import { addDays, monthOf, type BusinessDate } from '@fincrew/core';
import { loadAttendanceMonth } from './attendance-month';
import { paidByPayslip } from './salary-month';
import type { createClient } from './supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Today's attendance for everyone working today (dashboard "Today's attendance"). */
export async function loadToday(supabase: Supabase, shopId: string, today: BusinessDate) {
  const { year, month } = monthOf(today);
  const { rows } = await loadAttendanceMonth(supabase, shopId, year, month, today);
  const people = rows
    .map((r) => ({ row: r, cell: r.cells.find((c) => c.date === today) }))
    .filter((x) => x.cell && x.cell.status !== 'not_employed' && x.cell.status !== 'future');
  const is = (...s: string[]) => people.filter((x) => s.includes(x.cell!.status));
  return {
    working: people.length,
    present: is('present', 'half_day').length,
    absent: is('absent').length,
    unmarked: is('unmarked').map((x) => ({
      staffId: x.row.staffId,
      name: x.row.name,
      offWeekdays: x.row.offWeekdays,
    })),
    late: people
      .filter((x) => x.cell!.late)
      .map((x) => ({
        staffId: x.row.staffId,
        name: x.row.name,
        checkIn: x.cell!.checkIn,
        minutes: x.cell!.lateMinutes ?? 0,
      })),
  };
}

/** Money owed to staff and advances still to recover (dashboard tiles). */
export async function loadMoney(supabase: Supabase, shopId: string) {
  const [{ data: balances }, { data: advances }] = await Promise.all([
    supabase.from('ledger_balances').select('balance_paise').eq('shop_id', shopId),
    supabase
      .from('advance_balances')
      .select('outstanding_paise, advance_cut_paise')
      .eq('shop_id', shopId),
  ]);
  const due = (balances ?? []).map((b) => Number(b.balance_paise ?? 0)).filter((v) => v > 0);
  const owing = (advances ?? []).filter((a) => Number(a.outstanding_paise ?? 0) > 0);
  return {
    due: due.reduce((a, v) => a + v, 0),
    dueCount: due.length,
    advances: owing.reduce((a, x) => a + Number(x.outstanding_paise), 0),
    advanceCount: owing.length,
    monthlyCut: owing.reduce((a, x) => a + Number(x.advance_cut_paise ?? 0), 0),
  };
}

export type SalaryState = 'not_run' | 'draft' | 'finalized' | 'paid';

/** This month's salary run: where it stands and the money in it (latest revision per person). */
export async function loadSalary(supabase: Supabase, shopId: string, year: number, month: number) {
  const { data: run } = await supabase
    .from('salary_runs')
    .select('id')
    .eq('shop_id', shopId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (!run)
    return {
      state: 'not_run' as SalaryState,
      people: 0,
      net: 0,
      paid: 0,
      paidPeople: 0,
      unmarkedPeople: 0,
    };

  const { data: slips } = await supabase
    .from('payslips')
    .select('id, staff_id, status, net_pay_paise, warnings')
    .eq('run_id', run.id)
    .order('revision', { ascending: false });
  const latest = new Map<string, NonNullable<typeof slips>[number]>();
  for (const s of slips ?? []) if (!latest.has(s.staff_id)) latest.set(s.staff_id, s);
  const rows = [...latest.values()];
  const paidBy = await paidByPayslip(
    supabase,
    rows.map((r) => r.id),
  );
  const net = rows.reduce((a, r) => a + Number(r.net_pay_paise), 0);
  const paid = rows.reduce(
    (a, r) => a + Math.min(paidBy.get(r.id) ?? 0, Number(r.net_pay_paise)),
    0,
  );
  const paidPeople = rows.filter((r) => (paidBy.get(r.id) ?? 0) >= Number(r.net_pay_paise)).length;
  const state: SalaryState = rows.some((r) => r.status === 'draft')
    ? 'draft'
    : rows.length > 0 && paidPeople === rows.length
      ? 'paid'
      : 'finalized';
  const unmarkedPeople = rows.filter((r) =>
    ((r.warnings as { code: string }[] | null) ?? []).some((w) => w.code === 'unmarked_days'),
  ).length;
  return { state, people: rows.length, net, paid, paidPeople, unmarkedPeople };
}

export type SoonItem =
  | { kind: 'holiday'; date: BusinessDate; name: string; paid: boolean }
  | { kind: 'leaving'; date: BusinessDate; name: string; staffId: string }
  | { kind: 'salary'; date: BusinessDate };

/** Holidays and last working days in the next 30 days (leaving dates need `staff.view`). */
export async function loadSoon(
  supabase: Supabase,
  shopId: string,
  today: BusinessDate,
  withStaff: boolean,
): Promise<SoonItem[]> {
  const until = addDays(today, 30);
  const [{ data: holidays }, { data: leaving }] = await Promise.all([
    supabase
      .from('holidays')
      .select('date, name, paid')
      .eq('shop_id', shopId)
      .gte('date', today)
      .lte('date', until),
    withStaff
      ? supabase
          .from('staff')
          .select('person_id, leaving_date, people!inner(name)')
          .eq('shop_id', shopId)
          .gte('leaving_date', today)
          .lte('leaving_date', until)
      : Promise.resolve({ data: null }),
  ]);
  const items: SoonItem[] = [
    ...(holidays ?? []).map((h) => ({
      kind: 'holiday' as const,
      date: h.date,
      name: h.name,
      paid: h.paid,
    })),
    ...(leaving ?? []).map((s) => ({
      kind: 'leaving' as const,
      date: s.leaving_date!,
      name: s.people.name,
      staffId: s.person_id,
    })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
