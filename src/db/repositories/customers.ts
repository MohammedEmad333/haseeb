import { HaseebDatabase, newId, nowIso, type Row } from '../database';
import type { Customer, CustomerKind, Debt, Payment, SettlementMethod } from '../types';
import type { TierName } from '@/domain/wholesale';
import { ageDebt, type DebtAging } from '@/domain/debts';
import { money } from '@/lib/format';

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
      (tx) =>
        tx.execute(
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
        ),
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
      `SELECT customer_id, principal_piasters, due_at FROM debts
       WHERE direction = ? ORDER BY customer_id, opened_at, rowid`,
      [direction],
    );
    const paymentRows = await this.db.all(
      `SELECT customer_id, amount_piasters, paid_at FROM payments
       ORDER BY customer_id, paid_at, rowid`,
    );

    const paid = new Map<string, number>();
    const lastPaid = new Map<string, string>();
    for (const r of paymentRows) {
      const id = String(r.customer_id);
      paid.set(id, (paid.get(id) ?? 0) + Number(r.amount_piasters));
      lastPaid.set(id, String(r.paid_at));
    }

    const grouped = new Map<string, Array<{ principal: number; dueAt: string }>>();
    for (const r of debtRows) {
      const id = String(r.customer_id);
      const list = grouped.get(id) ?? [];
      list.push({ principal: Number(r.principal_piasters), dueAt: String(r.due_at) });
      grouped.set(id, list);
    }

    const summaries: DebtorSummary[] = [];
    for (const [customerId, debts] of grouped) {
      const customer = customers.get(customerId);
      if (!customer) continue;

      let credit = paid.get(customerId) ?? 0;
      let outstanding = 0;
      let governingDue: string | null = null;

      for (const debt of debts) {
        const applied = Math.min(credit, debt.principal);
        credit -= applied;
        const remaining = debt.principal - applied;
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
    const id = newId();
    const customer = await this.byId(input.customerId);
    await this.db.mutate(
      {
        entity: 'debt',
        entityId: id,
        action: 'create',
        description: `تسجيل دين ${money(input.amount)} على «${customer?.name ?? input.customerId}»`,
        payload: input,
      },
      (tx) =>
        tx.execute(
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
        ),
    );
    return id;
  }

  async recordPayment(input: {
    customerId: string;
    amount: number;
    method: SettlementMethod;
    debtId?: string | null;
    note?: string;
  }): Promise<string> {
    const id = newId();
    const customer = await this.byId(input.customerId);
    await this.db.mutate(
      {
        entity: 'payment',
        entityId: id,
        action: 'create',
        description: `سداد ${money(input.amount)} من «${customer?.name ?? input.customerId}»`,
        payload: input,
      },
      (tx) =>
        tx.execute(
          `INSERT INTO payments (id, debt_id, customer_id, amount_piasters, method, paid_at, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.debtId ?? null,
            input.customerId,
            input.amount,
            input.method,
            nowIso(),
            input.note ?? '',
          ],
        ),
    );
    return id;
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
      'SELECT COALESCE(SUM(amount_piasters), 0) AS total, COUNT(*) AS n FROM payments WHERE paid_at >= ?',
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
