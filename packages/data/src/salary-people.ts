import {
  compareDates,
  daysBetween,
  monthOf,
  payPeriodOn,
  personPayDay,
  type BusinessDate,
} from '@fincrew/core';
import type { Supabase } from './client';
import { toPaySettings, toShopRules } from './mappers';
import { paidByPayslip } from './salary-month';
import { loadSalaryRun, type SalaryPerson } from './salary-run';

/**
 * Salary by person (owner 13/11/2026: "we don't bound months as payment cycle and each staff have
 * their own cycle"). Salaries are still stored under the month their period ends in; these
 * loaders gather each person's own salaries across those months and never show the month name.
 */

const keyOf = (m: { year: number; month: number }) => m.year * 12 + m.month;
const fromKey = (k: number) => ({ year: Math.floor((k - 1) / 12), month: ((k - 1) % 12) + 1 });

/** One salary of one person, with the month it is stored under and its run (for paying it). */
export type PersonSalary = SalaryPerson & { year: number; month: number; runId: string | null };

/**
 * What a salary needs: `finalize` (its period is over), `pay` (finalized, not fully paid),
 * `running` (its period isn't over), `done` (paid in full).
 */
export type SalaryStage = 'finalize' | 'pay' | 'running' | 'done';

export function salaryStage(s: SalaryPerson): SalaryStage {
  if (s.state === 'draft') return s.running ? 'running' : 'finalize';
  return s.state === 'finalized' ? 'pay' : 'done';
}

/** Still to pay on it: take-home less what's paid (paid early counts on a running one). */
export const leftToPay = (s: SalaryPerson) => Math.max(0, s.net - s.paidAmount);

/** An ended salary nothing was marked for: from before the shop used FinCrew for this person. */
const neverMarked = (s: SalaryPerson) =>
  s.state === 'draft' && s.paidAmount === 0 && s.summary.unmarked >= s.summary.employedDays;

export type SalaryPersonRow = {
  staffId: string;
  name: string;
  phone: string | null;
  /** Their pay day today, a date of the month. */
  payDay: number;
  /** Ended and not finalized, or finalized and not fully paid; oldest first. */
  needs: (PersonSalary & { stage: 'finalize' | 'pay' })[];
  /** The salary whose period runs today. */
  current: PersonSalary | null;
};

/**
 * Everyone's salaries that are open today, by person (or one person with `staffId`): what needs
 * finalizing or paying, and the one running now. Only the months somebody has open are worked out.
 */
export async function loadSalaryPeople(
  supabase: Supabase,
  shopId: string,
  today: BusinessDate,
  staffId?: string,
) {
  let staffQuery = supabase
    .from('staff')
    .select('person_id, joining_date, leaving_date, status, people!inner(name, phone)')
    .eq('shop_id', shopId);
  let slipQuery = supabase
    .from('payslips')
    .select('id, staff_id, run_id, revision, status, net_pay_paise, salary_runs!inner(year, month)')
    .eq('shop_id', shopId)
    .order('revision', { ascending: false });
  if (staffId) {
    staffQuery = staffQuery.eq('person_id', staffId);
    slipQuery = slipQuery.eq('staff_id', staffId);
  }
  const [{ data: staff }, { data: shop }, { data: pays }, { data: slips }] = await Promise.all([
    staffQuery,
    supabase.from('shops').select('settings').eq('id', shopId).single(),
    supabase.from('pay_settings').select('*').eq('shop_id', shopId),
    slipQuery,
  ]);
  const rules = toShopRules(shop?.settings).pay;
  const paySettings = (pays ?? []).map(toPaySettings);

  // The latest payslip of each person in each month.
  const latest = new Map<string, NonNullable<typeof slips>[number]>();
  for (const s of slips ?? []) {
    const k = `${s.staff_id}:${keyOf(s.salary_runs)}`;
    if (!latest.has(k)) latest.set(k, s);
  }
  const finalized = [...latest.values()].filter((s) => s.status === 'finalized');
  const paid = await paidByPayslip(
    supabase,
    finalized.map((s) => s.id),
  );
  const firsts = await Promise.all(
    (staff ?? []).map((s) =>
      supabase
        .from('attendance')
        .select('date')
        .eq('staff_id', s.person_id)
        .order('date')
        .limit(1)
        .then(({ data }) => [s.person_id, data?.[0]?.date ?? null] as const),
    ),
  );
  const firstMarked = new Map(firsts);

  // Which months each person has open: not finalized from their first marked day up to the one
  // running today, and any finalized one not fully paid.
  const wanted = new Map<string, Set<number>>();
  const payDays = new Map<string, number>();
  const months = new Set<number>();
  for (const s of staff ?? []) {
    const id = s.person_id;
    const mine = paySettings.filter((p) => p.staffId === id);
    const payDay = personPayDay(rules, s.joining_date, mine, today);
    payDays.set(id, payDay);
    const keys = new Set<number>();
    const isFinal = (k: number) => latest.get(`${id}:${k}`)?.status === 'finalized';
    const first = firstMarked.get(id);
    if (first) {
      const end = keyOf(payPeriodOn(today, payDay));
      for (let k = keyOf(monthOf(first)); k <= end; k++) if (!isFinal(k)) keys.add(k);
    }
    for (const f of finalized)
      if (f.staff_id === id && Number(f.net_pay_paise) - (paid.get(f.id) ?? 0) > 0)
        keys.add(keyOf(f.salary_runs));
    wanted.set(id, keys);
    keys.forEach((k) => months.add(k));
  }

  const runs = await Promise.all(
    [...months].map(async (k) => {
      const m = fromKey(k);
      return { ...m, run: await loadSalaryRun(supabase, shopId, m.year, m.month, today) };
    }),
  );

  const people: SalaryPersonRow[] = (staff ?? []).map((s) => {
    const id = s.person_id;
    const keys = wanted.get(id) ?? new Set<number>();
    const mine: PersonSalary[] = runs
      .filter((r) => keys.has(keyOf(r)))
      .flatMap((r) =>
        r.run.people
          .filter((p) => p.staffId === id)
          .map((p) => ({ ...p, year: r.year, month: r.month, runId: r.run.runId })),
      )
      .filter((p) => p.running || !neverMarked(p))
      .sort((a, b) => compareDates(a.period.from, b.period.from));
    return {
      staffId: id,
      name: s.people.name,
      phone: s.people.phone,
      payDay: payDays.get(id) ?? 1,
      needs: mine.flatMap((p) => {
        const stage = salaryStage(p);
        return stage === 'finalize' || stage === 'pay' ? [{ ...p, stage }] : [];
      }),
      current: mine.find((p) => salaryStage(p) === 'running') ?? null,
    };
  });

  const withSalary = people.filter((p) => p.needs.length > 0 || p.current);
  const nextPays = withSalary
    .filter((p) => p.current)
    .map((p) => ({
      staffId: p.staffId,
      name: p.name,
      date: p.current!.period.payDate,
    }))
    .sort((a, b) => compareDates(a.date, b.date));
  return {
    people: withSalary.sort(
      (a, b) =>
        Number(b.needs.length > 0) - Number(a.needs.length > 0) ||
        compareDates(
          a.current?.period.payDate ?? a.needs[0]!.period.payDate,
          b.current?.period.payDate ?? b.needs[0]!.period.payDate,
        ) ||
        a.name.localeCompare(b.name),
    ),
    toPay: people.reduce((a, p) => a + p.needs.reduce((b, n) => b + leftToPay(n), 0), 0),
    toPayPeople: people.filter((p) => p.needs.length > 0).length,
    runningSoFar: people.reduce((a, p) => a + (p.current ? leftToPay(p.current) : 0), 0),
    runningPeople: people.filter((p) => p.current).length,
    nextPays,
  };
}

