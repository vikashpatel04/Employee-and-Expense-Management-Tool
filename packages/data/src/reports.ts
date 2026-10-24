import { expenseTotals, monthEnd, monthOf, monthStart, type BusinessDate } from '@fincrew/core';
import { toExpense } from './expenses';
import type { Supabase } from './client';

export type ReportMonth = {
  year: number;
  month: number;
  /** Gross pay on the latest payslips; null without salary.view. */
  salary: number | null;
  /** True when any of those payslips is still a draft. */
  salaryDraft: boolean;
  /** Salary payments made that month, minus undone ones. */
  paid: number | null;
  /** Advances given minus cash repaid that month (undone ones left out). */
  advances: number | null;
  /** Shop expenses (charged to the shop) that month; null without expenses.view_all. */
  expenses: number | null;
  byCategory: Record<string, number>;
  expenseCount: number;
};

/** The last `count` months, oldest first, ending with the month of `today`. */
export function lastMonths(today: BusinessDate, count: number) {
  const { year, month } = monthOf(today);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  });
}

const key = (date: string) => date.slice(0, 7);
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

/**
 * Money by month for the reports page (design: "Web · reports"). Each part loads only with its
 * permission (`salary` = salary.view, `advances` = salary.view or advances.give,
 * `expenses` = expenses.view_all); RLS would hide the rows anyway.
 */
export async function loadReport(
  supabase: Supabase,
  shopId: string,
  months: { year: number; month: number }[],
  can: { salary: boolean; advances: boolean; expenses: boolean },
) {
  const from = monthStart(months[0]!.year, months[0]!.month);
  const to = monthEnd(months.at(-1)!.year, months.at(-1)!.month);

  const [runs, payments, advances, expenses, categories] = await Promise.all([
    can.salary
      ? supabase
          .from('salary_runs')
          .select('id, year, month, payslips(staff_id, revision, status, gross_paise)')
          .eq('shop_id', shopId)
      : Promise.resolve({ data: null }),
    can.salary
      ? supabase
          .from('ledger_entries')
          .select('id, date, amount_paise')
          .eq('shop_id', shopId)
          .eq('type', 'salary_payment')
          .gte('date', from)
          .lte('date', to)
      : Promise.resolve({ data: null }),
    can.advances
      ? supabase
          .from('advances')
          .select('id, date, kind, amount_paise')
          .eq('shop_id', shopId)
          .gte('date', from)
          .lte('date', to)
      : Promise.resolve({ data: null }),
    can.expenses
      ? supabase
          .from('expenses')
          .select('*')
          .eq('shop_id', shopId)
          .gte('date', from)
          .lte('date', to)
      : Promise.resolve({ data: null }),
    supabase.from('expense_categories').select('id, name, icon, colour').eq('shop_id', shopId),
  ]);

  // Undone payments and advances: lines that a reversal points at.
  const paymentIds = (payments.data ?? []).map((p) => p.id);
  const { data: advanceLines } =
    can.advances && (advances.data ?? []).length > 0
      ? await supabase
          .from('ledger_entries')
          .select('id, ref_id')
          .eq('ref_table', 'advances')
          .in(
            'ref_id',
            (advances.data ?? []).map((a) => a.id),
          )
      : { data: [] };
  const lineIds = [...paymentIds, ...(advanceLines ?? []).map((l) => l.id)];
  const { data: reversals } =
    lineIds.length > 0
      ? await supabase.from('ledger_entries').select('reverses_id').in('reverses_id', lineIds)
      : { data: [] };
  const undone = new Set((reversals ?? []).map((r) => r.reverses_id));
  const undoneAdvance = new Set(
    (advanceLines ?? []).filter((l) => undone.has(l.id)).map((l) => l.ref_id),
  );

  const result: ReportMonth[] = months.map(({ year, month }) => {
    const k = ym(year, month);
    let salary: number | null = null;
    let salaryDraft = false;
    if (can.salary) {
      const run = (runs.data ?? []).find((r) => r.year === year && r.month === month);
      const latest = new Map<string, { revision: number; status: string; gross: number }>();
      for (const p of run?.payslips ?? []) {
        const have = latest.get(p.staff_id);
        if (!have || p.revision > have.revision)
          latest.set(p.staff_id, {
            revision: p.revision,
            status: p.status,
            gross: Number(p.gross_paise),
          });
      }
      salary = [...latest.values()].reduce((a, p) => a + p.gross, 0);
      salaryDraft = [...latest.values()].some((p) => p.status === 'draft');
    }
    const paid = can.salary
      ? (payments.data ?? [])
          .filter((p) => key(p.date) === k && !undone.has(p.id))
          .reduce((a, p) => a - Number(p.amount_paise), 0)
      : null;
    const adv = can.advances
      ? (advances.data ?? [])
          .filter((a) => key(a.date) === k && !undoneAdvance.has(a.id))
          .reduce((s, a) => s + (a.kind === 'given' ? 1 : -1) * Number(a.amount_paise), 0)
      : null;
    const monthExpenses = (expenses.data ?? []).filter((e) => key(e.date) === k);
    const totals = expenseTotals(monthExpenses.map(toExpense));
    return {
      year,
      month,
      salary,
      salaryDraft,
      paid,
      advances: adv,
      expenses: can.expenses ? totals.total : null,
      byCategory: totals.byCategory,
      expenseCount: monthExpenses.filter((e) => e.charged_to_kind === 'shop').length,
    };
  });

  return { months: result, categories: categories.data ?? [] };
}
