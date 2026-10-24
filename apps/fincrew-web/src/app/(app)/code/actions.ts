'use server';

import { revalidatePath } from 'next/cache';
import { regenerateAttendanceCode } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

/** A new attendance code now; the old one and its QR stop working (needs attendance.code). */
export async function newCodeAction(): Promise<{ error?: string; done?: string }> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('attendance.code')) return { error: t('code.noPermission') };
  const code = await regenerateAttendanceCode(await createClient(), me.shopId);
  if (!code) return { error: t('code.failed') };
  revalidatePath('/code');
  return { done: t('code.made') };
}
