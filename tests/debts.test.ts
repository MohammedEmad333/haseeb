import { describe, expect, it } from 'vitest';
import { DUE_SOON_DAYS, ageDebt, daysBetween, outstandingBalance } from '@/domain/debts';

const asOf = new Date('2026-09-08T14:30:00');

function daysFromAsOf(days: number): Date {
  const d = new Date(asOf.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

describe('debt aging', () => {
  it('counts whole calendar days, ignoring the time of day', () => {
    expect(daysBetween('2026-09-01T23:59:00', '2026-09-08T00:01:00')).toBe(7);
    expect(daysBetween('2026-09-08T08:00:00', '2026-09-08T22:00:00')).toBe(0);
  });

  it('reports a settled debt as paid regardless of its due date', () => {
    const aging = ageDebt(0, daysFromAsOf(-90), asOf);
    expect(aging.status).toBe('paid');
    expect(aging.daysOverdue).toBe(0);
  });

  it('flags a debt past its due date as overdue, with the day count', () => {
    const aging = ageDebt(145_000, daysFromAsOf(-12), asOf);
    expect(aging.status).toBe('overdue');
    // The design's profile panel: «متأخر ١٢ يوماً عن تاريخ الاستحقاق».
    expect(aging.daysOverdue).toBe(12);
  });

  it('warns inside the reminder window and stays quiet outside it', () => {
    expect(ageDebt(1_000, daysFromAsOf(-0), asOf).status).toBe('dueSoon');
    expect(ageDebt(1_000, daysFromAsOf(DUE_SOON_DAYS), asOf).status).toBe('dueSoon');
    expect(ageDebt(1_000, daysFromAsOf(DUE_SOON_DAYS + 1), asOf).status).toBe('current');
  });

  it('treats a debt due today as due soon, not overdue', () => {
    const aging = ageDebt(500, new Date('2026-09-08T00:00:00'), asOf);
    expect(aging.status).toBe('dueSoon');
    expect(aging.daysOverdue).toBe(0);
  });

  it('nets payments against debts', () => {
    // محمود عبد الله: ١,٤٥٠ + ٨٠٠ debts, ٥٠٠ + ٣٠٠ paid → ١,٤٥٠ outstanding.
    expect(
      outstandingBalance([
        { kind: 'debt', amount: 145_000 },
        { kind: 'debt', amount: 80_000 },
        { kind: 'payment', amount: 50_000 },
        { kind: 'payment', amount: 30_000 },
      ]),
    ).toBe(145_000);
  });
});
