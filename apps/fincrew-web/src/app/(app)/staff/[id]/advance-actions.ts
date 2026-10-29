'use server';

import { revalidatePath } from 'next/cache';
import {
  recordAdvance as recordShared,
  saveAdvanceSettings as saveSettingsShared,
  undoLedgerLine,
} from '@fincrew/data';
import type { AdvanceCutMode } from '@fincrew/core';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type AdvanceState = { error?: string; needsConfirm?: boolean; done?: string };

/**
 * Give an advance or record cash repaid with the shared rules (`recordAdvance` in
 * `@fincrew/data`): past the person's limit the form asks to confirm (PLAN §4.7).
 */
export async function recordAdvance(
  staffId: string,
  _prev: AdvanceState,
  form: FormData,
): Promise<AdvanceState> {
  const me = await requireMe();
  if (!me) return { error: t('advances.errors.noPermission') };
  const text = (k: string) => String(form.get(k) ?? '').trim();
  const r = await recordShared(await createClient(), {
    ...me,
    staffId,
    kind: text('kind') === 'repaid' ? 'repaid' : 'given',
    amount: text('amount'),
    date: text('date'),
    mode: text('mode'),
    note: text('note'),
    confirmOverLimit: form.get('confirmOverLimit') === 'on',
  });
  if (!r.ok) {
    switch (r.reason) {
      case 'no_permission':
        return { error: t('advances.errors.noPermission') };
      case 'amount':
        return { error: t('staffDetail.pay.form.errors.amount') };
      case 'date':
        return { error: t('common.invalidDate') };
      case 'over_limit':
        return { needsConfirm: true, error: t('advances.errors.overLimit') };
      case 'failed':
        return { error: t('advances.errors.failed', { reason: r.message }) };
    }
  }
  revalidatePath(`/staff/${staffId}`);
  revalidatePath('/advances');
  return { done: t(r.kind === 'given' ? 'advances.done.given' : 'advances.done.repaid') };
}

/** Per-person advance limit, cut mode and expense switches (shared `saveAdvanceSettings`). */
export async function saveAdvanceSettings(
  staffId: string,
  _prev: AdvanceState,
  form: FormData,
): Promise<AdvanceState> {
  const me = await requireMe();
  if (!me) return { error: t('advances.errors.noPermission') };
  const r = await saveSettingsShared(await createClient(), {
    ...me,
    staffId,
    limit: String(form.get('limit') ?? ''),
    mode: String(form.get('mode') ?? 'all') as AdvanceCutMode,
    cut: String(form.get('cut') ?? ''),
    payback: form.get('payback') === 'on',
    recover: form.get('recover') === 'on',
  });
  if (!r.ok)
    return {
      error:
        r.reason === 'no_permission'
          ? t('advances.errors.noPermission')
          : r.reason === 'amount'
            ? t('staffDetail.pay.form.errors.amount')
            : t('advances.errors.failed', { reason: r.message }),
    };
  revalidatePath(`/staff/${staffId}`);
  return { done: t('advances.done.settings') };
}

/** Undo a ledger line (payment or advance) with an exact reversal, once (PLAN §4.7). */
export async function undoLine(staffId: string, lineId: string): Promise<AdvanceState> {
  const me = await requireMe();
  if (!me) return { error: t('advances.errors.noPermission') };
  const r = await undoLedgerLine(await createClient(), {
    ...me,
    staffId,
    lineId,
    today: todayIST(),
  });
  if (!r.ok)
    return {
      error:
        r.reason === 'no_permission'
          ? t('advances.errors.noPermission')
          : t('advances.errors.failed', { reason: r.message }),
    };
  revalidatePath(`/staff/${staffId}`);
  revalidatePath('/salary');
  return { done: t('advances.done.undone') };
}
