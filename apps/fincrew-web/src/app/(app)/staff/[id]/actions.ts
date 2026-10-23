'use server';

import { redirect } from 'next/navigation';
import { parseDisplayDate, parseRupees, parseTimeOfDay } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type PayState = { error?: string };

const PAY_TYPES = ['monthly', 'daily', 'hourly'] as const;

/** Save pay settings from a date (a dated version; earlier months keep their pay). */
export async function savePay(staffId: string, _prev: PayState, form: FormData): Promise<PayState> {
  const me = await requireMe();
  if (!me) redirect('/');
  const text = (k: string) => String(form.get(k) ?? '').trim();

  const effectiveFrom = parseDisplayDate(text('effectiveFrom'));
  if (!effectiveFrom) return { error: t('common.invalidDate') };
  const payType = PAY_TYPES.find((p) => p === text('payType'));
  const amount = parseRupees(text('amount'));
  if (!payType || amount === null) {
    return { error: t('staffDetail.pay.form.errors.amount') };
  }

  const overtimeText = text('overtime');
  const overtime = overtimeText === '' ? null : parseRupees(overtimeText);
  if (overtimeText !== '' && overtime === null)
    return { error: t('staffDetail.pay.form.errors.overtime') };

  const startText = text('shiftStart');
  const endText = text('shiftEnd');
  const shiftStart = startText ? parseTimeOfDay(startText) : null;
  const shiftEnd = endText ? parseTimeOfDay(endText) : null;
  const shiftOk =
    (!startText && !endText) || (shiftStart !== null && shiftEnd !== null && shiftEnd > shiftStart);
  if (!shiftOk) return { error: t('staffDetail.pay.form.errors.shift') };

  const grace = Number(text('grace') || '10');
  if (!Number.isInteger(grace) || grace < 0)
    return { error: t('staffDetail.pay.form.errors.grace') };

  const hoursText = text('hoursPerDay');
  const hours = hoursText === '' ? null : Number(hoursText);
  if (hours !== null && !(hours > 0 && hours <= 24))
    return { error: t('staffDetail.pay.form.errors.hours') };

  const supabase = await createClient();
  const { error } = await supabase.from('pay_settings').upsert(
    {
      shop_id: me.shopId,
      staff_id: staffId,
      effective_from: effectiveFrom,
      pay_type: payType,
      monthly_salary_paise: payType === 'monthly' ? amount : null,
      daily_wage_paise: payType === 'daily' ? amount : null,
      hourly_rate_paise: payType === 'hourly' ? amount : null,
      overtime_rate_paise: overtime,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      grace_minutes: grace,
      day_minutes: hours === null ? null : Math.round(hours * 60),
    },
    { onConflict: 'staff_id,effective_from' },
  );
  if (error) return { error: t('staffDetail.pay.form.errors.failed', { reason: error.message }) };

  redirect(`/staff/${staffId}?tab=pay&saved=${effectiveFrom}`);
}
