import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHaseeb, type Haseeb } from '@/db';

let h: Haseeb;

beforeEach(async () => {
  h = await openHaseeb({ ephemeral: true, seedIfEmpty: false });
});

afterEach(async () => {
  await h.db.close();
});

describe('adding inventory products', () => {
  it('creates the product and records its opening stock', async () => {
    const product = await h.products.create({
      name: 'قهوة عربية',
      sku: 'COFFEE-1',
      barcode: '6251234567890',
      cost: 1_250,
      price: 1_800,
      initialQty: 12,
      lowThreshold: 5,
      critThreshold: 2,
      supplier: 'المورد المحلي',
    });

    expect(product).toMatchObject({ sku: 'COFFEE-1', qtyOnHand: 12, cost: 1_250, price: 1_800 });
    expect(await h.products.search('6251234567890')).toEqual([product]);

    const movement = (await h.products.movements(1))[0];
    expect(movement).toMatchObject({ productId: product.id, kind: 'purchase', qtyDelta: 12, qtyAfter: 12 });
    expect(movement.counterparty).toBe('المورد المحلي');
  });

  it('books opening stock to equity even when a supplier label is stored', async () => {
    const product = await h.products.create({
      name: 'رصيد افتتاحي',
      sku: 'OPENING-1',
      cost: 1_000,
      price: 1_500,
      initialQty: 3,
      supplier: 'مورد قديم',
    });

    const movement = (await h.products.movements(1))[0];
    expect(movement).toMatchObject({
      productId: product.id,
      kind: 'purchase',
      counterparty: 'مورد قديم',
    });

    const lines = await h.db.all(
      `SELECT account_id, debit_piasters, credit_piasters
       FROM journal_lines WHERE journal_id = ? ORDER BY account_id`,
      [`je-stock-${movement.id}`],
    );
    expect(lines).toEqual([
      { account_id: 'acc-equity', debit_piasters: 0, credit_piasters: 3_000 },
      { account_id: 'acc-inventory', debit_piasters: 3_000, credit_piasters: 0 },
    ]);
  });

  it('treats cash stock receipts as inventory paid from the cash drawer', async () => {
    const product = await h.products.create({
      name: 'توريد نقدي',
      sku: 'CASH-PURCHASE',
      cost: 750,
      price: 1_000,
      initialQty: 0,
    });

    await h.accounting.openShift(10_000);
    await h.products.move({
      productId: product.id,
      kind: 'purchase',
      qty: 4,
      purchaseMethod: 'cash',
    });

    expect((await h.products.byId(product.id))?.qtyOnHand).toBe(4);
    expect((await h.customers.debtTotals()).payable).toBe(0);

    const movement = (await h.products.movements(1))[0];
    const lines = await h.db.all(
      `SELECT account_id, debit_piasters, credit_piasters
       FROM journal_lines WHERE journal_id = ? ORDER BY account_id`,
      [`je-stock-${movement.id}`],
    );
    expect(lines).toEqual([
      { account_id: 'acc-cash', debit_piasters: 0, credit_piasters: 3_000 },
      { account_id: 'acc-inventory', debit_piasters: 3_000, credit_piasters: 0 },
    ]);

    const closed = await h.accounting.closeShift(7_000);
    expect(closed).toMatchObject({
      expectedCash: 7_000,
      actualCash: 7_000,
      difference: 0,
    });
  });

  it('creates a supplier payable for a credit stock receipt without reducing cash', async () => {
    const supplier = await h.customers.create({
      name: 'مورد آجل',
      kind: 'supplier',
      phone: '',
      city: '',
      tier: null,
      minOrderQty: 0,
      sinceYear: null,
    });
    const product = await h.products.create({
      name: 'توريد آجل',
      sku: 'CREDIT-PURCHASE',
      cost: 1_200,
      price: 1_800,
      initialQty: 0,
    });

    await h.accounting.openShift(10_000);
    await h.products.move({
      productId: product.id,
      kind: 'purchase',
      qty: 5,
      purchaseMethod: 'credit',
      counterpartyId: supplier.id,
    });

    const payables = await h.customers.debtors('payable');
    expect(payables.find((row) => row.id === supplier.id)?.outstanding).toBe(6_000);

    const movement = (await h.products.movements(1))[0];
    expect(movement.counterparty).toBe('مورد آجل');
    const lines = await h.db.all(
      `SELECT account_id, debit_piasters, credit_piasters
       FROM journal_lines WHERE journal_id = ? ORDER BY account_id`,
      [`je-stock-${movement.id}`],
    );
    expect(lines).toEqual([
      { account_id: 'acc-ap', debit_piasters: 0, credit_piasters: 6_000 },
      { account_id: 'acc-inventory', debit_piasters: 6_000, credit_piasters: 0 },
    ]);

    const closed = await h.accounting.closeShift(10_000);
    expect(closed).toMatchObject({
      expectedCash: 10_000,
      actualCash: 10_000,
      difference: 0,
    });
  });

  it('requires a registered supplier for credit stock receipts', async () => {
    const product = await h.products.create({
      name: 'توريد بدون مورد',
      sku: 'CREDIT-NO-SUPPLIER',
      cost: 500,
      price: 750,
      initialQty: 0,
    });

    await expect(
      h.products.move({
        productId: product.id,
        kind: 'purchase',
        qty: 2,
        purchaseMethod: 'credit',
      }),
    ).rejects.toThrow('اختيار مورد مسجل');

    expect((await h.products.byId(product.id))?.qtyOnHand).toBe(0);
  });

  it('rejects invalid stock movements and price updates', async () => {
    const product = await h.products.create({
      name: 'صنف تحقق',
      sku: 'VALIDATE-1',
      cost: 1_000,
      price: 1_500,
      initialQty: 5,
    });

    await expect(
      h.products.move({ productId: product.id, kind: 'purchase', qty: -3 }),
    ).rejects.toThrow();
    await expect(
      h.products.move({ productId: product.id, kind: 'sale', qty: 0 }),
    ).rejects.toThrow();
    expect((await h.products.byId(product.id))?.qtyOnHand).toBe(5);

    await expect(h.products.updatePrice(product.id, -1)).rejects.toThrow();
    await expect(h.products.updatePrice(product.id, 12.5)).rejects.toThrow();
    expect((await h.products.byId(product.id))?.price).toBe(1_500);
  });

  it('rejects duplicate SKUs and barcodes', async () => {
    await h.products.create({ name: 'صنف أول', sku: 'ONE', barcode: '12345', cost: 100, price: 150 });

    await expect(
      h.products.create({ name: 'صنف ثان', sku: 'ONE', cost: 100, price: 150 }),
    ).rejects.toThrow('رمز الصنف مستخدم');
    await expect(
      h.products.create({ name: 'صنف ثان', sku: 'TWO', barcode: '12345', cost: 100, price: 150 }),
    ).rejects.toThrow('الباركود مستخدم');
  });
});
