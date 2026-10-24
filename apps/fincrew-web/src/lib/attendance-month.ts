import {
  addDays,
  compareDates,
  dayLateness,
  effectiveOn,
  evaluateDays,
  minDate,
  monthDates,
  monthEnd,
  monthStart,
  resolveLatePolicy,
  summarizeDays,
  templateVersionOn,
  weekday,
  withOverride,
  type BusinessDate,
  type DayStatus,
  type LeaveTemplateVersion,
} from '@fincrew/core';
import type { createClient } from './supabase/server';
import {
  groupBy,
  toAssignment,
  toAttendanceRecord,
  toPaySettings,
  toShopRules,
  toTemplateVersion,
} from './mappers';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type GridCell = {
  date: BusinessDate;
  /** `future` for days after today; `not_employed` before joining / after leaving. */
  status: DayStatus | 'future';
  late: boolean;
  /** Marked by someone (vs filled from the calendar). */
  marked: boolean;
  /** Check-in / check-out, minutes after IST midnight, when recorded. */
  checkIn?: number;
  checkOut?: number;
  /** Minutes late (as counted by the late policy), when late. */
  lateMinutes?: number;
};

export type GridRow = {
  staffId: string;
  name: string;
  /** Weekdays off in the template in effect at month end (0 = Sunday). */
  offWeekdays: number[];
  hasTemplate: boolean;
  cells: GridCell[];
  /** Payable days up to today (core summarizeDays). */
  payableDays: number;
  lateDays: number;
  absentDays: number;
};

/**
 * One month of attendance for every staff member employed in it, worked out by packages/core:
 * weekly offs and holidays from templates, sandwich rule, extra working days, lateness from
 * shifts. Counts run up to today.
 */
export async function loadAttendanceMonth(
  supabase: Supabase,
  shopId: string,
  year: number,
  month: number,
  today: BusinessDate,
): Promise<{ days: { date: BusinessDate; weekday: number }[]; rows: GridRow[] }> {
  const start = monthStart(year, month);
  const end = monthEnd(year, month);
  const lookFrom = addDays(start, -31); // sandwich rule looks past the month edges
  const lookTo = addDays(end, 31);

  const [staffQ, attQ, holQ, asgQ, verQ, payQ, shopQ] = await Promise.all([
    supabase
      .from('staff')
      .select('person_id, joining_date, leaving_date, people!inner(name)')
      .eq('shop_id', shopId)
      .lte('joining_date', end)
      .or(`leaving_date.is.null,leaving_date.gte.${start}`),
    supabase
      .from('attendance')
      .select('*')
      .eq('shop_id', shopId)
      .gte('date', lookFrom)
      .lte('date', lookTo),
    supabase
      .from('holidays')
      .select('date, name, paid')
      .eq('shop_id', shopId)
      .gte('date', lookFrom)
      .lte('date', lookTo),
    supabase.from('staff_leave_templates').select('*').eq('shop_id', shopId),
    supabase.from('leave_template_versions').select('*').eq('shop_id', shopId),
    supabase.from('pay_settings').select('*').eq('shop_id', shopId),
    supabase.from('shops').select('settings').eq('id', shopId).single(),
  ]);

  const rules = toShopRules(shopQ.data?.settings);
  const holidays = (holQ.data ?? []).map((h) => ({ date: h.date, name: h.name, paid: h.paid }));
  const records = groupBy((attQ.data ?? []).map(toAttendanceRecord), (r) => r.staffId);
  const assignments = groupBy((asgQ.data ?? []).map(toAssignment), (a) => a.staffId);
  const versionsByTemplate = Object.fromEntries(
    groupBy((verQ.data ?? []).map(toTemplateVersion), (v) => v.templateId),
  ) as Record<string, LeaveTemplateVersion[]>;
  const pays = groupBy((payQ.data ?? []).map(toPaySettings), (p) => p.staffId);

  const dates = monthDates(year, month);
  const evalTo = minDate(end, today);
  const monthStarted = compareDates(start, today) <= 0;

  const rows: GridRow[] = (staffQ.data ?? []).map((s) => {
    const staffId = s.person_id;
    const staffPays = pays.get(staffId) ?? [];
    const templateOn = (d: BusinessDate) =>
      templateVersionOn(assignments.get(staffId) ?? [], versionsByTemplate, d);
    const closingDay = s.leaving_date ? minDate(s.leaving_date, end) : end;
    const closingPay = effectiveOn(staffPays, closingDay);
    const payRules = withOverride(rules.pay, closingPay?.payRulesOverride);
    const policy = resolveLatePolicy(rules.late, closingPay?.latePolicyOverride);

    const evaluated = monthStarted
      ? evaluateDays({
          from: start,
          to: evalTo,
          joiningDate: s.joining_date,
          leavingDate: s.leaving_date ?? undefined,
          templateOn,
          holidays,
          records: records.get(staffId) ?? [],
          rules: payRules,
        })
      : [];
    const byDate = new Map(evaluated.map((d) => [d.date, d]));

    let lateDays = 0;
    const cells: GridCell[] = dates.map((date) => {
      const day = byDate.get(date);
      if (!day) return { date, status: 'future', late: false, marked: false };
      const shift = effectiveOn(staffPays, date)?.shift;
      const rec = day.record;
      const lateness =
        shift && rec && day.status === 'present' ? dayLateness(rec, shift, policy) : null;
      const late = !!lateness && (lateness.lateMinutes > 0 || lateness.earlyMinutes > 0);
      if (late) lateDays++;
      return {
        date,
        status: day.status,
        late,
        marked: day.source === 'record',
        checkIn: rec?.checkIn,
        checkOut: rec?.checkOut,
        lateMinutes: late ? lateness!.lateMinutes : undefined,
      };
    });

    const summary = summarizeDays(evaluated);
    const closingTemplate = templateOn(closingDay);
    return {
      staffId,
      name: s.people.name,
      offWeekdays: closingTemplate?.weeklyOffs.map((o) => o.weekday) ?? [],
      hasTemplate: !!closingTemplate,
      cells,
      payableDays: summary.payableDays,
      lateDays,
      absentDays: summary.absent,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));

  return { days: dates.map((date) => ({ date, weekday: weekday(date) })), rows };
}
