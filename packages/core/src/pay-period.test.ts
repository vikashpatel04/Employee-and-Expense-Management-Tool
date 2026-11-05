import { describe, expect, it } from 'vitest';
import { addDays, compareDates, shiftMonth } from './dates';
import { employedPart, payDayOf, payPeriod, payPeriodOn, personPayDay } from './pay-period';
import type { PaySettings } from './salary';
import { DEFAULT_PAY_RULES } from './settings';

describe('payDayOf', () => {
  it('joining_day: the date of the month they joined', () => {
    expect(payDayOf({ mode: 'joining_day' }, '2026-09-16')).toBe(16);
    expect(payDayOf({ mode: 'joining_day' }, '2026-01-01')).toBe(1);
  });

  it('fixed: the set date, whenever they joined', () => {
    expect(payDayOf({ mode: 'fixed', day: 5 }, '2026-09-16')).toBe(5);
  });
});

describe('personPayDay', () => {
  const pay = (effectiveFrom: string, payDay?: PaySettings['payRulesOverride']): PaySettings => ({
    effectiveFrom,
    payType: 'monthly',
    monthlySalary: 1_500_000,
    ...(payDay ? { payRulesOverride: payDay } : {}),
  });

  it('uses the shop rule when the person has no override', () => {
    expect(personPayDay(DEFAULT_PAY_RULES, '2026-09-16', [pay('2026-09-16')], '2026-11-30')).toBe(
      16,
    );
    expect(personPayDay(DEFAULT_PAY_RULES, '2026-09-16', [], '2026-11-30')).toBe(16);
  });

  it('a person’s override holds from its date', () => {
    const versions = [pay('2026-09-16'), pay('2026-12-01', { payDay: { mode: 'fixed', day: 1 } })];
    expect(personPayDay(DEFAULT_PAY_RULES, '2026-09-16', versions, '2026-11-30')).toBe(16);
    expect(personPayDay(DEFAULT_PAY_RULES, '2026-09-16', versions, '2026-12-31')).toBe(1);
  });
});

describe('payPeriod', () => {
  it('runs from the pay day to the day before the next one, named after the month it ends in', () => {
    expect(payPeriod(2026, 10, 16)).toEqual({
      year: 2026,
      month: 10,
      from: '2026-09-16',
      to: '2026-10-15',
      payDate: '2026-10-16',
      cycleDays: 30,
    });
    expect(payPeriod(2026, 11, 16)).toMatchObject({
      from: '2026-10-16',
      to: '2026-11-15',
      payDate: '2026-11-16',
      cycleDays: 31,
    });
  });

  it('pay day 1 is the calendar month, paid on the 1st of the next', () => {
    expect(payPeriod(2026, 11, 1)).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-30',
      payDate: '2026-12-01',
      cycleDays: 30,
    });
    expect(payPeriod(2026, 12, 1).payDate).toBe('2027-01-01');
  });

  it('crosses the year end', () => {
    expect(payPeriod(2027, 1, 20)).toMatchObject({
      from: '2026-12-20',
      to: '2027-01-19',
      payDate: '2027-01-20',
    });
  });

  it('the pay date is the same date every month, not every so many days', () => {
    const dates = [];
    let m = { year: 2026, month: 10 };
    for (let i = 0; i < 12; i++) {
      dates.push(payPeriod(m.year, m.month, 16).payDate);
      m = shiftMonth(m.year, m.month, 1);
    }
    expect(dates.every((d) => d.endsWith('-16'))).toBe(true);
    expect(payPeriod(2027, 3, 16).cycleDays).toBe(28);
  });

  it('pay days 29–31 fall on the last day of a shorter month', () => {
    expect(payPeriod(2027, 2, 31)).toMatchObject({ to: '2027-02-27', payDate: '2027-02-28' });
    expect(payPeriod(2027, 3, 31)).toMatchObject({
      from: '2027-02-28',
      to: '2027-03-30',
      payDate: '2027-03-31',
    });
    expect(payPeriod(2027, 4, 31)).toMatchObject({
      from: '2027-03-31',
      to: '2027-04-29',
      payDate: '2027-04-30',
    });
    expect(payPeriod(2028, 2, 30).payDate).toBe('2028-02-29');
  });

  it('every pay day leaves no day out and pays no day twice, across a leap year', () => {
    for (let day = 1; day <= 31; day++) {
      let m = { year: 2027, month: 11 };
      let end = payPeriod(m.year, m.month, day).to;
      for (let i = 0; i < 18; i++) {
        m = shiftMonth(m.year, m.month, 1);
        const p = payPeriod(m.year, m.month, day);
        expect(p.from).toBe(addDays(end, 1));
        expect(compareDates(p.from, p.to)).toBeLessThan(0);
        end = p.to;
      }
    }
  });

  it('after a pay day change it starts the day after the last finalized salary', () => {
    // 16th → 10th: a shorter salary.
    expect(payPeriod(2027, 1, 10, '2026-12-15')).toMatchObject({
      from: '2026-12-16',
      to: '2027-01-09',
      payDate: '2027-01-10',
      cycleDays: 31,
    });
    // 16th → 1st: the leftover days join the next salary (one salary per month name).
    expect(payPeriod(2027, 1, 1, '2026-12-15')).toMatchObject({
      from: '2026-12-16',
      to: '2027-01-31',
      payDate: '2027-02-01',
      cycleDays: 31,
    });
  });
});

describe('employedPart', () => {
  const period = { from: '2026-10-01', to: '2026-10-31' };

  it('cuts a period to the joining and leaving dates', () => {
    expect(employedPart(period, '2026-10-20')).toEqual({ from: '2026-10-20', to: '2026-10-31' });
    expect(employedPart(period, '2026-01-01', '2026-10-05')).toEqual({
      from: '2026-10-01',
      to: '2026-10-05',
    });
  });

  it('leaves a period they worked all of alone', () => {
    expect(employedPart(period, '2026-01-01', null)).toEqual(period);
  });
});

describe('payPeriodOn', () => {
  it('finds the period a date falls in', () => {
    expect(payPeriodOn('2026-11-05', 16)).toMatchObject({ year: 2026, month: 11 });
    expect(payPeriodOn('2026-11-15', 16)).toMatchObject({ year: 2026, month: 11 });
    expect(payPeriodOn('2026-11-16', 16)).toMatchObject({ year: 2026, month: 12 });
    expect(payPeriodOn('2026-12-20', 16)).toMatchObject({ year: 2027, month: 1 });
  });

  it('pay day 1: the same month', () => {
    expect(payPeriodOn('2026-11-30', 1)).toMatchObject({ year: 2026, month: 11 });
    expect(payPeriodOn('2026-12-01', 1)).toMatchObject({ year: 2026, month: 12 });
  });
});
