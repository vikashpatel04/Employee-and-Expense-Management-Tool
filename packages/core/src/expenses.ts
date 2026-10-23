/**
 * Expenses: paid by / charged to, and their effect on staff ledgers (docs/PLAN.md §4.8).
 */
import type { BusinessDate } from './dates';
import type { LedgerDraft } from './ledger';
import type { Paise } from './money';

export type PaymentMode = 'cash' | 'upi' | 'bank' | 'card';

export interface Expense {
  date: BusinessDate;
  amount: Paise;
  categoryId: string;
  paymentMode: PaymentMode;
  paidBy: { kind: 'owner' | 'shop_cash' } | { kind: 'staff'; staffId: string };
  /** `shop` counts in totals; `staff` is recovered from them; `not_tracked` is kept for the record only. */
  chargedTo: { kind: 'shop' | 'not_tracked' } | { kind: 'staff'; staffId?: string };
  /** Paid by a staff member from their own pocket, to be paid back. */
  reimburse: boolean;
}

/** Default for "charged to": amounts below the shop's small-expense limit are Not tracked. */
export function defaultChargedTo(
  amount: Paise,
  smallExpenseLimit: Paise | undefined,
): 'shop' | 'not_tracked' {
  return smallExpenseLimit !== undefined && amount < smallExpenseLimit ? 'not_tracked' : 'shop';
}

export function validateExpense(e: Expense): string[] {
  const problems: string[] = [];
  if (!Number.isSafeInteger(e.amount) || e.amount <= 0)
    problems.push('amount must be more than zero');
  if (e.chargedTo.kind === 'staff' && !e.chargedTo.staffId)
    problems.push('chargedTo staff needs a staff member');
  if (e.reimburse && e.paidBy.kind !== 'staff')
    problems.push('reimburse is only for expenses a staff member paid');
  return problems;
}

/** Staff ledger lines an expense creates (none for a plain shop expense). */
export function expenseLedgerLines(e: Expense): { staffId: string; draft: LedgerDraft }[] {
  const out: { staffId: string; draft: LedgerDraft }[] = [];
  if (e.chargedTo.kind === 'staff' && e.chargedTo.staffId) {
    out.push({
      staffId: e.chargedTo.staffId,
      draft: { date: e.date, type: 'staff_charge', amount: -e.amount },
    });
  }
  if (e.paidBy.kind === 'staff' && e.reimburse) {
    out.push({
      staffId: e.paidBy.staffId,
      draft: { date: e.date, type: 'reimbursement', amount: e.amount },
    });
  }
  return out;
}

/** Shop expense totals. Not-tracked and staff-charged expenses are excluded from `total`. */
export function expenseTotals(expenses: readonly Expense[]): {
  total: Paise;
  byCategory: Record<string, Paise>;
  notTracked: Paise;
  chargedToStaff: Paise;
} {
  const byCategory: Record<string, Paise> = {};
  let total = 0;
  let notTracked = 0;
  let chargedToStaff = 0;
  for (const e of expenses) {
    if (e.chargedTo.kind === 'not_tracked') notTracked += e.amount;
    else if (e.chargedTo.kind === 'staff') chargedToStaff += e.amount;
    else {
      total += e.amount;
      byCategory[e.categoryId] = (byCategory[e.categoryId] ?? 0) + e.amount;
    }
  }
  return { total, byCategory, notTracked, chargedToStaff };
}
