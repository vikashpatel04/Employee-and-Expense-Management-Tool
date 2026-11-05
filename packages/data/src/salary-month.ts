import {
  addDays,
  businessDateOf,
  calculateSalary,
  compareDates,
  daysBetween,
  employedPart,
  monthEnd,
  monthStart,
  paidLeaveUsed,
  payPeriod,
  personPayDay,
  rollLeaveMonth,
  scheduledAdvanceCut,
  shiftMonth,
  templateVersionOn,
  type AdvanceCutMode,
  type BusinessDate,
  type LeaveMonth,
  type LeaveTemplateVersion,
  type PayPeriod,
  type SalaryResult,
} from '@fincrew/core';
import type { Supabase } from './client';
import {
  groupBy,
  toAssignment,
  toAttendanceRecord,
  toPaySettings,
  toShopRules,
  toTemplateVersion,
} from './mappers';

export type ComputedPayslip = {
  staffId: string;
  name: string;
  phone: string | null;
  joiningDate: BusinessDate;
  leavingDate: BusinessDate | null;
  /** The days this salary covers (their pay day; packages/core pay-period.ts). */
  period: PayPeriod;
  result: SalaryResult;
  /** The month's leave roll; null with no template (no paid leave) or when marks exceed the balance. */
  leave: LeaveMonth | null;
  /** Paid leave marked beyond the balance (the leave roll couldn't close the month). */
  leaveOverBalance: boolean;
};

/**
 * Work out every salary named after this month with packages/core, each over that person's own
 * pay period, from the same inputs as the attendance grid (src/lib/mappers.ts), plus allowances,
 * deductions, advances, expenses to settle (each person's advance cut mode and expense switches)
 * and last month's carried leave. Someone not employed in their period is left out. Nothing is
 * written here.
 */
