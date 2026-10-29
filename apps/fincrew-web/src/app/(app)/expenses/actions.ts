'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  deleteExpense as deleteShared,
  saveExpense as saveShared,
  type ExpenseWriteResult,
} from '@fincrew/data';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type ExpenseState = { error?: string };

function refresh() {
  revalidatePath('/expenses');
  revalidatePath('/');
  revalidatePath('/staff', 'layout');
}

const f = 'expenses.form.errors';

/** A refused save → the form's message (same keys as the Android app). */
function message(r: Exclude<ExpenseWriteResult, { ok: true }>): string {
  switch (r.reason) {
    case 'no_permission':
      return t('settings.errors.noPermission');
    case 'amount':
      return t(`${f}.amount`);
    case 'date':
      return t('common.invalidDate');
    case 'category':
      return t(`${f}.category`);
    case 'staff_paid':
      return t(`${f}.staffPaid`);
    case 'staff_charged':
      return t(`${f}.staffCharged`);
    case 'bill':
      return t('expenses.form.billBad');
    case 'invalid':
      return t(`${f}.failed`, { reason: r.problems.join('; ') });
    case 'failed':
      return t(`${f}.failed`, { reason: r.message });
  }
}

/**
 * Add (`expenseId` null) or change an expense with the shared rules (`saveExpense` in
 * `@fincrew/data`). A bill photo arrives already shrunk by the browser.
 */
export async function saveExpense(
  expenseId: string | null,
  _prev: ExpenseState,
  form: FormData,
): Promise<ExpenseState> {
  const me = await requireMe();
  if (!me) return { error: t('settings.errors.noPermission') };
  const text = (k: string) => String(form.get(k) ?? '').trim();
  const bill = form.get('bill');
  const r = await saveShared(await createClient(), {
    shopId: me.shopId,
    permissions: me.permissions,
    expenseId,
    form: {
      amount: text('amount'),
      date: text('date'),
      categoryId: text('category'),
      mode: text('mode'),
      paidBy: text('paidBy'),
      paidByStaffId: text('paidByStaff'),
      chargedTo: text('chargedTo'),
      chargedToStaffId: text('chargedToStaff'),
      reimburse: form.get('reimburse') === 'on',
      note: text('note'),
    },
    bill: bill instanceof File ? { body: bill, size: bill.size, type: bill.type } : null,
    removeBill: form.get('removeBill') === 'on',
    newId: randomUUID,
  });
  if (!r.ok) return { error: message(r) };
  refresh();
  // Show the expense's day. A new value each save, so the dialog sees the address change and
  // closes.
  redirect(`/expenses?view=day&date=${r.date}&saved=${Date.now().toString(36)}`);
}

/** Delete an expense; the database undoes any staff ledger lines it posted. */
export async function deleteExpense(expenseId: string, date: string): Promise<ExpenseState> {
  const me = await requireMe();
  if (!me) return { error: t('settings.errors.noPermission') };
  const r = await deleteShared(await createClient(), { ...me, expenseId });
  if (!r.ok)
    return {
      error:
        r.reason === 'no_permission'
          ? t('settings.errors.noPermission')
          : t(`${f}.failed`, { reason: r.message }),
    };
  refresh();
  redirect(`/expenses?view=day&date=${date}`);
}
