import { HaseebDatabase, newId, nowIso, type Row } from '../database';
import type { Customer, CustomerKind, Debt, Payment, SettlementMethod } from '../types';
import type { TierName } from '@/domain/wholesale';
import { ageDebt, type DebtAging } from '@/domain/debts';
import { money } from '@/lib/format';
import { postPaymentJournal } from './ledger-posting';

function toCustomer(row: Row): Customer {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: String(row.kind) as CustomerKind,
    phone: String(row.phone),
    city: String(row.city),
    tier: row.tier === null ? null : (String(row.tier) as TierName),
    minOrderQty: Number(row.min_order_qty),
    sinceYear: row.since_year === null ? null : Number(row.since_year),
  };
}

/** A customer with their debt position folded in — what the ledger lists. */
export interface DebtorSummary extends Customer {
  outstanding: number;
  lastPaymentAt: string | null;
  dueAt: string | null;
  aging: DebtAging;
}

export class CustomerRepository {
  constructor(private readonly db: HaseebDatabase) {}

  async list(kind?: CustomerKind): Promise<Customer[]> {
    const rows = kind
      ? await this.db.all('SELECT * FROM customers WHERE kind = ? ORDER BY name', [kind])
      : await this.db.all('SELECT * FROM customers ORDER BY name');
    return rows.map(toCustomer);
  }

  async byId(id: string): Promise<Customer | null> {
    const row = await this.db.get('SELECT * FROM customers WHERE id = ?', [id]);
    return row ? toCustomer(row) : null;
  }

