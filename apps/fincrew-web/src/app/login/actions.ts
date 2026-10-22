'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/lib/i18n';

export type SignInState = { error?: string };

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: t('auth.invalidCredentials') };

  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
