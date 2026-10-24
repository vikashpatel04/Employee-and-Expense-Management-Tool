'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  createInvite,
  inviteUrl,
  resetStaffPhone,
  revokeInvite,
  setSelfAttendance,
  unlockLogin,
} from '@fincrew/data';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type SignInState = { error?: string; done?: string; link?: string };

async function editor() {
  const me = await requireMe();
  return me && me.permissions.includes('staff.edit') ? me : null;
}

/** Make an invite link (shown once: only its hash is kept). */
export async function inviteAction(staffId: string): Promise<SignInState> {
  if (!(await editor())) return { error: t('signin.errors.noPermission') };
  const r = await createInvite(await createClient(), staffId);
  if (!r.ok) return { error: t('signin.errors.failed', { reason: r.message }) };
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  revalidatePath(`/staff/${staffId}`);
  return { link: inviteUrl(origin, r.token) };
}

/** Cancel, unlock, new phone: small one-click changes. */
export async function signInChange(
  staffId: string,
  change: 'cancel' | 'unlock' | 'phone',
): Promise<SignInState> {
  if (!(await editor())) return { error: t('signin.errors.noPermission') };
  const supabase = await createClient();
  const ok =
    change === 'cancel'
      ? await revokeInvite(supabase, staffId)
      : change === 'unlock'
        ? await unlockLogin(supabase, staffId)
        : await resetStaffPhone(supabase, staffId);
  if (!ok) return { error: t('signin.errors.failed', { reason: '—' }) };
  revalidatePath(`/staff/${staffId}`);
  return {
    done: t(
      change === 'cancel'
        ? 'signin.done.cancelled'
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
