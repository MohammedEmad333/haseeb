import { HaseebDatabase, newId, nowIso, type Row } from '../database';
import type {
  CashShift,
  CreditNote,
  JournalEntry,
  LedgerAccountType,
  PaymentMethod,
  TrialBalanceRow,
} from '../types';

/** Double-entry ledger, full invoice returns, and cashier shift reconciliation. */
export class AccountingRepository {
  constructor(private readonly db: HaseebDatabase) {}

  async trialBalance(): Promise<TrialBalanceRow[]> {
    await this.#backfillLedger();
    const rows = await this.db.all(
      `SELECT a.id, a.code, a.name, a.account_type,
              COALESCE(SUM(l.debit_piasters), 0) AS debit,
              COALESCE(SUM(l.credit_piasters), 0) AS credit
       FROM ledger_accounts a
       LEFT JOIN journal_lines l ON l.account_id = a.id
       WHERE a.active = 1
       GROUP BY a.id, a.code, a.name, a.account_type
       ORDER BY a.code`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      type: String(row.account_type) as LedgerAccountType,
      debit: Number(row.debit),
      credit: Number(row.credit),
      balance: Number(row.debit) - Number(row.credit),
    }));
  }

  async journals(limit = 20): Promise<JournalEntry[]> {
    await this.#backfillLedger();
    const rows = await this.db.all(
      `SELECT e.*, COALESCE(SUM(l.debit_piasters), 0) AS debit,
              COALESCE(SUM(l.credit_piasters), 0) AS credit
       FROM journal_entries e
       LEFT JOIN journal_lines l ON l.journal_id = e.id
       GROUP BY e.id
       ORDER BY e.occurred_at DESC, e.rowid DESC LIMIT ?`,
      [limit],
    );
    return rows.map(toJournal);
  }

  async creditNotes(): Promise<CreditNote[]> {
    return (await this.db.all('SELECT * FROM credit_notes ORDER BY issued_at DESC')).map(toCreditNote);
  }

  /** Reverse an entire invoice, restore stock, and post a balanced credit-note journal. */
  async returnInvoice(invoiceId: string, reason: string): Promise<CreditNote> {
    const cleanReason = reason.trim();
    if (!cleanReason) throw new Error('سبب المرتجع مطلوب.');
    if (await this.db.get('SELECT id FROM credit_notes WHERE invoice_id = ?', [invoiceId])) {
      throw new Error('تم إرجاع هذه الفاتورة مسبقاً.');
    }
    const invoice = await this.db.get(
      `SELECT i.*, s.payment_method FROM invoices i
       JOIN sales s ON s.id = i.sale_id WHERE i.id = ?`,
      [invoiceId],
    );
    if (!invoice) throw new Error('الفاتورة غير موجودة.');

    if (String(invoice.payment_method) === 'credit') {
      const paid = Number(
        (await this.db.value(
          `SELECT COALESCE(SUM(p.amount_piasters), 0) FROM payments p
           JOIN debts d ON d.id = p.debt_id WHERE d.invoice_id = ?`,
          [invoiceId],
        )) ?? 0,
      );
      if (paid > 0) throw new Error('لا يمكن إرجاع فاتورة آجلة بعد تحصيل دفعة منها قبل تسوية الدفعة.');
    }

    const lines = await this.db.all(
      `SELECT l.*, p.qty_on_hand FROM sale_lines l
       JOIN products p ON p.id = l.product_id WHERE l.sale_id = ? ORDER BY l.rowid`,
      [String(invoice.sale_id)],
    );
    const id = newId();
    const noteNo = await this.#nextCreditNoteNo();
    const at = nowIso();
    const subtotal = Number(invoice.subtotal_piasters) - Number(invoice.discount_piasters);
    const vat = Number(invoice.vat_piasters);
    const total = Number(invoice.total_piasters);
    const profit = Number(invoice.profit_piasters);
    const cost = subtotal - profit;
    const method = String(invoice.payment_method) as PaymentMethod;

    await this.db.mutate(
      {
        entity: 'credit_note',
        entityId: id,
        action: 'create',
        description: `مرتجع كامل ${noteNo} للفاتورة ${invoice.invoice_no}`,
        payload: { invoiceId, total, reason: cleanReason },
      },
      async (tx) => {
        await tx.execute(
          `INSERT INTO credit_notes (id, note_no, invoice_id, payment_method, subtotal_piasters,
             vat_piasters, total_piasters, profit_piasters, reason, issued_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, noteNo, invoiceId, method, subtotal, vat, total, profit, cleanReason, at],
        );
        for (const line of lines) {
          const qtyAfter = Number(line.qty_on_hand) + Number(line.qty);
          await tx.execute(
            `INSERT INTO credit_note_lines VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [newId(), id, String(line.product_id), String(line.name_snapshot), Number(line.qty), Number(line.unit_piasters), Number(line.total_piasters)],
          );
          await tx.execute('UPDATE products SET qty_on_hand = ? WHERE id = ?', [qtyAfter, String(line.product_id)]);
          await tx.execute(
            `INSERT INTO stock_movements
               (id, product_id, kind, qty_delta, qty_after, actor, counterparty, note, occurred_at)
             VALUES (?, ?, 'return', ?, ?, ?, '', ?, ?)`,
            [newId(), String(line.product_id), Number(line.qty), qtyAfter, this.db.actor, noteNo, at],
          );
        }
        if (method === 'credit') {
          await tx.execute('UPDATE debts SET principal_piasters = 0 WHERE invoice_id = ?', [invoiceId]);
        }

        const journalId = `je-credit-${id}`;
        await tx.execute('INSERT INTO journal_entries VALUES (?, ?, ?, ?, ?)', [journalId, 'credit_note', id, `إشعار دائن ${noteNo}`, at]);
        await tx.execute('INSERT INTO journal_lines VALUES (?, ?, ?, ?, 0)', [newId(), journalId, 'acc-sales', subtotal]);
        if (vat > 0) await tx.execute('INSERT INTO journal_lines VALUES (?, ?, ?, ?, 0)', [newId(), journalId, 'acc-vat', vat]);
        await tx.execute(
          'INSERT INTO journal_lines VALUES (?, ?, ?, 0, ?)',
          [newId(), journalId, paymentAccount(method), total],
        );
        if (cost > 0) {
          await tx.execute('INSERT INTO journal_lines VALUES (?, ?, ?, ?, 0)', [newId(), journalId, 'acc-inventory', cost]);
          await tx.execute('INSERT INTO journal_lines VALUES (?, ?, ?, 0, ?)', [newId(), journalId, 'acc-cogs', cost]);
        }
      },
    );
    return (await this.creditNotes()).find((note) => note.id === id)!;
  }

  async currentShift(): Promise<CashShift | null> {
    const row = await this.db.get("SELECT * FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1");
    return row ? toShift(row) : null;
  }

  async recentShifts(limit = 10): Promise<CashShift[]> {
    return (await this.db.all('SELECT * FROM cash_shifts ORDER BY opened_at DESC LIMIT ?', [limit])).map(toShift);
  }

  async openShift(openingCash: number): Promise<CashShift> {
    if (!Number.isInteger(openingCash) || openingCash < 0) throw new Error('رصيد افتتاح الصندوق غير صحيح.');
    if (await this.currentShift()) throw new Error('توجد وردية مفتوحة بالفعل.');
    const id = newId();
    await this.db.mutate(
      { entity: 'cash_shift', entityId: id, action: 'open', description: 'فتح وردية الصندوق', payload: { openingCash } },
      (tx) => tx.execute(
        `INSERT INTO cash_shifts (id, opened_by, opened_at, opening_cash_piasters, status)
         VALUES (?, ?, ?, ?, 'open')`,
        [id, this.db.actor, nowIso(), openingCash],
      ),
    );
    return (await this.currentShift())!;
  }

  async closeShift(actualCash: number): Promise<CashShift> {
    if (!Number.isInteger(actualCash) || actualCash < 0) throw new Error('الرصيد الفعلي غير صحيح.');
    const shift = await this.currentShift();
    if (!shift) throw new Error('لا توجد وردية مفتوحة.');
    const expected = shift.openingCash + await this.#cashMovementSince(shift.openedAt);
    const difference = actualCash - expected;
    const at = nowIso();
    await this.db.mutate(
      { entity: 'cash_shift', entityId: shift.id, action: 'close', description: `إغلاق وردية الصندوق بفارق ${difference}`, payload: { expected, actualCash, difference } },
      (tx) => tx.execute(
        `UPDATE cash_shifts SET status = 'closed', closed_at = ?, expected_cash_piasters = ?,
           actual_cash_piasters = ?, difference_piasters = ? WHERE id = ?`,
        [at, expected, actualCash, difference, shift.id],
      ),
    );
    return (await this.recentShifts(1))[0];
  }

  async #cashMovementSince(from: string): Promise<number> {
    const sales = Number((await this.db.value("SELECT COALESCE(SUM(total_piasters),0) FROM sales WHERE payment_method='cash' AND occurred_at>=?", [from])) ?? 0);
    const payments = Number((await this.db.value("SELECT COALESCE(SUM(amount_piasters),0) FROM payments WHERE method='cash' AND paid_at>=?", [from])) ?? 0);
    const refunds = Number((await this.db.value("SELECT COALESCE(SUM(total_piasters),0) FROM credit_notes WHERE payment_method='cash' AND issued_at>=?", [from])) ?? 0);
    const expenses = Number((await this.db.value('SELECT COALESCE(SUM(amount_piasters),0) FROM expenses WHERE recorded_at>=?', [from])) ?? 0);
    return sales + payments - refunds - expenses;
  }

  async #nextCreditNoteNo(): Promise<string> {
    const last = await this.db.value<string>("SELECT note_no FROM credit_notes WHERE note_no LIKE 'CN-%' ORDER BY note_no DESC LIMIT 1");
    return `CN-${String(last ? Number(last.slice(3)) + 1 : 1).padStart(4, '0')}`;
  }

  /** Post journal entries for rows created before this ledger migration. */
  async #backfillLedger(): Promise<void> {
    const missing = Number((await this.db.value(
      `SELECT
        (SELECT COUNT(*) FROM sales s LEFT JOIN journal_entries e ON e.reference_type='sale' AND e.reference_id=s.id WHERE e.id IS NULL) +
        (SELECT COUNT(*) FROM expenses x LEFT JOIN journal_entries e ON e.reference_type='expense' AND e.reference_id=x.id WHERE e.id IS NULL) +
        (SELECT COUNT(*) FROM payments p LEFT JOIN journal_entries e ON e.reference_type='payment' AND e.reference_id=p.id WHERE e.id IS NULL) +
        (SELECT COUNT(*) FROM stock_movements m LEFT JOIN journal_entries e ON e.reference_type='stock_purchase' AND e.reference_id=m.id WHERE m.kind='purchase' AND m.qty_delta>0 AND e.id IS NULL)`,
    )) ?? 0);
    if (missing === 0) return;
    const sales = await this.db.all(
      `SELECT s.* FROM sales s LEFT JOIN journal_entries e
       ON e.reference_type='sale' AND e.reference_id=s.id WHERE e.id IS NULL`,
    );
    const expenses = await this.db.all(
      `SELECT x.* FROM expenses x LEFT JOIN journal_entries e
       ON e.reference_type='expense' AND e.reference_id=x.id WHERE e.id IS NULL`,
    );
    const payments = await this.db.all(
      `SELECT p.* FROM payments p LEFT JOIN journal_entries e
       ON e.reference_type='payment' AND e.reference_id=p.id WHERE e.id IS NULL`,
    );
    const purchases = await this.db.all(
      `SELECT m.*, p.cost_piasters FROM stock_movements m JOIN products p ON p.id=m.product_id
       LEFT JOIN journal_entries e ON e.reference_type='stock_purchase' AND e.reference_id=m.id
       WHERE m.kind='purchase' AND m.qty_delta>0 AND e.id IS NULL`,
    );
    await this.db.mutate(
      { entity: 'ledger', action: 'backfill', description: `ترحيل ${missing} عملية سابقة إلى دفتر القيود`, localOnly: true },
      async (tx) => {
        for (const sale of sales) {
          const id = String(sale.id);
          const journal = `je-sale-${id}`;
          const taxable = Number(sale.subtotal_piasters) - Number(sale.discount_piasters);
          const cost = taxable - Number(sale.profit_piasters);
          await tx.execute('INSERT OR IGNORE INTO journal_entries VALUES (?, ?, ?, ?, ?)', [journal, 'sale', id, `قيد بيع ${sale.invoice_no}`, String(sale.occurred_at)]);
          await addLine(tx, journal, paymentAccount(String(sale.payment_method) as PaymentMethod), Number(sale.total_piasters), 0);
          await addLine(tx, journal, 'acc-sales', 0, taxable);
          await addLine(tx, journal, 'acc-vat', 0, Number(sale.vat_piasters));
          await addLine(tx, journal, 'acc-cogs', cost, 0);
          await addLine(tx, journal, 'acc-inventory', 0, cost);
        }
        for (const expense of expenses) {
          const id = String(expense.id); const journal = `je-expense-${id}`; const amount = Number(expense.amount_piasters);
          await tx.execute('INSERT OR IGNORE INTO journal_entries VALUES (?, ?, ?, ?, ?)', [journal, 'expense', id, `مصروف: ${expense.label}`, String(expense.recorded_at)]);
          await addLine(tx, journal, 'acc-expense', amount, 0);
          await addLine(tx, journal, 'acc-cash', 0, amount);
        }
        for (const payment of payments) {
          const id = String(payment.id); const journal = `je-payment-${id}`; const amount = Number(payment.amount_piasters);
          await tx.execute('INSERT OR IGNORE INTO journal_entries VALUES (?, ?, ?, ?, ?)', [journal, 'payment', id, 'تسوية ذمة', String(payment.paid_at)]);
          const method = String(payment.method);
          await addLine(tx, journal, method === 'cash' ? 'acc-cash' : method === 'card' ? 'acc-card' : 'acc-wallet', amount, 0);
          await addLine(tx, journal, 'acc-ar', 0, amount);
        }
        for (const purchase of purchases) {
          const id = String(purchase.id); const journal = `je-stock-${id}`; const amount = Number(purchase.qty_delta) * Number(purchase.cost_piasters);
          await tx.execute('INSERT OR IGNORE INTO journal_entries VALUES (?, ?, ?, ?, ?)', [journal, 'stock_purchase', id, `توريد مخزون: ${purchase.note}`, String(purchase.occurred_at)]);
          await addLine(tx, journal, 'acc-inventory', amount, 0);
          await addLine(tx, journal, String(purchase.counterparty) ? 'acc-ap' : 'acc-equity', 0, amount);
        }
      },
    );
  }
}

