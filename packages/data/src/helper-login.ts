import type { Supabase } from './client';

export type HelperLoginResult =
  { ok: true; linked?: 'new' | 'existing' } | { ok: false; reason: string; message?: string };

/**
 * Give, reset or remove a helper's sign-in (email + password) through the `helper-auth` edge
 * function, which checks staff.edit as the signed-in person and makes the account with the
 * service role. A new or reset password is a first password: the helper chooses their own at the
 * next sign-in. Used by the website (and the app).
 */
export async function helperLogin(
  supabase: Supabase,
  input:
    | { action: 'give'; personId: string; email: string; password: string }
    | { action: 'reset'; personId: string; password: string }
    | { action: 'remove'; personId: string },
): Promise<HelperLoginResult> {
  const { data, error } = await supabase.functions.invoke('helper-auth', { body: input });
  if (data && typeof data === 'object' && 'ok' in data) return data as HelperLoginResult;
  return { ok: false, reason: 'server', message: error?.message ?? '' };
}

/** A first password that's easy to read out: no 0/O, 1/l/I. */
export function firstPassword(
  random: (n: number) => number = (n) => Math.floor(Math.random() * n),
) {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (s: string) => s[random(s.length)]!;
  return `${Array.from({ length: 4 }, () => pick(letters)).join('')}-${Array.from({ length: 4 }, () => pick(digits)).join('')}`;
}
