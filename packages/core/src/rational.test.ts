import { describe, expect, it } from 'vitest';
import { rat, ratAdd, ratMul, ratSub, ratSum, ratToRupeePaise, ratCompare, ZERO } from './rational';

describe('rational arithmetic', () => {
  it('normalises sign and keeps exact values', () => {
    expect(rat(1, 3)).toEqual({ n: 1n, d: 3n });
    expect(rat(2, -4)).toEqual({ n: -1n, d: 2n });
    expect(ratAdd(rat(1, 3), rat(1, 6))).toEqual({ n: 1n, d: 2n });
    expect(ratSub(rat(1, 2), rat(3, 4))).toEqual({ n: -1n, d: 4n });
    expect(ratMul(rat(2, 3), rat(9, 4))).toEqual({ n: 3n, d: 2n });
    expect(ratSum([rat(1, 4), rat(1, 4), rat(1, 2)])).toEqual({ n: 1n, d: 1n });
    expect(ratSum([])).toEqual(ZERO);
  });

  it('rejects a zero denominator and non-integers', () => {
    expect(() => rat(1, 0)).toThrow();
    expect(() => rat(1.5, 2)).toThrow();
  });

  it('compares', () => {
    expect(ratCompare(rat(1, 3), rat(1, 2))).toBe(-1);
    expect(ratCompare(rat(2, 4), rat(1, 2))).toBe(0);
    expect(ratCompare(rat(-1, 2), rat(-1, 3))).toBe(-1);
  });

  it('handles salaries far beyond float precision when multiplied', () => {
    // ₹10 crore monthly × 31 days stays exact
    const r = ratMul(rat(10_000_000_00, 31), rat(31));
    expect(ratToRupeePaise(r)).toBe(10_000_000_00);
  });
});

describe('ratToRupeePaise: one rounding, to the rupee, half-up', () => {
  it.each([
    // [numerator paise, denominator, expected paise]
    [149, 1, 100],
    [150, 1, 200],
    [-150, 1, -200],
    [-149, 1, -100],
    // ₹30,000 / 31 days × 1 day = 96774.19… paise → ₹968
    [3_000_000, 31, 96_800],
    // exactly ₹0.50 above a rupee boundary after division: 4950 / 33 = 150 paise → ₹2
    [4950, 33, 200],
  ])('%i/%i → %i', (n, d, expected) => {
    expect(ratToRupeePaise(rat(n, d))).toBe(expected);
  });
});
