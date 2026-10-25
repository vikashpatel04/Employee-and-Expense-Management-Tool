'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_SANDWICH_RULE, formatDisplayDate, type LeaveTemplateVersion } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { useDialogDone } from '@/components/app/form-dialog';
import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, dateFieldProps, inputClass, quietButtonClass } from '../../../components';
import { FormMessage } from '../holidays/holiday-forms';
import {
  assignStaff,
  createTemplate,
  renameTemplate,
  saveVersion,
  setArchived,
  type LeaveState,
} from './actions';

type Rules = Omit<LeaveTemplateVersion, 'effectiveFrom'>;

const f = 'settings.leave.form';

/** A new template starts with nothing assumed: no weekly offs, no paid leave. */
const BLANK: Rules = {
  weeklyOffs: [],
  paidLeavesPerMonth: 0,
  carryOver: { mode: 'lapse' },
  sandwich: DEFAULT_SANDWICH_RULE,
  accrual: { mode: 'full' },
};

const segment =
  'text-label-sm flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] px-2 text-center has-[:checked]:bg-[var(--surface)] has-[:checked]:shadow-[var(--elevation-1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]';
const checkbox = 'h-5 w-5 accent-[var(--accent)]';

function Group({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-label-sm">{legend}</legend>
      {hint && <p className="text-caption -mt-1 text-[var(--ink-muted)]">{hint}</p>}
      {children}
    </fieldset>
  );
}

/**
 * Leave rules for a template version: weekly offs, paid leave, carry-over, part months, sandwich
 * rule. Without `templateId` it creates a template (name + first rules).
 */
