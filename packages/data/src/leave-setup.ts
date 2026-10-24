import { effectiveOn, type BusinessDate } from '@fincrew/core';
import { groupBy, toAssignment, toTemplateVersion } from './mappers';
import type { Supabase } from './client';

/**
 * A shop's leave templates with their dated versions, and which template each current staff
 * member is on today (settings screens).
 */
export async function loadLeaveSetup(supabase: Supabase, shopId: string, today: BusinessDate) {
  const [{ data: templates }, { data: versions }, { data: assignments }, { data: staff }] =
    await Promise.all([
      supabase
        .from('leave_templates')
        .select('id, name, archived')
        .eq('shop_id', shopId)
        .order('name'),
      supabase.from('leave_template_versions').select('*').eq('shop_id', shopId),
      supabase.from('staff_leave_templates').select('*').eq('shop_id', shopId),
      supabase
        .from('staff')
        .select('person_id, status, people!inner(name)')
        .eq('shop_id', shopId)
        .eq('status', 'active'),
    ]);
  const versionsByTemplate = groupBy((versions ?? []).map(toTemplateVersion), (v) => v.templateId);
  for (const list of versionsByTemplate.values())
    list.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const byStaff = groupBy((assignments ?? []).map(toAssignment), (a) => a.staffId);
  const names = new Map((templates ?? []).map((tpl) => [tpl.id, tpl.name]));

  const people = (staff ?? [])
    .map((s) => {
      const templateId = effectiveOn(byStaff.get(s.person_id) ?? [], today)?.templateId ?? null;
      return {
        id: s.person_id,
        name: s.people.name,
        templateId,
        templateName: templateId ? (names.get(templateId) ?? null) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { templates: templates ?? [], versionsByTemplate, staff: people };
}
