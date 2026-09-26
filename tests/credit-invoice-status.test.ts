import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHaseeb, type Haseeb } from '@/db';

let h: Haseeb;

beforeEach(async () => {
  h = await openHaseeb({ ephemeral: true, seedIfEmpty: false });
});

afterEach(async () => {
  await h.db.close();
});

async function setup() {
  const customer = await h.customers.create({
    name: 'عميل آجل',
    kind: 'retail',
    phone: '',
    city: '',
    tier: null,
    minOrderQty: 0,
    sinceYear: null,
  });
  const product = await h.products.create({
    name: 'صنف آجل',
    sku: 'CREDIT-STATUS',
    cost: 500,
    price: 1_000,
    initialQty: 10,
  });
  return { customer, product };
}

describe('credit invoice settlement status', () => {
  it('derives overdue from the due date and marks the invoice paid after full settlement', async () => {
    const { customer, product } = await setup();
    const sale = await h.sales.checkout({
      lines: [{ productId: product.id, name: product.name, qty: 2, unit: product.price }],
      paymentMethod: 'credit',
      customerId: customer.id,
      vatRate: 0,
      dueAt: '2020-01-01T00:00:00.000Z',
    });

    expect(sale.invoice.status).toBe('overdue');

    await h.customers.recordPayment({
      customerId: customer.id,
      amount: 500,
      method: 'cash',
      direction: 'receivable',
    });
    expect((await h.sales.invoiceById(sale.invoice.id))?.status).toBe('overdue');

    await h.customers.recordPayment({
      customerId: customer.id,
      amount: 1_500,
      method: 'cash',
      direction: 'receivable',
    });
    expect((await h.sales.invoiceById(sale.invoice.id))?.status).toBe('paid');
  });

  it('blocks a return when FIFO allocation has applied part of a spanning payment to that invoice', async () => {
    const { customer, product } = await setup();
    const first = await h.sales.checkout({
      lines: [{ productId: product.id, name: product.name, qty: 1, unit: product.price }],
      paymentMethod: 'credit',
      customerId: customer.id,
      vatRate: 0,
      dueAt: '2099-01-01T00:00:00.000Z',
    });
    const second = await h.sales.checkout({
      lines: [{ productId: product.id, name: product.name, qty: 1, unit: product.price }],
      paymentMethod: 'credit',
      customerId: customer.id,
      vatRate: 0,
      dueAt: '2099-01-01T00:00:00.000Z',
    });

    await h.customers.recordPayment({
      customerId: customer.id,
      amount: 1_500,
      method: 'cash',
      direction: 'receivable',
    });

    expect((await h.sales.invoiceById(first.invoice.id))?.status).toBe('paid');
    expect((await h.sales.invoiceById(second.invoice.id))?.status).toBe('pending');

    await expect(
      h.accounting.returnInvoice(second.invoice.id, 'محاولة إرجاع بعد سداد جزئي'),
    ).rejects.toThrow('لا يمكن إرجاع فاتورة آجلة بعد تحصيل دفعة منها');
  });

  it('marks a fully returned unpaid credit invoice as settled instead of leaving it pending', async () => {
    const { customer, product } = await setup();
    const sale = await h.sales.checkout({
      lines: [{ productId: product.id, name: product.name, qty: 1, unit: product.price }],
      paymentMethod: 'credit',
      customerId: customer.id,
      vatRate: 0,
      dueAt: '2099-01-01T00:00:00.000Z',
    });

    await h.accounting.returnInvoice(sale.invoice.id, 'إلغاء البيع الآجل');
    expect((await h.sales.invoiceById(sale.invoice.id))?.status).toBe('paid');
    expect((await h.customers.debtTotals()).receivable).toBe(0);
  });
});
