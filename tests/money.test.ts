import { describe, expect, it } from 'vitest';
import {
  allocate,
  applyPercent,
  assertPiasters,
  multiply,
  poundsToPiasters,
  roundHalfUp,
  sum,
} from '@/domain/money';

describe('money', () => {
  it('keeps amounts as whole piasters', () => {
    expect(poundsToPiasters(74.5)).toBe(7450);
    expect(poundsToPiasters(14.75)).toBe(1475);
    // The classic float trap: 0.1 + 0.2 is 0.30000000000000004 in binary
    // floating point, but three piaster amounts must add to exactly 30.
    expect(sum([poundsToPiasters(0.1), poundsToPiasters(0.2)])).toBe(30);
  });

  it('refuses fractional piasters', () => {
    expect(() => assertPiasters(10.5)).toThrow(RangeError);
    expect(() => assertPiasters(Number.NaN)).toThrow(RangeError);
  });

  it('rounds half away from zero, including negatives', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(2.4)).toBe(2);
  });

  it('multiplies exactly and rejects bad quantities', () => {
    expect(multiply(7450, 3)).toBe(22350);
    expect(() => multiply(7450, 1.5)).toThrow(RangeError);
    expect(() => multiply(7450, -1)).toThrow(RangeError);
  });

  it('applies percentages with half-up rounding', () => {
    expect(applyPercent(10000, 14)).toBe(1400);
    // 84.00 × 14% = 11.76 → 1176 piasters, not 1175.
    expect(applyPercent(8400, 14)).toBe(1176);
    expect(applyPercent(1, 50)).toBe(1);
  });

  it('allocates without losing or inventing a piaster', () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(sum(parts)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);

    const weighted = allocate(9999, [5, 3, 2]);
    expect(sum(weighted)).toBe(9999);

    expect(allocate(500, [0, 0])).toEqual([0, 0]);
  });
});
