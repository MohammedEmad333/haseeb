import { describe, expect, it } from 'vitest';
import { DEFAULT_VAT_RATE, computeTotals } from '@/domain/tax';

describe('VAT', () => {
  it('defaults to the Egyptian 14%', () => {
    expect(DEFAULT_VAT_RATE).toBe(14);
  });

  it('reproduces the invoice the design prints', () => {
    // ١,٢٤٠.٠٠ + ١٤٪ = ١٧٣.٦٠ ضريبة، والمستحق ١,٤١٣.٦٠
    const totals = computeTotals({ subtotal: 124_000 });
    expect(totals.vat).toBe(17_360);
    expect(totals.total).toBe(141_360);
  });

  it('charges VAT on the discounted amount, not the gross', () => {
    const totals = computeTotals({ subtotal: 50_000, discount: 2_000 });
    expect(totals.taxable).toBe(48_000);
    expect(totals.vat).toBe(6_720);
    expect(totals.total).toBe(54_720);
  });

  it('backs VAT out of tax-inclusive prices', () => {
    const totals = computeTotals({ subtotal: 141_360, priceIncludesVat: true });
    expect(totals.vat).toBe(17_360);
    expect(totals.taxable).toBe(124_000);
    // The customer still pays the shelf price.
    expect(totals.total).toBe(141_360);
  });

  it('handles a zero-rated sale', () => {
    const totals = computeTotals({ subtotal: 10_000, vatRate: 0 });
    expect(totals.vat).toBe(0);
    expect(totals.total).toBe(10_000);
  });

  it('refuses a discount larger than the sale', () => {
    expect(() => computeTotals({ subtotal: 1_000, discount: 1_001 })).toThrow(RangeError);
  });
});