export function LeaveVersionForm({
  templateId,
  initial,
  defaultDate,
}: {
  templateId?: string;
  initial?: Rules;
  defaultDate: string;
}) {
  const v = initial ?? BLANK;
  const [state, onSubmit, pending] = useFormAction<LeaveState>(
    templateId ? saveVersion.bind(null, templateId) : createTemplate,
    {},
  );
  useDialogDone(state);
  const [carry, setCarry] = useState(v.carryOver.mode);
  const [accrual, setAccrual] = useState(v.accrual.mode);
  const [sandwich, setSandwich] = useState(v.sandwich.enabled);
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const months = t('months.long', { returnObjects: true }) as unknown as string[];
  const offKind = (d: number) => {
    const off = v.weeklyOffs.find((o) => o.weekday === d);
    return off ? (off.paid ? 'paid' : 'unpaid') : 'work';
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {!templateId && (
        <label className="text-label-sm block">
          {t('settings.leave.name')}
          <input name="name" required maxLength={60} className={inputClass} />
        </label>
      )}
      <label className="text-label-sm block">
        {t(`${f}.effectiveFrom`)}
        <input
          name="effectiveFrom"
          required
          {...dateFieldProps}
          defaultValue={formatDisplayDate(defaultDate)}
          className={inputClass}
        />
      </label>

      <Group legend={t(`${f}.weeklyOffs`)} hint={t(`${f}.weeklyOffsHint`)}>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} className="flex items-center gap-2">
            <span className="text-label-sm w-10 shrink-0">{days[d]}</span>
            <div
              role="radiogroup"
              aria-label={days[d]}
              className="flex flex-1 gap-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1"
            >
              {(['work', 'paid', 'unpaid'] as const).map((k) => (
                <label key={k} className={segment}>
                  <input
                    type="radio"
                    name={`off${d}`}
                    value={k}
                    defaultChecked={offKind(d) === k}
                    className="sr-only"
                  />
                  {t(`${f}.dayKinds.${k}`)}
                </label>
              ))}
            </div>
          </div>
        ))}
      </Group>

      <label className="text-label-sm block">
        {t(`${f}.paidLeaves`)}
        <input
          name="paidLeaves"
          required
          inputMode="numeric"
          defaultValue={v.paidLeavesPerMonth}
          className={inputClass}
        />
        <span className="text-caption font-normal text-[var(--ink-muted)]">
          {t(`${f}.paidLeavesHint`)}
        </span>
      </label>

      <label className="text-label-sm block">
        {t(`${f}.carry`)}
        <select
          name="carry"
          value={carry}
          onChange={(e) => setCarry(e.target.value as Rules['carryOver']['mode'])}
          className={inputClass}
        >
          {(['lapse', 'carry', 'carry_within_year', 'payout'] as const).map((m) => (
            <option key={m} value={m}>
              {t(`${f}.carryModes.${m}`)}
            </option>
          ))}
        </select>
      </label>
      {carry === 'carry' && (
        <label className="text-label-sm block">
          {t(`${f}.cap`)}
          <input
            name="cap"
            inputMode="numeric"
            defaultValue={v.carryOver.mode === 'carry' ? (v.carryOver.cap ?? '') : ''}
            className={inputClass}
          />
          <span className="text-caption font-normal text-[var(--ink-muted)]">
            {t(`${f}.capHint`)}
          </span>
        </label>
      )}
      {(carry === 'carry_within_year' || carry === 'payout') && (
        <label className="text-label-sm block">
          {t(`${f}.resetMonth`)}
          <select
            name="resetMonth"
            defaultValue={'resetMonth' in v.carryOver ? v.carryOver.resetMonth : 3}
            className={inputClass}
          >
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="text-label-sm block">
        {t(`${f}.accrual`)}
        <select
          name="accrual"
          value={accrual}
          onChange={(e) => setAccrual(e.target.value as Rules['accrual']['mode'])}
          className={inputClass}
        >
          {(['full', 'prorated'] as const).map((m) => (
            <option key={m} value={m}>
              {t(`${f}.accrualModes.${m}`)}
            </option>
          ))}
        </select>
      </label>
      {accrual === 'prorated' && (
        <label className="text-label-sm block">
          {t(`${f}.rounding`)}
          <select
            name="rounding"
            defaultValue={v.accrual.mode === 'prorated' ? v.accrual.rounding : 'down'}
            className={inputClass}
          >
            {(['down', 'nearest', 'up'] as const).map((r) => (
              <option key={r} value={r}>
                {t(`${f}.roundings.${r}`)}
              </option>
            ))}
          </select>
        </label>
      )}

      <Group legend={t(`${f}.sandwich`)}>
        <label className="text-body flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            name="sandwich"
            checked={sandwich}
            onChange={(e) => setSandwich(e.target.checked)}
            className={checkbox}
          />
          {t(`${f}.sandwichOn`)}
        </label>
        {/* Kept in the form while off so the choices survive switching the rule on and off. */}
        <div className={sandwich ? 'flex flex-col gap-3 pl-8' : 'hidden'}>
          <Group legend={t(`${f}.triggers`)}>
            <div className="flex flex-wrap gap-x-5">
              {(['absent', 'unpaid_leave', 'half_day', 'unmarked'] as const).map((x) => (
                <label key={x} className="text-body flex min-h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    name="triggers"
                    value={x}
                    defaultChecked={v.sandwich.triggers.includes(x)}
                    className={checkbox}
                  />
                  {t(`${f}.triggerNames.${x}`)}
                </label>
              ))}
            </div>
          </Group>
          <Group legend={t(`${f}.appliesTo`)}>
            <div className="flex flex-wrap gap-x-5">
              {(['weekly_off', 'holiday'] as const).map((x) => (
                <label key={x} className="text-body flex min-h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    name="appliesTo"
                    value={x}
                    defaultChecked={v.sandwich.appliesTo.includes(x)}
                    className={checkbox}
                  />
                  {t(`${f}.appliesToNames.${x}`)}
                </label>
              ))}
            </div>
          </Group>
          <label className="text-label-sm block">
            {t(`${f}.sides`)}
            <select name="sides" defaultValue={v.sandwich.sides} className={inputClass}>
              {(['both', 'either'] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`${f}.sidesNames.${x}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Group>

      <FormMessage state={state} />
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass}>
        {pending ? t('settings.saving') : templateId ? t(`${f}.save`) : t('settings.leave.create')}
      </button>
    </form>
  );
}

export function RenameForm({ templateId, name }: { templateId: string; name: string }) {
  const [state, onSubmit, pending] = useFormAction<LeaveState>(
    renameTemplate.bind(null, templateId),
    {},
  );
  useDialogDone(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="text-label-sm block flex-1">
          {t('settings.leave.name')}
          <input name="name" required maxLength={60} defaultValue={name} className={inputClass} />
        </label>
        <button type="submit" disabled={pending} aria-busy={pending} className={quietButtonClass}>
          {pending ? t('settings.saving') : t('settings.leave.detail.rename')}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function ArchiveButton({ templateId, archived }: { templateId: string; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            const r = await setArchived(templateId, !archived);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
        className={`${quietButtonClass} w-fit disabled:opacity-[var(--opacity-disabled)]`}
      >
        {archived ? t('settings.leave.detail.unarchive') : t('settings.leave.detail.archive')}
      </button>
      {error && (
        <span role="alert" className="text-caption text-[var(--danger)]">
          {error}
        </span>
      )}
    </span>
  );
}

/** Tick staff and a date to move them onto this template. */
export function AssignForm({
  templateId,
  defaultDate,
  staff,
}: {
  templateId: string;
  defaultDate: string;
  staff: { id: string; name: string; current: string | null }[];
}) {
  const [state, onSubmit, pending] = useFormAction<LeaveState>(
    assignStaff.bind(null, templateId),
    {},
  );
  useDialogDone(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <ul className="flex max-h-80 flex-col overflow-y-auto rounded-[var(--radius-md)] border border-[var(--line)]">
        {staff.map((s) => (
          <li key={s.id} className="border-b border-[var(--line)] last:border-0">
            <label className="flex min-h-12 items-center gap-3 px-3 py-2">
              <input type="checkbox" name="staff" value={s.id} className={checkbox} />
              <span className="flex min-w-0 flex-col">
                <span className="text-label-sm">{s.name}</span>
                <span className="text-caption text-[var(--ink-muted)]">
                  {s.current
                    ? t('settings.leave.detail.nowOn', { name: s.current })
                    : t('settings.leave.detail.noTemplate')}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <label className="text-label-sm block">
        {t('settings.leave.detail.assignFrom')}
        <input
          name="from"
          required
          {...dateFieldProps}
          defaultValue={formatDisplayDate(defaultDate)}
          className={inputClass}
        />
      </label>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass}>
        {pending ? t('settings.saving') : t('settings.leave.detail.assignSave')}
      </button>
    </form>
  );
}
