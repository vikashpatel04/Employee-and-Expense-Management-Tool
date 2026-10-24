import { parseDisplayDate, parseRupees, validateExpense, type PaymentMode } from '@fincrew/core';
import type { Supabase } from './client';

export const PAYMENT_MODES = ['cash', 'upi', 'bank', 'card'] as const;
export const PAID_BY_KINDS = ['owner', 'shop_cash', 'staff'] as const;
export const CHARGED_TO_KINDS = ['shop', 'staff', 'not_tracked'] as const;
export type PaidByKind = (typeof PAID_BY_KINDS)[number];
export type ChargedToKind = (typeof CHARGED_TO_KINDS)[number];

/** Biggest bill photo the bucket takes (both apps shrink photos to ~200 KB first). */
export const MAX_BILL_BYTES = 1024 * 1024;

/** What the add / edit expense forms send, as typed (amount in rupees, date DD/MM/YYYY). */
export type ExpenseForm = {
  amount: string;
  date: string;
  categoryId: string;
  mode: string;
  paidBy: string;
  paidByStaffId?: string | null;
  chargedTo: string;
  chargedToStaffId?: string | null;
  reimburse: boolean;
  note?: string | null;
};

/** A shrunk bill photo: a browser File/Blob, or the phone's bytes as an ArrayBuffer. */
export type BillUpload = {
  body: Parameters<ReturnType<Supabase['storage']['from']>['upload']>[1];
  size: number;
  type: string;
};

export type ExpenseWriteResult =
  | { ok: true; id: string; date: string }
  | {
      ok: false;
      reason:
        'no_permission' | 'amount' | 'date' | 'category' | 'staff_paid' | 'staff_charged' | 'bill';
    }
  | { ok: false; reason: 'invalid'; problems: string[] }
  | { ok: false; reason: 'failed'; message: string };

/**
 * Add (`expenseId` null, needs expenses.add) or change (needs expenses.edit) an expense: the rules
 * the website and the Android app share. A new bill photo goes to Storage at
 * `<shop>/<expense>-<time>.jpg` and replaces the old one; `removeBill` clears it. The database
 * posts or re-posts any staff ledger lines (staff charge, pay-back).
 */
export async function saveExpense(
  supabase: Supabase,
  input: {
    shopId: string;
    permissions: readonly string[];
    expenseId: string | null;
    form: ExpenseForm;
    bill?: BillUpload | null;
    removeBill?: boolean;
    /** Id for a new expense (the bill file is named after it before the row exists). */
    newId: () => string;
  },
): Promise<ExpenseWriteResult> {
  const { shopId, permissions, expenseId, form, bill } = input;
  if (!permissions.includes(expenseId ? 'expenses.edit' : 'expenses.add'))
    return { ok: false, reason: 'no_permission' };

  const amount = parseRupees(form.amount.trim());
  if (!amount) return { ok: false, reason: 'amount' };
  const date = parseDisplayDate(form.date.trim());
  if (!date) return { ok: false, reason: 'date' };
  const categoryId = form.categoryId.trim();
  if (!categoryId) return { ok: false, reason: 'category' };
  const mode: PaymentMode = PAYMENT_MODES.find((m) => m === form.mode) ?? 'cash';
  const paidBy: PaidByKind = PAID_BY_KINDS.find((m) => m === form.paidBy) ?? 'owner';
  const charged: ChargedToKind = CHARGED_TO_KINDS.find((m) => m === form.chargedTo) ?? 'shop';
  const paidStaff = paidBy === 'staff' ? (form.paidByStaffId ?? '').trim() : '';
  const chargedStaff = charged === 'staff' ? (form.chargedToStaffId ?? '').trim() : '';
  if (paidBy === 'staff' && !paidStaff) return { ok: false, reason: 'staff_paid' };
  if (charged === 'staff' && !chargedStaff) return { ok: false, reason: 'staff_charged' };

  const row = {
    shop_id: shopId,
    date,
    amount_paise: amount,
    category_id: categoryId,
    payment_mode: mode,
    note: form.note?.trim() || null,
    paid_by_kind: paidBy,
    paid_by_staff_id: paidStaff || null,
    charged_to_kind: charged,
    charged_to_staff_id: chargedStaff || null,
    reimburse: paidBy === 'staff' && form.reimburse,
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
  if (problems.length) return { ok: false, reason: 'invalid', problems };

  const id = expenseId ?? input.newId();
  const { data: before } = expenseId
    ? await supabase.from('expenses').select('bill_path').eq('id', expenseId).maybeSingle()
    : { data: null };

  let billPath: string | null | undefined = input.removeBill ? null : undefined;
  if (bill && bill.size > 0) {
    if (bill.size > MAX_BILL_BYTES || !bill.type.startsWith('image/'))
      return { ok: false, reason: 'bill' };
    billPath = `${shopId}/${id}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('bills')
      .upload(billPath, bill.body, { contentType: 'image/jpeg', upsert: false });
    if (error) return { ok: false, reason: 'failed', message: error.message };
  }

  const saved = expenseId
    ? await supabase
        .from('expenses')
        .update({ ...row, ...(billPath !== undefined ? { bill_path: billPath } : {}) })
        .eq('id', expenseId)
        .eq('shop_id', shopId)
        .select('id')
    : await supabase
        .from('expenses')
        .insert({ ...row, id, bill_path: billPath ?? null })
        .select('id');
  if (saved.error || (saved.data ?? []).length === 0) {
    if (billPath) await supabase.storage.from('bills').remove([billPath]);
    return { ok: false, reason: 'failed', message: saved.error?.message ?? '—' };
  }
  // The old photo goes once the row no longer points at it (needs expenses.edit; best effort).
  if (billPath !== undefined && before?.bill_path)
    await supabase.storage.from('bills').remove([before.bill_path]);
  return { ok: true, id, date };
}

/** Delete an expense (needs expenses.edit); the database undoes any staff ledger lines it posted. */
export async function deleteExpense(
  supabase: Supabase,
  input: { shopId: string; permissions: readonly string[]; expenseId: string },
): Promise<
  | { ok: true }
  | { ok: false; reason: 'no_permission' }
  | { ok: false; reason: 'failed'; message: string }
> {
  if (!input.permissions.includes('expenses.edit')) return { ok: false, reason: 'no_permission' };
  const { data: row } = await supabase
    .from('expenses')
    .select('bill_path')
    .eq('id', input.expenseId)
    .maybeSingle();
  const { error, count } = await supabase
    .from('expenses')
    .delete({ count: 'exact' })
    .eq('id', input.expenseId)
    .eq('shop_id', input.shopId);
  if (error || count === 0) return { ok: false, reason: 'failed', message: error?.message ?? '—' };
  if (row?.bill_path) await supabase.storage.from('bills').remove([row.bill_path]);
  return { ok: true };
}

/** A short-lived link to a bill photo (RLS on Storage decides who may see it). */
export async function billUrl(supabase: Supabase, path: string, seconds = 300) {
  const { data } = await supabase.storage.from('bills').createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
