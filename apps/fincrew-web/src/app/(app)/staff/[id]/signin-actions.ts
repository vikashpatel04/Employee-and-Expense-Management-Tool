'use server';

import { revalidatePath } from 'next/cache';
import { resetPin, resetStaffPhone, setSelfAttendance, unlockLogin } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type SignInState = { error?: string; done?: string };

async function editor() {
  const me = await requireMe();
  return me && me.permissions.includes('staff.edit') ? me : null;
}

/** Reset the PIN, unlock, new phone: small one-click changes. */
export async function signInChange(
  staffId: string,
  change: 'reset' | 'unlock' | 'phone',
): Promise<SignInState> {
  if (!(await editor())) return { error: t('signin.errors.noPermission') };
  const supabase = await createClient();
  const ok =
    change === 'reset'
      ? await resetPin(supabase, staffId)
      : change === 'unlock'
        ? await unlockLogin(supabase, staffId)
        : await resetStaffPhone(supabase, staffId);
  if (!ok) return { error: t('signin.errors.failed', { reason: '—' }) };
  revalidatePath(`/staff/${staffId}`);
  return {
    done: t(
      change === 'reset'
        ? 'signin.done.reset'
        : change === 'unlock'
          ? 'signin.done.unlocked'
          : 'signin.done.phone',
    ),
  };
}

/** Checking in with the attendance code, on or off for this person. */
export async function selfAttendanceAction(staffId: string, on: boolean): Promise<SignInState> {
  if (!(await editor())) return { error: t('signin.errors.noPermission') };
  if (!(await setSelfAttendance(await createClient(), staffId, on)))
    return { error: t('signin.errors.failed', { reason: '—' }) };
  revalidatePath(`/staff/${staffId}`);
  return { done: t('signin.done.self') };
}
