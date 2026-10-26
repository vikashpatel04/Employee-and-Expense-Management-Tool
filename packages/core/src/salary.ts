/**
 * Salary for one staff member and one month (docs/PLAN.md §4.6).
 *
 *   day_rate           = monthly_salary / B   (B = actual days in the month, or a fixed number:
 *                                             PayRules.dayRateBasis)
 *   earned             = monthly − unpaid days × day_rate + extra days × day_rate
 *                        (= day_rate × payable_days when B is the month's days;
 *                         daily: wage × payable days; hourly: hours × rate)
 *   gross              = earned + overtime + allowances + leave payout
 *   net_before_advance = gross − (fixed deductions + late deductions)
 *   advance_cut        = scheduled cut, capped at what's outstanding and at net_before_advance
 *   net_pay            = net_before_advance − advance_cut
 *
 * Every payslip line is computed exactly (fractions) and rounded to the rupee ONCE.
 * Lines carry kinds and names, never display text: the apps translate them.
 * Every rule choice comes from `rules` (shop) and the staff member's pay-settings overrides.
 */
import {
  evaluateDays,
  summarizeDays,
  type AttendanceRecord,
  type DayResult,
  type DaySummary,
  type Holiday,
} from './attendance';
import { compareDates, daysInMonth, monthEnd, monthStart, type BusinessDate } from './dates';
import { effectiveOn, type Dated } from './dated';
import {
  applyLatePolicy,
  dayLateness,
  lateDayCharge,
  resolveLatePolicy,
  shiftMinutes,
  type LateOutcome,
  type LatePolicy,
  type Shift,
} from './late';
import type { LeaveTemplateVersion } from './leave';
import type { Paise } from './money';
import { rat, ratAdd, ratCompare, ratMul, ratToRupeePaise, ZERO, type Rat } from './rational';
import { withOverride, type PayRules } from './settings';

export type PayType = 'monthly' | 'daily' | 'hourly';

export interface PaySettings extends Dated {
  payType: PayType;
  monthlySalary?: Paise;
  dailyWage?: Paise;
  hourlyRate?: Paise;
  /** Per hour. */
  overtimeRate?: Paise;
  shift?: Shift;
  /** Hourly staff: hours that make a day, for leave payout. Defaults to the shift length. */
  hoursPerDay?: number;
  /** This person's exceptions to the shop's late policy. */
  latePolicyOverride?: Partial<LatePolicy>;
  /** This person's exceptions to the shop's pay rules. */
  payRulesOverride?: Partial<PayRules>;
}

export interface Allowance {
  name: string;
  /** Monthly amount. */
  amount: Paise;
  /** Prorated by payable days; otherwise fixed. */
  prorated: boolean;
  effectiveFrom: BusinessDate;
  effectiveTo?: BusinessDate;
}

export interface FixedDeduction {
  name: string;
  amount: Paise;
  effectiveFrom: BusinessDate;
  effectiveTo?: BusinessDate;
}

export interface SalaryInput {
  /** Today: unmarked days after it are not warned about (they haven't happened yet). */
  asOf?: BusinessDate;
  year: number;
  month: number;
  joiningDate: BusinessDate;
  leavingDate?: BusinessDate;
  paySettings: readonly PaySettings[];
  templateOn: (date: BusinessDate) => LeaveTemplateVersion | undefined;
  holidays: readonly Holiday[];
  /** This month's records, plus neighbouring days for the sandwich rule. */
  records: readonly AttendanceRecord[];
  allowances: readonly Allowance[];
  deductions: readonly FixedDeduction[];
  /** The shop's rules; the staff member's overrides are applied on top. */
  rules: { pay: PayRules; late: LatePolicy };
  /** Unused paid leave paid out this month (from the leave balance roll). */
  leavePayoutDays?: number;
  advance?: { scheduledCut: Paise; outstanding: Paise };
}

export type PayslipLineKind =
  | 'earned'
  | 'overtime'
  | 'allowance'
  | 'leave_payout'
  | 'deduction'
  | 'late_deduction'
  | 'advance_cut';

export interface PayslipLine {
  kind: PayslipLineKind;
  /** User-defined name for allowances and deductions. */
  name?: string;
  /** Always positive; `kind` says whether it adds or subtracts. */
  amount: Paise;
}

export type SalaryWarning =
  | { code: 'unmarked_days'; count: number }
  | { code: 'no_pay_settings'; count: number }
  | { code: 'missing_check_out'; count: number }
  | { code: 'negative_net_pay' };

