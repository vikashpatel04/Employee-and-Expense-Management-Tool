import type { BusinessDate, DaySummary, PayslipLine } from '@fincrew/core';
import type { Json } from '@fincrew/db';
import type { Supabase } from './client';
import { PAYMENT_MODES } from './expense-write';
import { computeMonth, paidByPayslip, sameJson } from './salary-month';

export type SalaryWriteResult =
  | { ok: true; count: number; created?: number; updated?: number }
  | { ok: false; reason: 'no_permission' }
  | { ok: false; reason: 'failed'; message: string };

type Ctx = { shopId: string; permissions: readonly string[] };
const noPermission = { ok: false, reason: 'no_permission' } as const;
const failed = (message: string) => ({ ok: false, reason: 'failed', message }) as const;

export type PayslipWarning = { code: string; count?: number };
export type SalaryPerson = {
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

/**
 * A month's salary run as the salary screens show it: the latest revision of each person's
 * payslip, how much of it is paid, and the run's overall state.
 */
export async function loadSalaryRun(
  supabase: Supabase,
  shopId: string,
  year: number,
  month: number,
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
  const rows = [...latest.values()].sort((a, b) =>
    a.staff.people.name.localeCompare(b.staff.people.name),
  );
  const paid = await paidByPayslip(
    supabase,
    rows.map((r) => r.id),
  );

  const people: SalaryPerson[] = rows.map((r) => {
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
      state: r.status === 'draft' ? 'draft' : paidAmount >= net ? 'paid' : 'finalized',
    };
  });
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
 * Work out (or work out again) every payslip of a month with packages/core (needs salary.run).
 * A draft is updated in place; a finalized payslip gets a new revision only when something
 * changed (finalizing that posts just the differences to the ledger).
 */
export async function runSalary(
  supabase: Supabase,
  input: Ctx & { personId: string; year: number; month: number },
): Promise<SalaryWriteResult> {
  const { shopId, year, month } = input;
  if (!input.permissions.includes('salary.run')) return noPermission;

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

  const [people, { data: existing }] = await Promise.all([
    computeMonth(supabase, shopId, year, month),
    supabase
      .from('payslips')
      .select('id, staff_id, revision, status, lines')
      .eq('run_id', run.id)
      .order('revision', { ascending: false }),
  ]);
  const latest = new Map<string, NonNullable<typeof existing>[number]>();
  for (const p of existing ?? []) if (!latest.has(p.staff_id)) latest.set(p.staff_id, p);

  let created = 0;
  let updated = 0;
  for (const p of people) {
    const r = p.result;
    const warnings = [
      ...r.warnings,
      ...(p.leaveOverBalance ? [{ code: 'paid_leave_over_balance' }] : []),
    ];
    // Core results are plain JSON; jsonb columns store them as-is.
    const json = (v: unknown) => v as Json;
    const row = {
      lines: json(r.lines),
      summary: json(r.summary),
      warnings: json(warnings),
      leave: json(p.leave),
      gross_paise: r.gross,
      deductions_paise: r.deductions,
      net_before_advance_paise: r.netBeforeAdvance,
      advance_cut_paise: r.advanceCut,
      expense_payback_paise: r.expensePayback,
      expense_cut_paise: r.expenseCut,
      net_pay_paise: r.netPay,
    };
    const prev = latest.get(p.staffId);
    if (prev?.status === 'draft') {
      const { error } = await supabase.from('payslips').update(row).eq('id', prev.id);
      if (error) return failed(error.message);
      updated++;
    } else if (!prev || !sameJson(prev.lines, r.lines)) {
      // The lines include the advance and expense cuts, so any money change shows here.
      const { error } = await supabase
        .from('payslips')
        .insert({ ...row, shop_id: shopId, run_id: run.id, staff_id: p.staffId });
      if (error) return failed(error.message);
      created++;
    }
  }
  return { ok: true, count: created + updated, created, updated };
}

/** Finalize one draft, or every draft of the run (needs salary.run): posts each to the ledger. */
export async function finalizeSalary(
  supabase: Supabase,
  input: Ctx & { runId: string; payslipId?: string | null },
): Promise<SalaryWriteResult> {
  if (!input.permissions.includes('salary.run')) return noPermission;
  let query = supabase
    .from('payslips')
    .select('id')
    .eq('run_id', input.runId)
    .eq('status', 'draft');
  if (input.payslipId) query = query.eq('id', input.payslipId);
  const { data: drafts } = await query;
  for (const d of drafts ?? []) {
    const { error } = await supabase.rpc('finalize_payslip', { p_payslip: d.id });
    if (error) return failed(error.message);
  }
  return { ok: true, count: drafts?.length ?? 0 };
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
