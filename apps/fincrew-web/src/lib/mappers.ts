/**
 * Database rows → packages/core types. One place, so the attendance grid and the salary run
 * feed core exactly the same inputs.
 */
import {
  minutesOfDayIST,
  resolveShopRules,
  type AttendanceRecord,
  type AttendanceStatus,
  type LeaveTemplateVersion,
  type PaySettings,
  type ShopRules,
  type TemplateAssignment,
} from '@fincrew/core';
import type { Database } from '@fincrew/db';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

export function toTemplateVersion(
  v: Row<'leave_template_versions'>,
): LeaveTemplateVersion & { templateId: string } {
  return {
    templateId: v.template_id,
    effectiveFrom: v.effective_from,
    weeklyOffs: v.weekly_offs as unknown as LeaveTemplateVersion['weeklyOffs'],
    paidLeavesPerMonth: v.paid_leaves_per_month,
    carryOver: v.carry_over as unknown as LeaveTemplateVersion['carryOver'],
    sandwich: v.sandwich as unknown as LeaveTemplateVersion['sandwich'],
    accrual: v.accrual as unknown as LeaveTemplateVersion['accrual'],
  };
}

export function toAssignment(
  a: Row<'staff_leave_templates'>,
): TemplateAssignment & { staffId: string } {
  return { staffId: a.staff_id, effectiveFrom: a.effective_from, templateId: a.template_id };
}

export function toPaySettings(p: Row<'pay_settings'>): PaySettings & { staffId: string } {
  const n = (v: number | null) => (v == null ? undefined : Number(v));
  return {
    staffId: p.staff_id,
    effectiveFrom: p.effective_from,
    payType: p.pay_type as PaySettings['payType'],
    monthlySalary: n(p.monthly_salary_paise),
    dailyWage: n(p.daily_wage_paise),
    hourlyRate: n(p.hourly_rate_paise),
    overtimeRate: n(p.overtime_rate_paise),
    shift:
      p.shift_start != null && p.shift_end != null
        ? { start: p.shift_start, end: p.shift_end, graceMinutes: p.grace_minutes }
        : undefined,
    hoursPerDay: p.day_minutes == null ? undefined : p.day_minutes / 60,
    latePolicyOverride: p.late_policy_override as PaySettings['latePolicyOverride'],
    payRulesOverride: p.pay_rules_override as PaySettings['payRulesOverride'],
  };
}

export function toAttendanceRecord(a: Row<'attendance'>): AttendanceRecord & { staffId: string } {
  return {
    staffId: a.staff_id,
    date: a.date,
    status: a.status as AttendanceStatus,
    checkIn: a.check_in ? minutesOfDayIST(new Date(a.check_in)) : undefined,
    checkOut: a.check_out ? minutesOfDayIST(new Date(a.check_out)) : undefined,
    overtimeMinutes: a.overtime_minutes || undefined,
  };
}

/** The shop's stored rules, filled with defaults (docs/features/core-rules.md). */
export function toShopRules(settings: unknown): ShopRules {
  return resolveShopRules((settings ?? {}) as Parameters<typeof resolveShopRules>[0]);
}

/** Group rows by a key, e.g. staff id. */
export function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return out;
}
