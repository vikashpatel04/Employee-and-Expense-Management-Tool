'use server';

import { redirect } from 'next/navigation';
import { savePay as saveShared } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type PayState = { error?: string };

/** Save pay settings from a date (shared `savePay`: a dated version; earlier months keep their pay). */
export async function savePay(staffId: string, _prev: PayState, form: FormData): Promise<PayState> {
  const me = await requireMe();
  if (!me) redirect('/');
  const text = (k: string) => String(form.get(k) ?? '');
  const r = await saveShared(await createClient(), {
    ...me,
    staffId,
    effectiveFrom: text('effectiveFrom'),
    payType: text('payType'),
    amount: text('amount'),
    overtime: text('overtime'),
    shiftStart: text('shiftStart'),
    shiftEnd: text('shiftEnd'),
    grace: text('grace'),
    hoursPerDay: text('hoursPerDay'),
  });
  if (!r.ok) {
    switch (r.reason) {
      case 'no_permission':
        return { error: t('advances.errors.noPermission') };
      case 'date':
        return { error: t('common.invalidDate') };
      case 'failed':
        return { error: t('staffDetail.pay.form.errors.failed', { reason: r.message }) };
      default:
        return { error: t(`staffDetail.pay.form.errors.${r.reason}`) };
    }
  }
  // `at` changes every save, so the dialog sees the address change and closes.
  redirect(`/staff/${staffId}?tab=pay&saved=${r.effectiveFrom}&at=${Date.now().toString(36)}`);
}
