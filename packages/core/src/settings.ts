/**
 * Every rule choice the owner can change. Nothing in `packages/core` is hard-coded beyond these
 * defaults: the shop stores its own values (shops.settings), and a staff member's pay settings
 * can override any field for that person. Docs: docs/features/core-rules.md (Settings).
 */
import { DEFAULT_CODE_SETTINGS, type CodeSettings } from './attendance-code';
import { DEFAULT_LATE_POLICY, type LatePolicy } from './late';
import { DEFAULT_STAFF_LOGIN, type StaffLoginSettings } from './staff-login';
import type { Paise } from './money';

export interface PayRules {
  /**
   * Divisor for a monthly salary's day rate.
   * `calendar_days`: actual days in the month (28–31). `fixed_days`: e.g. 30 or 26, every month.
   * Either way a fully paid month pays exactly the monthly salary.
   */
  dayRateBasis: { mode: 'calendar_days' } | { mode: 'fixed_days'; days: number };
  /**
   * Working on a weekly off or holiday.
   * `extra`: the off day's own pay plus the work as an extra day.
   * `replace`: paid once, as a working day (an unpaid off becomes paid; a paid off stays one day).
   * `none`: only the off day's own pay.
   */
  offDayWork: 'extra' | 'replace' | 'none';
  /** A working day nobody marked: `unpaid` (and warn) or `paid` (and warn). */
  unmarkedDay: 'unpaid' | 'paid';
  /** A shop holiday on a weekly off: which one's paid flag decides the day. */
  holidayOnWeeklyOff: 'holiday' | 'weekly_off';
  /**
   * Absent or leave marked on a weekly off / holiday.
   * `ignore`: the off day stands. `apply`: the mark replaces it (absent = unpaid, paid leave = paid
   * and uses balance).
   */
  markOnOffDay: 'ignore' | 'apply';
}

export const DEFAULT_PAY_RULES: PayRules = {
  dayRateBasis: { mode: 'calendar_days' },
  offDayWork: 'extra',
  unmarkedDay: 'unpaid',
  holidayOnWeeklyOff: 'holiday',
  markOnOffDay: 'ignore',
};

/** The whole rule set a shop keeps in `shops.settings`. */
export interface ShopRules {
  pay: PayRules;
  late: LatePolicy;
  attendanceCode: CodeSettings;
  staffLogin: StaffLoginSettings;
  /** Expenses below this default to "Not tracked"; none = never. */
  smallExpenseLimit?: Paise;
}

export const DEFAULT_SHOP_RULES: ShopRules = {
  pay: DEFAULT_PAY_RULES,
  late: DEFAULT_LATE_POLICY,
  attendanceCode: DEFAULT_CODE_SETTINGS,
  staffLogin: DEFAULT_STAFF_LOGIN,
};

/** Fill a stored (possibly partial or older) rule set with defaults, group by group. */
export function resolveShopRules(
  stored: {
    pay?: Partial<PayRules>;
    late?: Partial<LatePolicy>;
    attendanceCode?: Partial<CodeSettings>;
    staffLogin?: Partial<StaffLoginSettings>;
    smallExpenseLimit?: Paise;
  } = {},
): ShopRules {
  const rules: ShopRules = {
    pay: { ...DEFAULT_PAY_RULES, ...stored.pay },
    late: { ...DEFAULT_LATE_POLICY, ...stored.late },
    attendanceCode: { ...DEFAULT_CODE_SETTINGS, ...stored.attendanceCode },
    staffLogin: { ...DEFAULT_STAFF_LOGIN, ...stored.staffLogin },
  };
  return stored.smallExpenseLimit === undefined
    ? rules
    : { ...rules, smallExpenseLimit: stored.smallExpenseLimit };
}

/** A staff member's override on top of the shop's value, field by field. */
export function withOverride<T extends object>(shop: T, override: Partial<T> | undefined): T {
  return { ...shop, ...override };
}

/** Plain-language problems with a rule set; empty when valid. */
export function validateShopRules(r: ShopRules): string[] {
  const problems: string[] = [];
  const wholeAtLeast = (v: number, min: number) => Number.isInteger(v) && v >= min;
  if (r.pay.dayRateBasis.mode === 'fixed_days' && !wholeAtLeast(r.pay.dayRateBasis.days, 1)) {
    problems.push('pay.dayRateBasis.days must be a whole number, 1 or more');
  }
  if (!wholeAtLeast(r.late.freeLateDays, 0)) problems.push('late.freeLateDays must be 0 or more');
  if (r.late.halfDayThresholdMinutes !== null && !wholeAtLeast(r.late.halfDayThresholdMinutes, 1)) {
    problems.push('late.halfDayThresholdMinutes must be 1 or more, or off');
  }
  if (r.late.charge.mode === 'per_late_day' && !wholeAtLeast(r.late.charge.amount, 0)) {
    problems.push('late.charge.amount must be 0 or more');
  }
  const c = r.attendanceCode;
  if (
    c.rotation.mode === 'daily' &&
    !(wholeAtLeast(c.rotation.atMinutes, 0) && c.rotation.atMinutes < 1440)
  ) {
    problems.push('attendanceCode.rotation.atMinutes must be 0–1439');
  }
  for (const k of [
    'minGapMinutes',
    'cooldownMinutes',
    'wrongCodeWindowMinutes',
    'lockoutMinutes',
  ] as const) {
    if (!wholeAtLeast(c[k], 0)) problems.push(`attendanceCode.${k} must be 0 or more`);
  }
  if (!wholeAtLeast(c.maxWrongCodes, 1))
    problems.push('attendanceCode.maxWrongCodes must be 1 or more');
  const l = r.staffLogin;
  for (const k of ['inviteHours', 'wrongPinsBeforeWait', 'wrongPinsBeforeLock'] as const) {
    if (!wholeAtLeast(l[k], 1)) problems.push(`staffLogin.${k} must be 1 or more`);
  }
  if (!wholeAtLeast(l.pinWaitMinutes, 0))
    problems.push('staffLogin.pinWaitMinutes must be 0 or more');
  if (l.wrongPinsBeforeLock < l.wrongPinsBeforeWait)
    problems.push('staffLogin.wrongPinsBeforeLock must be at least wrongPinsBeforeWait');
  if (r.smallExpenseLimit !== undefined && !wholeAtLeast(r.smallExpenseLimit, 0)) {
    problems.push('smallExpenseLimit must be 0 or more');
  }
  return problems;
}