export interface SalaryResult {
  days: DayResult[];
  /** After late-policy half days. */
  summary: DaySummary;
  late: LateOutcome[];
  lines: PayslipLine[];
  earned: Paise;
  gross: Paise;
  deductions: Paise;
  netBeforeAdvance: Paise;
  advanceCut: Paise;
  netPay: Paise;
  warnings: SalaryWarning[];
}

const WORKED_UNITS: Partial<Record<string, number>> = { present: 2, half_day: 1 };

/** One day's pay for late charges and leave payout. `basisDays` divides a monthly salary. */
function dayRate(s: PaySettings, basisDays: number): Rat {
  switch (s.payType) {
    case 'monthly':
      return rat(s.monthlySalary ?? 0, basisDays);
    case 'daily':
      return rat(s.dailyWage ?? 0);
    case 'hourly': {
      const minutes =
        s.hoursPerDay !== undefined
          ? Math.round(s.hoursPerDay * 60)
          : s.shift
            ? shiftMinutes(s.shift)
            : 0;
      return rat((s.hourlyRate ?? 0) * minutes, 60);
    }
  }
}

function inRange(date: BusinessDate, from: BusinessDate, to?: BusinessDate): boolean {
  return compareDates(date, from) >= 0 && (!to || compareDates(date, to) <= 0);
}

