/**
 * Money is stored and computed in **integer minor units (piasters)**.
 * Floating point never touches an amount: 0.1 + 0.2 problems become
 * customer-visible rounding errors on an invoice, and an accounting app
 * cannot afford them.
 */

export type Piasters = number;

/** Guard: every amount that enters the domain must be a whole number. */
export function assertPiasters(value: number, what = 'amount'): Piasters {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`${what} must be an integer number of piasters, got ${value}`);
  }
  return value;
}

/** Convert pounds (as typed by a human) to piasters. */
export function poundsToPiasters(pounds: number): Piasters {
  return Math.round(pounds * 100);
}

export function piastersToPounds(piasters: Piasters): number {
  return piasters / 100;
}

/**
 * Half-up rounding on integers — the convention Egyptian invoices use, and
 * the one `Math.round` gets wrong for negatives (it rounds −0.5 to −0).
 */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** `amount × qty`, exact. */
export function multiply(unit: Piasters, qty: number): Piasters {
  assertPiasters(unit, 'unit price');
  if (!Number.isInteger(qty) || qty < 0) {
    throw new RangeError(`quantity must be a non-negative integer, got ${qty}`);
  }
  return unit * qty;
}

/**
 * Apply a percentage to a piaster amount, rounding half-up to the piaster.
 * `percent` is a plain number: 14 means 14%.
 */
export function applyPercent(amount: Piasters, percent: number): Piasters {
  assertPiasters(amount);
  return roundHalfUp((amount * percent) / 100);
}

export function sum(amounts: readonly Piasters[]): Piasters {
  return amounts.reduce<Piasters>((total, a) => total + assertPiasters(a), 0);
}

/**
 * Split an amount into `parts` shares that add back up to exactly the
 * original — the largest-remainder method. Used when allocating an
 * invoice-level discount across its lines.
 */
export function allocate(amount: Piasters, weights: readonly number[]): Piasters[] {
  assertPiasters(amount);
  const totalWeight = weights.reduce((t, w) => t + w, 0);
  if (totalWeight <= 0) return weights.map(() => 0);

  const raw = weights.map((w) => (amount * w) / totalWeight);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = amount - floors.reduce((t, f) => t + f, 0);

  // Hand the leftover piasters to the lines with the largest fractional part.
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const result = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i] += 1;
    remainder -= 1;
  }
  return result;
}
