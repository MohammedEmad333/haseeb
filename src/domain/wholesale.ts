/**
 * Volume-tier pricing for بيع الجملة.
 *
 * Tiers are matched on the line quantity; a per-invoice custom discount can
 * override the tier when the sales rep negotiates one.
 */

import { applyPercent, multiply, type Piasters } from './money';

export type TierName = 'silver' | 'gold' | 'platinum';

export interface Tier {
  name: TierName;
  labelAr: string;
  /** Inclusive lower bound in units. */
  minQty: number;
  /** Inclusive upper bound, or null for open-ended. */
  maxQty: number | null;
  /** Discount off the retail price, in percent. */
  discountPercent: number;
}

/** The three tiers from the design, ordered by threshold. */
export const TIERS: readonly Tier[] = [
  { name: 'silver', labelAr: 'فضية', minQty: 50, maxQty: 149, discountPercent: 5 },
  { name: 'gold', labelAr: 'ذهبية', minQty: 150, maxQty: 299, discountPercent: 9 },
  { name: 'platinum', labelAr: 'بلاتينية', minQty: 300, maxQty: null, discountPercent: 14 },
];

export const MAX_CUSTOM_DISCOUNT = 30;

/** The tier a quantity falls into, or null below the smallest threshold. */
export function tierForQuantity(qty: number): Tier | null {
  if (!Number.isInteger(qty) || qty < 0) {
    throw new RangeError(`quantity must be a non-negative integer, got ${qty}`);
  }
  for (const tier of TIERS) {
    if (qty >= tier.minQty && (tier.maxQty === null || qty <= tier.maxQty)) return tier;
  }
  return null;
}

/** The discount percent that applies to a quantity — 0 below the first tier. */
export function tierDiscountPercent(qty: number): number {
  return tierForQuantity(qty)?.discountPercent ?? 0;
}

export interface WholesaleLineInput {
  unitPrice: Piasters;
  qty: number;
  /**
   * Per-invoice override, 0–30. When set it *replaces* the tier discount
   * rather than stacking with it — two discounts on one line is how margins
   * quietly disappear.
   */
  customDiscountPercent?: number | null;
}

export interface WholesaleLine {
  unitPrice: Piasters;
  qty: number;
  gross: Piasters;
  discountPercent: number;
  discount: Piasters;
  total: Piasters;
  tier: Tier | null;
}

export function priceWholesaleLine({
  unitPrice,
  qty,
  customDiscountPercent = null,
}: WholesaleLineInput): WholesaleLine {
  const tier = tierForQuantity(qty);
  let discountPercent = tier?.discountPercent ?? 0;

  if (customDiscountPercent !== null && customDiscountPercent !== undefined) {
    if (customDiscountPercent < 0 || customDiscountPercent > MAX_CUSTOM_DISCOUNT) {
      throw new RangeError(
        `custom discount must be between 0 and ${MAX_CUSTOM_DISCOUNT}, got ${customDiscountPercent}`,
      );
    }
    discountPercent = customDiscountPercent;
  }

  const gross = multiply(unitPrice, qty);
  const discount = applyPercent(gross, discountPercent);
  return { unitPrice, qty, gross, discountPercent, discount, total: gross - discount, tier };
}

/** Price a whole wholesale invoice under one custom-discount setting. */
export function priceWholesaleInvoice(
  lines: readonly Omit<WholesaleLineInput, 'customDiscountPercent'>[],
  customDiscountPercent: number | null = null,
): { lines: WholesaleLine[]; gross: Piasters; discount: Piasters; subtotal: Piasters } {
  const priced = lines.map((l) => priceWholesaleLine({ ...l, customDiscountPercent }));
  const gross = priced.reduce((t, l) => t + l.gross, 0);
  const discount = priced.reduce((t, l) => t + l.discount, 0);
  return { lines: priced, gross, discount, subtotal: gross - discount };
}
