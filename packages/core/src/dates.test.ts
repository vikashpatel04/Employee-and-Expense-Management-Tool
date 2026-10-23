import { describe, expect, it } from 'vitest';
import {
  addDays,
  businessDateOf,
  compareDates,
  daysInMonth,
  daysBetween,
  eachDay,
  isBusinessDate,
  minutesOfDayIST,
  monthDates,
  monthOf,
  weekday,
} from './dates';

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

describe('date strings', () => {
  it('validates YYYY-MM-DD', () => {
    expect(isBusinessDate('2026-02-28')).toBe(true);
    expect(isBusinessDate('2026-02-29')).toBe(false);
    expect(isBusinessDate('2026-2-1')).toBe(false);
    expect(isBusinessDate('2026-13-01')).toBe(false);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('compares and measures', () => {
    expect(compareDates('2026-01-02', '2026-01-10')).toBe(-1);
    expect(compareDates('2026-01-10', '2026-01-10')).toBe(0);
    expect(daysBetween('2026-01-01', '2026-02-01')).toBe(31);
  });

  it('gives weekday with Sunday = 0', () => {
    expect(weekday('2026-10-25')).toBe(0); // Sunday
    expect(weekday('2026-10-23')).toBe(5); // Friday
  });

  it('lists days of a month and of a range', () => {
    const feb = monthDates(2026, 2);
    expect(feb).toHaveLength(28);
    expect(feb[0]).toBe('2026-02-01');
    expect(feb.at(-1)).toBe('2026-02-28');
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(eachDay('2026-03-02', '2026-03-01')).toEqual([]);
    expect(monthOf('2026-02-27')).toEqual({ year: 2026, month: 2 });
  });
});

describe('minutesOfDayIST', () => {
  it('converts an instant to minutes after IST midnight', () => {
    // 03:42 UTC = 09:12 IST
    expect(minutesOfDayIST(new Date('2026-10-23T03:42:00Z'))).toBe(9 * 60 + 12);
    // 18:40 UTC = 00:10 IST next day
    expect(minutesOfDayIST(new Date('2026-10-23T18:40:00Z'))).toBe(10);
  });
});
