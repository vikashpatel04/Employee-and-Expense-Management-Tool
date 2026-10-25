'use client';

import { useState, type ReactNode } from 'react';
import { minutesToInput, paiseToInput, type ShopRules } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { useDialogDone } from '@/components/app/form-dialog';
import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, inputClass } from '../../../components';
import { FormMessage } from '../holidays/holiday-forms';
import { saveRules, type RulesState } from './actions';

const r = 'settings.rules';
const card = 'flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-xs';
const checkbox = 'h-5 w-5 shrink-0 accent-[var(--accent)]';

function Choice({
  name,
  label,
  options,
  value,
  onChange,
  hint,
}: {
  name: string;
  label: string;
  /** option value → i18n key */
  options: Record<string, string>;
  value: string;
  onChange?: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="text-label-sm block">
      {label}
      <select
        name={name}
        {...(onChange
          ? { value, onChange: (e) => onChange(e.target.value) }
          : { defaultValue: value })}
        className={inputClass}
      >
        {Object.entries(options).map(([v, key]) => (
          <option key={v} value={v}>
            {t(key)}
          </option>
        ))}
      </select>
      {hint && <span className="text-caption font-normal text-[var(--ink-muted)]">{hint}</span>}
    </label>
  );
}

function NumberField({
  name,
  label,
  value,
  hint,
  required = true,
  decimal,
}: {
  name: string;
  label: string;
  value: string | number;
  hint?: string;
  required?: boolean;
  decimal?: boolean;
}) {
  return (
    <label className="text-label-sm block">
      {label}
      <input
        name={name}
        required={required}
        inputMode={decimal ? 'decimal' : 'numeric'}
        defaultValue={value}
        className={inputClass}
      />
      {hint && <span className="text-caption font-normal text-[var(--ink-muted)]">{hint}</span>}
    </label>
  );
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="text-body flex min-h-12 items-center gap-3">
      <input type="checkbox" name={name} defaultChecked={checked} className={checkbox} />
      {label}
    </label>
  );
}

function Section({
  title,
  grow = false,
  children,
}: {
  title: string;
  /** Fill the rest of its column (the last card in a stacked column). */
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`${card} ${grow ? 'flex-1' : ''}`}>
      <h2 className="text-title-md">{title}</h2>
      {children}
    </section>
  );
}

const keys = (prefix: string, values: readonly string[]) =>
  Object.fromEntries(values.map((v) => [v, `${prefix}.${v}`]));

