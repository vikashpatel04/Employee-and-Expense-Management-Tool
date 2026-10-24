import { compareDates, isBusinessDate, type BusinessDate } from '@fincrew/core';
import type { Supabase } from './client';
import { groupBy } from './mappers';
import { paidLeaveShortfall } from './paid-leave';

export const SETTABLE_STATUSES = [
  'present',
  'half_day',
  'absent',
  'paid_leave',
  'unpaid_leave',
] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

export type AttendanceWriteResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'no_permission' | 'invalid' | 'future' | 'past' }
  | { ok: false; reason: 'leave'; name: string; left: number }
  | { ok: false; reason: 'failed'; message: string };

/**
 * Set one status on many days, or clear their marks (`'clear'`): the rules the website grid and
 * the Android Today screen share. Today needs `attendance.mark`; earlier days also
 * `attendance.edit_past` (RLS enforces both; checked here first for a clear message). Paid leave
 * is refused beyond the person's balance for that month (PLAN §4.3). Clearing deletes the mark,
 * so the day goes back to what the rules give it.
 */
export async function writeAttendance(
  supabase: Supabase,
  input: {
    shopId: string;
    cells: { staffId: string; date: string }[];
    status: SettableStatus | 'clear';
    today: BusinessDate;
    permissions: readonly string[];
    /** Approved leave may be written ahead for days still to come. */
    allowFuture?: boolean;
  },
): Promise<AttendanceWriteResult> {
  const { shopId, cells, status, today, permissions, allowFuture } = input;
  if (!permissions.includes('attendance.mark')) return { ok: false, reason: 'no_permission' };
  if (
    (status !== 'clear' && !SETTABLE_STATUSES.includes(status)) ||
    cells.length === 0 ||
    cells.length > 2000
  )
    return { ok: false, reason: 'invalid' };
  for (const c of cells) {
    if (!isBusinessDate(c.date)) return { ok: false, reason: 'invalid' };
    if (compareDates(c.date, today) > 0 && !allowFuture) return { ok: false, reason: 'future' };
    if (compareDates(c.date, today) < 0 && !permissions.includes('attendance.edit_past'))
      return { ok: false, reason: 'past' };
  }

  if (status === 'clear') {
    for (const [staffId, group] of groupBy(cells, (c) => c.staffId)) {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('shop_id', shopId)
        .eq('staff_id', staffId)
        .in(
          'date',
          group.map((c) => c.date),
        );
      if (error) return { ok: false, reason: 'failed', message: error.message };
    }
    return { ok: true, count: cells.length };
  }

  if (status === 'paid_leave') {
    const short = await paidLeaveShortfall(supabase, shopId, cells);
    if (short) return { ok: false, reason: 'leave', ...short };
  }
  const { error } = await supabase.from('attendance').upsert(
    cells.map((c) => ({ shop_id: shopId, staff_id: c.staffId, date: c.date, status })),
    { onConflict: 'staff_id,date' },
  );
  if (error) return { ok: false, reason: 'failed', message: error.message };
  return { ok: true, count: cells.length };
}
