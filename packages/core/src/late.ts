/**
 * Shift timing and lateness (docs/PLAN.md §4.4). Times are minutes after IST midnight.
 * Every choice here is a field of `LatePolicy`, set by the owner (shop) or per staff member.
 */
import type { BusinessDate } from './dates';
import type { Paise } from './money';
import { rat, ratMul, type Rat } from './rational';

export interface LatePolicy {
  /** `notice_only` shows lateness; `deduct` also charges it. */
  mode: 'notice_only' | 'deduct';
  /** The first N late days in a month are not charged. */
  freeLateDays: number;
  /**
   * Arriving late (or leaving early) by MORE than this many minutes turns the day into a half
   * day instead of a charge. `null` = never.
   */
  halfDayThresholdMinutes: number | null;
  /** Whether a day turned into a half day also uses up one of the free late days. */
  halfDayUsesFreeDay: boolean;
  /** Count leaving before shift end the same way as arriving late. */
  earlyLeaving: boolean;
  /** Once past grace, count minutes from shift start (plan default) or from the end of grace. */
  lateCountsFrom: 'shift_start' | 'grace_end';
  /** How a charged late day is charged. */
  charge: { mode: 'per_minute' } | { mode: 'per_late_day'; amount: Paise };
}

export const DEFAULT_LATE_POLICY: LatePolicy = {
  mode: 'notice_only',
  freeLateDays: 3,
  halfDayThresholdMinutes: 120,
  halfDayUsesFreeDay: false,
  earlyLeaving: false,
  lateCountsFrom: 'shift_start',
  charge: { mode: 'per_minute' },
};

export interface Shift {
  /** Minutes after midnight; `end` must be after `start` (no overnight shifts). */
  start: number;
  end: number;
  graceMinutes: number;
}

export const DEFAULT_GRACE_MINUTES = 10;

export const shiftMinutes = (s: Shift) => s.end - s.start;

/** Shop policy with a staff member's override fields on top. */
export function resolveLatePolicy(
  shop: LatePolicy,
  override: Partial<LatePolicy> | undefined,
): LatePolicy {
  return { ...shop, ...override };
}

/** Minutes late / early for one day. Within grace counts as zero. */
export function dayLateness(
  times: { checkIn?: number; checkOut?: number },
  shift: Shift,
  policy: LatePolicy,
): { lateMinutes: number; earlyMinutes: number } {
  const late = times.checkIn === undefined ? 0 : times.checkIn - shift.start;
  const early =
    !policy.earlyLeaving || times.checkOut === undefined ? 0 : shift.end - times.checkOut;
  const counted = (m: number) =>
    m <= shift.graceMinutes
      ? 0
      : policy.lateCountsFrom === 'grace_end'
        ? m - shift.graceMinutes
        : m;
  return { lateMinutes: counted(late), earlyMinutes: counted(early) };
}

export type LateOutcomeKind = 'on_time' | 'noticed' | 'free' | 'charged' | 'half_day';

export interface LateOutcome {
  date: BusinessDate;
  lateMinutes: number;
  earlyMinutes: number;
  outcome: LateOutcomeKind;
  /** Late + early minutes on a `charged` day (0 otherwise). */
  chargedMinutes: number;
}

/** Decide, for a month's days, which late days are free, charged or turned into half days. */
export function applyLatePolicy(
  days: readonly { date: BusinessDate; lateMinutes: number; earlyMinutes: number }[],
  policy: LatePolicy,
): LateOutcome[] {
  const ordered = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let counted = 0;
  return ordered.map((d) => {
    const early = policy.earlyLeaving ? d.earlyMinutes : 0;
    const base = {
      date: d.date,
      lateMinutes: d.lateMinutes,
      earlyMinutes: early,
      chargedMinutes: 0,
    };
    if (d.lateMinutes === 0 && early === 0) return { ...base, outcome: 'on_time' };
    if (policy.mode === 'notice_only') return { ...base, outcome: 'noticed' };

    const threshold = policy.halfDayThresholdMinutes;
    if (threshold !== null && (d.lateMinutes > threshold || early > threshold)) {
      if (policy.halfDayUsesFreeDay) counted++;
      return { ...base, outcome: 'half_day' };
    }

    counted++;
    if (counted <= policy.freeLateDays) return { ...base, outcome: 'free' };
    return { ...base, outcome: 'charged', chargedMinutes: d.lateMinutes + early };
  });
}

/** Charge for late minutes: minutes × (day rate ÷ shift minutes). `dayRate` is in paise. */
export function lateDeduction(minutes: number, dayRate: Rat, shiftLength: number): Rat {
  if (shiftLength <= 0) throw new RangeError('Shift must end after it starts');
  return ratMul(dayRate, rat(minutes, shiftLength));
}

/** The charge for one `charged` day under the policy's charge mode. */
export function lateDayCharge(
  outcome: LateOutcome,
  policy: LatePolicy,
  dayRate: Rat,
  shiftLength: number,
): Rat {
  if (outcome.outcome !== 'charged') return rat(0);
  return policy.charge.mode === 'per_late_day'
    ? rat(policy.charge.amount)
    : lateDeduction(outcome.chargedMinutes, dayRate, shiftLength);
}
