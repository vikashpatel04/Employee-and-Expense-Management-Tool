import {
  businessDateOf,
  compareDates,
  monthEnd,
  monthStart,
  type BusinessDate,
  type DaySummary,
  type PayslipLine,
} from '@fincrew/core';
import type { Json } from '@fincrew/db';
import type { Supabase } from './client';
import { PAYMENT_MODES } from './expense-write';
import { computeMonth, paidByPayslip, type ComputedPayslip } from './salary-month';

export type SalaryWriteResult =
  | { ok: true; count: number; created?: number; updated?: number }
  | { ok: false; reason: 'no_permission' }
  | { ok: false; reason: 'failed'; message: string };

type Ctx = { shopId: string; permissions: readonly string[] };
const noPermission = { ok: false, reason: 'no_permission' } as const;
const failed = (message: string) => ({ ok: false, reason: 'failed', message }) as const;

export type PayslipWarning = { code: string; count?: number };
export type SalaryPerson = {
  /** The payslip once finalized; until then (live figures) the staff member's id. */
  id: string;
  staffId: string;
  name: string;
  phone: string | null;
  revision: number;
  lines: PayslipLine[];
  summary: DaySummary;
  warnings: PayslipWarning[];
  leave: { carried?: number; paidOut?: number } | null;
  earned: number;
  overtime: number;
  allowances: number;
  gross: number;
  deductions: number;
  cut: number;
  /** Expenses paid back with this salary / expenses charged to them cut from it. */
  payback: number;
  expenseCut: number;
  net: number;
  paidAmount: number;
  state: 'draft' | 'finalized' | 'paid';
};

/** Warnings on a payslip that isn't finalized yet (core's, plus the leave roll and the month). */
function draftWarnings(p: ComputedPayslip, monthOver: boolean): PayslipWarning[] {
  return [
    ...p.result.warnings,
    ...(p.leaveOverBalance ? [{ code: 'paid_leave_over_balance' }] : []),
    ...(monthOver ? [] : [{ code: 'month_running' }]),
  ];
}

/**
 * A month's salary as the salary screens show it (owner 30/10/2026: no "work out" step).
 * Anyone without a finalized payslip shows live figures, worked out now from attendance, pay,
 * advances and expenses (`computeMonth`), state `draft` ("Not finalized yet"): they change as
 * the month changes. A finalized payslip shows as saved, with what's been paid (`finalized`,
 * then `paid`). Also the run's overall state. During the month (and for anyone still working
 * at its end) the live figures carry the `month_running` warning. A month with no run and no
 * attendance marked (before the shop used FinCrew) shows nobody.
 */
