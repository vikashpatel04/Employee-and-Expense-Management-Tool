import { describe, expect, it } from 'vitest';
import { businessDateOf, daysInMonth } from './dates';

describe('businessDateOf', () => {
  it('uses Asia/Kolkata, not UTC', () => {
    // 2026-03-31 20:00 UTC is 2026-04-01 01:30 IST
    expect(businessDateOf(new Date('2026-03-31T20:00:00Z'))).toBe('2026-04-01');
    expect(businessDateOf(new Date('2026-03-31T18:00:00Z'))).toBe('2026-03-31');
  });
});

describe('daysInMonth', () => {
  it.each([
    [2026, 1, 31],
    [2026, 2, 28],
    [2028, 2, 29],
    [2026, 4, 30],
  ])('%i-%i has %i days', (y, m, d) => {
    expect(daysInMonth(y, m)).toBe(d);
  });
});
