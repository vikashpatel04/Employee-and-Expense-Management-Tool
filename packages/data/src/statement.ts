import {
  buildHistory,
  buildStatement,
  compareDates,
  employedPart,
  moneyNow,
  monthEnd,
  monthStart,
  payPeriodOn,
  personPayDay,
  shiftMonth,
  type BusinessDate,
  type DaySummary,
  type LedgerType,
  type PayslipLine,
  type StatementInput,
  type StatementLedgerLine,
  type StatementMonth,
} from '@fincrew/core';
import type { Supabase } from './client';
import { toPaySettings, toShopRules } from './mappers';
import { computeMonth, paidByPayslip } from './salary-month';
import { loadStaffOverview } from './staff';

const monthKey = (m: { year: number; month: number }) => m.year * 12 + m.month;

/** Lines that count before advance and expenses, which come off once and not per month. */
const LIVE_LINES: readonly PayslipLine['kind'][] = [
  'earned',
  'overtime',
  'allowance',
  'leave_payout',
  'deduction',
  'late_deduction',
];

async function payDayOf(
  supabase: Supabase,
  shopId: string,
  staffId: string,
  joiningDate: BusinessDate,
  today: BusinessDate,
) {
  const [{ data: shop }, { data: pays }] = await Promise.all([
    supabase.from('shops').select('settings').eq('id', shopId).single(),
    supabase.from('pay_settings').select('*').eq('staff_id', staffId),
  ]);
  return personPayDay(
    toShopRules(shop?.settings).pay,
    joiningDate,
    (pays ?? []).map(toPaySettings),
    today,
  );
}

/**
 * Salary paid early towards months not finalized yet, by month (`year * 12 + month`): payments
 * that point at a draft payslip. Someone who can't read drafts (the staff member themself) gets
 * them under `unplaced`, to put on the month running now.
 */
async function paidEarly(supabase: Supabase, staffId: string) {
  const [{ data: slips }, { data: lines }] = await Promise.all([
    supabase
      .from('payslips')
      .select('id, status, salary_runs!inner(year, month)')
      .eq('staff_id', staffId),
    supabase
      .from('ledger_entries')
      .select('id, date, type, amount_paise, payment_mode, ref_table, ref_id, reverses_id')
      .eq('staff_id', staffId)
      .in('type', ['salary_payment', 'reversal']),
  ]);
  const undone = new Set((lines ?? []).map((l) => l.reverses_id).filter(Boolean));
  const finalized = new Set((slips ?? []).filter((s) => s.status === 'finalized').map((s) => s.id));
  const draftMonth = new Map(
    (slips ?? []).filter((s) => s.status === 'draft').map((s) => [s.id, monthKey(s.salary_runs)]),
  );
  const byMonth = new Map<number, Payment[]>();
  const unplaced: Payment[] = [];
  for (const l of lines ?? []) {
    if (l.type !== 'salary_payment' || undone.has(l.id) || l.ref_table !== 'payslips' || !l.ref_id)
      continue;
    if (finalized.has(l.ref_id)) continue;
    const payment = { date: l.date, amount: -Number(l.amount_paise), mode: l.payment_mode };
    const key = draftMonth.get(l.ref_id);
    if (key === undefined) unplaced.push(payment);
    else byMonth.set(key, [...(byMonth.get(key) ?? []), payment]);
  }
  return { byMonth, unplaced };
}

/** A salary payment made before the salary was finalized (Pay now, keeping the pay day). */
export type Payment = { date: BusinessDate; amount: number; mode: string | null };

/**
 * Every month this person has no finalized salary for, oldest first: from their first marked day
 * up to the period running today. Months before anything was marked (before the shop used FinCrew)
 * don't count. `amount` is before advance and expenses, which come off once, at the end; `paid`
 * is what was paid towards it early.
 */
