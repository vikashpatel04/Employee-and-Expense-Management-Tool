import {
  addDays,
  businessDateOf,
  compareDates,
  employedPart,
  newCycleCheck,
  monthEnd,
  monthOf,
  monthStart,
  shiftMonth,
  type BusinessDate,
  type DaySummary,
  type PayslipLine,
} from '@fincrew/core';
import type { Json } from '@fincrew/db';
import type { Supabase } from './client';
import { PAYMENT_MODES } from './expense-write';
import {
  computeMonth,
  paidByPayslip,
  type ComputedPayslip,
  type SalaryEntry,
} from './salary-month';

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
  /** The days this salary covers (cut to joining and leaving) and the date it is paid. */
  period: { from: BusinessDate; to: BusinessDate; payDate: BusinessDate };
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
  /** Add or less entries that can still be removed; once finalized they are payslip lines. */
  entries: SalaryEntry[];
  /** Not finalized and its period isn't over: Pay now instead of Finalize. */
  running: boolean;
  /** Closed early: a new cycle started on this date. */
  newCycleFrom: BusinessDate | null;
};

/** Warnings on a payslip that isn't finalized yet (core's, plus the leave roll and the period). */
function draftWarnings(p: ComputedPayslip, periodOver: boolean): PayslipWarning[] {
  return [
    ...p.result.warnings,
    ...(p.leaveOverBalance ? [{ code: 'paid_leave_over_balance' }] : []),
    ...(periodOver ? [] : [{ code: 'month_running' }]),
  ];
}

/**
 * The salaries named after a month as the salary screens show them (owner 30/10/2026: no "work
 * out" step; 05/11/2026: each person over their own pay period). Anyone without a finalized
 * payslip shows live figures, worked out now from attendance, pay, advances and expenses
 * (`computeMonth`), state `draft` ("Not finalized yet"): they change as the days go by. A finalized
 * payslip shows as saved, with what's been paid (`finalized`, then `paid`). Also the run's overall
 * state. During a person's period (and for anyone still working at its end) the live figures carry
 * the `month_running` warning; a period that hasn't started yet isn't shown. A month with no run
 * and no attendance marked (before the shop used FinCrew) shows nobody.
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
        .select('*, staff!inner(joining_date, leaving_date, people!inner(name, phone))')
        .eq('run_id', run.id)
        .order('revision', { ascending: false })
    : { data: [] };

  const latest = new Map<string, NonNullable<typeof slips>[number]>();
  for (const s of slips ?? []) if (!latest.has(s.staff_id)) latest.set(s.staff_id, s);
  const rows = [...latest.values()].filter((r) => r.status === 'finalized');
  const finalized = new Set(rows.map((r) => r.staff_id));
  // A draft is saved when someone is paid early: what's paid comes off at finalizing.
  const drafts = new Map(
    [...latest.values()].filter((r) => r.status === 'draft').map((r) => [r.staff_id, r.id]),
  );
  // A month with no run and nothing marked (before the shop used FinCrew) has nothing to show.
  const before = shiftMonth(year, month, -1);
  const used =
    !!run ||
    ((
      await supabase
        .from('attendance')
        .select('date', { count: 'exact', head: true })
        .eq('shop_id', shopId)
        .gte('date', monthStart(before.year, before.month))
        .lte('date', monthEnd(year, month))
    ).count ?? 0) > 0;
  const [paid, computed] = await Promise.all([
    paidByPayslip(supabase, [...rows.map((r) => r.id), ...drafts.values()]),
    used ? computeMonth(supabase, shopId, year, month) : [],
  ]);

  const live: SalaryPerson[] = computed
    .filter((p) => !finalized.has(p.staffId) && compareDates(p.period.from, today) <= 0)
    .map((p) => {
      const r = p.result;
      const sum = (kinds: string[]) =>
        r.lines.filter((l) => kinds.includes(l.kind)).reduce((a, l) => a + l.amount, 0);
      const periodOver =
        compareDates(p.period.to, today) <= 0 ||
        (!!p.leavingDate && compareDates(p.leavingDate, today) <= 0);
      return {
        id: p.staffId,
        staffId: p.staffId,
        name: p.name,
        phone: p.phone,
        revision: 0,
        period: {
          ...employedPart(p.period, p.joiningDate, p.leavingDate),
          payDate: p.period.payDate,
        },
        lines: r.lines,
        summary: r.summary,
        warnings: draftWarnings(p, periodOver),
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
        paidAmount: paid.get(drafts.get(p.staffId) ?? '') ?? 0,
        state: 'draft',
        entries: p.entries,
        running: !periodOver,
        newCycleFrom: null,
      };
    });

  const saved: SalaryPerson[] = rows.map((r) => {
    const lines = r.lines as unknown as PayslipLine[];
    const sum = (kinds: string[]) =>
      lines.filter((l) => kinds.includes(l.kind)).reduce((a, l) => a + l.amount, 0);
    const net = Number(r.net_pay_paise);
    const paidAmount = paid.get(r.id) ?? 0;
    const end = r.period_to ?? monthEnd(year, month);
    return {
      id: r.id,
      staffId: r.staff_id,
      name: r.staff.people.name,
      phone: r.staff.people.phone,
      revision: r.revision,
      period: {
        ...employedPart(
          { from: r.period_from ?? monthStart(year, month), to: end },
          r.staff.joining_date,
          r.staff.leaving_date,
        ),
        payDate: addDays(end, 1),
      },
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
      entries: [],
      running: false,
      newCycleFrom: r.new_cycle_from,
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
 * The salary to act on now, for the dashboard: last month's while anyone in it is still to finalize
 * or pay, otherwise this month's. Also every pay date still open, soonest first (a salary from last
 * month to next month that isn't fully paid), with how many people it covers.
 */
