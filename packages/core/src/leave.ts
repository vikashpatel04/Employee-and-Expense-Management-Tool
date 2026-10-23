/**
 * Leave templates: weekly offs, paid leaves per month, carry-over, sandwich rule
 * (docs/PLAN.md §4.2). Leave is counted in whole days.
 */
import type { BusinessDate } from './dates';
import { effectiveOn, type Dated } from './dated';

export interface WeeklyOff {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  paid: boolean;
}

/**
 * What happens to unused paid leave at month end.
 * `resetMonth` is the LAST month of the leave year (e.g. 3 = the year ends with March):
 * at the end of that month the bank lapses (`carry_within_year`) or is paid out (`payout`).
 */
export type CarryOver =
  | { mode: 'lapse' }
  | { mode: 'carry'; cap?: number }
  | { mode: 'carry_within_year'; resetMonth: number }
  | { mode: 'payout'; resetMonth: number };

export interface LeaveTemplateVersion extends Dated {
  weeklyOffs: WeeklyOff[];
  paidLeavesPerMonth: number;
  carryOver: CarryOver;
  sandwichRule: boolean;
}

export interface TemplateAssignment extends Dated {
  templateId: string;
}

/** The template version that applies to a staff member on `date`. */
export function templateVersionOn(
  assignments: readonly TemplateAssignment[],
  versionsByTemplate: Readonly<Record<string, readonly LeaveTemplateVersion[]>>,
  date: BusinessDate,
): LeaveTemplateVersion | undefined {
  const assignment = effectiveOn(assignments, date);
  if (!assignment) return undefined;
  return effectiveOn(versionsByTemplate[assignment.templateId] ?? [], date);
}

export interface LeaveMonth {
  year: number;
  month: number;
  /** Carried in from last month. */
  opening: number;
  earned: number;
  used: number;
  /** opening + earned */
  available: number;
  /** Banked into next month's opening. */
  carried: number;
  /** Unused leave paid out this month (payout mode, reset month). */
  paidOut: number;
  /** Unused leave that disappeared. */
  lapsed: number;
}

/**
 * Close one month's leave. `version` is the template version in effect for the month
 * (callers pass the one in effect on the month's last employed day).
 */
export function rollLeaveMonth(input: {
  year: number;
  month: number;
  opening: number;
  used: number;
  version: LeaveTemplateVersion;
}): LeaveMonth {
  const { year, month, opening, used, version } = input;
  const earned = version.paidLeavesPerMonth;
  const available = opening + earned;
  if (used > available) {
    throw new RangeError(
      `Used ${used} days of paid leave but only ${available} were available: more paid leave than balance`,
    );
  }
  const unused = available - used;
  const result = {
    year,
    month,
    opening,
    earned,
    used,
    available,
    carried: 0,
    paidOut: 0,
    lapsed: 0,
  };

  const co = version.carryOver;
  switch (co.mode) {
    case 'lapse':
      return { ...result, lapsed: unused };
    case 'carry': {
      const carried = co.cap === undefined ? unused : Math.min(unused, co.cap);
      return { ...result, carried, lapsed: unused - carried };
    }
    case 'carry_within_year':
      return month === co.resetMonth
        ? { ...result, lapsed: unused }
        : { ...result, carried: unused };
    case 'payout':
      return month === co.resetMonth
        ? { ...result, paidOut: unused }
        : { ...result, carried: unused };
  }
}

/** Close several consecutive months, each opening with the previous month's carry. */
export function rollLeaveMonths(
  opening: number,
  months: readonly { year: number; month: number; used: number; version: LeaveTemplateVersion }[],
): LeaveMonth[] {
  const out: LeaveMonth[] = [];
  let carry = opening;
  for (const m of months) {
    const closed = rollLeaveMonth({ ...m, opening: carry });
    out.push(closed);
    carry = closed.carried;
  }
  return out;
}

/** Marking a day as paid leave is refused once the month's balance is used up (PLAN §4.3). */
export function canUsePaidLeave(input: { available: number; usedSoFar: number }): boolean {
  return input.usedSoFar < input.available;
}

/** Plain-language problems with a template version; empty when it's valid. */
export function validateTemplateVersion(v: LeaveTemplateVersion): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const off of v.weeklyOffs) {
    if (seen.has(off.weekday))
      problems.push(`weeklyOffs: weekday ${off.weekday} appears more than once`);
    seen.add(off.weekday);
  }
  for (const off of v.weeklyOffs) {
    if (!Number.isInteger(off.weekday) || off.weekday < 0 || off.weekday > 6) {
      problems.push(`weeklyOffs: weekday must be 0 (Sunday) to 6 (Saturday), got ${off.weekday}`);
    }
  }
  if (!Number.isInteger(v.paidLeavesPerMonth) || v.paidLeavesPerMonth < 0) {
    problems.push('paidLeavesPerMonth must be a whole number of days, 0 or more');
  }
  const co = v.carryOver;
  if (co.mode === 'carry' && co.cap !== undefined && (!Number.isInteger(co.cap) || co.cap < 0)) {
    problems.push('carryOver.cap must be a whole number of days, 0 or more');
  }
  if (
    (co.mode === 'carry_within_year' || co.mode === 'payout') &&
    (!Number.isInteger(co.resetMonth) || co.resetMonth < 1 || co.resetMonth > 12)
  ) {
    problems.push('carryOver.resetMonth must be 1–12');
  }
  return problems;
}