export async function computeMonth(
  supabase: Supabase,
  shopId: string,
  year: number,
  month: number,
): Promise<ComputedPayslip[]> {
  const end = monthEnd(year, month);
  const prev = shiftMonth(year, month, -1);
  // A period named after this month starts in the month before at the earliest.
  const earliest = monthStart(prev.year, prev.month);
  const lookFrom = addDays(earliest, -31);
  const lookTo = addDays(end, 31);

  const [
    staffQ,
    attQ,
    holQ,
    asgQ,
    verQ,
    payQ,
    allowQ,
    dedQ,
    advQ,
    balQ,
    shopQ,
    expQ,
    settled,
    ended,
  ] = await Promise.all([
    supabase
      .from('staff')
      .select(
        'person_id, joining_date, leaving_date, advance_cut_paise, advance_cut_mode, expense_payback, expense_recover, people!inner(name, phone)',
      )
      .eq('shop_id', shopId)
      .lte('joining_date', end)
      .or(`leaving_date.is.null,leaving_date.gte.${earliest}`),
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
    supabase.from('allowances').select('*').eq('shop_id', shopId),
    supabase.from('fixed_deductions').select('*').eq('shop_id', shopId),
    supabase.from('advance_balances').select('staff_id, outstanding_paise').eq('shop_id', shopId),
    supabase
      .from('leave_balances')
      .select('staff_id, carried')
      .eq('shop_id', shopId)
      .eq('year', prev.year)
      .eq('month', prev.month),
    supabase.from('shops').select('settings').eq('id', shopId).single(),
    supabase
      .from('expense_balances')
      .select('staff_id, payback_paise, charge_paise')
      .eq('shop_id', shopId),
    settledThisMonth(supabase, shopId, year, month),
    finalizedEnds(supabase, shopId, prev.year, prev.month),
  ]);

  const rules = toShopRules(shopQ.data?.settings);
  const holidays = (holQ.data ?? []).map((h) => ({ date: h.date, name: h.name, paid: h.paid }));
  const records = groupBy((attQ.data ?? []).map(toAttendanceRecord), (r) => r.staffId);
  const assignments = groupBy((asgQ.data ?? []).map(toAssignment), (a) => a.staffId);
  const versionsByTemplate = Object.fromEntries(
    groupBy((verQ.data ?? []).map(toTemplateVersion), (v) => v.templateId),
  ) as Record<string, LeaveTemplateVersion[]>;
  const pays = groupBy((payQ.data ?? []).map(toPaySettings), (p) => p.staffId);
  const allowances = groupBy(allowQ.data ?? [], (a) => a.staff_id);
  const deductions = groupBy(dedQ.data ?? [], (d) => d.staff_id);
  const outstanding = new Map(
    (advQ.data ?? []).map((a) => [a.staff_id, Number(a.outstanding_paise ?? 0)]),
  );
  const carried = new Map((balQ.data ?? []).map((b) => [b.staff_id, Number(b.carried)]));
  const dues = new Map(
    (expQ.data ?? []).map((e) => [
      e.staff_id,
      { payback: Number(e.payback_paise ?? 0), charges: Number(e.charge_paise ?? 0) },
    ]),
  );

  return (staffQ.data ?? [])
    .flatMap((s): ComputedPayslip[] => {
      const staffId = s.person_id;
      const paySettings = pays.get(staffId) ?? [];
      const period = payPeriod(
        year,
        month,
        personPayDay(rules.pay, s.joining_date, paySettings, end),
        ended.get(staffId),
      );
      const { from: employedFrom, to: closingDay } = employedPart(
        period,
        s.joining_date,
        s.leaving_date,
      );
      if (compareDates(employedFrom, closingDay) > 0) return [];
      const templateOn = (d: BusinessDate) =>
        templateVersionOn(assignments.get(staffId) ?? [], versionsByTemplate, d);
      const input = {
        year,
        month,
        period,
        joiningDate: s.joining_date,
        leavingDate: s.leaving_date ?? undefined,
        paySettings,
        templateOn,
        holidays,
        records: records.get(staffId) ?? [],
        allowances: (allowances.get(staffId) ?? []).map((a) => ({
          name: a.name,
          amount: Number(a.amount_paise),
          prorated: a.prorated,
          effectiveFrom: a.effective_from,
          effectiveTo: a.effective_to ?? undefined,
        })),
        deductions: (deductions.get(staffId) ?? []).map((d) => ({
          name: d.name,
          amount: Number(d.amount_paise),
          effectiveFrom: d.effective_from,
          effectiveTo: d.effective_to ?? undefined,
        })),
        rules: { pay: rules.pay, late: rules.late },
        asOf: businessDateOf(new Date()),
        ...(() => {
          // A re-run of a finalized month: what that payslip settled counts as still open.
          const done = settled.get(staffId);
          const owed = (outstanding.get(staffId) ?? 0) + (done?.advanceCut ?? 0);
          const due = dues.get(staffId);
          return {
            advance: {
              scheduledCut: scheduledAdvanceCut({
                mode: s.advance_cut_mode as AdvanceCutMode,
                monthlyCut: s.advance_cut_paise == null ? null : Number(s.advance_cut_paise),
                outstanding: owed,
              }),
              outstanding: owed,
            },
            expenses: {
              payback: s.expense_payback ? (due?.payback ?? 0) + (done?.payback ?? 0) : 0,
              charges: s.expense_recover ? (due?.charges ?? 0) + (done?.expenseCut ?? 0) : 0,
            },
          };
        })(),
      };

      // First pass gives the days (and so paid leave used); the leave roll may add a payout.
      const first = calculateSalary(input);
      let leave: LeaveMonth | null = null;
      let leaveOverBalance = false;
      const version = templateVersionOn(
        assignments.get(staffId) ?? [],
        versionsByTemplate,
        closingDay,
      );
      try {
        leave = rollLeaveMonth({
          year,
          month,
          opening: carried.get(staffId) ?? 0,
          used: paidLeaveUsed(first.days),
          version,
          employedDays: Math.max(0, daysBetween(employedFrom, closingDay) + 1),
          periodDays: period.cycleDays,
        });
      } catch {
        leaveOverBalance = true;
      }
      const result =
        leave && leave.paidOut > 0
          ? calculateSalary({ ...input, leavePayoutDays: leave.paidOut })
          : first;
      return [
        {
          staffId,
          name: s.people.name,
          phone: s.people.phone,
          joiningDate: s.joining_date,
          leavingDate: s.leaving_date,
          period,
          result,
          leave: version ? leave : null,
          leaveOverBalance,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What this month's latest finalized payslips already settled (advance cut, expenses paid back
 * and cut), per person. The balances views already subtract them; a re-run adds them back.
 */
async function settledThisMonth(supabase: Supabase, shopId: string, year: number, month: number) {
  const out = new Map<string, { advanceCut: number; payback: number; expenseCut: number }>();
  const { data: run } = await supabase
    .from('salary_runs')
    .select('id')
    .eq('shop_id', shopId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (!run) return out;
  const { data } = await supabase
    .from('payslips')
    .select('staff_id, advance_cut_paise, expense_payback_paise, expense_cut_paise')
    .eq('run_id', run.id)
    .eq('status', 'finalized')
    .order('revision', { ascending: false });
  for (const p of data ?? [])
    if (!out.has(p.staff_id))
      out.set(p.staff_id, {
        advanceCut: Number(p.advance_cut_paise),
        payback: Number(p.expense_payback_paise),
        expenseCut: Number(p.expense_cut_paise),
      });
  return out;
}

/**
 * Where each person's finalized salary for this month ended: the next one starts the day after,
 * even if their pay day has changed since. Older payslips (no dates) covered the calendar month.
 */
async function finalizedEnds(supabase: Supabase, shopId: string, year: number, month: number) {
  const out = new Map<string, BusinessDate>();
  const { data: run } = await supabase
    .from('salary_runs')
    .select('id')
    .eq('shop_id', shopId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (!run) return out;
  const { data } = await supabase
    .from('payslips')
    .select('staff_id, period_to')
    .eq('run_id', run.id)
    .eq('status', 'finalized')
    .order('revision', { ascending: false });
  for (const p of data ?? [])
    if (!out.has(p.staff_id)) out.set(p.staff_id, p.period_to ?? monthEnd(year, month));
  return out;
}

/** Amount paid against each payslip: payments minus their reversals. */
export async function paidByPayslip(
  supabase: Supabase,
  payslipIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (payslipIds.length === 0) return out;
  const { data: payments } = await supabase
    .from('ledger_entries')
    .select('id, ref_id, amount_paise')
    .eq('type', 'salary_payment')
    .eq('ref_table', 'payslips')
    .in('ref_id', payslipIds);
  const paymentIds = (payments ?? []).map((p) => p.id);
  const { data: reversals } = paymentIds.length
    ? await supabase
        .from('ledger_entries')
        .select('reverses_id')
        .eq('type', 'reversal')
        .in('reverses_id', paymentIds)
    : { data: [] };
  const reversed = new Set((reversals ?? []).map((r) => r.reverses_id));
  for (const p of payments ?? []) {
    if (reversed.has(p.id) || !p.ref_id) continue;
    out.set(p.ref_id, (out.get(p.ref_id) ?? 0) - Number(p.amount_paise));
  }
  return out;
}

/** Deep equality that ignores object key order (Postgres jsonb reorders keys). */
export function sameJson(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}
