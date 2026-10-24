'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  DEFAULT_SANDWICH_RULE,
  parseDisplayDate,
  validateTemplateVersion,
  type CarryOver,
  type LeaveAccrual,
  type LeaveTemplateVersion,
  type SandwichRule,
  type SandwichTrigger,
} from '@fincrew/core';
import type { Json } from '@fincrew/db';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';

export type LeaveState = { error?: string; done?: string };

const TRIGGERS: SandwichTrigger[] = ['absent', 'unpaid_leave', 'half_day', 'unmarked'];
const APPLIES = ['weekly_off', 'holiday'] as const;

/** Whole number ≥ 0 from a field; null when it isn't one. */
function whole(text: string): number | null {
  const n = Number(text);
  return text !== '' && Number.isInteger(n) && n >= 0 ? n : null;
}

/** Read the version fields of the leave form (shapes: packages/core leave.ts). */
function readVersion(form: FormData): { version: LeaveTemplateVersion } | { error: string } {
  const text = (k: string) => String(form.get(k) ?? '').trim();
  const f = 'settings.leave.form';

  const effectiveFrom = parseDisplayDate(text('effectiveFrom'));
  if (!effectiveFrom) return { error: t('common.invalidDate') };

  const weeklyOffs = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => {
    const kind = text(`off${d}`);
    return kind === 'paid' || kind === 'unpaid' ? [{ weekday: d, paid: kind === 'paid' }] : [];
  });

  const paidLeavesPerMonth = whole(text('paidLeaves'));
  if (paidLeavesPerMonth === null)
    return { error: t('settings.errors.whole', { field: t(`${f}.paidLeaves`) }) };

  let carryOver: CarryOver;
  const carryMode = text('carry');
  if (carryMode === 'carry') {
    const cap = text('cap') === '' ? undefined : whole(text('cap'));
    if (cap === null) return { error: t('settings.errors.whole', { field: t(`${f}.cap`) }) };
    carryOver = cap === undefined ? { mode: 'carry' } : { mode: 'carry', cap };
  } else if (carryMode === 'carry_within_year' || carryMode === 'payout') {
    carryOver = { mode: carryMode, resetMonth: Number(text('resetMonth')) };
  } else {
    carryOver = { mode: 'lapse' };
  }

  const rounding = text('rounding');
  const accrual: LeaveAccrual =
    text('accrual') === 'prorated'
      ? {
          mode: 'prorated',
          rounding: rounding === 'nearest' || rounding === 'up' ? rounding : 'down',
        }
      : { mode: 'full' };

  const enabled = form.get('sandwich') === 'on';
  const triggers = TRIGGERS.filter((x) => form.getAll('triggers').includes(x));
  const appliesTo = APPLIES.filter((x) => form.getAll('appliesTo').includes(x));
  // When the rule is off, keep tidy defaults for whatever wasn't ticked.
  const sandwich: SandwichRule = {
    enabled,
    triggers: triggers.length || enabled ? triggers : DEFAULT_SANDWICH_RULE.triggers,
    appliesTo: appliesTo.length || enabled ? appliesTo : DEFAULT_SANDWICH_RULE.appliesTo,
    sides: text('sides') === 'either' ? 'either' : 'both',
  };

  const version: LeaveTemplateVersion = {
    effectiveFrom,
    weeklyOffs,
    paidLeavesPerMonth,
    carryOver,
    sandwich,
    accrual,
  };
  const problems = validateTemplateVersion(version);
  if (problems.length)
    return { error: t('settings.errors.invalid', { problems: problems.join('; ') }) };
  return { version };
}

const versionRow = (v: LeaveTemplateVersion) => ({
  effective_from: v.effectiveFrom,
  weekly_offs: v.weeklyOffs as unknown as Json,
  paid_leaves_per_month: v.paidLeavesPerMonth,
  carry_over: v.carryOver as unknown as Json,
  sandwich: v.sandwich as unknown as Json,
  accrual: v.accrual as unknown as Json,
});

async function allowed() {
  const me = await requireMe();
  return me && me.permissions.includes(SETTINGS_SECTIONS.leave) ? me : null;
}