/** Every shop rule on one form, prefilled with the shop's current values (or the defaults). */
export function RulesForm({ rules }: { rules: ShopRules }) {
  const [state, onSubmit, pending] = useFormAction<RulesState>(saveRules, {});
  useDialogDone(state);
  const [dayRate, setDayRate] = useState(rules.pay.dayRateBasis.mode);
  const [chargeMode, setChargeMode] = useState(rules.late.charge.mode);
  const [rotation, setRotation] = useState(rules.attendanceCode.rotation.mode);
  const { pay, late, attendanceCode: code, staffLogin: login } = rules;

  return (
    <form onSubmit={onSubmit} className="grid items-stretch gap-4 lg:grid-cols-2">
      {/* Rows of equal height: Pay | Coming late, then Attendance code | Expenses + Staff sign-in. */}
      <Section title={t(`${r}.pay.title`)}>
        <Choice
          name="dayRate"
          label={t(`${r}.pay.dayRate`)}
          options={keys(`${r}.pay.dayRateModes`, ['calendar_days', 'fixed_days'])}
          value={dayRate}
          onChange={(v) => setDayRate(v as typeof dayRate)}
          hint={t(`${r}.pay.dayRateHint`)}
        />
        {dayRate === 'fixed_days' && (
          <NumberField
            name="fixedDays"
            label={t(`${r}.pay.fixedDays`)}
            value={pay.dayRateBasis.mode === 'fixed_days' ? pay.dayRateBasis.days : 30}
          />
        )}
        <Choice
          name="offDayWork"
          label={t(`${r}.pay.offDayWork`)}
          options={keys(`${r}.pay.offDayWorkModes`, ['extra', 'replace', 'none'])}
          value={pay.offDayWork}
        />
        <Choice
          name="unmarkedDay"
          label={t(`${r}.pay.unmarkedDay`)}
          options={keys(`${r}.pay.unmarkedModes`, ['unpaid', 'paid'])}
          value={pay.unmarkedDay}
        />
        <Choice
          name="holidayOnWeeklyOff"
          label={t(`${r}.pay.holidayOnWeeklyOff`)}
          options={keys(`${r}.pay.holidayModes`, ['holiday', 'weekly_off'])}
          value={pay.holidayOnWeeklyOff}
        />
        <Choice
          name="markOnOffDay"
          label={t(`${r}.pay.markOnOffDay`)}
          options={keys(`${r}.pay.markModes`, ['ignore', 'apply'])}
          value={pay.markOnOffDay}
        />
      </Section>
      <Section title={t(`${r}.late.title`)}>
        <Choice
          name="lateMode"
          label={t(`${r}.late.mode`)}
          options={keys(`${r}.late.modes`, ['notice_only', 'deduct'])}
          value={late.mode}
        />
        <NumberField
          name="freeLateDays"
          label={t(`${r}.late.freeLateDays`)}
          value={late.freeLateDays}
        />
        <NumberField
          name="halfDay"
          label={t(`${r}.late.halfDay`)}
          value={late.halfDayThresholdMinutes ?? ''}
          hint={t(`${r}.late.halfDayHint`)}
          required={false}
        />
        <Check
          name="halfDayUsesFreeDay"
          label={t(`${r}.late.halfDayUsesFreeDay`)}
          checked={late.halfDayUsesFreeDay}
        />
        <Check
          name="earlyLeaving"
          label={t(`${r}.late.earlyLeaving`)}
          checked={late.earlyLeaving}
        />
        <Choice
          name="countsFrom"
          label={t(`${r}.late.countsFrom`)}
          options={keys(`${r}.late.countsFromModes`, ['shift_start', 'grace_end'])}
          value={late.lateCountsFrom}
        />
        <Choice
          name="chargeMode"
          label={t(`${r}.late.charge`)}
          options={keys(`${r}.late.chargeModes`, ['per_minute', 'per_late_day'])}
          value={chargeMode}
          onChange={(v) => setChargeMode(v as typeof chargeMode)}
        />
        {chargeMode === 'per_late_day' && (
          <NumberField
            name="chargeAmount"
            label={t(`${r}.late.chargeAmount`)}
            value={late.charge.mode === 'per_late_day' ? paiseToInput(late.charge.amount) : ''}
            decimal
          />
        )}
      </Section>
      <Section title={t(`${r}.code.title`)}>
        <Choice
          name="rotation"
          label={t(`${r}.code.rotation`)}
          options={keys(`${r}.code.rotationModes`, ['daily', 'manual'])}
          value={rotation}
          onChange={(v) => setRotation(v as typeof rotation)}
        />
        {rotation === 'daily' && (
          <label className="text-label-sm block">
            {t(`${r}.code.rotateAt`)}
            <input
              type="time"
              name="rotateAt"
              required
              defaultValue={minutesToInput(
                code.rotation.mode === 'daily' ? code.rotation.atMinutes : 0,
              )}
              className={inputClass}
            />
          </label>
        )}
        <NumberField name="minGap" label={t(`${r}.code.minGap`)} value={code.minGapMinutes} />
        <NumberField name="cooldown" label={t(`${r}.code.cooldown`)} value={code.cooldownMinutes} />
        <Check
          name="checkOutRequired"
          label={t(`${r}.code.checkOutRequired`)}
          checked={code.checkOutRequired}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField name="maxWrong" label={t(`${r}.code.maxWrong`)} value={code.maxWrongCodes} />
          <NumberField
            name="wrongWindow"
            label={t(`${r}.code.wrongWindow`)}
            value={code.wrongCodeWindowMinutes}
          />
          <NumberField name="lockout" label={t(`${r}.code.lockout`)} value={code.lockoutMinutes} />
        </div>
      </Section>
      <div className="flex flex-col gap-4">
        <Section title={t(`${r}.expenses.title`)}>
          <NumberField
            name="smallLimit"
            label={t(`${r}.expenses.smallLimit`)}
            value={
              rules.smallExpenseLimit === undefined ? '' : paiseToInput(rules.smallExpenseLimit)
            }
            hint={t(`${r}.expenses.smallLimitHint`)}
            required={false}
            decimal
          />
        </Section>
        <Section title={t(`${r}.login.title`)} grow>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField
              name="pinsBeforeWait"
              label={t(`${r}.login.pinsBeforeWait`)}
              value={login.wrongPinsBeforeWait}
            />
            <NumberField
              name="pinWait"
              label={t(`${r}.login.pinWait`)}
              value={login.pinWaitMinutes}
            />
            <NumberField
              name="pinsBeforeLock"
              label={t(`${r}.login.pinsBeforeLock`)}
              value={login.wrongPinsBeforeLock}
            />
          </div>
          <Check
            name="allowBiometrics"
            label={t(`${r}.login.allowBiometrics`)}
            checked={login.allowBiometrics}
          />
        </Section>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 lg:col-span-2">
        <FormMessage state={state} />
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={`${buttonClass} w-auto`}
        >
          {pending ? t('settings.saving') : t(`${r}.save`)}
        </button>
      </div>
    </form>
  );
}
