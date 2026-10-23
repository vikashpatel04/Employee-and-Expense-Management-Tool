'use server';

import { revalidatePath } from 'next/cache';
import { parseDisplayDate, parseRupees } from '@fincrew/core';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type AdvanceState = { error?: string; needsConfirm?: boolean; done?: string };

const MODES = ['cash', 'upi', 'bank', 'card'];

/**
 * Give an advance or record cash repaid. The database posts the ledger line and refuses an
 * advance past the person's limit unless `over_limit_confirmed` (PLAN §4.7): the form then asks.
 */
export async function recordAdvance(
  staffId: string,
  _prev: AdvanceState,
  form: FormData,
): Promise<AdvanceState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('advances.give'))
    return { error: t('advances.errors.noPermission') };
  const text = (k: string) => String(form.get(k) ?? '').trim();

  const kind = text('kind') === 'repaid' ? 'repaid' : 'given';
  const amount = parseRupees(text('amount'));
  if (!amount) return { error: t('staffDetail.pay.form.errors.amount') };
  const date = parseDisplayDate(text('date'));
  if (!date) return { error: t('common.invalidDate') };
  const mode = MODES.includes(text('mode')) ? text('mode') : 'cash';

  const supabase = await createClient();
  const { error } = await supabase.from('advances').insert({
    shop_id: me.shopId,
    staff_id: staffId,
    date,
    kind,
    amount_paise: amount,
    payment_mode: mode,
    note: text('note') || null,
    over_limit_confirmed: form.get('confirmOverLimit') === 'on',
  });
  if (error) {
    if (error.hint === 'over_limit')
      return { needsConfirm: true, error: t('advances.errors.overLimit') };
    return { error: t('advances.errors.failed', { reason: error.message }) };
  }
  revalidatePath(`/staff/${staffId}`);
  revalidatePath('/advances');
  return { done: t(kind === 'given' ? 'advances.done.given' : 'advances.done.repaid') };
}

/** Per-person advance limit and monthly cut (blank = none / decide at each salary run). */
export async function saveAdvanceSettings(
  staffId: string,
  _prev: AdvanceState,
  form: FormData,
): Promise<AdvanceState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('staff.edit'))
    return { error: t('advances.errors.noPermission') };
  const read = (k: string) => {
    const v = String(form.get(k) ?? '').trim();
    return v === '' ? null : parseRupees(v);
  };
  const limit = read('limit');
  const cut = read('cut');
  if (
    (String(form.get('limit') ?? '').trim() && limit === null) ||
    (String(form.get('cut') ?? '').trim() && cut === null)
  ) {
    return { error: t('staffDetail.pay.form.errors.amount') };
  }
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('staff')
    .update({ advance_limit_paise: limit, advance_cut_paise: cut }, { count: 'exact' })
    .eq('person_id', staffId);
  if (error || count === 0)
    return { error: t('advances.errors.failed', { reason: error?.message ?? '—' }) };
  revalidatePath(`/staff/${staffId}`);
  return { done: t('advances.done.settings') };
}

/** Undo a ledger line (payment or advance) with an exact reversal, once (PLAN §4.7). */
export async function undoLine(staffId: string, lineId: string): Promise<AdvanceState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('salary.undo_payment'))
    return { error: t('advances.errors.noPermission') };
  const supabase = await createClient();
  const { data: line } = await supabase
    .from('ledger_entries')
    .select('amount_paise, staff_id')
    .eq('id', lineId)
    .maybeSingle();
  if (!line || line.staff_id !== staffId)
    return { error: t('advances.errors.failed', { reason: '—' }) };
  const { error } = await supabase.from('ledger_entries').insert({
    shop_id: me.shopId,
    staff_id: staffId,
    date: todayIST(),
    type: 'reversal',
    amount_paise: -Number(line.amount_paise),
    reverses_id: lineId,
  });
  if (error) return { error: t('advances.errors.failed', { reason: error.message }) };
  revalidatePath(`/staff/${staffId}`);
  revalidatePath('/salary');
  return { done: t('advances.done.undone') };
}