  async create(input: Omit<Customer, 'id'>): Promise<Customer> {
    const id = newId();
    await this.db.mutate(
      {
        entity: 'customer',
        entityId: id,
        action: 'create',
        description: `إضافة عميل «${input.name}»`,
        payload: input,
      },
      async (tx) => {
        await tx.execute(
          `INSERT INTO customers (id, name, kind, phone, city, tier, min_order_qty, since_year, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.name,
            input.kind,
            input.phone,
            input.city,
            input.tier,
            input.minOrderQty,
            input.sinceYear,
            nowIso(),
          ],
        );
      },
    );
    return { ...input, id };
  }

  // ---- debt ledger ---------------------------------------------------

  /**
   * Outstanding per customer, with payments allocated to debts oldest-first.
   *
   * FIFO allocation is what decides the *aging*: the status has to follow the
   * oldest debt a payment has not yet reached, not the newest debt on file.
   * Summing balances alone would let a customer who just took on a fresh
   * 30-day debt look current while a six-week-old invoice sits unpaid.
   */
  async debtors(
    direction: 'receivable' | 'payable' = 'receivable',
    asOf = new Date(),
  ): Promise<DebtorSummary[]> {
    const customers = new Map((await this.list()).map((c) => [c.id, c]));

    const debtRows = await this.db.all(
      `SELECT id, customer_id, principal_piasters, due_at FROM debts
       WHERE direction = ? ORDER BY customer_id, opened_at, rowid`,
      [direction],
    );
    const paymentRows = await this.db.all(
      `SELECT p.customer_id, p.debt_id, p.amount_piasters, p.paid_at
       FROM payments p
       LEFT JOIN debts d ON d.id = p.debt_id
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE d.direction = ?
          OR (
            p.debt_id IS NULL
            AND (
              (? = 'payable' AND c.kind = 'supplier')
              OR (? = 'receivable' AND c.kind <> 'supplier')
            )
          )
       ORDER BY p.customer_id, p.paid_at, p.rowid`,
      [direction, direction, direction],
    );

    const unlinkedPaid = new Map<string, number>();
    const linkedPaid = new Map<string, number>();
    const lastPaid = new Map<string, string>();
    for (const r of paymentRows) {
      const customerId = String(r.customer_id);
      const amount = Number(r.amount_piasters);
      if (r.debt_id == null) {
        unlinkedPaid.set(customerId, (unlinkedPaid.get(customerId) ?? 0) + amount);
      } else {
        const debtId = String(r.debt_id);
        linkedPaid.set(debtId, (linkedPaid.get(debtId) ?? 0) + amount);
      }
      lastPaid.set(customerId, String(r.paid_at));
    }

    const grouped = new Map<string, Array<{ id: string; principal: number; dueAt: string }>>();
    for (const r of debtRows) {
      const customerId = String(r.customer_id);
      const list = grouped.get(customerId) ?? [];
      list.push({
        id: String(r.id),
        principal: Number(r.principal_piasters),
        dueAt: String(r.due_at),
      });
      grouped.set(customerId, list);
    }

    const summaries: DebtorSummary[] = [];
    for (const [customerId, debts] of grouped) {
      const customer = customers.get(customerId);
      if (!customer) continue;

      let fifoCredit = unlinkedPaid.get(customerId) ?? 0;
      let outstanding = 0;
      let governingDue: string | null = null;

      for (const debt of debts) {
        const linked = linkedPaid.get(debt.id) ?? 0;
        const linkedApplied = Math.min(linked, debt.principal);
        fifoCredit += Math.max(0, linked - linkedApplied);
        const afterLinked = debt.principal - linkedApplied;
        const fifoApplied = Math.min(fifoCredit, afterLinked);
        fifoCredit -= fifoApplied;
        const remaining = afterLinked - fifoApplied;
        if (remaining > 0) {
          outstanding += remaining;
          // The oldest debt still carrying a balance sets the due date.
          if (governingDue === null) governingDue = debt.dueAt;
        }
      }

      summaries.push({
        ...customer,
        outstanding,
        lastPaymentAt: lastPaid.get(customerId) ?? null,
        dueAt: governingDue,
        aging: ageDebt(outstanding, governingDue ?? asOf, asOf),
      });
    }

    return summaries.sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name, 'ar'));
  }

  async debtsFor(customerId: string): Promise<Debt[]> {
    const rows = await this.db.all(
      'SELECT * FROM debts WHERE customer_id = ? ORDER BY opened_at DESC',
      [customerId],
    );
    return rows.map((r) => ({
        id: String(r.id),
        customerId: String(r.customer_id),
        invoiceId: r.invoice_id === null ? null : String(r.invoice_id),
        direction: String(r.direction) as 'receivable' | 'payable',
        principal: Number(r.principal_piasters),
      openedAt: String(r.opened_at),
      dueAt: String(r.due_at),
      note: String(r.note),
    }));
  }

  async paymentsFor(customerId: string): Promise<Payment[]> {
    const rows = await this.db.all(
      'SELECT * FROM payments WHERE customer_id = ? ORDER BY paid_at DESC',
      [customerId],
    );
    return rows.map((r) => ({
        id: String(r.id),
        debtId: r.debt_id === null ? null : String(r.debt_id),
        customerId: String(r.customer_id),
        amount: Number(r.amount_piasters),
      method: String(r.method) as SettlementMethod,
      paidAt: String(r.paid_at),
      note: String(r.note),
    }));
  }

  /** Debts and payments interleaved — the «سجل السدادات» timeline. */
  async ledgerFor(customerId: string): Promise<
    Array<{
      id: string;
      kind: 'debt' | 'payment';
      label: string;
      amount: number;
      at: string;
    }>
  > {
    const entries = [
      ...(await this.debtsFor(customerId)).map((d) => ({
        id: d.id,
        kind: 'debt' as const,
        label: d.note ? `دين جديد — ${d.note}` : 'دين جديد',
        amount: d.principal,
        at: d.openedAt,
      })),
      ...(await this.paymentsFor(customerId)).map((p) => ({
        id: p.id,
        kind: 'payment' as const,
        label: PAYMENT_LABEL[p.method],
        amount: p.amount,
        at: p.paidAt,
      })),
    ];
    return entries.sort((a, b) => b.at.localeCompare(a.at));
  }

  async recordDebt(input: {
    customerId: string;
    amount: number;
    dueAt: string;
    invoiceId?: string | null;
    direction?: 'receivable' | 'payable';
    note?: string;
  }): Promise<string> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error('قيمة الدين يجب أن تكون مبلغاً صحيحاً أكبر من صفر.');
    }
    if (!Number.isFinite(new Date(input.dueAt).getTime())) {
      throw new Error('تاريخ استحقاق الدين غير صحيح.');
    }

    const id = newId();
    const customer = await this.byId(input.customerId);
    if (!customer) throw new Error('العميل غير موجود.');

    await this.db.mutate(
      {
        entity: 'debt',
        entityId: id,
        action: 'create',
        description: `تسجيل دين ${money(input.amount)} على «${customer?.name ?? input.customerId}»`,
        payload: input,
      },
      async (tx) => {
        await tx.execute(
          `INSERT INTO debts (id, customer_id, invoice_id, direction, principal_piasters,
             opened_at, due_at, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.customerId,
            input.invoiceId ?? null,
            input.direction ?? 'receivable',
            input.amount,
            nowIso(),
            input.dueAt,
            input.note ?? '',
          ],
        );
      },
    );
    return id;
  }

