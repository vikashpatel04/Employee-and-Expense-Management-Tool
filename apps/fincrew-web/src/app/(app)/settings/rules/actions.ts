'use server';

import { revalidatePath } from 'next/cache';
import { parseRupees, parseTimeOfDay, validateShopRules, type ShopRules } from '@fincrew/core';
import type { Json } from '@fincrew/db';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';

export type RulesState = { error?: string; done?: string };

class FieldError extends Error {}

/** Read the rules form into a full rule set (shapes and defaults: packages/core settings.ts). */
function readRules(form: FormData): ShopRules {
  const text = (k: string) => String(form.get(k) ?? '').trim();
  const pick = <T extends string>(k: string, options: readonly T[]): T =>
    options.find((o) => o === text(k)) ?? options[0]!;
  const whole = (k: string, label: string) => {
    const n = Number(text(k));
    if (text(k) === '' || !Number.isInteger(n) || n < 0)
      throw new FieldError(t('settings.errors.whole', { field: t(label) }));
    return n;
  };
  const r = 'settings.rules';

  const dayRate = pick('dayRate', ['calendar_days', 'fixed_days'] as const);
  const chargeMode = pick('chargeMode', ['per_minute', 'per_late_day'] as const);
  let chargeAmount = 0;
  if (chargeMode === 'per_late_day') {
    const amount = parseRupees(text('chargeAmount'));
    if (amount === null)
      throw new FieldError(t('settings.errors.amount', { field: t(`${r}.late.chargeAmount`) }));
    chargeAmount = amount;
  }
  const rotation = pick('rotation', ['daily', 'manual'] as const);
  let atMinutes = 0;
  if (rotation === 'daily') {
    const at = parseTimeOfDay(text('rotateAt'));
    if (at === null)
      throw new FieldError(t('settings.errors.time', { field: t(`${r}.code.rotateAt`) }));
    atMinutes = at;
  }
  let smallExpenseLimit: number | undefined;
  if (text('smallLimit') !== '') {
    const limit = parseRupees(text('smallLimit'));
    if (limit === null)
      throw new FieldError(t('settings.errors.amount', { field: t(`${r}.expenses.smallLimit`) }));
    smallExpenseLimit = limit;
  }

  const rules: ShopRules = {
    pay: {
      dayRateBasis:
        dayRate === 'fixed_days'
          ? { mode: 'fixed_days', days: whole('fixedDays', `${r}.pay.fixedDays`) }
          : { mode: 'calendar_days' },
      offDayWork: pick('offDayWork', ['extra', 'replace', 'none'] as const),
      unmarkedDay: pick('unmarkedDay', ['unpaid', 'paid'] as const),
      holidayOnWeeklyOff: pick('holidayOnWeeklyOff', ['holiday', 'weekly_off'] as const),
      markOnOffDay: pick('markOnOffDay', ['ignore', 'apply'] as const),
    },
    late: {
      mode: pick('lateMode', ['notice_only', 'deduct'] as const),
      freeLateDays: whole('freeLateDays', `${r}.late.freeLateDays`),
      halfDayThresholdMinutes:
        text('halfDay') === '' ? null : whole('halfDay', `${r}.late.halfDay`),
      halfDayUsesFreeDay: form.get('halfDayUsesFreeDay') === 'on',
      earlyLeaving: form.get('earlyLeaving') === 'on',
      lateCountsFrom: pick('countsFrom', ['shift_start', 'grace_end'] as const),
      charge:
        chargeMode === 'per_late_day'
          ? { mode: 'per_late_day', amount: chargeAmount }
          : { mode: 'per_minute' },
    },
    attendanceCode: {
      rotation: rotation === 'daily' ? { mode: 'daily', atMinutes } : { mode: 'manual' },
      minGapMinutes: whole('minGap', `${r}.code.minGap`),
      cooldownMinutes: whole('cooldown', `${r}.code.cooldown`),
      checkOutRequired: form.get('checkOutRequired') === 'on',
      maxWrongCodes: whole('maxWrong', `${r}.code.maxWrong`),
      wrongCodeWindowMinutes: whole('wrongWindow', `${r}.code.wrongWindow`),
      lockoutMinutes: whole('lockout', `${r}.code.lockout`),
    },
  };
  return smallExpenseLimit === undefined ? rules : { ...rules, smallExpenseLimit };
}

/**
 * Save the shop's rules into `shops.settings`, keeping any other keys stored there. The whole
 * rule set is written, so later changes to code defaults never change a shop's rules silently.
 */
export async function saveRules(_prev: RulesState, form: FormData): Promise<RulesState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes(SETTINGS_SECTIONS.rules))
    return { error: t('settings.errors.noPermission') };

  let rules: ShopRules;
  try {
    rules = readRules(form);
  } catch (e) {
    if (e instanceof FieldError) return { error: e.message };
    throw e;
  }
  const problems = validateShopRules(rules);
  if (problems.length)
    return { error: t('settings.errors.invalid', { problems: problems.join('; ') }) };

  const supabase = await createClient();
  const { data: shop } = await supabase
    .from('shops')
    .select('settings')
    .eq('id', me.shopId)
    .single();
  const stored = (shop?.settings ?? {}) as Record<string, unknown>;
  // A cleared small-expense limit must disappear, not linger from before.
  const { smallExpenseLimit: _old, ...rest } = stored;
  const { error, count } = await supabase
    .from('shops')
    .update({ settings: { ...rest, ...rules } as unknown as Json }, { count: 'exact' })
    .eq('id', me.shopId);
  if (error || count === 0)
    return { error: t('settings.errors.failed', { reason: error?.message ?? '—' }) };
  revalidatePath('/settings/rules');
  revalidatePath('/salary');
  revalidatePath('/attendance');
  return { done: t('settings.rules.done') };
}
