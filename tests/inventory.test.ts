import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  applyMovement,
  lineProfit,
  marginPercent,
  movementDelta,
  stockStatus,
} from '@/domain/inventory';

describe('stock', () => {
  it('signs each movement kind correctly', () => {
    expect(movementDelta('purchase', 60)).toBe(60);
    expect(movementDelta('return', 2)).toBe(2);
    expect(movementDelta('sale', 5)).toBe(-5);
    // A stock-take keeps its own sign, in both directions.
    expect(movementDelta('adjustment', -3)).toBe(-3);
    expect(movementDelta('adjustment', 4)).toBe(4);
  });

  it('normalises a negative quantity on a directional movement', () => {
    expect(movementDelta('sale', -5)).toBe(-5);
    expect(movementDelta('purchase', -60)).toBe(60);
  });

  it('decrements stock on a sale', () => {
    expect(applyMovement(48, 'sale', 5)).toBe(43);
    expect(applyMovement(12, 'purchase', 60)).toBe(72);
  });

  it('refuses to drive stock negative', () => {
    expect(() => applyMovement(7, 'sale', 8)).toThrow(RangeError);
    expect(() => applyMovement(2, 'adjustment', -3)).toThrow(RangeError);
    // Selling the last unit is fine; selling one more is not.
    expect(applyMovement(7, 'sale', 7)).toBe(0);
  });

  it('classifies stock against the thresholds', () => {
    expect(stockStatus(48)).toBe('inStock');
    expect(stockStatus(DEFAULT_THRESHOLDS.low)).toBe('low');
    expect(stockStatus(12)).toBe('low');
    expect(stockStatus(DEFAULT_THRESHOLDS.critical)).toBe('critical');
    expect(stockStatus(7)).toBe('critical');
    expect(stockStatus(0)).toBe('critical');
  });

  it('computes profit and margin', () => {
    // زيت عافية: 74.50 sale, 64.00 cost, 8 units.
    expect(lineProfit(7_450, 6_400, 8)).toBe(8_400);
    expect(marginPercent(4_820_000, 1_146_000)).toBeCloseTo(23.78, 2);
    expect(marginPercent(0, 0)).toBe(0);
  });
});