/** Days of a running salary left after today (its last day counts). */
export const daysLeft = (s: SalaryPerson, today: BusinessDate) =>
  Math.max(0, daysBetween(today, s.period.to));

/**
 * One person's salary page: what needs doing, the salary running now, and every earlier
 * finalized salary with what's been paid, newest first. Null when they can't be read.
 */
export async function loadPersonSalary(
  supabase: Supabase,
  shopId: string,
  staffId: string,
  today: BusinessDate,
) {
  const [open, { data: slips }] = await Promise.all([
    loadSalaryPeople(supabase, shopId, today, staffId),
    supabase
      .from('payslips')
      .select(
        'id, run_id, revision, status, net_pay_paise, period_from, period_to, new_cycle_from, summary, salary_runs!inner(year, month)',
      )
      .eq('staff_id', staffId)
      .eq('status', 'finalized')
      .order('revision', { ascending: false }),
  ]);
  const { data: who } = await supabase
    .from('staff')
    .select('person_id, joining_date, people!inner(name, phone)')
    .eq('person_id', staffId)
    .eq('shop_id', shopId)
    .maybeSingle();
  if (!who) return null;
  const row = open.people.find((p) => p.staffId === staffId);

  const latest = new Map<string, NonNullable<typeof slips>[number]>();
  for (const s of slips ?? []) if (!latest.has(s.run_id)) latest.set(s.run_id, s);
  const list = [...latest.values()];
  const ids = list.map((s) => s.id);
  const [paid, { data: payments }] = await Promise.all([
    paidByPayslip(supabase, ids),
    ids.length
      ? supabase
          .from('ledger_entries')
          .select('ref_id, date')
          .eq('type', 'salary_payment')
          .eq('ref_table', 'payslips')
          .in('ref_id', ids)
      : Promise.resolve({ data: [] as { ref_id: string | null; date: string }[] }),
  ]);
  const lastPaid = new Map<string, BusinessDate>();
  for (const p of payments ?? [])
    if (p.ref_id && (!lastPaid.has(p.ref_id) || compareDates(p.date, lastPaid.get(p.ref_id)!) > 0))
      lastPaid.set(p.ref_id, p.date);

  const earlier = list
    .map((s) => {
      const summary = s.summary as { payableDays?: number; employedDays?: number } | null;
      const net = Number(s.net_pay_paise);
      return {
        payslipId: s.id,
        from: s.period_from,
        to: s.period_to,
        newCycleFrom: s.new_cycle_from,
        payableDays: summary?.payableDays ?? 0,
        employedDays: summary?.employedDays ?? 0,
        net,
        paid: paid.get(s.id) ?? 0,
        left: Math.max(0, net - (paid.get(s.id) ?? 0)),
        paidOn: lastPaid.get(s.id) ?? null,
        year: s.salary_runs.year,
        month: s.salary_runs.month,
      };
    })
    .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));

  return {
    staffId,
    name: who.people.name,
    phone: who.people.phone,
    joiningDate: who.joining_date,
    payDay: row?.payDay ?? 1,
    needs: row?.needs ?? [],
    current: row?.current ?? null,
    earlier,
  };
}

export type PersonSalaryView = NonNullable<Awaited<ReturnType<typeof loadPersonSalary>>>;
