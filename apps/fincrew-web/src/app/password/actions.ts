'use server';

import { redirect } from 'next/navigation';
import { t } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';

export type PasswordState = { error?: string };

/**
 * A helper's first sign-in (or after the shop reset their password): they choose their own
 * password, which clears `must_change_password`; the session is refreshed so the next page sees
 * the new flag. Password rules are Supabase Auth's (its error is shown as it comes).
 */
export async function choosePassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const password = String(form.get('password') ?? '');
  const again = String(form.get('again') ?? '');
  if (!password) return { error: t('password.errors.empty') };
  if (password !== again) return { error: t('password.errors.mismatch') };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password,
    data: { must_change_password: false },
  });
  if (error) return { error: t('password.errors.failed', { reason: error.message }) };
  await supabase.auth.refreshSession();
  redirect('/');
}
