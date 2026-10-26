'use server';

import { createClient as createPlainClient } from '@supabase/supabase-js';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { supabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

export type ClearState = { error?: string; done?: string };

/**
 * Clear all data (docs/features/clear-data.md): owner only; needs the owner's password again
 * (checked by signing in with it on a separate client, so nothing changes for this session) and
 * the shop's name typed. The database does the clearing (`clear_shop_data`); the files in
 * Storage (bills, staff documents) are removed afterwards with the owner's session.
 */
export async function clearAllData(_prev: ClearState, form: FormData): Promise<ClearState> {
  const me = await requireMe();
  if (!me || !me.isOwner) return { error: t('settings.data.errors.owner') };
  if (String(form.get('confirm') ?? '').trim() !== me.shopName)
    return { error: t('settings.data.errors.name') };
  const password = String(form.get('password') ?? '');
  if (!password) return { error: t('settings.data.errors.password') };

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const email = user.user?.email;
  if (!email) return { error: t('settings.data.errors.password') };
  const { url, key } = supabaseEnv();
  const { error: signInError } = await createPlainClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.signInWithPassword({ email, password });
  if (signInError) return { error: t('settings.data.errors.password') };

  const { data, error } = await supabase.rpc('clear_shop_data', { p_shop: me.shopId });
  if (error) return { error: t('settings.errors.failed', { reason: error.message }) };
  const r = data as { bills: string[]; docs: string[] };
  if (r.bills.length) await supabase.storage.from('bills').remove(r.bills);
  if (r.docs.length) await supabase.storage.from('staff-docs').remove(r.docs);
  return { done: t('settings.data.done') };
}
