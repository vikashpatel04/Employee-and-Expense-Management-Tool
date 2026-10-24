'use server';

import { revalidatePath } from 'next/cache';
import { writeAttendance, type AttendanceWriteResult, type SettableStatus } from '@fincrew/data';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

type Settable = SettableStatus;

export type SetResult = { ok: true; count: number } | { ok: false; error: string };

/** Shared result → the website's wording. */
function message(r: AttendanceWriteResult): SetResult {
  if (r.ok) return r;
  switch (r.reason) {
    case 'no_permission':
      return { ok: false, error: t('attendance.readOnly') };
    case 'future':
      return { ok: false, error: t('attendance.errors.future') };
    case 'past':
      return { ok: false, error: t('attendance.errors.past') };
    case 'leave':
      return { ok: false, error: t('attendance.errors.leave', { name: r.name, left: r.left }) };
    case 'failed':
      return { ok: false, error: t('attendance.errors.failed', { reason: r.message }) };
    default:
      return { ok: false, error: t('attendance.errors.failed', { reason: 'invalid request' }) };
  }
}

/**
 * Set one status on many days (the grid's bulk "Set to"). Rules: `writeAttendance` in
 * `@fincrew/data` (shared with the Android app).
 */
export async function setAttendance(
  cells: { staffId: string; date: string }[],
  status: Settable,
): Promise<SetResult> {
  return save(cells, status);
}

/**
 * Remove the marks on these days, so each goes back to what the rules give it (not marked, or
 * the weekly off / holiday from the template). Same permission and date checks as setting a mark.
 */
export async function clearAttendance(
  cells: { staffId: string; date: string }[],
): Promise<SetResult> {
  return save(cells, 'clear');
}

async function save(
  cells: { staffId: string; date: string }[],
  status: Settable | 'clear',
): Promise<SetResult> {
  const me = await requireMe();
  if (!me) return { ok: false, error: t('attendance.readOnly') };
  const supabase = await createClient();
  const r = await writeAttendance(supabase, {
    shopId: me.shopId,
    cells,
    status,
    today: todayIST(),
    permissions: me.permissions,
  });
  if (r.ok) revalidatePath('/attendance');
  return message(r);
}