export function calculateSalary(input: SalaryInput): SalaryResult {
  const D = daysInMonth(input.year, input.month);
  const from = monthStart(input.year, input.month);
  const to = monthEnd(input.year, input.month);

  const settingsOn = (date: BusinessDate) => effectiveOn(input.paySettings, date);
  // The month uses the overrides in effect on its last day of employment (or its last day).
  const closingDate =
    input.leavingDate && compareDates(input.leavingDate, to) < 0 ? input.leavingDate : to;
  const closingSettings = settingsOn(closingDate);
  const payRules = withOverride(input.rules.pay, closingSettings?.payRulesOverride);
  const basis = payRules.dayRateBasis.mode === 'fixed_days' ? payRules.dayRateBasis.days : D;

  const days = evaluateDays({
    from,
    to,
    joiningDate: input.joiningDate,
    leavingDate: input.leavingDate,
    templateOn: input.templateOn,
    holidays: input.holidays,
    records: input.records,
    rules: payRules,
  });
  const employed = days.filter((d) => d.status !== 'not_employed');

  // ---- Late policy: measure, then decide free / charged / half day for the month.
  const policy = resolveLatePolicy(input.rules.late, closingSettings?.latePolicyOverride);
  const measured = employed.flatMap((day) => {
    const s = settingsOn(day.date);
    const rec = day.record;
    if (!s?.shift || s.payType === 'hourly' || !rec || day.status !== 'present') return [];
    const { lateMinutes, earlyMinutes } = dayLateness(rec, s.shift, policy);
    return [{ date: day.date, lateMinutes, earlyMinutes }];
  });
  const late = applyLatePolicy(measured, policy).filter((l) => l.outcome !== 'on_time');
  const lateByDate = new Map(late.map((l) => [l.date, l]));

  // Late half days: a present day becomes a half day.
  const adjusted = days.map((day) => {
    if (lateByDate.get(day.date)?.outcome !== 'half_day') return day;
    return day.scheduled.kind === 'working'
      ? { ...day, baseUnits: 1 }
      : { ...day, extraUnits: Math.min(day.extraUnits, 1) };
  });
  const summary = summarizeDays(adjusted);

  // ---- Earned, overtime, late deduction: day by day with that day's pay settings.
  let earned = ZERO;
  let overtime = ZERO;
  let lateCharge = ZERO;
  let noSettings = 0;
  let missingCheckOut = 0;
  for (const day of adjusted) {
    if (day.status === 'not_employed') continue;
    const s = settingsOn(day.date);
    if (!s) {
      noSettings++;
      continue;
    }
    const rec = day.record;
    if (s.payType === 'hourly') {
      if (rec && WORKED_UNITS[rec.status] !== undefined && rec.checkIn !== undefined) {
        if (rec.checkOut === undefined) missingCheckOut++;
        else
          earned = ratAdd(
            earned,
            rat((s.hourlyRate ?? 0) * Math.max(0, rec.checkOut - rec.checkIn), 60),
          );
      }
    } else if (s.payType === 'monthly') {
      // The day's share of the month, adjusted by what the day is worth at the day rate:
      // a fully paid day (2 units) adds exactly 1/D of the salary whatever the basis.
      const monthly = s.monthlySalary ?? 0;
      const units = day.baseUnits + day.extraUnits;
      earned = ratAdd(earned, ratAdd(rat(monthly, D), rat(monthly * (units - 2), 2 * basis)));
    } else {
      earned = ratAdd(earned, ratMul(dayRate(s, basis), rat(day.baseUnits + day.extraUnits, 2)));
    }
    if (rec?.overtimeMinutes) {
      overtime = ratAdd(overtime, rat((s.overtimeRate ?? 0) * rec.overtimeMinutes, 60));
    }
    const l = lateByDate.get(day.date);
    if (l?.outcome === 'charged' && s.shift) {
      lateCharge = ratAdd(
        lateCharge,
        lateDayCharge(l, policy, dayRate(s, basis), shiftMinutes(s.shift)),
      );
    }
  }

  // ---- Allowances and fixed deductions: share of the employed days they cover.
  const eligible = employed.length;
  const unitsByDate = new Map(adjusted.map((d) => [d.date, d.baseUnits + d.extraUnits]));
  const coverage = (x: { effectiveFrom: BusinessDate; effectiveTo?: BusinessDate }) => {
    const active = employed.filter((d) => inRange(d.date, x.effectiveFrom, x.effectiveTo));
    const units = active.reduce((a, d) => a + (unitsByDate.get(d.date) ?? 0), 0);
    return { activeDays: active.length, payableUnits: units };
  };

  const lines: PayslipLine[] = [];
  const push = (kind: PayslipLineKind, r: Rat, name?: string) => {
    const amount = ratToRupeePaise(r);
    if (amount !== 0) lines.push(name === undefined ? { kind, amount } : { kind, name, amount });
  };

  if (ratCompare(earned, ZERO) < 0) earned = ZERO; // a fixed basis can't take pay below zero
  push('earned', earned);
  push('overtime', overtime);
  if (eligible > 0) {
    for (const a of input.allowances) {
      const { activeDays, payableUnits } = coverage(a);
      if (activeDays === 0) continue;
      const share = a.prorated
        ? ratCompare(rat(payableUnits, 2), rat(activeDays)) < 0
          ? rat(payableUnits, 2 * eligible)
          : rat(activeDays, eligible)
        : rat(activeDays, eligible);
      push('allowance', ratMul(rat(a.amount), share), a.name);
    }
  }
  if (input.leavePayoutDays && closingSettings) {
    push('leave_payout', ratMul(dayRate(closingSettings, basis), rat(input.leavePayoutDays)));
  }
  if (eligible > 0) {
    for (const x of input.deductions) {
      const { activeDays } = coverage(x);
      if (activeDays > 0)
        push('deduction', ratMul(rat(x.amount), rat(activeDays, eligible)), x.name);
    }
  }
  push('late_deduction', lateCharge);

  const total = (kinds: PayslipLineKind[]) =>
    lines.filter((l) => kinds.includes(l.kind)).reduce((a, l) => a + l.amount, 0);
  const gross = total(['earned', 'overtime', 'allowance', 'leave_payout']);
  const deductions = total(['deduction', 'late_deduction']);
  const netBeforeAdvance = gross - deductions;

  const advanceCut = input.advance
    ? Math.max(0, Math.min(input.advance.scheduledCut, input.advance.outstanding, netBeforeAdvance))
    : 0;
  if (advanceCut > 0) lines.push({ kind: 'advance_cut', amount: advanceCut });
  const netPay = netBeforeAdvance - advanceCut;

  const warnings: SalaryWarning[] = [];
  const overdueUnmarked = input.asOf
    ? employed.filter((d) => d.status === 'unmarked' && compareDates(d.date, input.asOf!) <= 0)
        .length
    : summary.unmarked;
  if (overdueUnmarked > 0) warnings.push({ code: 'unmarked_days', count: overdueUnmarked });
  if (noSettings > 0) warnings.push({ code: 'no_pay_settings', count: noSettings });
  if (missingCheckOut > 0) warnings.push({ code: 'missing_check_out', count: missingCheckOut });
  if (netPay < 0) warnings.push({ code: 'negative_net_pay' });

  return {
    days: adjusted,
    summary,
    late,
    lines,
    earned: ratToRupeePaise(earned),
    gross,
    deductions,
    netBeforeAdvance,
    advanceCut,
    netPay,
    warnings,
  };
}
