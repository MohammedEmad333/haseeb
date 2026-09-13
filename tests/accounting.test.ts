import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHaseeb, type Haseeb } from '@/db';

let h: Haseeb;

beforeEach(async () => {
  h = await openHaseeb({ ephemeral: true, seedIfEmpty: false });
});

afterEach(async () => {
  await h.db.close();
});

async function sale(paymentMethod: 'cash' | 'credit' = 'cash') {
  const product = await h.products.create({
    name: 'صنف محاسبي', sku: `ACC-${paymentMethod}`, cost: 500, price: 1_000, initialQty: 10,
  });
  const result = await h.sales.checkout({
    lines: [{ productId: product.id, name: product.name, qty: 2, unit: product.price, cost: product.cost }],
    paymentMethod,
    vatRate: 0,
  });
  return { product, result };
}

describe('double-entry accounting', () => {
  it('posts every sale as a balanced journal and exposes a trial balance', async () => {
    await sale();
    const journals = await h.accounting.journals();
    const saleJournal = journals.find((entry) => entry.referenceType === 'sale');
    expect(saleJournal).toMatchObject({ debit: 3_000, credit: 3_000 });

    const trial = await h.accounting.trialBalance();
    expect(trial.reduce((sum, row) => sum + row.debit, 0)).toBe(
      trial.reduce((sum, row) => sum + row.credit, 0),
    );
  });

  it('issues a full credit note, restores stock, and reverses sales analytics', async () => {
    const { product, result } = await sale();
    const note = await h.accounting.returnInvoice(result.invoice.id, 'استرجاع من العميل');

    expect(note).toMatchObject({ noteNo: 'CN-0001', total: 2_000 });
    expect((await h.products.byId(product.id))?.qtyOnHand).toBe(10);
    expect((await h.analytics.todayTotals()).sales).toBe(0);
    const journal = (await h.accounting.journals()).find((entry) => entry.referenceType === 'credit_note');
    expect(journal?.debit).toBe(journal?.credit);
  });

  it('reconciles the cash drawer against cash sales and expenses', async () => {
    await h.accounting.openShift(10_000);
    await sale();
    await h.ops.addExpense({ label: 'نقل', amount: 500 });
    const closed = await h.accounting.closeShift(11_500);

    expect(closed).toMatchObject({ expectedCash: 11_500, actualCash: 11_500, difference: 0, status: 'closed' });
  });
});
