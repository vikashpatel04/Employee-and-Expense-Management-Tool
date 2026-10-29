import {
  parseDisplayDate,
  parseRupees,
  parseTimeOfDay,
  type AdvanceCutMode,
  type BusinessDate,
} from '@fincrew/core';
import type { Supabase } from './client';

type Ctx = { shopId: string; permissions: readonly string[] };

export const PAY_TYPES = ['monthly', 'daily', 'hourly'] as const;
export type PayType = (typeof PAY_TYPES)[number];

export type PayWriteResult =
  | { ok: true; effectiveFrom: BusinessDate }
  | {
      ok: false;
      reason: 'no_permission' | 'date' | 'amount' | 'overtime' | 'shift' | 'grace' | 'hours';
    }
  | { ok: false; reason: 'failed'; message: string };

/**
 * "Change pay from a date" (needs staff.pay.edit): a dated pay version, so earlier months keep
 * their pay (PLAN §4.6). Fields as typed: DD/MM/YYYY, rupees, "HH:MM", minutes, hours; blank
 * overtime / shift / hours = none, blank grace = 10 minutes. The new version keeps the person's
 * own rules from the version it follows. Used by the website and the app.
 */
export async function savePay(
  supabase: Supabase,
  input: Ctx & {
    staffId: string;
    effectiveFrom: string;
    payType: string;
    amount: string;
    overtime: string;
    shiftStart: string;
    shiftEnd: string;
    grace: string;
    hoursPerDay: string;
  },
): Promise<PayWriteResult> {
  if (!input.permissions.includes('staff.pay.edit')) return { ok: false, reason: 'no_permission' };
  const text = (v: string) => v.trim();

  const effectiveFrom = parseDisplayDate(text(input.effectiveFrom));
  if (!effectiveFrom) return { ok: false, reason: 'date' };
  const payType = PAY_TYPES.find((p) => p === text(input.payType));
  const amount = parseRupees(text(input.amount));
  if (!payType || amount === null) return { ok: false, reason: 'amount' };

  const overtimeText = text(input.overtime);
  const overtime = overtimeText === '' ? null : parseRupees(overtimeText);
  if (overtimeText !== '' && overtime === null) return { ok: false, reason: 'overtime' };

  const startText = text(input.shiftStart);
  const endText = text(input.shiftEnd);
  const shiftStart = startText ? parseTimeOfDay(startText) : null;
  const shiftEnd = endText ? parseTimeOfDay(endText) : null;
  const shiftOk =
    (!startText && !endText) || (shiftStart !== null && shiftEnd !== null && shiftEnd > shiftStart);
  if (!shiftOk) return { ok: false, reason: 'shift' };

  const grace = Number(text(input.grace) || '10');
  if (!Number.isInteger(grace) || grace < 0) return { ok: false, reason: 'grace' };

  const hoursText = text(input.hoursPerDay);
  const hours = hoursText === '' ? null : Number(hoursText);
  if (hours !== null && !(hours > 0 && hours <= 24)) return { ok: false, reason: 'hours' };

  const { data: before } = await supabase
    .from('pay_settings')
    .select('pay_rules_override, late_policy_override')
    .eq('staff_id', input.staffId)
    .lte('effective_from', effectiveFrom)
    .order('effective_from', { ascending: false })
    .limit(1);
  const { error } = await supabase.from('pay_settings').upsert(
    {
      ...before?.[0],
      shop_id: input.shopId,
      staff_id: input.staffId,
      effective_from: effectiveFrom,
      pay_type: payType,
      monthly_salary_paise: payType === 'monthly' ? amount : null,
      daily_wage_paise: payType === 'daily' ? amount : null,
      hourly_rate_paise: payType === 'hourly' ? amount : null,
      overtime_rate_paise: overtime,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      grace_minutes: grace,
      day_minutes: hours === null ? null : Math.round(hours * 60),
    },
    { onConflict: 'staff_id,effective_from' },
  );
  if (error) return { ok: false, reason: 'failed', message: error.message };
  return { ok: true, effectiveFrom };
}

export type AdvanceSettingsResult =
  | { ok: true }
  | { ok: false; reason: 'no_permission' }
  | { ok: false; reason: 'amount' }
  | { ok: false; reason: 'failed'; message: string };

/**
 * How the salary run settles a person's money (needs staff.edit): advance limit (rupees, blank =
 * no limit), advance cut mode (all / fixed monthly cut, the rest carries / none), and whether
 * expenses are paid back and charges cut through the salary.
 */
export async function saveAdvanceSettings(
  supabase: Supabase,
  input: Ctx & {
    staffId: string;
    limit: string;
    mode: AdvanceCutMode;
    cut: string;
    payback: boolean;
    recover: boolean;
  },
): Promise<AdvanceSettingsResult> {
  if (!input.permissions.includes('staff.edit')) return { ok: false, reason: 'no_permission' };
  if (!['all', 'fixed', 'none'].includes(input.mode)) return { ok: false, reason: 'amount' };
  const read = (v: string) => (v.trim() === '' ? null : parseRupees(v.trim()));
  const limit = read(input.limit);
  const cut = read(input.cut);
  if ((input.limit.trim() && limit === null) || (input.cut.trim() && cut === null))
    return { ok: false, reason: 'amount' };
  // A fixed cut needs an amount; other modes keep the last one typed for switching back.
  if (input.mode === 'fixed' && !cut) return { ok: false, reason: 'amount' };
  const { error, count } = await supabase
    .from('staff')
    .update(
      {
        advance_limit_paise: limit,
        advance_cut_mode: input.mode,
        ...(cut !== null ? { advance_cut_paise: cut } : {}),
        expense_payback: input.payback,
        expense_recover: input.recover,
      },
      { count: 'exact' },
    )
    .eq('person_id', input.staffId)
    .eq('shop_id', input.shopId);
  if (error || count === 0) return { ok: false, reason: 'failed', message: error?.message ?? '—' };
  return { ok: true };
}
