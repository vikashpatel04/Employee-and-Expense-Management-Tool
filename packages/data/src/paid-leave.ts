import {
  compareDates,
  daysBetween,
  earnedLeave,
  employedPart,
  payPeriodOn,
  personPayDay,
  shiftMonth,
  templateVersionOn,
  type LeaveTemplateVersion,
} from '@fincrew/core';
import type { Supabase } from './client';
import { groupBy, toAssignment, toPaySettings, toShopRules, toTemplateVersion } from './mappers';

/**
 * Marking paid leave is refused beyond a person's balance for that pay period (PLAN §4.3). Returns
 * the first person who'd go past it, with how many paid leaves they have left, or null.
 */
export async function paidLeaveShortfall(
  supabase: Supabase,
  shopId: string,
  cells: { staffId: string; date: string }[],
): Promise<{ name: string; left: number } | null> {
  const staffIds = [...new Set(cells.map((c) => c.staffId))];
  const [staffQ, asgQ, verQ, attQ, balQ, payQ, shopQ] = await Promise.all([
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
    supabase.from('pay_settings').select('*').in('staff_id', staffIds),
    supabase.from('shops').select('settings').eq('id', shopId).single(),
  ]);
  const staff = new Map((staffQ.data ?? []).map((s) => [s.person_id, s]));
  const assignments = groupBy((asgQ.data ?? []).map(toAssignment), (a) => a.staffId);
  const versions = Object.fromEntries(
    groupBy((verQ.data ?? []).map(toTemplateVersion), (v) => v.templateId),
  ) as Record<string, LeaveTemplateVersion[]>;
  const rules = toShopRules(shopQ.data?.settings).pay;
  const pays = groupBy((payQ.data ?? []).map(toPaySettings), (p) => p.staffId);

  // Each cell's pay period: the balance belongs to the period, not the calendar month.
  const periodOf = (c: { staffId: string; date: string }) => {
    const s = staff.get(c.staffId);
    if (!s) return null;
    return payPeriodOn(
      c.date,
      personPayDay(rules, s.joining_date, pays.get(c.staffId) ?? [], c.date),
    );
  };
  const groups = groupBy(cells, (c) => {
    const p = periodOf(c);
    return `${c.staffId}|${p?.year}-${p?.month}`;
  });

  for (const group of groups.values()) {
    const { staffId } = group[0]!;
    const s = staff.get(staffId);
    const period = periodOf(group[0]!);
    if (!s || !period) continue;
    const { year, month } = period;
    const { from, to } = employedPart(period, s.joining_date, s.leaving_date);
    const version = templateVersionOn(assignments.get(staffId) ?? [], versions, to);
    const employed = Math.max(0, daysBetween(from, to) + 1);
    const prev = shiftMonth(year, month, -1);
    const opening = Number(
      (balQ.data ?? []).find(
        (b) => b.staff_id === staffId && b.year === prev.year && b.month === prev.month,
      )?.carried ?? 0,
    );
    const available = opening + (version ? earnedLeave(version, employed, period.cycleDays) : 0);
    const targets = new Set(group.map((c) => c.date));
    const usedElsewhere = (attQ.data ?? []).filter(
      (a) =>
        a.staff_id === staffId &&
        compareDates(a.date, period.from) >= 0 &&
        compareDates(a.date, period.to) <= 0 &&
        !targets.has(a.date),
    ).length;
    if (usedElsewhere + targets.size > available) {
      return { name: s.people.name, left: Math.max(0, available - usedElsewhere) };
    }
  }
  return null;
}
