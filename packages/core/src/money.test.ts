import { describe, expect, it } from 'vitest';
import { formatINR, roundToRupee, rupeesToPaise } from './money';

describe('formatINR', () => {
  it.each([
    [0, '₹0.00'],
    [5, '₹0.05'],
    [99900, '₹999.00'],
    [100000, '₹1,000.00'],
    [12500000, '₹1,25,000.00'],
    [1234567890, '₹1,23,45,678.90'],
    [-12500000, '-₹1,25,000.00'],
  ])('%i → %s', (paise, expected) => {
    expect(formatINR(paise)).toBe(expected);
  });

  it('can drop symbol and decimals', () => {
    expect(formatINR(12500000, { symbol: false, decimals: false })).toBe('1,25,000');
  });

  it('rejects non-integer paise', () => {
    expect(() => formatINR(10.5)).toThrow(TypeError);
  });
});

describe('roundToRupee (half-up)', () => {
  it.each([
    [149, 100],
    [150, 200],
    [151, 200],
    [-150, -200],
    [-149, -100],
    [0, 0],
  ])('%i → %i', (paise, expected) => {
    expect(roundToRupee(paise)).toBe(expected);
  });
});

describe('rupeesToPaise', () => {
  it('converts without float drift', () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
  });
});
