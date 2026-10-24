'use server';

import { revalidatePath } from 'next/cache';
import {
  parseDisplayDate,
  parseRupees,
  validateShopRules,
  withOverride,
  type LatePolicy,
  type PayRules,
} from '@fincrew/core';
import type { Json } from '@fincrew/db';
import { t } from '@/lib/i18n';
import { toShopRules } from '@/lib/mappers';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type OverrideState = { error?: string; done?: string };

class FieldError extends Error {}

/** Read the "rules just for this person" form; an empty choice means "shop's rule" (left out). */
function readOverrides(form: FormData): { pay: Partial<PayRules>; late: Partial<LatePolicy> } {
  const text = (k: string) => String(form.get(k) ?? '').trim();
  const choice = <T extends string>(k: string, options: readonly T[]): T | undefined =>
    options.find((o) => o === text(k));
  const whole = (k: string, label: string, min = 0) => {
    const n = Number(text(k));
    if (text(k) === '' || !Number.isInteger(n) || n < min)
      throw new FieldError(t('settings.errors.whole', { field: t(label) }));
    return n;
  };
  const r = 'settings.rules';
  const pay: Partial<PayRules> = {};
  const late: Partial<LatePolicy> = {};

  const dayRate = choice('dayRate', ['calendar_days', 'fixed_days'] as const);
  if (dayRate === 'calendar_days') pay.dayRateBasis = { mode: 'calendar_days' };
  if (dayRate === 'fixed_days')
    pay.dayRateBasis = { mode: 'fixed_days', days: whole('fixedDays', `${r}.pay.fixedDays`, 1) };
  const offDayWork = choice('offDayWork', ['extra', 'replace', 'none'] as const);
  if (offDayWork) pay.offDayWork = offDayWork;
  const unmarkedDay = choice('unmarkedDay', ['unpaid', 'paid'] as const);
  if (unmarkedDay) pay.unmarkedDay = unmarkedDay;
  const holiday = choice('holidayOnWeeklyOff', ['holiday', 'weekly_off'] as const);
  if (holiday) pay.holidayOnWeeklyOff = holiday;
  const mark = choice('markOnOffDay', ['ignore', 'apply'] as const);
  if (mark) pay.markOnOffDay = mark;

  const mode = choice('lateMode', ['notice_only', 'deduct'] as const);
  if (mode) late.mode = mode;
  if (text('freeLateDays') !== '')
    late.freeLateDays = whole('freeLateDays', `${r}.late.freeLateDays`);
  const halfDay = choice('halfDay', ['never', 'minutes'] as const);
  if (halfDay === 'never') late.halfDayThresholdMinutes = null;
  if (halfDay === 'minutes')
    late.halfDayThresholdMinutes = whole('halfDayMinutes', `${r}.late.halfDay`, 1);
  const usesFree = choice('halfDayUsesFreeDay', ['yes', 'no'] as const);
  if (usesFree) late.halfDayUsesFreeDay = usesFree === 'yes';
  const early = choice('earlyLeaving', ['yes', 'no'] as const);
  if (early) late.earlyLeaving = early === 'yes';
  const from = choice('countsFrom', ['shift_start', 'grace_end'] as const);
  if (from) late.lateCountsFrom = from;
  const charge = choice('chargeMode', ['per_minute', 'per_late_day'] as const);
  if (charge === 'per_minute') late.charge = { mode: 'per_minute' };
  if (charge === 'per_late_day') {
    const amount = parseRupees(text('chargeAmount'));
    if (amount === null)
      throw new FieldError(t('settings.errors.amount', { field: t(`${r}.late.chargeAmount`) }));
    late.charge = { mode: 'per_late_day', amount };
  }
  return { pay, late };
}

/**
 * Save this person's own rules from a date. They live on the pay settings version in effect from
 * that date (a copy is started on that date if needed) and every later version, so they hold
 * "from this date on", like every other dated setting.
 */
export async function saveOverrides(
  staffId: string,
  _prev: OverrideState,
  form: FormData,
): Promise<OverrideState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('staff.pay.edit'))
    return { error: t('settings.errors.noPermission') };
  const date = parseDisplayDate(String(form.get('from') ?? ''));
  if (!date) return { error: t('common.invalidDate') };
  let overrides: ReturnType<typeof readOverrides>;
  try {
    overrides = readOverrides(form);
  } catch (e) {
    if (e instanceof FieldError) return { error: e.message };
    throw e;
  }

  const supabase = await createClient();
  const [{ data: shop }, { data: versions }] = await Promise.all([
    supabase.from('shops').select('settings').eq('id', me.shopId).single(),
    supabase
      .from('pay_settings')
      .select('*')
      .eq('staff_id', staffId)
      .lte('effective_from', date)
      .order('effective_from', { ascending: false })
      .limit(1),
  ]);
  const shopRules = toShopRules(shop?.settings);
  const problems = validateShopRules({
    ...shopRules,
    pay: withOverride(shopRules.pay, overrides.pay),
    late: withOverride(shopRules.late, overrides.late),
  });
  if (problems.length)
    return { error: t('settings.errors.invalid', { problems: problems.join('; ') }) };

  const base = versions?.[0];
  if (!base) return { error: t('staffDetail.rules.noPay') };
  const fields = {
    pay_rules_override: overrides.pay as unknown as Json,
    late_policy_override: overrides.late as unknown as Json,
  };
  if (base.effective_from !== date) {
    // Start a version on this date with the same pay.
    const { id: _id, created_at: _created, ...copy } = base;
    const { error } = await supabase
      .from('pay_settings')
      .insert({ ...copy, effective_from: date, ...fields });
    if (error) return { error: t('staffDetail.pay.form.errors.failed', { reason: error.message }) };
  }
  const { error } = await supabase
    .from('pay_settings')
    .update(fields)
    .eq('staff_id', staffId)
    .gte('effective_from', date);
  if (error) return { error: t('staffDetail.pay.form.errors.failed', { reason: error.message }) };
  revalidatePath(`/staff/${staffId}`);
  revalidatePath('/attendance');
  revalidatePath('/salary');
  return { done: t('staffDetail.rules.saved') };
}
