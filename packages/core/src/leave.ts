/**
 * Leave templates: weekly offs, paid leaves per month, carry-over, sandwich rule
 * (docs/PLAN.md §4.2). Leave is counted in whole days.
 */
import { daysInMonth, type BusinessDate } from './dates';
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

/** What counts as "away" on a working day next to an off day. */
export type SandwichTrigger = 'absent' | 'unpaid_leave' | 'half_day' | 'unmarked';

export interface SandwichRule {
  enabled: boolean;
  /** Statuses on the neighbouring working day that count. */
  triggers: SandwichTrigger[];
  /** Which paid off days it can make unpaid. */
  appliesTo: ('weekly_off' | 'holiday')[];
  /** `both`: away before AND after; `either`: away on one side is enough. */
  sides: 'both' | 'either';
}

export const DEFAULT_SANDWICH_RULE: SandwichRule = {
  enabled: false,
  triggers: ['absent'],
  appliesTo: ['weekly_off'],
  sides: 'both',
};

/** How a month's paid leave is earned. `prorated`: by employed days in a partial month. */
export type LeaveAccrual =
  { mode: 'full' } | { mode: 'prorated'; rounding: 'down' | 'nearest' | 'up' };

export interface LeaveTemplateVersion extends Dated {
  /** Empty = no weekly offs. */
  weeklyOffs: WeeklyOff[];
  /** 0 = no paid leave. */
  paidLeavesPerMonth: number;
  carryOver: CarryOver;
  sandwich: SandwichRule;
  accrual: LeaveAccrual;
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

/** Paid leave earned this month under the template's accrual setting. */
export function earnedLeave(
  version: LeaveTemplateVersion,
  employedDays: number,
  daysInThisMonth: number,
): number {
  const full = version.paidLeavesPerMonth;
  if (version.accrual.mode === 'full' || employedDays >= daysInThisMonth) return full;
  const exact = (full * employedDays) / daysInThisMonth;
  switch (version.accrual.rounding) {
    case 'down':
      return Math.floor(exact);
    case 'up':
      return Math.ceil(exact);
    case 'nearest':
      return Math.floor(exact + 0.5);
  }
}

/**
 * Close one month's leave. `version` is the template version in effect for the month
 * (callers pass the one in effect on the month's last employed day). No version means the
 * person has no leave template: no paid leave, and any bank lapses.
 */
export function rollLeaveMonth(input: {
  year: number;
  month: number;
  opening: number;
  used: number;
  version: LeaveTemplateVersion | undefined;
  /** Employed days this month, for prorated accrual; defaults to the whole month. */
  employedDays?: number;
}): LeaveMonth {
  const { year, month, opening, used, version } = input;
  const D = daysInMonth(year, month);
  const earned = version ? earnedLeave(version, input.employedDays ?? D, D) : 0;
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

  if (!version) return { ...result, lapsed: unused };
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
  months: readonly {
    year: number;
    month: number;
    used: number;
    version: LeaveTemplateVersion | undefined;
    employedDays?: number;
  }[],
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
  if (v.sandwich.enabled && v.sandwich.triggers.length === 0) {
    problems.push('sandwich.triggers needs at least one status when the rule is on');
  }
  if (v.sandwich.enabled && v.sandwich.appliesTo.length === 0) {
    problems.push('sandwich.appliesTo needs weekly offs, holidays or both when the rule is on');
  }
  return problems;
}
