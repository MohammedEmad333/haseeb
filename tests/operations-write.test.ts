import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHaseeb, type Haseeb } from '@/db';

let h: Haseeb;

beforeEach(async () => {
  h = await openHaseeb({ ephemeral: true, seedIfEmpty: false });
});

afterEach(async () => {
  await h.db.close();
});

describe('operational entries', () => {
  it('records a monthly expense with an audit entry', async () => {
    const expense = await h.ops.addExpense({ label: 'كهرباء', amount: 25_000, period: '2026-09' });

    expect(expense).toMatchObject({ label: 'كهرباء', amount: 25_000, period: '2026-09' });
    expect(await h.ops.totalExpenses('2026-09')).toBe(25_000);
    expect((await h.ops.audit(1))[0]).toMatchObject({ entity: 'expense', action: 'create' });
  });

  it('creates sequential customer and supplier orders', async () => {
    const first = await h.ops.createOrder({
      direction: 'customer',
      counterpartyName: 'عميل الاختبار',
      itemCount: 2,
      total: 4_500,
    });
    const second = await h.ops.createOrder({
      direction: 'customer',
      counterpartyName: 'عميل آخر',
      itemCount: 1,
      total: 1_000,
    });
    const purchase = await h.ops.createOrder({
      direction: 'supplier',
      counterpartyName: 'المورد',
      itemCount: 5,
      total: 20_000,
    });

    expect(first).toMatchObject({ orderNo: 'ORD-0001', status: 'preparing' });
    expect(second.orderNo).toBe('ORD-0002');
    expect(purchase).toMatchObject({ orderNo: 'PO-0001', status: 'awaitingShipment' });
  });
});
