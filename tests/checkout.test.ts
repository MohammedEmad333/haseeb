/**
 * End-to-end tests against a real SQLite image: a sale has to move stock,
 * write an invoice, record an audit row and — on credit — open a debt, all
 * or nothing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHaseeb, type Haseeb } from '@/db';

let h: Haseeb;

beforeEach(async () => {
  h = await openHaseeb({ ephemeral: true });
});

afterEach(async () => {
  await h.db.close();
});

async function oilProduct() {
  const product = (await h.products.list()).find((p) => p.sku === 'SKU-2210');
  if (!product) throw new Error('seed product missing');
  return product;
}

describe('checkout', () => {
  it('decrements stock, writes the invoice and logs the movement', async () => {
    const before = await oilProduct();
    const auditBefore = (await h.ops.audit(500)).length;

    const { sale, invoice } = await h.sales.checkout({
      lines: [{ productId: before.id, name: before.name, qty: 2, unit: before.price, cost: before.cost }],
      paymentMethod: 'cash',
    });

    expect((await oilProduct()).qtyOnHand).toBe(before.qtyOnHand - 2);

    // 74.50 × 2 = 149.00, plus 14% VAT = 169.86
    expect(sale.subtotal).toBe(14_900);
    expect(sale.vat).toBe(2_086);
    expect(sale.total).toBe(16_986);
    // (74.50 − 64.00) × 2 = 21.00
    expect(sale.profit).toBe(2_100);

    expect(invoice.status).toBe('paid');
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.invoiceNo).toBe(sale.invoiceNo);

    // Every mutation lands in the audit trail.
    expect((await h.ops.audit(500)).length).toBeGreaterThan(auditBefore);

    const movement = (await h.products.movements(5)).find((m) => m.productId === before.id);
    expect(movement?.qtyDelta).toBe(-2);
    expect(movement?.qtyAfter).toBe(before.qtyOnHand - 2);
  });

  it('opens a debt for a credit sale and leaves the invoice pending', async () => {
    const product = await oilProduct();
    const customer = (await h.customers.list('retail'))[0];
    const owedBefore = (await h.customers.debtTotals()).receivable;

    const { invoice, debtId } = await h.sales.checkout({
      lines: [{ productId: product.id, name: product.name, qty: 1, unit: product.price, cost: product.cost }],
      paymentMethod: 'credit',
      customerId: customer.id,
    });

    expect(debtId).not.toBeNull();
    expect(invoice.status).toBe('pending');
    expect(invoice.dueAt).not.toBeNull();
    expect((await h.customers.debtTotals()).receivable).toBe(owedBefore + invoice.total);
  });

  it('rolls the whole sale back when a line exceeds stock', async () => {
    const product = await oilProduct();
    const stockBefore = product.qtyOnHand;
    const salesBefore = (await h.sales.recentSales(500)).length;

    await expect(
      h.sales.checkout({
        lines: [
          { productId: product.id, name: product.name, qty: stockBefore + 1, unit: product.price, cost: product.cost },
        ],
        paymentMethod: 'cash',
      }),
    ).rejects.toThrow();

    expect((await oilProduct()).qtyOnHand).toBe(stockBefore);
    expect(await h.sales.recentSales(500)).toHaveLength(salesBefore);
  });

  it('refuses a credit sale with no customer to bill', async () => {
    const product = await oilProduct();
    await expect(
      h.sales.checkout({
        lines: [{ productId: product.id, name: product.name, qty: 1, unit: product.price, cost: product.cost }],
        paymentMethod: 'credit',
      }),
    ).rejects.toThrow();
  });

  it('refuses an empty sale', async () => {
    await expect(h.sales.checkout({ lines: [], paymentMethod: 'cash' })).rejects.toThrow();
  });

  it('issues sequential invoice numbers', async () => {
    const product = await oilProduct();
    const line = { productId: product.id, name: product.name, qty: 1, unit: product.price, cost: product.cost };
    const first = await h.sales.checkout({ lines: [line], paymentMethod: 'cash' });
    const second = await h.sales.checkout({ lines: [line], paymentMethod: 'cash' });
    expect(Number(second.invoice.invoiceNo.slice(4))).toBe(
      Number(first.invoice.invoiceNo.slice(4)) + 1,
    );
  });

  it('queues each business mutation for the optional encrypted sync', async () => {
    const product = await oilProduct();
    const before = await h.ops.pendingSyncCount();
    await h.sales.checkout({
      lines: [{ productId: product.id, name: product.name, qty: 1, unit: product.price, cost: product.cost }],
      paymentMethod: 'cash',
    });
    expect(await h.ops.pendingSyncCount()).toBe(before + 1);
  });
});

describe('seeded ledger', () => {
  it('reproduces the design figures that reconcile', async () => {
    const totals = await h.customers.debtTotals();
    expect(totals.receivable).toBe(1_240_000); // ١٢,٤٠٠ ج.م
    expect(totals.receivableCount).toBe(18); // ١٨ عميلاً
    expect(totals.payable).toBe(385_000); // ٣,٨٥٠ ج.م
    expect(totals.payableCount).toBe(4); // ٤ موردين
    expect(totals.collectedThisMonth).toBe(964_000); // ٩,٦٤٠ ج.م
    expect(totals.collectedCount).toBe(23); // ٢٣ سداداً

    expect(await h.ops.totalExpenses()).toBe(948_000); // ٩,٤٨٠ ج.م

    const invoices = await h.sales.invoices();
    expect(invoices).toHaveLength(48); // ٤٨ فاتورة في الفترة
    expect(invoices.reduce((t, i) => t + i.total, 0)).toBe(6_240_000); // ٦٢,٤٠٠ ج.م
  });

  it('carries the six named invoices at their stated amounts', async () => {
    const named: Record<string, [number, number]> = {
      'INV-2481': [141_360, 31_020],
      'INV-2480': [428_000, 74_000],
      'INV-2479': [145_000, 28_000],
      'INV-2478': [912_000, 134_000],
      'INV-2477': [267_050, 49_030],
      'INV-2476': [84_000, 16_000],
    };
    for (const [no, [total, profit]] of Object.entries(named)) {
      const invoice = await h.sales.invoiceByNo(no);
      expect(invoice, no).not.toBeNull();
      expect(invoice!.total, no).toBe(total);
      expect(invoice!.profit, no).toBe(profit);
    }
  });

  it('reconciles the printed tax invoice to the piaster', async () => {
    const invoice = (await h.sales.invoiceByNo('INV-2481'))!;
    const lineSum = invoice.lines.reduce((t, l) => t + l.total, 0);
    expect(lineSum).toBe(124_000); // ١,٢٤٠.٠٠ قبل الضريبة
    expect(invoice.vat).toBe(17_360); // ١٧٣.٦٠ ضريبة
    expect(invoice.subtotal + invoice.vat).toBe(invoice.total);
  });

  it('ages محمود عبد الله exactly as the design describes him', async () => {
    const debtor = (await h.customers.debtors()).find((d) => d.name === 'محمود عبد الله');
    expect(debtor).toBeDefined();
    expect(debtor!.outstanding).toBe(145_000); // ١,٤٥٠ ج.م
    expect(debtor!.aging.status).toBe('overdue');
    expect(debtor!.aging.daysOverdue).toBe(12); // متأخر ١٢ يوماً
  });

  it('matches the design stock table', async () => {
    const expected: Record<string, [number, string]> = {
      'SKU-1042': [48, 'inStock'],
      'SKU-2210': [12, 'low'],
      'SKU-3388': [7, 'critical'],
      'SKU-1177': [22, 'inStock'],
      'SKU-4501': [90, 'inStock'],
      'SKU-3390': [16, 'low'],
      'SKU-5020': [120, 'inStock'],
    };
    for (const product of await h.products.list()) {
      const row = expected[product.sku];
      if (!row) continue;
      expect(product.qtyOnHand, product.sku).toBe(row[0]);
      expect(product.status, product.sku).toBe(row[1]);
    }
  });

  it('does not queue seed data for sync', async () => {
    // Seeding is local initialisation, not a business event to push.
    expect(await h.ops.pendingSyncCount()).toBe(0);
  });
});
