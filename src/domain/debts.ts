/**
 * Debt aging for دفتر الديون.
 *
 * A debt is one of four things, and the whole screen — colour, badge, sort
 * order, reminder copy — follows from which one:
 *   paid      مسدَّد            — nothing outstanding
 *   current   جارٍ              — due comfortably in the future
 *   dueSoon   قريب الاستحقاق    — due within the reminder window
 *   overdue   متأخر             — past its due date
 */

import type { Piasters } from './money';

export type DebtStatus = 'paid' | 'current' | 'dueSoon' | 'overdue';

/** How many days ahead of the due date a debt starts warning. */
export const DUE_SOON_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/** Whole days between two instants, counting from calendar midnight so that
 *  "due today" is 0 days regardless of the clock time a sale was rung up. */
export function daysBetween(from: Date | string, to: Date | string): number {
  const a = startOfDay(from);
  const b = startOfDay(to);
  return Math.round((b - a) / MS_PER_DAY);
}

function startOfDay(value: Date | string): number {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface DebtAging {
  status: DebtStatus;
  /** Positive when the debt is late, negative when it is still ahead. */
  daysOverdue: number;
  outstanding: Piasters;
}

export function ageDebt(
  outstanding: Piasters,
  dueDate: string | Date,
  asOf: string | Date = new Date(),
  dueSoonDays: number = DUE_SOON_DAYS,
): DebtAging {
  if (outstanding <= 0) {
    return { status: 'paid', daysOverdue: 0, outstanding: 0 };
  }
  const daysOverdue = daysBetween(dueDate, asOf);
  if (daysOverdue > 0) return { status: 'overdue', daysOverdue, outstanding };
  if (-daysOverdue <= dueSoonDays) return { status: 'dueSoon', daysOverdue, outstanding };
  return { status: 'current', daysOverdue, outstanding };
}

/** Arabic label for a status, as it appears on the badge. */
export const DEBT_STATUS_LABEL: Record<DebtStatus, string> = {
  paid: 'مسدَّد',
  current: 'جارٍ',
  dueSoon: 'قريب الاستحقاق',
  overdue: 'متأخر',
};

/** Running balance for a customer's ledger: debts add, payments subtract. */
export interface LedgerEntry {
  kind: 'debt' | 'payment';
  amount: Piasters;
}

export function outstandingBalance(entries: readonly LedgerEntry[]): Piasters {
  return entries.reduce(
    (balance, e) => (e.kind === 'debt' ? balance + e.amount : balance - e.amount),
    0,
  );
}
