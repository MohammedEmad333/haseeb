/**
 * Stock levels and the movements that change them.
 *
 * Every quantity change in the app goes through `applyMovement`, so the
 * warehouse timeline and the product row can never drift apart.
 */

export type StockStatus = 'inStock' | 'low' | 'critical';

export type MovementKind =
  | 'purchase' // توريد        — inbound from a supplier
  | 'sale' // بيع            — outbound to a customer
  | 'return' // مرتجع          — inbound from a customer
  | 'adjustment'; // جرد وتسوية   — a stock-take correction

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  purchase: 'توريد',
  sale: 'بيع',
  return: 'مرتجع',
  adjustment: 'جرد وتسوية',
};

/**
 * Which way a movement of each kind pushes the quantity. Adjustments carry
 * their own sign because a stock-take can go either way.
 */
export function movementDelta(kind: MovementKind, qty: number): number {
  if (!Number.isInteger(qty)) {
    throw new RangeError(`movement quantity must be an integer, got ${qty}`);
  }
  switch (kind) {
    case 'purchase':
    case 'return':
      return Math.abs(qty);
    case 'sale':
      return -Math.abs(qty);
    case 'adjustment':
      return qty;
  }
}

export interface StockThresholds {
  /** At or below this, the item is «كمية منخفضة». */
  low: number;
  /** At or below this, the item is «إنذار نفاد». */
  critical: number;
}

export const DEFAULT_THRESHOLDS: StockThresholds = { low: 20, critical: 10 };

export function stockStatus(
  qty: number,
  thresholds: StockThresholds = DEFAULT_THRESHOLDS,
): StockStatus {
  if (qty <= thresholds.critical) return 'critical';
  if (qty <= thresholds.low) return 'low';
  return 'inStock';
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  inStock: 'متوفر',
  low: 'كمية منخفضة',
  critical: 'إنذار نفاد',
};

/**
 * Apply a movement to an on-hand quantity.
 *
 * Selling more than is on hand is refused rather than silently going
 * negative — a POS that lets stock drop below zero produces a warehouse
 * report nobody can reconcile.
 */
export function applyMovement(onHand: number, kind: MovementKind, qty: number): number {
  const next = onHand + movementDelta(kind, qty);
  if (next < 0) {
    throw new RangeError(
      `movement would drive stock negative (on hand ${onHand}, ${kind} ${qty})`,
    );
  }
  return next;
}

/** Gross profit on a line: (sale price − cost) × qty, in piasters. */
export function lineProfit(unitPrice: number, unitCost: number, qty: number): number {
  return (unitPrice - unitCost) * qty;
}

/** Margin as a percentage of revenue, guarded against a zero denominator. */
export function marginPercent(revenue: number, profit: number): number {
  if (revenue === 0) return 0;
  return (profit / revenue) * 100;
}
