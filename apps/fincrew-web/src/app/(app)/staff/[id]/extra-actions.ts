'use server';

import { revalidatePath } from 'next/cache';
import { parseDisplayDate, parseRupees } from '@fincrew/core';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type ExtraState = { error?: string; done?: string };

const text = (form: FormData, k: string) => String(form.get(k) ?? '').trim();
const failed = (reason?: string) => ({
  error: t('staffDetail.pay.form.errors.failed', { reason: reason ?? '—' }),
});

async function allowed(permission: string) {
  const me = await requireMe();
  return me && me.permissions.includes(permission) ? me : null;
}

function refresh(staffId: string) {
  revalidatePath(`/staff/${staffId}`);
  revalidatePath('/staff');
  revalidatePath('/attendance');
  revalidatePath('/salary');
}

/**
 * Name, phone, joining and leaving date. A leaving date marks the person as left (the staff
 * list's "Left" filter); clearing it makes them active again.
 */
export async function saveDetails(
  staffId: string,
  _prev: ExtraState,
  form: FormData,
): Promise<ExtraState> {
  const me = await allowed('staff.edit');
  if (!me) return { error: t('settings.errors.noPermission') };
  const name = text(form, 'name');
  if (!name) return { error: t('staffDetail.details.errors.name') };
  const joining = parseDisplayDate(text(form, 'joiningDate'));
  if (!joining) return { error: t('common.invalidDate') };
  const leaving = text(form, 'leavingDate') ? parseDisplayDate(text(form, 'leavingDate')) : null;
  if (text(form, 'leavingDate') && !leaving) return { error: t('common.invalidDate') };
  if (leaving && leaving < joining) return { error: t('staffDetail.details.errors.leaving') };

  const supabase = await createClient();
  const { error: pErr, count } = await supabase
    .from('people')
    .update({ name, phone: text(form, 'phone') || null }, { count: 'exact' })
    .eq('id', staffId)
    .eq('shop_id', me.shopId);
  if (pErr || count === 0) return failed(pErr?.message);
  const { error } = await supabase
    .from('staff')
    .update({ joining_date: joining, leaving_date: leaving, status: leaving ? 'left' : 'active' })
    .eq('person_id', staffId);
  if (error) return failed(error.message);
  refresh(staffId);
  return { done: t('staffDetail.details.saved') };
}

/** Add an allowance or a fixed deduction (dated, from/until). */
export async function addItem(
  staffId: string,
  kind: 'allowance' | 'deduction',
  _prev: ExtraState,
  form: FormData,
): Promise<ExtraState> {
  const me = await allowed('staff.pay.edit');
  if (!me) return { error: t('settings.errors.noPermission') };
  const name = text(form, 'name');
  if (!name) return { error: t('staffDetail.items.errors.name') };
  const amount = parseRupees(text(form, 'amount'));
  if (amount === null) return { error: t('staffDetail.pay.form.errors.amount') };
  const from = parseDisplayDate(text(form, 'from'));
  if (!from) return { error: t('common.invalidDate') };
  const to = text(form, 'to') ? parseDisplayDate(text(form, 'to')) : null;
  if (text(form, 'to') && !to) return { error: t('common.invalidDate') };
  if (to && to < from) return { error: t('staffDetail.items.errors.to') };

  const row = {
    shop_id: me.shopId,
    staff_id: staffId,
    name,
    amount_paise: amount,
    effective_from: from,
    effective_to: to,
  };
  const supabase = await createClient();
  const { error } =
    kind === 'allowance'
      ? await supabase
          .from('allowances')
          .insert({ ...row, prorated: form.get('prorated') === 'on' })
      : await supabase.from('fixed_deductions').insert(row);
  if (error) return failed(error.message);
  refresh(staffId);
  return { done: t('staffDetail.items.saved') };
}

const ITEM_TABLE = { allowance: 'allowances', deduction: 'fixed_deductions' } as const;

/** Stop an allowance or deduction after today (the row stays for past months). */
export async function endItem(
  staffId: string,
  kind: 'allowance' | 'deduction',
  id: string,
): Promise<ExtraState> {
  const me = await allowed('staff.pay.edit');
  if (!me) return { error: t('settings.errors.noPermission') };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from(ITEM_TABLE[kind])
    .update({ effective_to: todayIST() }, { count: 'exact' })
    .eq('id', id)
    .eq('staff_id', staffId);
  if (error || count === 0) return failed(error?.message);
  refresh(staffId);
  return {};
}

