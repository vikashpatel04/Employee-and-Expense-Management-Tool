/**
 * Attendance → payable days (docs/PLAN.md §4.3, §4.2 sandwich rule, §4.6 payable_days).
 *
 * Pay is counted in half-day UNITS (present = 2, half day = 1) so no fractions are needed.
 */
import { addDays, compareDates, eachDay, weekday as weekdayOf, type BusinessDate } from './dates';
import type { LeaveTemplateVersion } from './leave';

export const ATTENDANCE_STATUSES = [
  'present',
  'half_day',
  'absent',
  'paid_leave',
  'unpaid_leave',
  'weekly_off',
  'holiday',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface AttendanceRecord {
  date: BusinessDate;
  status: AttendanceStatus;
  /** Minutes after IST midnight. */
  checkIn?: number;
  checkOut?: number;
  overtimeMinutes?: number;
}

export interface Holiday {
  date: BusinessDate;
  name?: string;
  paid: boolean;
}

export interface ScheduledDay {
  date: BusinessDate;
  kind: 'working' | 'weekly_off' | 'holiday';
  /** Whether the off day is paid. Always false for working days. */
  paid: boolean;
}

/** What the calendar says about a day before anyone marks attendance. A holiday wins over a weekly off. */
export function scheduledDay(
  date: BusinessDate,
  template: LeaveTemplateVersion | undefined,
  holidays: ReadonlyMap<BusinessDate, Holiday>,
): ScheduledDay {
  const holiday = holidays.get(date);
  if (holiday) return { date, kind: 'holiday', paid: holiday.paid };
  const off = template?.weeklyOffs.find((o) => o.weekday === weekdayOf(date));
  if (off) return { date, kind: 'weekly_off', paid: off.paid };
  return { date, kind: 'working', paid: false };
}

export type DayStatus = AttendanceStatus | 'unmarked' | 'not_employed';

export interface DayResult {
  date: BusinessDate;
  scheduled: ScheduledDay;
  status: DayStatus;
  /** `record`: someone marked it; `auto`: filled from the calendar; `none`: nothing yet. */
  source: 'record' | 'auto' | 'none';
  /** Pay for the day itself, in half-day units (0–2). */
  baseUnits: number;
  /** Half-day units worked on a weekly off or holiday, paid as an extra working day. */
  extraUnits: number;
  /** A paid weekly off made unpaid by the sandwich rule. */
  sandwiched: boolean;
  record?: AttendanceRecord;
}

const WORK_UNITS: Partial<Record<AttendanceStatus, number>> = {
  present: 2,
  half_day: 1,
  paid_leave: 2,
};

export interface EvaluateDaysInput {
  /** The range to evaluate, usually a calendar month. */
  from: BusinessDate;
  to: BusinessDate;
  joiningDate: BusinessDate;
  leavingDate?: BusinessDate;
  /** Template version in effect on a date (see `templateVersionOn`). */
  templateOn: (date: BusinessDate) => LeaveTemplateVersion | undefined;
  holidays: readonly Holiday[];
  /** Records for the range, plus neighbouring days for the sandwich rule at month edges. */
  records: readonly AttendanceRecord[];
  /** Shop setting: pay presence on an off day as an extra working day (default on). */
  extraWorkingDayPay: boolean;
}

/** How far the sandwich rule looks for the nearest working day on each side. */
const SANDWICH_SEARCH_DAYS = 31;

export function evaluateDays(input: EvaluateDaysInput): DayResult[] {
  const holidays = new Map(input.holidays.map((h) => [h.date, h]));
  const records = new Map(input.records.map((r) => [r.date, r]));
  const employed = (date: BusinessDate) =>
    compareDates(date, input.joiningDate) >= 0 &&
    (!input.leavingDate || compareDates(date, input.leavingDate) <= 0);
  const schedule = (date: BusinessDate) => scheduledDay(date, input.templateOn(date), holidays);

  /** Nearest working day in `step` direction is marked absent (false if unknown or not employed). */
  const neighbourAbsent = (date: BusinessDate, step: 1 | -1): boolean => {
    let d = date;
    for (let i = 0; i < SANDWICH_SEARCH_DAYS; i++) {
      d = addDays(d, step);
      if (!employed(d)) return false;
      if (schedule(d).kind !== 'working') continue;
      return records.get(d)?.status === 'absent';
    }
    return false;
  };

  return eachDay(input.from, input.to).map((date): DayResult => {
    const scheduled = schedule(date);
    const record = records.get(date);
    const base = { date, scheduled, sandwiched: false, extraUnits: 0, record };

    if (!employed(date)) {
      return { ...base, status: 'not_employed', source: 'none', baseUnits: 0, record: undefined };
    }

    if (scheduled.kind === 'working') {
      if (!record) return { ...base, status: 'unmarked', source: 'none', baseUnits: 0 };
      return {
        ...base,
        status: record.status,
        source: 'record',
        baseUnits: WORK_UNITS[record.status] ?? 0,
      };
    }

    // Weekly off or holiday.
    const offUnits = scheduled.paid ? 2 : 0;
    const worked = record
      ? record.status === 'present'
        ? 2
        : record.status === 'half_day'
          ? 1
          : 0
      : 0;
    if (worked > 0) {
      return {
        ...base,
        status: record!.status,
        source: 'record',
        baseUnits: offUnits,
        extraUnits: input.extraWorkingDayPay ? worked : 0,
      };
    }

    const status: AttendanceStatus = scheduled.kind === 'holiday' ? 'holiday' : 'weekly_off';
    const sandwiched =
      scheduled.kind === 'weekly_off' &&
      scheduled.paid &&
      input.templateOn(date)?.sandwichRule === true &&
      neighbourAbsent(date, -1) &&
      neighbourAbsent(date, 1);

    return {
      ...base,
      status,
      source: record ? 'record' : 'auto',
      baseUnits: sandwiched ? 0 : offUnits,
      sandwiched,
    };
  });
}

export interface DaySummary {
  employedDays: number;
  present: number;
  halfDay: number;
  absent: number;
  paidLeave: number;
  unpaidLeave: number;
  paidWeeklyOff: number;
  unpaidWeeklyOff: number;
  paidHoliday: number;
  unpaidHoliday: number;
  /** In days; can be a half. */
  extraWorkingDays: number;
  unmarked: number;
  sandwiched: number;
  payableUnits: number;
  /** payableUnits / 2 */
  payableDays: number;
}

export function summarizeDays(days: readonly DayResult[]): DaySummary {
  const s: DaySummary = {
    employedDays: 0,
    present: 0,
    halfDay: 0,
    absent: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    paidWeeklyOff: 0,
    unpaidWeeklyOff: 0,
    paidHoliday: 0,
    unpaidHoliday: 0,
    extraWorkingDays: 0,
    unmarked: 0,
    sandwiched: 0,
    payableUnits: 0,
    payableDays: 0,
  };
  for (const d of days) {
    if (d.status === 'not_employed') continue;
    s.employedDays++;
    s.payableUnits += d.baseUnits + d.extraUnits;
    s.extraWorkingDays += d.extraUnits / 2;
    if (d.sandwiched) s.sandwiched++;

    if (d.scheduled.kind !== 'working') {
      const paid = d.scheduled.paid && !d.sandwiched;
      if (d.scheduled.kind === 'weekly_off') paid ? s.paidWeeklyOff++ : s.unpaidWeeklyOff++;
      else paid ? s.paidHoliday++ : s.unpaidHoliday++;
      continue;
    }
    switch (d.status) {
      case 'present':
        s.present++;
        break;
      case 'half_day':
        s.halfDay++;
        break;
      case 'absent':
        s.absent++;
        break;
      case 'paid_leave':
        s.paidLeave++;
        break;
      case 'unpaid_leave':
        s.unpaidLeave++;
        break;
      case 'unmarked':
        s.unmarked++;
        break;
      default:
        break; // weekly_off / holiday marked on a working day: unpaid, counted nowhere
    }
  }
  s.payableDays = s.payableUnits / 2;
  return s;
}

/** Paid leave days used (on working days), for the leave balance. */
export function paidLeaveUsed(days: readonly DayResult[]): number {
  return days.filter((d) => d.scheduled.kind === 'working' && d.status === 'paid_leave').length;
}