async function addLine(tx: { execute: (sql: string, params?: (string | number | null)[]) => Promise<unknown> }, journal: string, account: string, debit: number, credit: number): Promise<void> {
  if (debit === 0 && credit === 0) return;
  await tx.execute('INSERT OR IGNORE INTO journal_lines VALUES (?, ?, ?, ?, ?)', [newId(), journal, account, debit, credit]);
}

function paymentAccount(method: PaymentMethod): string {
  return method === 'cash' ? 'acc-cash' : method === 'card' ? 'acc-card' : method === 'wallet' ? 'acc-wallet' : 'acc-ar';
}

function toJournal(row: Row): JournalEntry {
  return { id: String(row.id), referenceType: String(row.reference_type), referenceId: String(row.reference_id), description: String(row.description), occurredAt: String(row.occurred_at), debit: Number(row.debit), credit: Number(row.credit) };
}

function toCreditNote(row: Row): CreditNote {
  return { id: String(row.id), noteNo: String(row.note_no), invoiceId: String(row.invoice_id), paymentMethod: String(row.payment_method) as PaymentMethod, subtotal: Number(row.subtotal_piasters), vat: Number(row.vat_piasters), total: Number(row.total_piasters), profit: Number(row.profit_piasters), reason: String(row.reason), issuedAt: String(row.issued_at) };
}

function toShift(row: Row): CashShift {
  return { id: String(row.id), openedBy: String(row.opened_by), openedAt: String(row.opened_at), openingCash: Number(row.opening_cash_piasters), closedAt: row.closed_at == null ? null : String(row.closed_at), expectedCash: row.expected_cash_piasters == null ? null : Number(row.expected_cash_piasters), actualCash: row.actual_cash_piasters == null ? null : Number(row.actual_cash_piasters), difference: row.difference_piasters == null ? null : Number(row.difference_piasters), status: String(row.status) as 'open' | 'closed' };
}
