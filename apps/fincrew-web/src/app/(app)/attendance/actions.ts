'use server';

import { revalidatePath } from 'next/cache';
import {
  compareDates,
  daysInMonth,
  earnedLeave,
  isBusinessDate,
  maxDate,
  minDate,
  monthEnd,
  monthOf,
  monthStart,
  templateVersionOn,
  daysBetween,
  type LeaveTemplateVersion,
} from '@fincrew/core';
import { groupBy, toAssignment, toTemplateVersion } from '@fincrew/data';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const SETTABLE = ['present', 'half_day', 'absent', 'paid_leave', 'unpaid_leave'] as const;
type Settable = (typeof SETTABLE)[number];

export type SetResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * Set one status on many days (the grid's bulk "Set to"). Today needs attendance.mark; earlier
 * days also attendance.edit_past (RLS enforces both; checked here first for a clear message).
 * Paid leave is refused beyond the person's balance for that month (PLAN §4.3).
 */
export async function setAttendance(
  cells: { staffId: string; date: string }[],
  status: Settable,
): Promise<SetResult> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('attendance.mark'))
    return { ok: false, error: t('attendance.readOnly') };
  if (!SETTABLE.includes(status) || cells.length === 0 || cells.length > 2000) {
    return { ok: false, error: t('attendance.errors.failed', { reason: 'invalid request' }) };
  }
  const today = todayIST();
  for (const c of cells) {
    if (!isBusinessDate(c.date))
      return { ok: false, error: t('attendance.errors.failed', { reason: c.date }) };
    if (compareDates(c.date, today) > 0) return { ok: false, error: t('attendance.errors.future') };
    if (compareDates(c.date, today) < 0 && !me.permissions.includes('attendance.edit_past')) {
      return { ok: false, error: t('attendance.errors.past') };
    }
  }

  const supabase = await createClient();
  if (status === 'paid_leave') {
    const problem = await paidLeaveProblem(supabase, me.shopId, cells);
    if (problem) return { ok: false, error: problem };
  }

  const { error } = await supabase.from('attendance').upsert(
    cells.map((c) => ({ shop_id: me.shopId, staff_id: c.staffId, date: c.date, status })),
    { onConflict: 'staff_id,date' },
  );
  if (error) return { ok: false, error: t('attendance.errors.failed', { reason: error.message }) };

  revalidatePath('/attendance');
  return { ok: true, count: cells.length };
}

/**
 * Remove the marks on these days, so each goes back to what the rules give it (not marked, or
 * the weekly off / holiday from the template). Same permission and date checks as setting a mark.
 */
export async function clearAttendance(
  cells: { staffId: string; date: string }[],
): Promise<SetResult> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('attendance.mark'))
    return { ok: false, error: t('attendance.readOnly') };
  if (cells.length === 0 || cells.length > 2000)
    return { ok: false, error: t('attendance.errors.failed', { reason: 'invalid request' }) };
  const today = todayIST();
  for (const c of cells) {
    if (!isBusinessDate(c.date))
      return { ok: false, error: t('attendance.errors.failed', { reason: c.date }) };
    if (compareDates(c.date, today) > 0) return { ok: false, error: t('attendance.errors.future') };
    if (compareDates(c.date, today) < 0 && !me.permissions.includes('attendance.edit_past')) {
      return { ok: false, error: t('attendance.errors.past') };
    }
  }

  const supabase = await createClient();
  for (const [staffId, group] of groupBy(cells, (c) => c.staffId)) {
    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('shop_id', me.shopId)
      .eq('staff_id', staffId)
      .in(
        'date',
        group.map((c) => c.date),
      );
    if (error)
      return { ok: false, error: t('attendance.errors.failed', { reason: error.message }) };
  }
  revalidatePath('/attendance');
  return { ok: true, count: cells.length };
}

/** Explain the first person who'd go past their paid leave for a month, or null. */
async function paidLeaveProblem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shopId: string,
  cells: { staffId: string; date: string }[],
): Promise<string | null> {
  const groups = groupBy(cells, (c) => `${c.staffId}|${c.date.slice(0, 7)}`);
  const staffIds = [...new Set(cells.map((c) => c.staffId))];
  const [staffQ, asgQ, verQ, attQ, balQ] = await Promise.all([
    supabase
      .from('staff')
      .select('person_id, joining_date, leaving_date, people!inner(name)')
      .in('person_id', staffIds),
    supabase.from('staff_leave_templates').select('*').in('staff_id', staffIds),
    supabase.from('leave_template_versions').select('*').eq('shop_id', shopId),
    supabase
      .from('attendance')
      .select('staff_id, date')
      .in('staff_id', staffIds)
      .eq('status', 'paid_leave'),
    supabase
      .from('leave_balances')
      .select('staff_id, year, month, carried')
      .in('staff_id', staffIds),
  ]);
  const staff = new Map((staffQ.data ?? []).map((s) => [s.person_id, s]));
  const assignments = groupBy((asgQ.data ?? []).map(toAssignment), (a) => a.staffId);
  const versions = Object.fromEntries(
    groupBy((verQ.data ?? []).map(toTemplateVersion), (v) => v.templateId),
  ) as Record<string, LeaveTemplateVersion[]>;

  for (const [key, group] of groups) {
    const [staffId, ym] = key.split('|') as [string, string];
    const s = staff.get(staffId);
    if (!s) continue;
    const { year, month } = monthOf(`${ym}-01`);
    const from = maxDate(monthStart(year, month), s.joining_date);
    const to = s.leaving_date
      ? minDate(monthEnd(year, month), s.leaving_date)
      : monthEnd(year, month);
    const version = templateVersionOn(assignments.get(staffId) ?? [], versions, to);
    const D = daysInMonth(year, month);
    const employed = Math.max(0, daysBetween(from, to) + 1);
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const opening = Number(
      (balQ.data ?? []).find(
        (b) => b.staff_id === staffId && b.year === prev.y && b.month === prev.m,
      )?.carried ?? 0,
    );
    const available = opening + (version ? earnedLeave(version, employed, D) : 0);
    const targets = new Set(group.map((c) => c.date));
    const usedElsewhere = (attQ.data ?? []).filter(
      (a) => a.staff_id === staffId && a.date.startsWith(ym) && !targets.has(a.date),
    ).length;
    if (usedElsewhere + targets.size > available) {
      return t('attendance.errors.leave', {
        name: s.people.name,
        left: Math.max(0, available - usedElsewhere),
      });
    }
  }
  return null;
}
