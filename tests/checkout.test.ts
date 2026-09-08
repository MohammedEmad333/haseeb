/**
 * End-to-end tests against a real SQLite image: a sale has to move stock,
 * write an invoice, record an audit row and — on credit — open a debt, all
 * or nothing.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { openHaseeb, type Haseeb } from '@/db';

let h: Haseeb;

beforeEach(async () => {
  h = await openHaseeb({ ephemeral: true });
});

function oilProduct() {
  const product = h.products.list().find((p) => p.sku === 'SKU-2210');
  if (!product) throw new Error('seed product missing');
  return product;
}

describe('checkout', () => {
  it('decrements stock, writes the invoice and logs the movement', () => {
    const before = oilProduct();
    const auditBefore = h.ops.audit(500).length;

    const { sale, invoice } = h.sales.checkout({
      lines: [{ productId: before.id, name: before.name, qty: 2, unit: before.price, cost: before.cost }],
      paymentMethod: 'cash',
    });

    expect(oilProduct().qtyOnHand).toBe(before.qtyOnHand - 2);

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
    expect(h.ops.audit(500).length).toBeGreaterThan(auditBefore);

    const movement = h.products.movements(5).find((m) => m.productId === before.id);
    expect(movement?.qtyDelta).toBe(-2);
    expect(movement?.qtyAfter).toBe(before.qtyOnHand - 2);
  });

  it('opens a debt for a credit sale and leaves the invoice pending', () => {
    const product = oilProduct();
    const customer = h.customers.list('retail')[0];
    const owedBefore = h.customers.debtTotals().receivable;

    const { invoice, debtId } = h.sales.checkout({
      lines: [{ productId: product.id, name: product.name, qty: 1, unit: product.price, cost: product.cost }],
      paymentMethod: 'credit',
      customerId: customer.id,
    });

    expect(debtId).not.toBeNull();
    expect(invoice.status).toBe('pending');
    expect(invoice.dueAt).not.toBeNull();
    expect(h.customers.debtTotals().receivable).toBe(owedBefore + invoice.total);
  });

  it('rolls the whole sale back when a line exceeds stock', () => {
    const product = oilProduct();
    const stockBefore = product.qtyOnHand;
    const salesBefore = h.sales.recentSales(500).length;

    expect(() =>
      h.sales.checkout({
        lines: [
          { productId: product.id, name: product.name, qty: stockBefore + 1, unit: product.price, cost: product.cost },
        ],
        paymentMethod: 'cash',
      }),
    ).toThrow();

    expect(oilProduct().qtyOnHand).toBe(stockBefore);
    expect(h.sales.recentSales(500)).toHaveLength(salesBefore);
  });

  it('refuses a credit sale with no customer to bill', () => {
    const product = oilProduct();
    expect(() =>
      h.sales.checkout({
        lines: [{ productId: product.id, name: product.name, qty: 1, unit: product.price, cost: product.cost }],
        paymentMethod: 'credit',
      }),
    ).toThrow();
  });

  it('refuses an empty sale', () => {
    expect(() => h.sales.checkout({ lines: [], paymentMethod: 'cash' })).toThrow();
  });

  it('issues sequential invoice numbers', () => {
    const product = oilProduct();
    const line = { productId: product.id, name: product.name, qty: 1, unit: product.price, cost: product.cost };
    const first = h.sales.checkout({ lines: [line], paymentMethod: 'cash' });
    const second = h.sales.checkout({ lines: [line], paymentMethod: 'cash' });
    expect(Number(second.invoice.invoiceNo.slice(4))).toBe(
      Number(first.invoice.invoiceNo.slice(4)) + 1,
    );
  });

  it('queues each business mutation for the optional encrypted sync', () => {
    const product = oilProduct();
    const before = h.ops.pendingSyncCount();
    h.sales.checkout({
      lines: [{ productId: product.id, name: product.name, qty: 1, unit: product.price, cost: product.cost }],
      paymentMethod: 'cash',
    });
    expect(h.ops.pendingSyncCount()).toBe(before + 1);
  });
});

describe('seeded ledger', () => {
  it('reproduces the design figures that reconcile', () => {
    const totals = h.customers.debtTotals();
    expect(totals.receivable).toBe(1_240_000); // ١٢,٤٠٠ ج.م
    expect(totals.receivableCount).toBe(18); // ١٨ عميلاً
    expect(totals.payable).toBe(385_000); // ٣,٨٥٠ ج.م
    expect(totals.payableCount).toBe(4); // ٤ موردين
    expect(totals.collectedThisMonth).toBe(964_000); // ٩,٦٤٠ ج.م
    expect(totals.collectedCount).toBe(23); // ٢٣ سداداً

    expect(h.ops.totalExpenses()).toBe(948_000); // ٩,٤٨٠ ج.م

    const invoices = h.sales.invoices();
    expect(invoices).toHaveLength(48); // ٤٨ فاتورة في الفترة
    expect(invoices.reduce((t, i) => t + i.total, 0)).toBe(6_240_000); // ٦٢,٤٠٠ ج.م
  });

  it('carries the six named invoices at their stated amounts', () => {
    const named: Record<string, [number, number]> = {
      'INV-2481': [141_360, 31_020],
      'INV-2480': [428_000, 74_000],
      'INV-2479': [145_000, 28_000],
      'INV-2478': [912_000, 134_000],
      'INV-2477': [267_050, 49_030],
      'INV-2476': [84_000, 16_000],
    };
    for (const [no, [total, profit]] of Object.entries(named)) {
      const invoice = h.sales.invoiceByNo(no);
      expect(invoice, no).not.toBeNull();
      expect(invoice!.total, no).toBe(total);
      expect(invoice!.profit, no).toBe(profit);
    }
  });

  it('reconciles the printed tax invoice to the piaster', () => {
    const invoice = h.sales.invoiceByNo('INV-2481')!;
    const lineSum = invoice.lines.reduce((t, l) => t + l.total, 0);
    expect(lineSum).toBe(124_000); // ١,٢٤٠.٠٠ قبل الضريبة
    expect(invoice.vat).toBe(17_360); // ١٧٣.٦٠ ضريبة
    expect(invoice.subtotal + invoice.vat).toBe(invoice.total);
  });

  it('ages محمود عبد الله exactly as the design describes him', () => {
    const debtor = h.customers.debtors().find((d) => d.name === 'محمود عبد الله');
    expect(debtor).toBeDefined();
    expect(debtor!.outstanding).toBe(145_000); // ١,٤٥٠ ج.م
    expect(debtor!.aging.status).toBe('overdue');
    expect(debtor!.aging.daysOverdue).toBe(12); // متأخر ١٢ يوماً
  });

  it('matches the design stock table', () => {
    const expected: Record<string, [number, string]> = {
      'SKU-1042': [48, 'inStock'],
      'SKU-2210': [12, 'low'],
      'SKU-3388': [7, 'critical'],
      'SKU-1177': [22, 'inStock'],
      'SKU-4501': [90, 'inStock'],
      'SKU-3390': [16, 'low'],
      'SKU-5020': [120, 'inStock'],
    };
    for (const product of h.products.list()) {
      const row = expected[product.sku];
      if (!row) continue;
      expect(product.qtyOnHand, product.sku).toBe(row[0]);
      expect(product.status, product.sku).toBe(row[1]);
    }
  });

  it('does not queue seed data for sync', () => {
    // Seeding is local initialisation, not a business event to push.
    expect(h.ops.pendingSyncCount()).toBe(0);
  });
});
