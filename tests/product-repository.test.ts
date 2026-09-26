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
    const supplier = await h.customers.create({
      name: 'المورد المحلي',
      kind: 'supplier',
      phone: '',
      city: '',
      tier: null,
      minOrderQty: 0,
      sinceYear: null,
    });
    const product = await h.products.create({
      name: 'قهوة عربية',
      sku: 'COFFEE-1',
      barcode: '6251234567890',
      cost: 1_250,
      price: 1_800,
      initialQty: 12,
      lowThreshold: 5,
      critThreshold: 2,
      supplier: supplier.name,
      supplierId: supplier.id,
    });

    expect(product).toMatchObject({ sku: 'COFFEE-1', qtyOnHand: 12, cost: 1_250, price: 1_800 });
    expect(await h.products.search('6251234567890')).toEqual([product]);

    const movement = (await h.products.movements(1))[0];
    expect(movement).toMatchObject({ productId: product.id, kind: 'purchase', qtyDelta: 12, qtyAfter: 12 });
    expect(movement.counterparty).toBe('المورد المحلي');

    const payable = (await h.customers.debtors('payable')).find((row) => row.id === supplier.id);
    expect(payable?.outstanding).toBe(15_000);

    const trial = await h.accounting.trialBalance();
    expect(trial.find((row) => row.id === 'acc-ap')?.balance).toBe(-15_000);
  });

  it('rejects free-text supplier purchases that would create untracked payables', async () => {
    await expect(
      h.products.create({
        name: 'صنف مورد غير مربوط',
        sku: 'UNLINKED-SUPPLIER',
        cost: 500,
        price: 800,
        initialQty: 2,
        supplier: 'اسم نصي فقط',
      }),
    ).rejects.toThrow('اختر المورد من قائمة الموردين');
  });

  it('posts cash receipts against cash without creating supplier debt', async () => {
    const product = await h.products.create({
      name: 'صنف شراء نقدي',
      sku: 'CASH-PURCHASE',
      cost: 1_000,
      price: 1_500,
      initialQty: 0,
    });

    await h.products.move({
      productId: product.id,
      kind: 'purchase',
      qty: 3,
      paymentMethod: 'cash',
    });

    const trial = await h.accounting.trialBalance();
    expect(trial.find((row) => row.id === 'acc-inventory')?.balance).toBe(3_000);
    expect(trial.find((row) => row.id === 'acc-cash')?.balance).toBe(-3_000);
    expect(trial.find((row) => row.id === 'acc-ap')?.balance).toBe(0);
    expect((await h.customers.debtTotals()).payable).toBe(0);
  });

  it('requires a supplier for credit receipts and creates a payable', async () => {
    const product = await h.products.create({
      name: 'صنف شراء آجل',
      sku: 'CREDIT-PURCHASE',
      cost: 2_000,
      price: 2_500,
      initialQty: 0,
    });

    await expect(
      h.products.move({
        productId: product.id,
        kind: 'purchase',
        qty: 2,
        paymentMethod: 'credit',
      }),
    ).rejects.toThrow('اختر مورداً');

    const supplier = await h.customers.create({
      name: 'مورد آجل',
      kind: 'supplier',
      phone: '',
      city: '',
      tier: null,
      minOrderQty: 0,
      sinceYear: null,
    });
    await h.products.move({
      productId: product.id,
      kind: 'purchase',
      qty: 2,
      paymentMethod: 'credit',
      supplierId: supplier.id,
      counterparty: supplier.name,
    });

    const payable = (await h.customers.debtors('payable')).find((row) => row.id === supplier.id);
    expect(payable?.outstanding).toBe(4_000);
    const trial = await h.accounting.trialBalance();
    expect(trial.find((row) => row.id === 'acc-ap')?.balance).toBe(-4_000);
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
