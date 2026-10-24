import {
  daysBetween,
  daysInMonth,
  earnedLeave,
  maxDate,
  minDate,
  monthEnd,
  monthOf,
  monthStart,
  templateVersionOn,
  type LeaveTemplateVersion,
} from '@fincrew/core';
import type { Supabase } from './client';
import { groupBy, toAssignment, toTemplateVersion } from './mappers';

/**
 * Marking paid leave is refused beyond a person's balance for that month (PLAN §4.3). Returns
 * the first person who'd go past it, with how many paid leaves they have left, or null.
 */
export async function paidLeaveShortfall(
  supabase: Supabase,
  shopId: string,
  cells: { staffId: string; date: string }[],
): Promise<{ name: string; left: number } | null> {
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
      return { name: s.people.name, left: Math.max(0, available - usedElsewhere) };
    }
  }
  return null;
}