export async function loadOpenMonths(
  supabase: Supabase,
  shopId: string,
  staffId: string,
  joiningDate: BusinessDate,
  finalized: ReadonlySet<number>,
  today: BusinessDate,
) {
  const [payDay, { data: first }, early] = await Promise.all([
    payDayOf(supabase, shopId, staffId, joiningDate, today),
    supabase.from('attendance').select('date').eq('staff_id', staffId).order('date').limit(1),
    paidEarly(supabase, staffId),
  ]);
  const current = payPeriodOn(today, payDay);
  const start = first?.[0] ? payPeriodOn(first[0].date, payDay) : current;
  const wanted: { year: number; month: number }[] = [];
  for (
    let m = { year: start.year, month: start.month };
    monthKey(m) <= monthKey(current);
    m = shiftMonth(m.year, m.month, 1)
  )
    if (!finalized.has(monthKey(m))) wanted.push(m);

  const months = await Promise.all(
    wanted.map(async (m) => {
      const mine = (await computeMonth(supabase, shopId, m.year, m.month)).find(
        (p) => p.staffId === staffId,
      );
      if (!mine || compareDates(mine.period.from, today) > 0) return null;
      const over =
        compareDates(mine.period.to, today) <= 0 ||
        (!!mine.leavingDate && compareDates(mine.leavingDate, today) <= 0);
      return {
        year: m.year,
        month: m.month,
        ...employedPart(mine.period, mine.joiningDate, mine.leavingDate),
        payDate: mine.period.payDate,
        amount: mine.result.netBeforeAdvance,
        payableDays: mine.result.summary.payableDays,
        employedDays: mine.result.summary.employedDays,
        lines: mine.result.lines.filter((l) => LIVE_LINES.includes(l.kind)),
        running: !over,
      };
    }),
  );
  const open = months.filter((m) => m !== null);
  return open.map((m, i) => {
    const payments = [
      ...(early.byMonth.get(monthKey(m)) ?? []),
      ...(i === open.length - 1 ? early.unplaced : []),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return { ...m, payments, paid: payments.reduce((a, p) => a + p.amount, 0) };
  });
}

/**
 * What the shop owes this person right now (the staff page; the same sum as Staffora's Money):
 * their ledger balance plus each month not finalized yet. Null when they can't be read.
 */
export async function loadMoneyNow(
  supabase: Supabase,
  shopId: string,
  staffId: string,
  today: BusinessDate,
) {
  const [overview, { data: slips }] = await Promise.all([
    loadStaffOverview(supabase, shopId, staffId, true),
    supabase
      .from('payslips')
      .select('salary_runs!inner(year, month)')
      .eq('staff_id', staffId)
      .eq('status', 'finalized'),
  ]);
  if (!overview) return null;
  const months = await loadOpenMonths(
    supabase,
    shopId,
    staffId,
    overview.joiningDate,
    new Set((slips ?? []).map((s) => monthKey(s.salary_runs))),
    today,
  );
  return moneyNow({
    balance: overview.balance ?? 0,
    advance: overview.advance ?? 0,
    expenseOwed: overview.expenseOwed ?? 0,
    expenseCharged: overview.expenseCharged ?? 0,
    unfinalized: months.map((m) => m.amount),
    paidEarly: months.reduce((a, m) => a + m.paid, 0),
  });
}

export type WeOwe = NonNullable<Awaited<ReturnType<typeof loadMoneyNow>>>;

/**
 * Everything both statements show (packages/core statement.ts): what's open today and every line
 * since joining. The person's own, or with salary.view (RLS). Null when they can't be read.
 */
export async function loadStatement(
  supabase: Supabase,
  shopId: string,
  staffId: string,
  today: BusinessDate,
) {
  const [overview, { data: shop }, { data: ledgerRows }, { data: slips }] = await Promise.all([
    loadStaffOverview(supabase, shopId, staffId, true),
    supabase.from('shops').select('name').eq('id', shopId).single(),
    supabase
      .from('ledger_entries')
      .select(
        'id, date, type, amount_paise, name, note, payment_mode, reverses_id, ref_table, ref_id',
      )
      .eq('staff_id', staffId)
      .order('date')
      .order('created_at'),
    supabase
      .from('payslips')
      .select(
        'id, run_id, revision, net_pay_paise, lines, summary, period_from, period_to, new_cycle_from, salary_runs!inner(year, month)',
      )
      .eq('staff_id', staffId)
      .eq('status', 'finalized')
      .order('revision', { ascending: false }),
  ]);
  if (!overview) return null;

  // Latest revision of each month; its older revisions posted lines that belong to it too.
  const latest = new Map<string, NonNullable<typeof slips>[number]>();
  const latestOf = new Map<string, string>();
  for (const s of slips ?? []) {
    if (!latest.has(s.run_id)) latest.set(s.run_id, s);
    latestOf.set(s.id, latest.get(s.run_id)!.id);
  }
  const finalized = [...latest.values()];
  const [paid, open, payDay] = await Promise.all([
    paidByPayslip(
      supabase,
      (slips ?? []).map((s) => s.id),
    ),
    loadOpenMonths(
      supabase,
      shopId,
      staffId,
      overview.joiningDate,
      new Set(finalized.map((s) => monthKey(s.salary_runs))),
      today,
    ),
    payDayOf(supabase, shopId, staffId, overview.joiningDate, today),
  ]);

  const paidOn = (runId: string) =>
    (slips ?? []).filter((s) => s.run_id === runId).reduce((a, s) => a + (paid.get(s.id) ?? 0), 0);
  const months: StatementMonth[] = [
    ...finalized.map((s): StatementMonth => {
      const { year, month } = s.salary_runs;
      const summary = s.summary as unknown as DaySummary;
      return {
        year,
        month,
        ...employedPart(
          {
            from: s.period_from ?? monthStart(year, month),
            to: s.period_to ?? monthEnd(year, month),
          },
          overview.joiningDate,
          overview.leavingDate,
        ),
        state: 'finalized',
        amount: Number(s.net_pay_paise),
        paid: paidOn(s.run_id),
        lines: s.lines as unknown as PayslipLine[],
        payableDays: summary.payableDays,
        employedDays: summary.employedDays,
        payslipId: s.id,
        ...(s.new_cycle_from ? { newCycleFrom: s.new_cycle_from } : {}),
      };
    }),
    ...open.map((m): StatementMonth => ({
      year: m.year,
      month: m.month,
      from: m.from,
      to: m.to,
      state: m.running ? 'running' : 'draft',
      amount: m.amount,
      paid: m.paid,
      lines: m.lines,
      payableDays: m.payableDays,
      employedDays: m.employedDays,
    })),
  ].sort((a, b) => monthKey(a) - monthKey(b));

  const rows = ledgerRows ?? [];
  const reversed = new Set(rows.map((l) => l.reverses_id).filter(Boolean));
  const typeOf = new Map(rows.map((l) => [l.id, l.type as LedgerType]));
  const ledger: StatementLedgerLine[] = rows.map((l) => ({
    id: l.id,
    date: l.date,
    type: l.type as LedgerType,
    amount: Number(l.amount_paise),
    name: l.name ?? undefined,
    note: l.note,
    mode: l.payment_mode,
    reversesId: l.reverses_id ?? undefined,
    reverses: l.reverses_id ? typeOf.get(l.reverses_id) : undefined,
    undone: reversed.has(l.id),
    payslipId: l.ref_table === 'payslips' && l.ref_id ? (latestOf.get(l.ref_id) ?? l.ref_id) : null,
  }));

  const input: StatementInput = {
    today,
    months,
    ledger,
    advance: overview.advance ?? 0,
    expenseOwed: overview.expenseOwed ?? 0,
    expenseCharged: overview.expenseCharged ?? 0,
  };
  return {
    shopName: shop?.name ?? '',
    staffId,
    name: overview.name,
    phone: overview.phone,
    joiningDate: overview.joiningDate,
    leavingDate: overview.leavingDate,
    payDay,
    today,
    statement: buildStatement(input),
    history: buildHistory(input),
  };
}

export type StatementView = NonNullable<Awaited<ReturnType<typeof loadStatement>>>;
