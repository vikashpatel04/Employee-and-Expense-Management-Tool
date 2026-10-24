import { expenseTotals, monthEnd, monthStart, type Expense, type PaymentMode } from '@fincrew/core';
import type { Database } from '@fincrew/db';
import type { Supabase } from './client';

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
