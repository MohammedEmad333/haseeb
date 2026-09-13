import { newId } from '../database';
import type { SqlTx } from '../drivers';
import type { PaymentMethod, SettlementMethod } from '../types';

async function line(tx: SqlTx, journalId: string, accountId: string, debit: number, credit: number): Promise<void> {
  if (debit === 0 && credit === 0) return;
  await tx.execute('INSERT INTO journal_lines VALUES (?, ?, ?, ?, ?)', [newId(), journalId, accountId, debit, credit]);
}

export async function postSaleJournal(tx: SqlTx, input: {
  id: string; invoiceNo: string; paymentMethod: PaymentMethod; taxable: number; vat: number; total: number; profit: number; at: string;
}): Promise<void> {
  const journal = `je-sale-${input.id}`;
  const cost = input.taxable - input.profit;
  await tx.execute('INSERT OR IGNORE INTO journal_entries VALUES (?, ?, ?, ?, ?)', [journal, 'sale', input.id, `قيد بيع ${input.invoiceNo}`, input.at]);
  await line(tx, journal, paymentAccount(input.paymentMethod), input.total, 0);
  await line(tx, journal, 'acc-sales', 0, input.taxable);
  await line(tx, journal, 'acc-vat', 0, input.vat);
  await line(tx, journal, 'acc-cogs', cost, 0);
  await line(tx, journal, 'acc-inventory', 0, cost);
}

export async function postExpenseJournal(tx: SqlTx, input: { id: string; label: string; amount: number; at: string }): Promise<void> {
  const journal = `je-expense-${input.id}`;
  await tx.execute('INSERT OR IGNORE INTO journal_entries VALUES (?, ?, ?, ?, ?)', [journal, 'expense', input.id, `مصروف: ${input.label}`, input.at]);
  await line(tx, journal, 'acc-expense', input.amount, 0);
  await line(tx, journal, 'acc-cash', 0, input.amount);
}

export async function postPaymentJournal(tx: SqlTx, input: { id: string; method: SettlementMethod; amount: number; at: string }): Promise<void> {
  const journal = `je-payment-${input.id}`;
  await tx.execute('INSERT OR IGNORE INTO journal_entries VALUES (?, ?, ?, ?, ?)', [journal, 'payment', input.id, 'تسوية ذمة', input.at]);
  await line(tx, journal, settlementAccount(input.method), input.amount, 0);
  await line(tx, journal, 'acc-ar', 0, input.amount);
}

export async function postPurchaseJournal(tx: SqlTx, input: { movementId: string; amount: number; supplier: string; note: string; at: string }): Promise<void> {
  if (input.amount <= 0) return;
  const journal = `je-stock-${input.movementId}`;
  await tx.execute('INSERT OR IGNORE INTO journal_entries VALUES (?, ?, ?, ?, ?)', [journal, 'stock_purchase', input.movementId, `توريد مخزون: ${input.note}`, input.at]);
  await line(tx, journal, 'acc-inventory', input.amount, 0);
  await line(tx, journal, input.supplier ? 'acc-ap' : 'acc-equity', 0, input.amount);
}

export function paymentAccount(method: PaymentMethod): string {
  return method === 'cash' ? 'acc-cash' : method === 'card' ? 'acc-card' : method === 'wallet' ? 'acc-wallet' : 'acc-ar';
}

function settlementAccount(method: SettlementMethod): string {
  return method === 'cash' ? 'acc-cash' : method === 'card' ? 'acc-card' : 'acc-wallet';
}
