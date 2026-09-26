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

  it('only allocates monthly expenses across days that overlap the requested range', async () => {
    await h.ops.addExpense({ label: 'يناير', amount: 31_000, period: '2026-01' });
    await h.ops.addExpense({ label: 'فبراير', amount: 28_000, period: '2026-02' });

    expect(
      await h.ops.expensesForRange(
        '2026-02-01T00:00:00.000Z',
        '2026-02-08T00:00:00.000Z',
      ),
    ).toBe(7_000);

    expect(
      await h.ops.expensesForRange(
        '2026-01-29T00:00:00.000Z',
        '2026-02-03T00:00:00.000Z',
      ),
    ).toBe(5_000);
  });

  it('keeps order numbering numeric after four digits', async () => {
    await h.db.mutate(
      {
        entity: 'order',
        action: 'test_seed',
        description: 'تهيئة تسلسل الطلب للاختبار',
        localOnly: true,
      },
      async (tx) => {
        for (const [id, orderNo] of [['legacy-9999', 'ORD-9999'], ['legacy-10000', 'ORD-10000']]) {
          await tx.execute(
            `INSERT INTO orders
               (id, order_no, direction, counterparty_name, status, fulfilment,
                item_count, summary, total_piasters, placed_at)
             VALUES (?, ?, 'customer', 'قديم', 'completed', '', 1, '', 100, ?)`,
            [id, orderNo, '2026-01-01T00:00:00.000Z'],
          );
        }
      },
    );

    const next = await h.ops.createOrder({
      direction: 'customer',
      counterpartyName: 'عميل جديد',
      itemCount: 1,
      total: 100,
    });
    expect(next.orderNo).toBe('ORD-10001');
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