export async function loadSalaryNow(supabase: Supabase, shopId: string, today: BusinessDate) {
  const current = monthOf(today);
  const last = shiftMonth(current.year, current.month, -1);
  const next = shiftMonth(current.year, current.month, 1);
  const [lastRun, currentRun, nextRun] = await Promise.all([
    loadSalaryRun(supabase, shopId, last.year, last.month, today),
    loadSalaryRun(supabase, shopId, current.year, current.month, today),
    loadSalaryRun(supabase, shopId, next.year, next.month, today),
  ]);
  const open = (p: SalaryPerson) => p.state !== 'paid';
  const lastOpen = lastRun.people.some(open);
  const { people, overall } = lastOpen ? lastRun : currentRun;
  const dates = new Map<
    string,
    { date: BusinessDate; year: number; month: number; count: number }
  >();
  for (const [m, run] of [
    [last, lastRun],
    [current, currentRun],
    [next, nextRun],
  ] as const)
    for (const p of run.people.filter(open)) {
      const key = `${m.year}-${m.month}-${p.period.payDate}`;
      const have = dates.get(key) ?? { date: p.period.payDate, ...m, count: 0 };
      dates.set(key, { ...have, count: have.count + 1 });
    }
  const { totals } = salaryOverview(people);
  return {
    ...(lastOpen ? last : current),
    state: overall,
    people: people.length,
    net: totals.net,
    paid: totals.paid,
    paidPeople: people.filter((p) => p.state === 'paid').length,
    unmarkedPeople: people.filter(
      (p) => p.state === 'draft' && p.warnings.some((w) => w.code === 'unmarked_days'),
    ).length,
    payDates: [...dates.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
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
  input: Ctx & {
    personId: string;
    year: number;
    month: number;
    staffIds: readonly string[];
    closes?: ReadonlyMap<string, BusinessDate>;
  },
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
    computeMonth(supabase, shopId, year, month, { closes: input.closes }),
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
    // Core results are plain JSON; jsonb columns store them as-is. The period-running warning
    // is a screen hint, not part of the payslip.
    const json = (v: unknown) => v as Json;
    const row = {
      period_from: p.period.from,
      period_to: p.closesOn ?? p.period.to,
      new_cycle_from: p.closesOn ? addDays(p.closesOn, 1) : null,
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

/** The longest name an add or less entry can have (the table refuses more). */
export const SALARY_ENTRY_NAME_MAX = 60;

/**
 * Add a named amount to one month's salary, or take one off (Check and finalize; needs
 * salary.run): it changes that month's figures straight away and stays until it is removed or the
 * salary is finalized, when it becomes a line on the payslip. `amount` is in paise.
 */
export async function addSalaryEntry(
  supabase: Supabase,
  input: Ctx & {
    personId: string;
    staffId: string;
    year: number;
    month: number;
    kind: SalaryEntry['kind'];
    name: string;
    amount: number;
  },
): Promise<SalaryWriteResult> {
  if (!input.permissions.includes('salary.run')) return noPermission;
  const name = input.name.trim();
  if (!name || name.length > SALARY_ENTRY_NAME_MAX) return failed('name');
  if (!Number.isInteger(input.amount) || input.amount <= 0) return failed('amount');
  const { error } = await supabase.from('salary_adjustments').insert({
    shop_id: input.shopId,
    staff_id: input.staffId,
    year: input.year,
    month: input.month,
    kind: input.kind,
    name,
    amount_paise: input.amount,
    created_by: input.personId,
  });
  return error ? failed(error.message) : { ok: true, count: 1 };
}

/** Remove an add or less entry (needs salary.run). The database refuses once it is finalized. */
export async function removeSalaryEntry(
  supabase: Supabase,
  input: Ctx & { id: string },
): Promise<SalaryWriteResult> {
  if (!input.permissions.includes('salary.run')) return noPermission;
  const { error } = await supabase.from('salary_adjustments').delete().eq('id', input.id);
  return error ? failed(error.message) : { ok: true, count: 1 };
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
    /** The day it was paid (Paid on); today when left out. Never after today. */
    date?: BusinessDate;
  },
): Promise<SalaryWriteResult> {
  if (!input.permissions.includes('salary.run')) return noPermission;
  const mode = PAYMENT_MODES.find((m) => m === input.mode);
  if (!mode) return failed(input.mode);
  const date = input.date ?? input.today;
  if (compareDates(date, input.today) > 0) return failed('date');
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
      date,
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
 * Pay now, keeping the pay day (owner 09/11/2026; needs salary.run): pay any amount towards a
 * salary not finalized yet. Its live figures are saved as the draft payslip and the payment points
 * at it, so it comes off when the salary is finalized; the period and pay day stay as they are.
 */
export async function payEarly(
  supabase: Supabase,
  input: Ctx & {
    personId: string;
    staffId: string;
    year: number;
    month: number;
    amount: number;
    date: BusinessDate;
    mode: string;
    today: BusinessDate;
  },
): Promise<SalaryWriteResult> {
  if (!input.permissions.includes('salary.run')) return noPermission;
  const mode = PAYMENT_MODES.find((m) => m === input.mode);
  if (!mode) return failed(input.mode);
  if (!Number.isInteger(input.amount) || input.amount <= 0) return failed('amount');
  if (compareDates(input.date, input.today) > 0) return failed('date');
  const saved = await saveDrafts(supabase, { ...input, staffIds: [input.staffId] });
  if (!saved.ok) return saved;
  const draft = saved.drafts[0];
  if (!draft) return failed('finalized');
  const { error } = await supabase.from('ledger_entries').insert({
    shop_id: input.shopId,
    staff_id: input.staffId,
    date: input.date,
    type: 'salary_payment',
    amount_paise: -input.amount,
    payment_mode: mode,
    ref_table: 'payslips',
    ref_id: draft,
  });
  return error ? failed(error.message) : { ok: true, count: 1 };
}

export type NewCyclePreview = Awaited<ReturnType<typeof previewNewCycle>>;

/**
 * What paying a salary up to `upTo` and starting a new cycle the day after would mean for one
 * person (Pay now): the figures for those days, what's already paid towards it, and the next
 * salary's dates. Or why that day can't end it (core `newCycleCheck`).
 */
export async function previewNewCycle(
  supabase: Supabase,
  shopId: string,
  staffId: string,
  year: number,
  month: number,
  upTo: BusinessDate,
  today: BusinessDate,
) {
  const now = (await computeMonth(supabase, shopId, year, month)).find(
    (p) => p.staffId === staffId,
  );
  if (!now) return { ok: false as const, reason: 'not_found' as const };
  const check = newCycleCheck(now.period, upTo, today);
  if (!check.ok) return check;
  const [cut, run] = await Promise.all([
    computeMonth(supabase, shopId, year, month, {
      closes: new Map([[staffId, check.closesOn]]),
    }).then((all) => all.find((p) => p.staffId === staffId)),
    supabase
      .from('salary_runs')
      .select('id')
      .eq('shop_id', shopId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
  ]);
  if (!cut) return { ok: false as const, reason: 'not_found' as const };
  const { data: draft } = run.data
    ? await supabase
        .from('payslips')
        .select('id')
        .eq('run_id', run.data.id)
        .eq('staff_id', staffId)
        .eq('status', 'draft')
        .maybeSingle()
    : { data: null };
  const paid = draft ? ((await paidByPayslip(supabase, [draft.id])).get(draft.id) ?? 0) : 0;
  return {
    ok: true as const,
    closesOn: check.closesOn,
    newCycleFrom: check.newCycleFrom,
    payDay: check.payDay,
    next: check.next,
    from: employedPart(now.period, now.joiningDate, now.leavingDate).from,
    payableDays: cut.result.summary.payableDays,
    cycleDays: now.period.cycleDays,
    lines: cut.result.lines,
    net: cut.result.netPay,
    paid,
  };
}

/**
 * Pay now with a new cycle (owner 09/11/2026; needs salary.run): the salary pays up to `upTo` and
 * is finalized (`finalize_new_cycle`, which also makes the day after `upTo` their pay day from
 * then on), and what's left of it is paid, dated `paidOn`.
 */
export async function startNewCycle(
  supabase: Supabase,
  input: Ctx & {
    personId: string;
    staffId: string;
    year: number;
    month: number;
    /** The last day this salary pays for. */
    upTo: BusinessDate;
    /** The day it was paid. */
    paidOn: BusinessDate;
    mode: string;
    today: BusinessDate;
  },
): Promise<SalaryWriteResult> {
  if (!input.permissions.includes('salary.run')) return noPermission;
  const mode = PAYMENT_MODES.find((m) => m === input.mode);
  if (!mode) return failed(input.mode);
  if (compareDates(input.paidOn, input.today) > 0) return failed('date');
  const preview = await previewNewCycle(
    supabase,
    input.shopId,
    input.staffId,
    input.year,
    input.month,
    input.upTo,
    input.today,
  );
  if (!preview.ok) return failed(preview.reason);
  const saved = await saveDrafts(supabase, {
    ...input,
    staffIds: [input.staffId],
    closes: new Map([[input.staffId, preview.closesOn]]),
  });
  if (!saved.ok) return saved;
  const draft = saved.drafts[0];
  if (!draft) return failed('finalized');
  const { error } = await supabase.rpc('finalize_new_cycle', { p_payslip: draft });
  if (error) return failed(error.message);
  const [{ data: slip }, paid] = await Promise.all([
    supabase.from('payslips').select('net_pay_paise').eq('id', draft).single(),
    paidByPayslip(supabase, [draft]),
  ]);
  const left = Number(slip?.net_pay_paise ?? 0) - (paid.get(draft) ?? 0);
  if (left > 0) {
    const { error: payError } = await supabase.from('ledger_entries').insert({
      shop_id: input.shopId,
      staff_id: input.staffId,
      date: input.paidOn,
      type: 'salary_payment',
      amount_paise: -left,
      payment_mode: mode,
      ref_table: 'payslips',
      ref_id: draft,
    });
    if (payError) return failed(payError.message);
  }
  return { ok: true, count: 1 };
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
    periodFrom: slip.period_from,
    periodTo: slip.period_to,
    joiningDate: slip.staff.joining_date,
    leavingDate: slip.staff.leaving_date,
    revision: slip.revision,
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