export async function loadSalaryRun(
  supabase: Supabase,
  shopId: string,
  year: number,
  month: number,
  today: BusinessDate = businessDateOf(new Date()),
) {
  const { data: run } = await supabase
    .from('salary_runs')
    .select('id')
    .eq('shop_id', shopId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  const { data: slips } = run
    ? await supabase
        .from('payslips')
        .select('*, staff!inner(people!inner(name, phone))')
        .eq('run_id', run.id)
        .order('revision', { ascending: false })
    : { data: [] };

  const latest = new Map<string, NonNullable<typeof slips>[number]>();
  for (const s of slips ?? []) if (!latest.has(s.staff_id)) latest.set(s.staff_id, s);
  const rows = [...latest.values()].filter((r) => r.status === 'finalized');
  const finalized = new Set(rows.map((r) => r.staff_id));
  // A month with no run and nothing marked (before the shop used FinCrew) has nothing to show.
  const used =
    !!run ||
    ((
      await supabase
        .from('attendance')
        .select('date', { count: 'exact', head: true })
        .eq('shop_id', shopId)
        .gte('date', monthStart(year, month))
        .lte('date', monthEnd(year, month))
    ).count ?? 0) > 0;
  const [paid, computed] = await Promise.all([
    paidByPayslip(
      supabase,
      rows.map((r) => r.id),
    ),
    used ? computeMonth(supabase, shopId, year, month) : [],
  ]);

  const live: SalaryPerson[] = computed
    .filter((p) => !finalized.has(p.staffId))
    .map((p) => {
      const r = p.result;
      const sum = (kinds: string[]) =>
        r.lines.filter((l) => kinds.includes(l.kind)).reduce((a, l) => a + l.amount, 0);
      const monthOver =
        compareDates(monthEnd(year, month), today) <= 0 ||
        (!!p.leavingDate && compareDates(p.leavingDate, today) <= 0);
      return {
        id: p.staffId,
        staffId: p.staffId,
        name: p.name,
        phone: p.phone,
        revision: 0,
        lines: r.lines,
        summary: r.summary,
        warnings: draftWarnings(p, monthOver),
        leave: p.leave,
        earned: sum(['earned']),
        overtime: sum(['overtime']),
        allowances: sum(['allowance', 'leave_payout']),
        gross: r.gross,
        deductions: r.deductions,
        cut: r.advanceCut,
        payback: r.expensePayback,
        expenseCut: r.expenseCut,
        net: r.netPay,
        paidAmount: 0,
        state: 'draft',
      };
    });

  const saved: SalaryPerson[] = rows.map((r) => {
    const lines = r.lines as unknown as PayslipLine[];
    const sum = (kinds: string[]) =>
      lines.filter((l) => kinds.includes(l.kind)).reduce((a, l) => a + l.amount, 0);
    const net = Number(r.net_pay_paise);
    const paidAmount = paid.get(r.id) ?? 0;
    return {
      id: r.id,
      staffId: r.staff_id,
      name: r.staff.people.name,
      phone: r.staff.people.phone,
      revision: r.revision,
      lines,
      summary: r.summary as unknown as DaySummary,
      warnings: (r.warnings as unknown as PayslipWarning[]) ?? [],
      leave: r.leave as unknown as SalaryPerson['leave'],
      earned: sum(['earned']),
      overtime: sum(['overtime']),
      allowances: sum(['allowance', 'leave_payout']),
      gross: Number(r.gross_paise),
      deductions: Number(r.deductions_paise),
      cut: Number(r.advance_cut_paise),
      payback: Number(r.expense_payback_paise),
      expenseCut: Number(r.expense_cut_paise),
      net,
      paidAmount,
      state: paidAmount >= net ? 'paid' : 'finalized',
    };
  });
  const people = [...saved, ...live].sort((a, b) => a.name.localeCompare(b.name));
  const overall: 'none' | 'draft' | 'finalized' | 'paid' =
    people.length === 0
      ? 'none'
      : people.some((p) => p.state === 'draft')
        ? 'draft'
        : people.every((p) => p.state === 'paid')
          ? 'paid'
          : 'finalized';
  return { runId: run?.id ?? null, people, overall };
}

/**
 * Where a person's payslip is in the month's steps (salary screens, website and app): a draft
 * with a warning needs a look, a draft without one is ready to finalize, a finalized one is due
 * until it is fully paid.
 */
export type SalaryGroup = 'look' | 'ready' | 'due' | 'paid';
export const SALARY_GROUPS: readonly SalaryGroup[] = ['look', 'ready', 'due', 'paid'];

export function salaryGroup(p: SalaryPerson): SalaryGroup {
  if (p.state === 'draft') return p.warnings.length > 0 ? 'look' : 'ready';
  return p.state === 'paid' ? 'paid' : 'due';
}

/**
 * A month's salary for the step-by-step screens: people by group, how the take-home adds up
 * (earned + allowances and overtime + expenses paid back − advance cut − expenses charged −
 * deductions = take-home), what's paid and still to pay, and the working days not marked.
 */
export function salaryOverview(people: readonly SalaryPerson[]) {
  const sum = (f: (p: SalaryPerson) => number) => people.reduce((a, p) => a + f(p), 0);
  const groups = Object.fromEntries(SALARY_GROUPS.map((g) => [g, [] as SalaryPerson[]])) as Record<
    SalaryGroup,
    SalaryPerson[]
  >;
  for (const p of people) groups[salaryGroup(p)].push(p);
  const due = (p: SalaryPerson) => (p.state === 'draft' ? 0 : Math.max(0, p.net - p.paidAmount));
  return {
    groups,
    totals: {
      earned: sum((p) => p.earned),
      extras: sum((p) => p.gross - p.earned),
      payback: sum((p) => p.payback),
      cut: sum((p) => p.cut),
      expenseCut: sum((p) => p.expenseCut),
      deductions: sum((p) => p.deductions),
      net: sum((p) => p.net),
      paid: sum((p) => Math.min(p.paidAmount, p.net)),
      due: sum(due),
    },
    dueCount: people.filter((p) => due(p) > 0).length,
    unmarked: sum(
      (p) => p.warnings.find((w) => w.code === 'unmarked_days' && p.state === 'draft')?.count ?? 0,
    ),
  };
}

/**
 * Save the live figures of these people as draft payslips (updated in place), creating the
 * month's run if needed, and return each one's draft id. People with a finalized payslip this
 * month are left alone: finalized is final.
 */
async function saveDrafts(
  supabase: Supabase,
  input: Ctx & { personId: string; year: number; month: number; staffIds: readonly string[] },
): Promise<{ ok: true; drafts: string[] } | ReturnType<typeof failed>> {
  const { shopId, year, month } = input;
  let { data: run } = await supabase
    .from('salary_runs')
    .select('id')
    .eq('shop_id', shopId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (!run) {
    const { data, error } = await supabase
      .from('salary_runs')
      .insert({ shop_id: shopId, year, month, created_by: input.personId })
      .select('id')
      .single();
    if (error) return failed(error.message);
    run = data;
  }

  const wanted = new Set(input.staffIds);
  const [people, { data: existing }] = await Promise.all([
    computeMonth(supabase, shopId, year, month),
    supabase
      .from('payslips')
      .select('id, staff_id, revision, status')
      .eq('run_id', run.id)
      .order('revision', { ascending: false }),
  ]);
  const latest = new Map<string, NonNullable<typeof existing>[number]>();
  for (const p of existing ?? []) if (!latest.has(p.staff_id)) latest.set(p.staff_id, p);

  const drafts: string[] = [];
  for (const p of people) {
    if (!wanted.has(p.staffId)) continue;
    const prev = latest.get(p.staffId);
    if (prev?.status === 'finalized') continue;
    const r = p.result;
    // Core results are plain JSON; jsonb columns store them as-is. The month-running warning
    // is a screen hint, not part of the payslip.
    const json = (v: unknown) => v as Json;
    const row = {
      lines: json(r.lines),
      summary: json(r.summary),
      warnings: json(draftWarnings(p, true)),
      leave: json(p.leave),
      gross_paise: r.gross,
      deductions_paise: r.deductions,
      net_before_advance_paise: r.netBeforeAdvance,
      advance_cut_paise: r.advanceCut,
      expense_payback_paise: r.expensePayback,
      expense_cut_paise: r.expenseCut,
      net_pay_paise: r.netPay,
    };
    if (prev) {
      const { error } = await supabase.from('payslips').update(row).eq('id', prev.id);
      if (error) return failed(error.message);
      drafts.push(prev.id);
    } else {
      const { data, error } = await supabase
        .from('payslips')
        .insert({ ...row, shop_id: shopId, run_id: run.id, staff_id: p.staffId })
        .select('id')
        .single();
      if (error) return failed(error.message);
      drafts.push(data.id);
    }
  }
  return { ok: true, drafts };
}

/**
 * Finalize these people's salary for the month (needs salary.run): their live figures are
 * worked out once more, saved and finalized, which posts each payslip to the ledger and shows it
 * to them in Staffora. Anyone already finalized is skipped. Finalized is final; the next month's
 * figures carry on from there.
 */
export async function finalizeSalary(
  supabase: Supabase,
  input: Ctx & { personId: string; year: number; month: number; staffIds: readonly string[] },
): Promise<SalaryWriteResult> {
  if (!input.permissions.includes('salary.run')) return noPermission;
  if (input.staffIds.length === 0) return { ok: true, count: 0 };
  const saved = await saveDrafts(supabase, input);
  if (!saved.ok) return saved;
  for (const id of saved.drafts) {
    const { error } = await supabase.rpc('finalize_payslip', { p_payslip: id });
    if (error) return failed(error.message);
  }
  return { ok: true, count: saved.drafts.length };
}

/**
 * Pay what's left of finalized payslips (one, or all in the run when `payslipId` is null; needs
 * salary.run): one salary payment line per person, dated today. `amount` (paise, one payslip
 * only) pays part of it: more than 0 and no more than what's left.
 */
export async function paySalary(
  supabase: Supabase,
  input: Ctx & {
    runId: string;
    payslipId: string | null;
    mode: string;
    today: BusinessDate;
    amount?: number | null;
  },
): Promise<SalaryWriteResult> {
  if (!input.permissions.includes('salary.run')) return noPermission;
  const mode = PAYMENT_MODES.find((m) => m === input.mode);
  if (!mode) return failed(input.mode);
  const part = input.amount ?? null;
  if (part !== null && (!input.payslipId || !Number.isInteger(part) || part <= 0))
    return failed('amount');

  let query = supabase
    .from('payslips')
    .select('id, staff_id, revision, net_pay_paise')
    .eq('run_id', input.runId)
    .eq('status', 'finalized')
    .order('revision', { ascending: false });
  if (input.payslipId) query = query.eq('id', input.payslipId);
  const { data: slips } = await query;
  const latest = new Map<string, NonNullable<typeof slips>[number]>();
  for (const s of slips ?? []) if (!latest.has(s.staff_id)) latest.set(s.staff_id, s);
  const paid = await paidByPayslip(
    supabase,
    [...latest.values()].map((s) => s.id),
  );

  let count = 0;
  for (const s of latest.values()) {
    const left = Number(s.net_pay_paise) - (paid.get(s.id) ?? 0);
    if (left <= 0) continue;
    if (part !== null && part > left) return failed('amount');
    const { error } = await supabase.from('ledger_entries').insert({
      shop_id: input.shopId,
      staff_id: s.staff_id,
      date: input.today,
      type: 'salary_payment',
      amount_paise: -(part ?? left),
      payment_mode: mode,
      ref_table: 'payslips',
      ref_id: s.id,
    });
    if (error) return failed(error.message);
    count++;
  }
  return { ok: true, count };
}

/**
 * A person's finalized payslips with money still to pay (latest revision of each month), oldest
 * first: what "Pay" on their page settles with `paySalary`.
 */
export async function loadPayslipsDue(supabase: Supabase, staffId: string) {
  const { data: slips } = await supabase
    .from('payslips')
    .select('id, run_id, revision, status, net_pay_paise, salary_runs!inner(year, month)')
    .eq('staff_id', staffId)
    .order('revision', { ascending: false });
  const latest = new Map<string, NonNullable<typeof slips>[number]>();
  for (const s of slips ?? []) if (!latest.has(s.run_id)) latest.set(s.run_id, s);
  const finalized = [...latest.values()].filter((s) => s.status === 'finalized');
  const paid = await paidByPayslip(
    supabase,
    finalized.map((s) => s.id),
  );
  return finalized
    .map((s) => ({
      runId: s.run_id,
      payslipId: s.id,
      year: s.salary_runs.year,
      month: s.salary_runs.month,
      due: Number(s.net_pay_paise) - (paid.get(s.id) ?? 0),
    }))
    .filter((s) => s.due > 0)
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
}

/**
 * A person's finalized payslips (latest revision of each month), newest first, with what's been
 * paid: Staffora's Money → Payslips. RLS shows staff only their own finalized payslips.
 */
export async function loadMyPayslips(supabase: Supabase, staffId: string) {
  const { data: slips } = await supabase
    .from('payslips')
    .select('id, run_id, revision, net_pay_paise, finalized_at, salary_runs!inner(year, month)')
    .eq('staff_id', staffId)
    .eq('status', 'finalized')
    .order('revision', { ascending: false });
  const latest = new Map<string, NonNullable<typeof slips>[number]>();
  for (const s of slips ?? []) if (!latest.has(s.run_id)) latest.set(s.run_id, s);
  const list = [...latest.values()];
  const paid = await paidByPayslip(
    supabase,
    list.map((s) => s.id),
  );
  return list
    .map((s) => ({
      id: s.id,
      year: s.salary_runs.year,
      month: s.salary_runs.month,
      net: Number(s.net_pay_paise),
      paid: paid.get(s.id) ?? 0,
      /** When the shop finalized it (a timestamp), or null for older rows. */
      finalizedAt: s.finalized_at,
    }))
    .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
}

/** One payslip with everything a payslip page shows (the person's own, or with salary.view). */
export async function loadPayslipView(supabase: Supabase, payslipId: string) {
  const { data: slip } = await supabase
    .from('payslips')
    .select(
      '*, salary_runs!inner(year, month), staff!inner(joining_date, leaving_date, people!inner(name)), shops!inner(name)',
    )
    .eq('id', payslipId)
    .maybeSingle();
  if (!slip) return null;
  const { year, month } = slip.salary_runs;
  const paid =
    slip.status === 'finalized'
      ? ((await paidByPayslip(supabase, [slip.id])).get(slip.id) ?? 0)
      : 0;
  return {
    id: slip.id,
    shopName: slip.shops.name,
    name: slip.staff.people.name,
    year,
    month,
    joiningDate: slip.staff.joining_date,
    leavingDate: slip.staff.leaving_date,
    status: slip.status as 'draft' | 'finalized',
    lines: slip.lines as unknown as PayslipLine[],
    summary: slip.summary as unknown as DaySummary,
    gross: Number(slip.gross_paise),
    deductions: Number(slip.deductions_paise),
    netBeforeAdvance: Number(slip.net_before_advance_paise),
    cut: Number(slip.advance_cut_paise),
    payback: Number(slip.expense_payback_paise),
    expenseCut: Number(slip.expense_cut_paise),
    net: Number(slip.net_pay_paise),
    paid,
  };
}
