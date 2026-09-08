import { describe, expect, it } from 'vitest';
import {
  MAX_CUSTOM_DISCOUNT,
  priceWholesaleInvoice,
  priceWholesaleLine,
  tierDiscountPercent,
  tierForQuantity,
} from '@/domain/wholesale';

describe('wholesale tiers', () => {
  it('places quantities in the right tier, including the boundaries', () => {
    expect(tierForQuantity(49)).toBeNull();
    expect(tierForQuantity(50)?.name).toBe('silver');
    expect(tierForQuantity(149)?.name).toBe('silver');
    expect(tierForQuantity(150)?.name).toBe('gold');
    expect(tierForQuantity(299)?.name).toBe('gold');
    expect(tierForQuantity(300)?.name).toBe('platinum');
    expect(tierForQuantity(5_000)?.name).toBe('platinum');
  });

  it('gives no discount below the first threshold', () => {
    expect(tierDiscountPercent(10)).toBe(0);
    expect(tierDiscountPercent(0)).toBe(0);
  });

  it('applies the tier discount to a line', () => {
    // 300 × 12.90 = 3,870.00, less the platinum 14% = 3,328.20
    const line = priceWholesaleLine({ unitPrice: 1_290, qty: 300 });
    expect(line.tier?.name).toBe('platinum');
    expect(line.gross).toBe(387_000);
    expect(line.discount).toBe(54_180);
    expect(line.total).toBe(332_820);
  });

  it('replaces the tier discount with a custom one rather than stacking', () => {
    const line = priceWholesaleLine({ unitPrice: 1_000, qty: 300, customDiscountPercent: 20 });
    expect(line.discountPercent).toBe(20);
    // Stacking 14% then 20% would give 68,800; replacing gives 80% of gross.
    expect(line.total).toBe(240_000);
  });

  it('allows a zero custom discount to override the tier', () => {
    const line = priceWholesaleLine({ unitPrice: 1_000, qty: 300, customDiscountPercent: 0 });
    expect(line.discount).toBe(0);
    expect(line.total).toBe(300_000);
  });

  it('rejects a discount outside the permitted range', () => {
    expect(() =>
      priceWholesaleLine({ unitPrice: 100, qty: 10, customDiscountPercent: MAX_CUSTOM_DISCOUNT + 1 }),
    ).toThrow(RangeError);
    expect(() => priceWholesaleLine({ unitPrice: 100, qty: 10, customDiscountPercent: -1 })).toThrow(
      RangeError,
    );
  });

  it('prices a whole invoice, each line on its own tier', () => {
    const invoice = priceWholesaleInvoice([
      { unitPrice: 1_475, qty: 300 }, // platinum, 14%
      { unitPrice: 3_200, qty: 150 }, // gold, 9%
      { unitPrice: 1_000, qty: 10 }, //  below the first tier, 0%
    ]);
    expect(invoice.lines.map((l) => l.discountPercent)).toEqual([14, 9, 0]);
    expect(invoice.subtotal).toBe(invoice.gross - invoice.discount);
  });
});
