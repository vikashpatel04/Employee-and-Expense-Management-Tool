'use server';

import { redirect } from 'next/navigation';
import { parseDisplayDate } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type AddStaffState = { error?: string };

export async function addStaff(_prev: AddStaffState, form: FormData): Promise<AddStaffState> {
  const me = await requireMe();
  if (!me) redirect('/');
  const name = String(form.get('name') ?? '').trim();
  const phone = String(form.get('phone') ?? '').trim();
  const joiningDate = parseDisplayDate(String(form.get('joiningDate') ?? ''));
  if (!joiningDate) return { error: t('common.invalidDate') };

  const supabase = await createClient();
  const { error } = await supabase.rpc('add_staff', {
    p_shop: me.shopId,
    p_name: name,
    p_phone: phone,
    p_joining_date: joiningDate,
  });
  if (error) return { error: t('staff.failed', { reason: error.message }) };

  redirect(`/staff?added=${encodeURIComponent(name)}`);
}