/** Remove one added by mistake. Finalized payslips keep their own copy of the lines. */
export async function removeItem(
  staffId: string,
  kind: 'allowance' | 'deduction',
  id: string,
): Promise<ExtraState> {
  const me = await allowed('staff.pay.edit');
  if (!me) return { error: t('settings.errors.noPermission') };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from(ITEM_TABLE[kind])
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('staff_id', staffId);
  if (error || count === 0) return failed(error?.message);
  refresh(staffId);
  return {};
}

/** Move this person to a leave template from a date (a dated assignment). */
export async function saveTemplate(
  staffId: string,
  _prev: ExtraState,
  form: FormData,
): Promise<ExtraState> {
  const me = await allowed('staff.edit');
  if (!me) return { error: t('settings.errors.noPermission') };
  const from = parseDisplayDate(text(form, 'from'));
  if (!from) return { error: t('common.invalidDate') };
  const supabase = await createClient();
  const { data: tpl } = await supabase
    .from('leave_templates')
    .select('archived')
    .eq('id', text(form, 'template'))
    .eq('shop_id', me.shopId)
    .maybeSingle();
  if (!tpl) return failed();
  if (tpl.archived) return { error: t('settings.leave.errors.archived') };
  const { error } = await supabase.from('staff_leave_templates').upsert(
    {
      shop_id: me.shopId,
      staff_id: staffId,
      template_id: text(form, 'template'),
      effective_from: from,
    },
    { onConflict: 'staff_id,effective_from' },
  );
  if (error) return failed(error.message);
  refresh(staffId);
  revalidatePath('/settings/leave');
  return { done: t('staffDetail.templateForm.saved') };
}

/**
 * The one opening balance line (money owed before FinCrew). The ledger is append-only and allows
 * one per person, so the form asks to confirm first.
 */
export async function saveOpening(
  staffId: string,
  _prev: ExtraState,
  form: FormData,
): Promise<ExtraState> {
  const me = await allowed('staff.pay.edit');
  if (!me) return { error: t('settings.errors.noPermission') };
  const amount = parseRupees(text(form, 'amount'));
  if (!amount) return { error: t('staffDetail.pay.form.errors.amount') };
  const date = parseDisplayDate(text(form, 'date'));
  if (!date) return { error: t('common.invalidDate') };
  if (form.get('confirm') !== 'on') return { error: t('staffDetail.opening.errors.confirm') };

  const supabase = await createClient();
  const { error } = await supabase.from('ledger_entries').insert({
    shop_id: me.shopId,
    staff_id: staffId,
    date,
    type: 'opening_balance',
    // Ledger sign: positive = the shop owes the person.
    amount_paise: text(form, 'direction') === 'owes' ? -amount : amount,
  });
  if (error) return failed(error.message);
  refresh(staffId);
  return { done: t('staffDetail.opening.saved') };
}

/**
 * Correct the opening balance: the ledger is append-only, so this adds a correction line
 * (`adjustment`, linked to the opening line, dated the same day) for the difference between the
 * new figure and the current one. Corrections need `salary.run` (ledger insert rules).
 */
export async function correctOpening(
  staffId: string,
  _prev: ExtraState,
  form: FormData,
): Promise<ExtraState> {
  const me = await allowed('salary.run');
  if (!me) return { error: t('settings.errors.noPermission') };
  const amount = parseRupees(text(form, 'amount'));
  if (amount === null) return { error: t('staffDetail.pay.form.errors.amount') };
  if (form.get('confirm') !== 'on') return { error: t('staffDetail.opening.errors.confirm') };
  const target = text(form, 'direction') === 'owes' ? -amount : amount;

  const supabase = await createClient();
  const { data: opening } = await supabase
    .from('ledger_entries')
    .select('id, date, amount_paise')
    .eq('staff_id', staffId)
    .eq('type', 'opening_balance')
    .maybeSingle();
  if (!opening) return failed();
  const { data: fixes } = await supabase
    .from('ledger_entries')
    .select('amount_paise')
    .eq('staff_id', staffId)
    .eq('type', 'adjustment')
    .eq('ref_table', 'ledger_entries')
    .eq('ref_id', opening.id);
  const now =
    Number(opening.amount_paise) + (fixes ?? []).reduce((a, f) => a + Number(f.amount_paise), 0);
  if (target === now) return { done: t('staffDetail.opening.noChange') };

  const { error } = await supabase.from('ledger_entries').insert({
    shop_id: me.shopId,
    staff_id: staffId,
    date: opening.date,
    type: 'adjustment',
    amount_paise: target - now,
    ref_table: 'ledger_entries',
    ref_id: opening.id,
    note: t('staffDetail.opening.correctionNote'),
  });
  if (error) return failed(error.message);
  refresh(staffId);
  return { done: t('staffDetail.opening.corrected') };
}
