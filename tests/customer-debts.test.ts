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
