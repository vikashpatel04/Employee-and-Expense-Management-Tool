'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseDisplayDate, parseRupees, validateExpense } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type ExpenseState = { error?: string };

const MODES = ['cash', 'upi', 'bank', 'card'] as const;
const PAID_BY = ['owner', 'shop_cash', 'staff'] as const;
const CHARGED = ['shop', 'staff', 'not_tracked'] as const;

function refresh() {
  revalidatePath('/expenses');
  revalidatePath('/');
  revalidatePath('/staff', 'layout');
}

/**
 * Add (`expenseId` null, needs expenses.add) or change (needs expenses.edit) an expense. A bill
 * photo arrives already shrunk by the browser and goes to Storage at `<shop>/<expense>-<time>.jpg`;
 * the database posts or re-posts any staff ledger lines (staff charge, pay-back).
 */
export async function saveExpense(
  expenseId: string | null,
  _prev: ExpenseState,
  form: FormData,
): Promise<ExpenseState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes(expenseId ? 'expenses.edit' : 'expenses.add'))
    return { error: t('settings.errors.noPermission') };
  const text = (k: string) => String(form.get(k) ?? '').trim();
  const f = 'expenses.form.errors';

  const amount = parseRupees(text('amount'));
  if (!amount) return { error: t(`${f}.amount`) };
  const date = parseDisplayDate(text('date'));
  if (!date) return { error: t('common.invalidDate') };
  const categoryId = text('category');
  if (!categoryId) return { error: t(`${f}.category`) };
  const mode = MODES.find((m) => m === text('mode')) ?? 'cash';
  const paidBy = PAID_BY.find((m) => m === text('paidBy')) ?? 'owner';
  const charged = CHARGED.find((m) => m === text('chargedTo')) ?? 'shop';
  const paidStaff = paidBy === 'staff' ? text('paidByStaff') : '';
  const chargedStaff = charged === 'staff' ? text('chargedToStaff') : '';
  if (paidBy === 'staff' && !paidStaff) return { error: t(`${f}.staffPaid`) };
  if (charged === 'staff' && !chargedStaff) return { error: t(`${f}.staffCharged`) };

  const row = {
    shop_id: me.shopId,
    date,
    amount_paise: amount,
    category_id: categoryId,
    payment_mode: mode,
    note: text('note') || null,
    paid_by_kind: paidBy,
    paid_by_staff_id: paidStaff || null,
    charged_to_kind: charged,
    charged_to_staff_id: chargedStaff || null,
    reimburse: paidBy === 'staff' && form.get('reimburse') === 'on',
  };
  const problems = validateExpense({
    date,
    amount,
    categoryId,
    paymentMode: mode,
    paidBy: paidBy === 'staff' ? { kind: 'staff', staffId: paidStaff } : { kind: paidBy },
    chargedTo: charged === 'staff' ? { kind: 'staff', staffId: chargedStaff } : { kind: charged },
    reimburse: row.reimburse,
  });
  if (problems.length) return { error: t(`${f}.failed`, { reason: problems.join('; ') }) };

  const supabase = await createClient();
  const id = expenseId ?? randomUUID();
  const { data: before } = expenseId
    ? await supabase.from('expenses').select('bill_path').eq('id', expenseId).maybeSingle()
    : { data: null };

  // Bill photo: a new one replaces the old; "remove" clears it.
  const bill = form.get('bill');
  let billPath: string | null | undefined = form.get('removeBill') === 'on' ? null : undefined;
  if (bill instanceof File && bill.size > 0) {
    if (bill.size > 1024 * 1024 || !bill.type.startsWith('image/'))
      return { error: t('expenses.form.billBad') };
    billPath = `${me.shopId}/${id}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('bills')
      .upload(billPath, bill, { contentType: 'image/jpeg', upsert: false });
    if (error) return { error: t(`${f}.failed`, { reason: error.message }) };
  }

  const saved = expenseId
    ? await supabase
        .from('expenses')
        .update({ ...row, ...(billPath !== undefined ? { bill_path: billPath } : {}) })
        .eq('id', expenseId)
        .eq('shop_id', me.shopId)
        .select('id')
    : await supabase
        .from('expenses')
        .insert({ ...row, id, bill_path: billPath ?? null })
        .select('id');
  if (saved.error || (saved.data ?? []).length === 0) {
    if (billPath) await supabase.storage.from('bills').remove([billPath]);
    return { error: t(`${f}.failed`, { reason: saved.error?.message ?? '—' }) };
  }
  // The old photo goes once the row no longer points at it (needs expenses.edit; best effort).
  if (billPath !== undefined && before?.bill_path)
    await supabase.storage.from('bills').remove([before.bill_path]);

  refresh();
  redirect(`/expenses?month=${date.slice(0, 7)}&saved=1`);
}

/** Delete an expense; the database undoes any staff ledger lines it posted. */
export async function deleteExpense(expenseId: string, month: string): Promise<ExpenseState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('expenses.edit'))
    return { error: t('settings.errors.noPermission') };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from('expenses')
    .select('bill_path')
    .eq('id', expenseId)
    .maybeSingle();
  const { error, count } = await supabase
    .from('expenses')
    .delete({ count: 'exact' })
    .eq('id', expenseId)
    .eq('shop_id', me.shopId);
  if (error || count === 0)
    return { error: t('expenses.form.errors.failed', { reason: error?.message ?? '—' }) };
  if (row?.bill_path) await supabase.storage.from('bills').remove([row.bill_path]);
  refresh();
  redirect(`/expenses?month=${month}`);
}