/** New template with its first rules; opens it so staff can be moved onto it. */
export async function createTemplate(_prev: LeaveState, form: FormData): Promise<LeaveState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: t('settings.leave.errors.name') };
  // Check the rules first: templates can't be deleted, so don't leave an empty one behind.
  const read = readVersion(form);
  if ('error' in read) return read;

  const supabase = await createClient();
  const { data: tpl, error } = await supabase
    .from('leave_templates')
    .insert({ shop_id: me.shopId, name })
    .select('id')
    .single();
  if (error) {
    return error.code === '23505'
      ? { error: t('settings.leave.errors.nameTaken') }
      : { error: t('settings.errors.failed', { reason: error.message }) };
  }
  const { error: vErr } = await supabase
    .from('leave_template_versions')
    .insert({ shop_id: me.shopId, template_id: tpl.id, ...versionRow(read.version) });
  if (vErr) return { error: t('settings.errors.failed', { reason: vErr.message }) };
  redirect(`/settings/leave/${tpl.id}?saved=1`);
}

/** Rules from a date. Same date as an existing version replaces it. */
export async function saveVersion(
  templateId: string,
  _prev: LeaveState,
  form: FormData,
): Promise<LeaveState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const read = readVersion(form);
  if ('error' in read) return read;
  const supabase = await createClient();
  const { error } = await supabase
    .from('leave_template_versions')
    .upsert(
      { shop_id: me.shopId, template_id: templateId, ...versionRow(read.version) },
      { onConflict: 'template_id,effective_from' },
    );
  if (error) return { error: t('settings.errors.failed', { reason: error.message }) };
  revalidatePath(`/settings/leave/${templateId}`);
  revalidatePath('/settings/leave');
  return { done: t('settings.leave.detail.saved') };
}

export async function renameTemplate(
  templateId: string,
  _prev: LeaveState,
  form: FormData,
): Promise<LeaveState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: t('settings.leave.errors.name') };
  const supabase = await createClient();
  const { error } = await supabase
    .from('leave_templates')
    .update({ name })
    .eq('id', templateId)
    .eq('shop_id', me.shopId);
  if (error) {
    return error.code === '23505'
      ? { error: t('settings.leave.errors.nameTaken') }
      : { error: t('settings.errors.failed', { reason: error.message }) };
  }
  revalidatePath(`/settings/leave/${templateId}`);
  revalidatePath('/settings/leave');
  return { done: t('settings.leave.detail.saved') };
}

export async function setArchived(templateId: string, archived: boolean): Promise<LeaveState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const supabase = await createClient();
  const { error } = await supabase
    .from('leave_templates')
    .update({ archived })
    .eq('id', templateId)
    .eq('shop_id', me.shopId);
  if (error) return { error: t('settings.errors.failed', { reason: error.message }) };
  revalidatePath(`/settings/leave/${templateId}`);
  revalidatePath('/settings/leave');
  return {};
}

/**
 * Move the ticked staff onto this template from a date (a dated assignment; earlier months keep
 * their template). Assignments are part of a person's setup, so this needs `staff.edit` (RLS).
 */
export async function assignStaff(
  templateId: string,
  _prev: LeaveState,
  form: FormData,
): Promise<LeaveState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('staff.edit'))
    return { error: t('settings.errors.noPermission') };
  const date = parseDisplayDate(String(form.get('from') ?? ''));
  if (!date) return { error: t('common.invalidDate') };
  const staffIds = form.getAll('staff').map(String);
  if (staffIds.length === 0) return { error: t('settings.leave.errors.noStaff') };

  const supabase = await createClient();
  const { data: tpl } = await supabase
    .from('leave_templates')
    .select('archived')
    .eq('id', templateId)
    .maybeSingle();
  if (tpl?.archived) return { error: t('settings.leave.errors.archived') };

  const { error } = await supabase.from('staff_leave_templates').upsert(
    staffIds.map((staffId) => ({
      shop_id: me.shopId,
      staff_id: staffId,
      template_id: templateId,
      effective_from: date,
    })),
    { onConflict: 'staff_id,effective_from' },
  );
  if (error) return { error: t('settings.errors.failed', { reason: error.message }) };
  revalidatePath(`/settings/leave/${templateId}`);
  revalidatePath('/settings/leave');
  revalidatePath('/attendance');
  return { done: t('settings.leave.detail.assigned', { count: staffIds.length }) };
}
