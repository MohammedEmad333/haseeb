import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHaseeb, type Haseeb } from '@/db';

let h: Haseeb;

beforeEach(async () => {
  h = await openHaseeb({ ephemeral: true, seedIfEmpty: false });
});

afterEach(async () => {
  await h.db.close();
});

async function customer(name = 'عميل اختبار') {
  return h.customers.create({
    name,
    kind: 'retail',
    phone: '',
    city: '',
    tier: null,
    minOrderQty: 0,
    sinceYear: null,
  });
}

describe('debt ledger integrity', () => {
  it('rejects non-positive debts and payments', async () => {
    const c = await customer();

    await expect(
      h.customers.recordDebt({
        customerId: c.id,
        amount: 0,
        dueAt: '2026-10-01T00:00:00.000Z',
      }),
    ).rejects.toThrow();

    await h.customers.recordDebt({
      customerId: c.id,
      amount: 10_000,
      dueAt: '2026-10-01T00:00:00.000Z',
    });

    await expect(
      h.customers.recordPayment({
        customerId: c.id,
        amount: -100,
        method: 'cash',
        direction: 'receivable',
      }),
    ).rejects.toThrow();

    await expect(
      h.customers.recordPayment({
        customerId: c.id,
        amount: 10_001,
        method: 'cash',
        direction: 'receivable',
      }),
    ).rejects.toThrow('أكبر من الرصيد المستحق');
  });

  it('does not let receivable payments reduce payable balances', async () => {
    const c = await customer('عميل باتجاهين');

    await h.customers.recordDebt({
      customerId: c.id,
      amount: 20_000,
      dueAt: '2026-10-01T00:00:00.000Z',
      direction: 'receivable',
    });
    await h.customers.recordDebt({
      customerId: c.id,
      amount: 30_000,
      dueAt: '2026-10-01T00:00:00.000Z',
      direction: 'payable',
    });

    await h.customers.recordPayment({
      customerId: c.id,
      amount: 5_000,
      method: 'cash',
      direction: 'receivable',
    });

    const receivable = (await h.customers.debtors('receivable')).find((row) => row.id === c.id);
    const payable = (await h.customers.debtors('payable')).find((row) => row.id === c.id);

    expect(receivable?.outstanding).toBe(15_000);
    expect(payable?.outstanding).toBe(30_000);
  });


  it('posts supplier settlements as cash outflow and excludes them from collections', async () => {
    const supplier = await h.customers.create({
      name: 'مورد اختبار',
      kind: 'supplier',
      phone: '',
      city: '',
      tier: null,
      minOrderQty: 0,
      sinceYear: null,
    });
    await h.customers.recordDebt({
      customerId: supplier.id,
      amount: 30_000,
      dueAt: '2026-10-01T00:00:00.000Z',
      direction: 'payable',
    });

    await h.accounting.openShift(10_000);
    const paymentId = await h.customers.recordPayment({
      customerId: supplier.id,
      amount: 1_000,
      method: 'cash',
      direction: 'payable',
    });

    const lines = await h.db.all(
      `SELECT account_id, debit_piasters, credit_piasters
       FROM journal_lines WHERE journal_id = ? ORDER BY account_id`,
      [`je-payment-${paymentId}`],
    );
    expect(lines).toEqual([
      { account_id: 'acc-ap', debit_piasters: 1_000, credit_piasters: 0 },
      { account_id: 'acc-cash', debit_piasters: 0, credit_piasters: 1_000 },
    ]);

    expect(
      await h.analytics.collectedBetween(
        '2000-01-01T00:00:00.000Z',
        '2100-01-01T00:00:00.000Z',
      ),
    ).toBe(0);
    expect((await h.customers.debtTotals()).collectedThisMonth).toBe(0);

    const closed = await h.accounting.closeShift(9_000);
    expect(closed).toMatchObject({
      expectedCash: 9_000,
      actualCash: 9_000,
      difference: 0,
    });
  });

  it('keeps supplier payments out of historical receivable balances', async () => {
    const client = await customer('عميل تاريخي');
    const supplier = await h.customers.create({
      name: 'مورد تاريخي',
      kind: 'supplier',
      phone: '',
      city: '',
      tier: null,
      minOrderQty: 0,
      sinceYear: null,
    });

    await h.customers.recordDebt({
      customerId: client.id,
      amount: 20_000,
      dueAt: '2026-10-01T00:00:00.000Z',
      direction: 'receivable',
    });
    await h.customers.recordDebt({
      customerId: supplier.id,
      amount: 30_000,
      dueAt: '2026-10-01T00:00:00.000Z',
      direction: 'payable',
    });
    await h.customers.recordPayment({
      customerId: supplier.id,
      amount: 5_000,
      method: 'cash',
      direction: 'payable',
    });

    expect(await h.analytics.outstandingAsOf(new Date('2100-01-01T00:00:00.000Z'))).toBe(20_000);
  });


  it('respects payments targeted at a specific debt instead of reallocating them FIFO', async () => {
    const c = await customer('عميل بديون متعددة');
    const firstDebt = await h.customers.recordDebt({
      customerId: c.id,
      amount: 10_000,
      dueAt: '2026-01-01T00:00:00.000Z',
      direction: 'receivable',
      note: 'الدين الأقدم',
    });
    const secondDebt = await h.customers.recordDebt({
      customerId: c.id,
      amount: 20_000,
      dueAt: '2026-12-01T00:00:00.000Z',
      direction: 'receivable',
      note: 'الدين الأحدث',
    });

    await h.customers.recordPayment({
      customerId: c.id,
      amount: 5_000,
      method: 'cash',
      debtId: secondDebt,
      direction: 'receivable',
    });

    const summary = (await h.customers.debtors('receivable', new Date('2026-09-26T00:00:00.000Z')))
      .find((row) => row.id === c.id);
    expect(summary?.outstanding).toBe(25_000);
    expect(summary?.dueAt).toBe('2026-01-01T00:00:00.000Z');

    await expect(
      h.customers.recordPayment({
        customerId: c.id,
        amount: 16_000,
        method: 'cash',
        debtId: secondDebt,
        direction: 'receivable',
      }),
    ).rejects.toThrow('أكبر من رصيد الدين المحدد');

    expect(firstDebt).not.toBe(secondDebt);
  });

  it('rejects a debt id that belongs to another customer', async () => {
    const first = await customer('الأول');
    const second = await customer('الثاني');
    const debtId = await h.customers.recordDebt({
      customerId: first.id,
      amount: 10_000,
      dueAt: '2026-10-01T00:00:00.000Z',
    });
    await h.customers.recordDebt({
      customerId: second.id,
      amount: 10_000,
      dueAt: '2026-10-01T00:00:00.000Z',
    });

    await expect(
      h.customers.recordPayment({
        customerId: second.id,
        amount: 1_000,
        method: 'cash',
        debtId,
        direction: 'receivable',
      }),
    ).rejects.toThrow('لا يخص هذا العميل');
  });
});
