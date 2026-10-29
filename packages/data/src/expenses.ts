import { expenseTotals, monthEnd, monthStart, type Expense, type PaymentMode } from '@fincrew/core';
import type { Database } from '@fincrew/db';
import type { Supabase } from './client';
import { toShopRules } from './mappers';

export type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
export type CategoryRow = Database['public']['Tables']['expense_categories']['Row'];

/** A database row → the core expense shape (for totals and ledger rules). */
export function toExpense(r: ExpenseRow): Expense {
  return {
    date: r.date,
    amount: Number(r.amount_paise),
    categoryId: r.category_id,
    paymentMode: r.payment_mode as PaymentMode,
    paidBy:
      r.paid_by_kind === 'staff'
        ? { kind: 'staff', staffId: r.paid_by_staff_id! }
        : { kind: r.paid_by_kind as 'owner' | 'shop_cash' },
    chargedTo:
      r.charged_to_kind === 'staff'
        ? { kind: 'staff', staffId: r.charged_to_staff_id! }
        : { kind: r.charged_to_kind as 'shop' | 'not_tracked' },
    reimburse: r.reimburse,
  };
}

/** One month's expenses (the ones this person may see), categories, staff names and totals. */
export async function loadExpenseMonth(
  supabase: Supabase,
  shopId: string,
  year: number,
  month: number,
) {
  const [{ data: rows }, { data: categories }, { data: staff }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*')
      .eq('shop_id', shopId)
      .gte('date', monthStart(year, month))
      .lte('date', monthEnd(year, month))
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('expense_categories').select('*').eq('shop_id', shopId).order('name'),
    supabase.from('staff').select('person_id, status, people!inner(name)').eq('shop_id', shopId),
  ]);
  const expenses = rows ?? [];
  const core = expenses.map(toExpense);
  const totals = expenseTotals(core);
  const reimbursed = core
    .filter((e) => e.paidBy.kind === 'staff' && e.reimburse)
    .reduce((a, e) => a + e.amount, 0);
  const counts = {
    shop: core.filter((e) => e.chargedTo.kind === 'shop').length,
    staff: core.filter((e) => e.chargedTo.kind === 'staff').length,
    reimbursed: core.filter((e) => e.paidBy.kind === 'staff' && e.reimburse).length,
    notTracked: core.filter((e) => e.chargedTo.kind === 'not_tracked').length,
  };
  return {
    expenses,
    categories: categories ?? [],
    staff: (staff ?? [])
      .map((s) => ({ id: s.person_id, name: s.people.name, active: s.status === 'active' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    totals: { ...totals, reimbursed },
    counts,
  };
}

/**
 * Some loaded expenses summed for the Expenses page (a day or the month, website and app): all
 * money spent (`spent`, the big figure) and how it splits (shop, charged to staff, not tracked),
 * the shop's expenses by category (biggest first, with how many), and how many counted expenses
 * have no bill photo.
 */
export function expenseSummary(rows: readonly ExpenseRow[]) {
  const t = expenseTotals(rows.map(toExpense));
  const counts = new Map<string, number>();
  for (const r of rows)
    if (r.charged_to_kind === 'shop')
      counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
  return {
    rows: [...rows],
    spent: t.total + t.chargedToStaff + t.notTracked,
    shop: t.total,
    chargedToStaff: t.chargedToStaff,
    notTracked: t.notTracked,
    byCategory: Object.entries(t.byCategory)
      .map(([categoryId, amount]) => ({ categoryId, amount, count: counts.get(categoryId) ?? 0 }))
      .sort((a, b) => b.amount - a.amount),
    noBill: rows.filter((r) => !r.bill_path && r.charged_to_kind !== 'not_tracked').length,
  };
}

/** One day of a loaded month (the Expenses page's Day view): `expenseSummary` of that day. */
export function expenseDay(expenses: readonly ExpenseRow[], date: string) {
  return expenseSummary(expenses.filter((e) => e.date === date));
}

/** All money spent on each day of a month (index 0 = the 1st), for the Month view's bars. */
export function dailySpending(expenses: readonly ExpenseRow[], year: number, month: number) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out = Array.from({ length: days }, () => 0);
  for (const e of expenses) {
    const d = Number(e.date.slice(8, 10));
    if (d >= 1 && d <= days) out[d - 1]! += Number(e.amount_paise);
  }
  return out;
}

/**
 * What the shop owes each staff member for expenses they paid (`payback`) and what is charged to
 * them and not cut yet (`charge`), from `expense_balances`; only people with something (Expenses
 * page "Needs you").
 */
export async function loadExpenseDues(supabase: Supabase, shopId: string) {
  const { data } = await supabase
    .from('expense_balances')
    .select('staff_id, payback_paise, charge_paise')
    .eq('shop_id', shopId);
  return (data ?? [])
    .map((r) => ({
      staffId: r.staff_id ?? '',
      payback: Number(r.payback_paise ?? 0),
      charge: Number(r.charge_paise ?? 0),
    }))
    .filter((r) => r.staffId && (r.payback > 0 || r.charge > 0));
}

/**
 * What the add / edit expense form needs: the expense (when editing), categories, staff names
 * and the shop's small-expense limit (below it a new expense starts as Not tracked).
 */
export async function loadExpenseForm(
  supabase: Supabase,
  shopId: string,
  expenseId?: string | null,
) {
  const [{ data: expense }, { data: categories }, { data: staff }, { data: shop }] =
    await Promise.all([
      expenseId
        ? supabase
            .from('expenses')
            .select('*')
            .eq('id', expenseId)
            .eq('shop_id', shopId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('expense_categories').select('*').eq('shop_id', shopId).order('name'),
      supabase.from('staff').select('person_id, status, people!inner(name)').eq('shop_id', shopId),
      supabase.from('shops').select('settings').eq('id', shopId).maybeSingle(),
    ]);
  return {
    expense: (expense as ExpenseRow | null) ?? null,
    categories: categories ?? [],
    staff: (staff ?? [])
      .map((s) => ({ id: s.person_id, name: s.people.name, active: s.status === 'active' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    smallLimit: toShopRules(shop?.settings).smallExpenseLimit ?? null,
  };
}
