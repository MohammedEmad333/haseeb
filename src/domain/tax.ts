/**
 * Egyptian VAT. The rate lives in the business profile so a different
 * jurisdiction only changes a row in the database, never this file.
 */

import { applyPercent, assertPiasters, type Piasters } from './money';

export const DEFAULT_VAT_RATE = 14;

export interface TotalsInput {
  /** Sum of the line totals, before any discount. */
  subtotal: Piasters;
  /** Invoice-level discount, as a positive piaster amount. */
  discount?: Piasters;
  /** VAT percentage, e.g. 14. */
  vatRate?: number;
  /** Prices already include VAT (common in retail POS). */
  priceIncludesVat?: boolean;
}

export interface Totals {
  subtotal: Piasters;
  discount: Piasters;
  /** Amount VAT is charged on: subtotal − discount. */
  taxable: Piasters;
  vat: Piasters;
  total: Piasters;
  vatRate: number;
}

/**
 * The single place invoice totals are computed. POS, wholesale and the tax
 * invoice all call this, so the three screens can never disagree.
 */
export function computeTotals({
  subtotal,
  discount = 0,
  vatRate = DEFAULT_VAT_RATE,
  priceIncludesVat = false,
}: TotalsInput): Totals {
  assertPiasters(subtotal, 'subtotal');
  assertPiasters(discount, 'discount');
  if (discount > subtotal) {
    throw new RangeError('discount cannot exceed the subtotal');
  }
  if (vatRate < 0) throw new RangeError('VAT rate cannot be negative');

  const net = subtotal - discount;

  if (priceIncludesVat) {
    // Back out the tax already inside the price: vat = gross × r / (100 + r).
    const vat = Math.round((net * vatRate) / (100 + vatRate));
    return {
      subtotal,
      discount,
      taxable: net - vat,
      vat,
      total: net,
      vatRate,
    };
  }

  const vat = applyPercent(net, vatRate);
  return { subtotal, discount, taxable: net, vat, total: net + vat, vatRate };
}
