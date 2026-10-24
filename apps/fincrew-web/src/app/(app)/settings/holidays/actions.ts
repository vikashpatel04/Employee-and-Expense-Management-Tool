'use server';

import { revalidatePath } from 'next/cache';
import { parseDisplayDate } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';

export type HolidayState = { error?: string; done?: string };

/** Add a shop holiday; a date that already has one is replaced (unique per shop and date). */
export async function saveHoliday(_prev: HolidayState, form: FormData): Promise<HolidayState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes(SETTINGS_SECTIONS.holidays))
    return { error: t('settings.errors.noPermission') };
  const date = parseDisplayDate(String(form.get('date') ?? ''));
  if (!date) return { error: t('common.invalidDate') };
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: t('settings.holidays.errors.name') };

  const supabase = await createClient();
  const { error } = await supabase
    .from('holidays')
    .upsert(
      { shop_id: me.shopId, date, name, paid: form.get('paid') === 'on' },
      { onConflict: 'shop_id,date' },
    );
  if (error) return { error: t('settings.errors.failed', { reason: error.message }) };
  revalidatePath('/settings/holidays');
  revalidatePath('/attendance');
  return { done: t('settings.holidays.done') };
}

export async function removeHoliday(id: string): Promise<HolidayState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes(SETTINGS_SECTIONS.holidays))
    return { error: t('settings.errors.noPermission') };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('holidays')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('shop_id', me.shopId);
  if (error || count === 0)
    return { error: t('settings.errors.failed', { reason: error?.message ?? '—' }) };
  revalidatePath('/settings/holidays');
  revalidatePath('/attendance');
  return {};
}
