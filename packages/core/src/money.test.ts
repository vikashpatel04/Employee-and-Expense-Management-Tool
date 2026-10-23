import { describe, expect, it } from 'vitest';
import { formatINR, paiseToInput, parseRupees, roundToRupee, rupeesToPaise } from './money';

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

describe('parseRupees (what people type → paise, no floats)', () => {
  it.each([
    ['22000', 2_200_000],
    ['22,000', 2_200_000],
    ['₹1,25,000.50', 12_500_050],
    [' 1250.5 ', 125_050],
    ['0.05', 5],
    ['100.', 10_000],
    ['.5', 50],
  ])('%s → %i', (text, paise) => {
    expect(parseRupees(text)).toBe(paise);
  });

  it.each(['', 'abc', '12.345', '-500', '1,2,3.4.5', '₹'])('rejects %j', (text) => {
    expect(parseRupees(text)).toBeNull();
  });
});

describe('paiseToInput', () => {
  it('formats paise for an input field, without grouping', () => {
    expect(paiseToInput(2_200_000)).toBe('22000');
    expect(paiseToInput(12_500_050)).toBe('125000.50');
    expect(paiseToInput(5)).toBe('0.05');
  });
});
