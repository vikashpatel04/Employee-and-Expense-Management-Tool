/**
 * Pay periods (owner 05/11/2026): a person's salary runs from their pay day to the day before the
 * next one, not from the 1st to month end. The pay day is a date of the month, never a count of
 * days: pay day 16 pays on the 16th of every month, however long the month was. A salary is named
 * after the month its period ends in, so a person has one salary per month name. Pay day 1 is the
 * calendar month, paid on the 1st of the next. Days 29–31 fall on the last day of a shorter month.
 */
import {
  addDays,
  compareDates,
  daysBetween,
  daysInMonth,
  maxDate,
  minDate,
  monthEnd,
  monthOf,
  monthStart,
  shiftMonth,
  type BusinessDate,
} from './dates';
import { effectiveOn } from './dated';
import type { PaySettings } from './salary';
import { withOverride, type PayRules } from './settings';

export interface PayPeriod {
  /** The month the salary is named after: its period ends in this month. */
  year: number;
  month: number;
  from: BusinessDate;
  to: BusinessDate;
  /** The day after `to`. */
  payDate: BusinessDate;
  /** Days in a normal period ending on `to`: what a monthly salary is shared over. */
  cycleDays: number;
}

/** The date of the month this rule pays on, 1–31. */
export function payDayOf(rule: PayRules['payDay'], joiningDate: BusinessDate): number {
  return rule.mode === 'fixed' ? rule.day : Number(joiningDate.slice(8, 10));
}

/** A person's pay day on `date`: the shop's rule, or their own override in effect then. */
export function personPayDay(
  rules: PayRules,
  joiningDate: BusinessDate,
  paySettings: readonly PaySettings[],
  date: BusinessDate,
): number {
  const override = effectiveOn(paySettings, date)?.payRulesOverride;
  return payDayOf(withOverride(rules, override).payDay, joiningDate);
}

function periodEnd(year: number, month: number, payDay: number): BusinessDate {
  if (payDay === 1) return monthEnd(year, month);
  const date = Math.min(payDay, daysInMonth(year, month));
  return addDays(`${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`, -1);
}

/**
 * The salary period named after this month. `previousEnd` is where the person's finalized salary
 * for the month before ended: the period starts the day after it, so changing a pay day never
 * loses a day or pays one twice. That one salary can be shorter or longer than a month.
 */
export function payPeriod(
  year: number,
  month: number,
  payDay: number,
  previousEnd?: BusinessDate,
): PayPeriod {
  const before = shiftMonth(year, month, -1);
  const normalFrom = addDays(periodEnd(before.year, before.month, payDay), 1);
  const to = periodEnd(year, month, payDay);
  return {
    year,
    month,
    from: previousEnd ? addDays(previousEnd, 1) : normalFrom,
    to,
    payDate: addDays(to, 1),
    cycleDays: daysBetween(normalFrom, to) + 1,
  };
}

/** The part of a period a person was employed for: cut to their joining and leaving dates. */
export function employedPart(
  period: { from: BusinessDate; to: BusinessDate },
  joiningDate: BusinessDate,
  leavingDate?: BusinessDate | null,
): { from: BusinessDate; to: BusinessDate } {
  return {
    from: maxDate(period.from, joiningDate),
    to: leavingDate ? minDate(period.to, leavingDate) : period.to,
  };
}

/** The normal period `date` falls in. */
export function payPeriodOn(date: BusinessDate, payDay: number): PayPeriod {
  const { year, month } = monthOf(date);
  const period = payPeriod(year, month, payDay);
  if (compareDates(date, period.to) <= 0) return period;
  const next = shiftMonth(year, month, 1);
  return payPeriod(next.year, next.month, payDay);
}

export type NewCycleProblem = 'future' | 'before_period' | 'too_early' | 'period_over';

/**
 * Paying a salary before its period ends and starting a new cycle from the date paid (Pay now,
 * owner 09/11/2026). The salary closes the day before, and from then on the person's pay day is
 * the date paid. It must be a day of this period after its first, no later than today, and in the
 * month the salary is named after (from its 2nd), so the closed salary keeps its month and the
 * next one is named after the month that follows.
 */
export function newCycleCheck(
  period: PayPeriod,
  paidOn: BusinessDate,
  today: BusinessDate,
):
  | { ok: true; closesOn: BusinessDate; payDay: number; next: PayPeriod }
  | { ok: false; reason: NewCycleProblem; earliest: BusinessDate } {
  const earliest = newCycleEarliest(period);
  const fail = (reason: NewCycleProblem) => ({ ok: false as const, reason, earliest });
  if (compareDates(paidOn, today) > 0) return fail('future');
  if (compareDates(paidOn, period.from) <= 0) return fail('before_period');
  if (compareDates(paidOn, period.to) > 0) return fail('period_over');
  if (compareDates(paidOn, earliest) < 0) return fail('too_early');
  const payDay = Number(paidOn.slice(8, 10));
  return { ok: true, closesOn: addDays(paidOn, -1), payDay, next: payPeriodOn(paidOn, payDay) };
}

/** The first date a new cycle can start from in this period. */
export function newCycleEarliest(period: PayPeriod): BusinessDate {
  return maxDate(addDays(period.from, 1), addDays(monthStart(period.year, period.month), 1));
}