  async recordPayment(input: {
    customerId: string;
    amount: number;
    method: SettlementMethod;
    debtId?: string | null;
    direction?: 'receivable' | 'payable';
    note?: string;
  }): Promise<string> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error('قيمة السداد يجب أن تكون مبلغاً صحيحاً أكبر من صفر.');
    }

    const customer = await this.byId(input.customerId);
    if (!customer) throw new Error('العميل غير موجود.');

    const direction =
      input.direction ?? (customer.kind === 'supplier' ? 'payable' : 'receivable');

    let targetDebtId = input.debtId ?? null;
    if (targetDebtId) {
      const debt = await this.db.get(
        'SELECT customer_id, direction FROM debts WHERE id = ?',
        [targetDebtId],
      );
      if (!debt) throw new Error('الدين المحدد غير موجود.');
      if (String(debt.customer_id) !== input.customerId) {
        throw new Error('الدين المحدد لا يخص هذا العميل.');
      }
      if (String(debt.direction) !== direction) {
        throw new Error('اتجاه الدين المحدد لا يطابق نوع السداد.');
      }
    }

    const before = await this.#allocationAfterPayment(
      input.customerId,
      direction,
      0,
      null,
    );
    if (input.amount > before.outstandingBefore) {
      throw new Error('قيمة السداد أكبر من الرصيد المستحق.');
    }

    if (!targetDebtId) targetDebtId = before.firstOpenDebtId;
    if (!targetDebtId) throw new Error('لا يوجد دين مفتوح لتسجيل السداد عليه.');
    if (
      input.debtId &&
      input.amount > (before.remainingByDebt.get(targetDebtId) ?? 0)
    ) {
      throw new Error('قيمة السداد أكبر من رصيد الدين المحدد.');
    }

    const allocation = await this.#allocationAfterPayment(
      input.customerId,
      direction,
      input.amount,
      targetDebtId,
    );

    const id = newId();
    const at = nowIso();
    await this.db.mutate(
      {
        entity: 'payment',
        entityId: id,
        action: 'create',
        description: `سداد ${money(input.amount)} من «${customer.name}»`,
        payload: { ...input, direction, debtId: targetDebtId },
      },
      async (tx) => {
        await tx.execute(
          `INSERT INTO payments (id, debt_id, customer_id, amount_piasters, method, paid_at, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            targetDebtId,
            input.customerId,
            input.amount,
            input.method,
            at,
            input.note ?? '',
          ],
        );
        await postPaymentJournal(tx, { id, method: input.method, amount: input.amount, direction, at });
        if (direction === 'receivable') {
          for (const invoice of allocation.invoiceStatuses) {
            await tx.execute('UPDATE invoices SET status = ? WHERE id = ?', [
              invoice.status,
              invoice.invoiceId,
            ]);
          }
        }
      },
    );
    return id;
  }

  async #allocationAfterPayment(
    customerId: string,
    direction: 'receivable' | 'payable',
    extraPayment: number,
    extraDebtId: string | null,
  ): Promise<{
    outstandingBefore: number;
    firstOpenDebtId: string | null;
    remainingByDebt: Map<string, number>;
    invoiceStatuses: Array<{ invoiceId: string; status: 'paid' | 'pending' | 'overdue' }>;
  }> {
    const debts = await this.db.all(
      `SELECT id, invoice_id, principal_piasters, due_at
       FROM debts
       WHERE customer_id = ? AND direction = ?
       ORDER BY opened_at, rowid`,
      [customerId, direction],
    );
    const payments = await this.db.all(
      `SELECT p.debt_id, p.amount_piasters
       FROM payments p
       LEFT JOIN debts d ON d.id = p.debt_id
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE p.customer_id = ?
         AND (
           d.direction = ?
           OR (
             p.debt_id IS NULL
             AND (
               (? = 'payable' AND c.kind = 'supplier')
               OR (? = 'receivable' AND c.kind <> 'supplier')
             )
           )
         )
       ORDER BY p.paid_at, p.rowid`,
      [customerId, direction, direction, direction],
    );

    const baseLinked = new Map<string, number>();
    let baseUnlinked = 0;
    for (const payment of payments) {
      const amount = Number(payment.amount_piasters);
      if (payment.debt_id == null) {
        baseUnlinked += amount;
      } else {
        const debtId = String(payment.debt_id);
        baseLinked.set(debtId, (baseLinked.get(debtId) ?? 0) + amount);
      }
    }

    const allocate = (addedAmount: number, addedDebtId: string | null) => {
      const linked = new Map(baseLinked);
      let fifoCredit = baseUnlinked;
      if (addedAmount > 0) {
        if (addedDebtId) {
          linked.set(addedDebtId, (linked.get(addedDebtId) ?? 0) + addedAmount);
        } else {
          fifoCredit += addedAmount;
        }
      }

      let outstanding = 0;
      let firstOpenDebtId: string | null = null;
      const remainingByDebt = new Map<string, number>();
      const invoiceStatuses: Array<{ invoiceId: string; status: 'paid' | 'pending' | 'overdue' }> = [];
      const now = Date.now();

      for (const debt of debts) {
        const debtId = String(debt.id);
        const principal = Number(debt.principal_piasters);
        const direct = linked.get(debtId) ?? 0;
        const directApplied = Math.min(direct, principal);
        fifoCredit += Math.max(0, direct - directApplied);

        const afterDirect = principal - directApplied;
        const fifoApplied = Math.min(fifoCredit, afterDirect);
        fifoCredit -= fifoApplied;
        const remaining = afterDirect - fifoApplied;

        remainingByDebt.set(debtId, remaining);
        if (remaining > 0) {
          outstanding += remaining;
          if (!firstOpenDebtId) firstOpenDebtId = debtId;
        }

        if (debt.invoice_id != null) {
          const due = new Date(String(debt.due_at)).getTime();
          invoiceStatuses.push({
            invoiceId: String(debt.invoice_id),
            status:
              remaining === 0
                ? 'paid'
                : Number.isFinite(due) && due < now
                  ? 'overdue'
                  : 'pending',
          });
        }
      }

      return { outstanding, firstOpenDebtId, remainingByDebt, invoiceStatuses };
    };

    const before = allocate(0, null);
    const after = allocate(extraPayment, extraDebtId);
    return {
      outstandingBefore: before.outstanding,
      firstOpenDebtId: before.firstOpenDebtId,
      remainingByDebt: before.remainingByDebt,
      invoiceStatuses: after.invoiceStatuses,
    };
  }

  /** Totals for the four cards at the top of دفتر الديون. */
  async debtTotals(asOf = new Date()): Promise<{
    receivable: number;
    receivableCount: number;
    payable: number;
    payableCount: number;
    overdue: number;
    overdueCount: number;
    collectedThisMonth: number;
    collectedCount: number;
  }> {
    const receivables = (await this.debtors('receivable', asOf)).filter((d) => d.outstanding > 0);
    const payables = (await this.debtors('payable', asOf)).filter((d) => d.outstanding > 0);
    const overdue = receivables.filter((d) => d.aging.status === 'overdue');

    const monthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1).toISOString();
    const collected = await this.db.get(
      `SELECT COALESCE(SUM(p.amount_piasters), 0) AS total, COUNT(*) AS n
       FROM payments p
       LEFT JOIN debts d ON d.id = p.debt_id
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE p.paid_at >= ?
         AND (
           d.direction = 'receivable'
           OR (p.debt_id IS NULL AND c.kind <> 'supplier')
         )`,
      [monthStart],
    );

    return {
      receivable: receivables.reduce((t, d) => t + d.outstanding, 0),
      receivableCount: receivables.length,
      payable: payables.reduce((t, d) => t + d.outstanding, 0),
      payableCount: payables.length,
      overdue: overdue.reduce((t, d) => t + d.outstanding, 0),
      overdueCount: overdue.length,
      collectedThisMonth: Number(collected?.total ?? 0),
      collectedCount: Number(collected?.n ?? 0),
    };
  }
}

const PAYMENT_LABEL: Record<SettlementMethod, string> = {
  cash: 'سداد نقدي',
  wallet: 'سداد محفظة',
  card: 'سداد بطاقة',
  transfer: 'سداد تحويل',
};
