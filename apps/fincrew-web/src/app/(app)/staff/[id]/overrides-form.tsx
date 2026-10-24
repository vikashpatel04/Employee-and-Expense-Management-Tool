'use client';

import { useState } from 'react';
import {
  formatDisplayDate,
  formatINR,
  paiseToInput,
  type LatePolicy,
  type PayRules,
  type ShopRules,
} from '@fincrew/core';
import { t } from '@/lib/i18n';
import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, dateFieldProps, inputClass } from '../../../components';
import { FormMessage } from '../../settings/holidays/holiday-forms';
import { saveOverrides, type OverrideState } from './rules-actions';

const r = 'settings.rules';
const o = 'staffDetail.rules';

/** A choice whose first option is "Shop's rule (…)". */
function Override({
  name,
  label,
  shopValue,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  shopValue: string;
  /** option value → label */
  options: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-label-sm block">
      {label}
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        <option value="">{t(`${o}.shop`, { value: shopValue })}</option>
        {Object.entries(options).map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberInput({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="text-label-sm block pl-4">
      {label}
      <input name={name} required inputMode="decimal" defaultValue={value} className={inputClass} />
    </label>
  );
}

const labels = (prefix: string, values: readonly string[]) =>
  Object.fromEntries(values.map((v) => [v, t(`${prefix}.${v}`)]));
const yesNo = () => ({ yes: t(`${o}.yes`), no: t(`${o}.no`) });

/**
 * Rules just for one person, from a date: each field is the shop's rule unless changed here
 * (stored as `pay_rules_override` / `late_policy_override` on their pay settings).
 */
export function OverridesForm({
  staffId,
  shop,
  pay,
  late,
  defaultDate,
}: {
  staffId: string;
  shop: ShopRules;
  pay: Partial<PayRules>;
  late: Partial<LatePolicy>;
  defaultDate: string;
}) {
  const [state, onSubmit, pending] = useFormAction<OverrideState>(
    saveOverrides.bind(null, staffId),
    {},
  );
  const bool = (v: boolean | undefined) => (v === undefined ? '' : v ? 'yes' : 'no');
  const [v, setV] = useState<Record<string, string>>({
    dayRate: pay.dayRateBasis?.mode ?? '',
    offDayWork: pay.offDayWork ?? '',
    unmarkedDay: pay.unmarkedDay ?? '',
    holidayOnWeeklyOff: pay.holidayOnWeeklyOff ?? '',
    markOnOffDay: pay.markOnOffDay ?? '',
    lateMode: late.mode ?? '',
    halfDay:
      late.halfDayThresholdMinutes === undefined
        ? ''
        : late.halfDayThresholdMinutes === null
          ? 'never'
          : 'minutes',
    halfDayUsesFreeDay: bool(late.halfDayUsesFreeDay),
    earlyLeaving: bool(late.earlyLeaving),
    countsFrom: late.lateCountsFrom ?? '',
    chargeMode: late.charge?.mode ?? '',
  });
  const field = (key: string) => ({
    name: key,
    value: v[key] ?? '',
    onChange: (x: string) => setV((s) => ({ ...s, [key]: x })),
  });
  const s = shop;
  const sb = (x: boolean) => (x ? t(`${o}.yes`) : t(`${o}.no`));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="text-label-sm block">
        {t(`${o}.from`)}
        <input
          name="from"
          required
          {...dateFieldProps}
          defaultValue={formatDisplayDate(defaultDate)}
          className={inputClass}
        />
      </label>

      <h4 className="text-label mt-2">{t(`${r}.pay.title`)}</h4>
      <Override
        {...field('dayRate')}
        label={t(`${r}.pay.dayRate`)}
        shopValue={
          s.pay.dayRateBasis.mode === 'fixed_days'
            ? `${t(`${r}.pay.dayRateModes.fixed_days`)}: ${s.pay.dayRateBasis.days}`
            : t(`${r}.pay.dayRateModes.calendar_days`)
        }
        options={labels(`${r}.pay.dayRateModes`, ['calendar_days', 'fixed_days'])}
      />
      {v.dayRate === 'fixed_days' && (
        <NumberInput
          name="fixedDays"
          label={t(`${r}.pay.fixedDays`)}
          value={String(pay.dayRateBasis?.mode === 'fixed_days' ? pay.dayRateBasis.days : 30)}
        />
      )}
      <Override
        {...field('offDayWork')}
        label={t(`${r}.pay.offDayWork`)}
        shopValue={t(`${r}.pay.offDayWorkModes.${s.pay.offDayWork}`)}
        options={labels(`${r}.pay.offDayWorkModes`, ['extra', 'replace', 'none'])}
      />
      <Override
        {...field('unmarkedDay')}
        label={t(`${r}.pay.unmarkedDay`)}
        shopValue={t(`${r}.pay.unmarkedModes.${s.pay.unmarkedDay}`)}
        options={labels(`${r}.pay.unmarkedModes`, ['unpaid', 'paid'])}
      />
      <Override
        {...field('holidayOnWeeklyOff')}
        label={t(`${r}.pay.holidayOnWeeklyOff`)}
        shopValue={t(`${r}.pay.holidayModes.${s.pay.holidayOnWeeklyOff}`)}
        options={labels(`${r}.pay.holidayModes`, ['holiday', 'weekly_off'])}
      />
      <Override
        {...field('markOnOffDay')}
        label={t(`${r}.pay.markOnOffDay`)}
        shopValue={t(`${r}.pay.markModes.${s.pay.markOnOffDay}`)}
        options={labels(`${r}.pay.markModes`, ['ignore', 'apply'])}
      />

      <h4 className="text-label mt-2">{t(`${r}.late.title`)}</h4>
      <Override
        {...field('lateMode')}
        label={t(`${r}.late.mode`)}
        shopValue={t(`${r}.late.modes.${s.late.mode}`)}
        options={labels(`${r}.late.modes`, ['notice_only', 'deduct'])}
      />
      <label className="text-label-sm block">
        {t(`${r}.late.freeLateDays`)}
        <input
          name="freeLateDays"
          inputMode="numeric"
          defaultValue={late.freeLateDays ?? ''}
          className={inputClass}
        />
        <span className="text-caption font-normal text-[var(--ink-muted)]">
          {t(`${o}.blankForShop`, { value: s.late.freeLateDays })}
        </span>
      </label>
      <Override
        {...field('halfDay')}
        label={t(`${r}.late.halfDay`)}
        shopValue={
          s.late.halfDayThresholdMinutes === null
            ? t(`${o}.never`)
            : String(s.late.halfDayThresholdMinutes)
        }
        options={{ never: t(`${o}.never`), minutes: t(`${o}.afterMinutes`) }}
      />
      {v.halfDay === 'minutes' && (
        <NumberInput
          name="halfDayMinutes"
          label={t(`${o}.minutes`)}
          value={String(late.halfDayThresholdMinutes ?? s.late.halfDayThresholdMinutes ?? 120)}
        />
      )}
      <Override
        {...field('halfDayUsesFreeDay')}
        label={t(`${r}.late.halfDayUsesFreeDay`)}
        shopValue={sb(s.late.halfDayUsesFreeDay)}
        options={yesNo()}
      />
      <Override
        {...field('earlyLeaving')}
        label={t(`${r}.late.earlyLeaving`)}
        shopValue={sb(s.late.earlyLeaving)}
        options={yesNo()}
      />
      <Override
        {...field('countsFrom')}
        label={t(`${r}.late.countsFrom`)}
        shopValue={t(`${r}.late.countsFromModes.${s.late.lateCountsFrom}`)}
        options={labels(`${r}.late.countsFromModes`, ['shift_start', 'grace_end'])}
      />
      <Override
        {...field('chargeMode')}
        label={t(`${r}.late.charge`)}
        shopValue={
          s.late.charge.mode === 'per_late_day'
            ? `${t(`${r}.late.chargeModes.per_late_day`)}: ${formatINR(s.late.charge.amount)}`
            : t(`${r}.late.chargeModes.per_minute`)
        }
        options={labels(`${r}.late.chargeModes`, ['per_minute', 'per_late_day'])}
      />
      {v.chargeMode === 'per_late_day' && (
        <NumberInput
          name="chargeAmount"
          label={t(`${o}.amount`)}
          value={late.charge?.mode === 'per_late_day' ? paiseToInput(late.charge.amount) : ''}
        />
      )}

      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t('staffDetail.saving') : t(`${o}.save`)}
      </button>
    </form>
  );
}
