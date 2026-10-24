'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDisplayDate, paiseToInput } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, dateFieldProps, inputClass, quietButtonClass } from '../../../components';
import { FormMessage } from '../../settings/holidays/holiday-forms';
import {
  addItem,
  correctOpening,
  endItem,
  removeItem,
  saveDetails,
  saveOpening,
  saveTemplate,
  type ExtraState,
} from './extra-actions';

const checkbox = 'h-5 w-5 shrink-0 accent-[var(--accent)]';

function DateField({
  name,
  label,
  value,
  required = true,
}: {
  name: string;
  label: string;
  value?: string | null;
  required?: boolean;
}) {
  return (
    <label className="text-label-sm block">
      {label}
      <input
        name={name}
        required={required}
        {...dateFieldProps}
        defaultValue={value ? formatDisplayDate(value) : ''}
        className={inputClass}
      />
    </label>
  );
}

/** Name, phone, joining and leaving date. */
export function DetailsForm({
  staffId,
  details,
}: {
  staffId: string;
  details: { name: string; phone: string | null; joiningDate: string; leavingDate: string | null };
}) {
  const [state, onSubmit, pending] = useFormAction<ExtraState>(saveDetails.bind(null, staffId), {});
  const d = 'staffDetail.details';
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="text-label-sm block">
        {t(`${d}.name`)}
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={details.name}
          className={inputClass}
        />
      </label>
      <label className="text-label-sm block">
        {t(`${d}.phone`)}
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          maxLength={20}
          defaultValue={details.phone ?? ''}
          className={inputClass}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField name="joiningDate" label={t(`${d}.joiningDate`)} value={details.joiningDate} />
        <DateField
          name="leavingDate"
          label={t(`${d}.leavingDate`)}
          value={details.leavingDate}
          required={false}
        />
      </div>
      <p className="text-caption text-[var(--ink-muted)]">{t(`${d}.leavingHint`)}</p>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t('staffDetail.saving') : t(`${d}.save`)}
      </button>
    </form>
  );
}

/** Add an allowance or a fixed deduction. */
export function ItemForm({
  staffId,
  kind,
  defaultDate,
}: {
  staffId: string;
  kind: 'allowance' | 'deduction';
  defaultDate: string;
}) {
  const [state, onSubmit, pending] = useFormAction<ExtraState>(
    addItem.bind(null, staffId, kind),
    {},
  );
  const i = 'staffDetail.items';
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-label-sm block">
          {t(`${i}.name`)}
          <input name="name" required maxLength={60} className={inputClass} />
        </label>
        <label className="text-label-sm block">
          {t(`${i}.amount`)}
          <input
            name="amount"
            required
            inputMode="decimal"
            className={`${inputClass} text-money-md`}
          />
        </label>
        <DateField name="from" label={t(`${i}.from`)} value={defaultDate} />
        <DateField name="to" label={t(`${i}.to`)} required={false} />
      </div>
      {kind === 'allowance' && (
        <label className="text-body flex min-h-12 items-center gap-3">
          <input type="checkbox" name="prorated" className={checkbox} />
          {t(`${i}.prorated`)}
        </label>
      )}
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t('staffDetail.saving') : t(`${i}.save`)}
      </button>
    </form>
  );
}

/** "End today" and a two-step "Remove" for one allowance or deduction. */
export function ItemButtons({
  staffId,
  kind,
  id,
  name,
  canEnd,
}: {
  staffId: string;
  kind: 'allowance' | 'deduction';
  id: string;
  name: string;
  canEnd: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ExtraState>) =>
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else router.refresh();
    });
  const link =
    'text-caption min-h-8 rounded-[var(--radius-sm)] px-2 underline disabled:opacity-[var(--opacity-disabled)]';
  return (
    <span className="inline-flex flex-col items-end">
      <span className="inline-flex gap-1">
        {canEnd && (
          <button
            type="button"
            disabled={pending}
            aria-label={t('staffDetail.items.endLabel', { name })}
            onClick={() => run(() => endItem(staffId, kind, id))}
            className={`${link} text-[var(--accent-ink)]`}
          >
            {t('staffDetail.items.end')}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          aria-label={asking ? undefined : t('staffDetail.items.removeLabel', { name })}
          onClick={() => (asking ? run(() => removeItem(staffId, kind, id)) : setAsking(true))}
          className={`${link} ${asking ? 'text-[var(--danger)]' : 'text-[var(--accent-ink)]'}`}
        >
          {asking ? t('staffDetail.items.removeConfirm') : t('staffDetail.items.remove')}
        </button>
      </span>
      {error && (
        <span role="alert" className="text-caption text-[var(--danger)]">
          {error}
        </span>
      )}
    </span>
  );
}

/** Pick a leave template from a date. */
export function TemplateForm({
  staffId,
  templates,
  current,
  defaultDate,
}: {
  staffId: string;
  templates: { id: string; name: string }[];
  current: string | null;
  defaultDate: string;
}) {
  const [state, onSubmit, pending] = useFormAction<ExtraState>(
    saveTemplate.bind(null, staffId),
    {},
  );
  const f = 'staffDetail.templateForm';
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-label-sm block">
          {t(`${f}.template`)}
          <select name="template" defaultValue={current ?? templates[0]?.id} className={inputClass}>
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <DateField name="from" label={t(`${f}.from`)} value={defaultDate} />
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t('staffDetail.saving') : t(`${f}.save`)}
      </button>
    </form>
  );
}

/** The one-time opening balance, with a confirmation tick. */
export function OpeningForm({
  staffId,
  name,
  defaultDate,
  current,
}: {
  staffId: string;
  name: string;
  defaultDate: string;
  /** Correcting a balance already set: its current (corrected) amount, ledger sign. */
  current?: number;
}) {
  const correcting = current !== undefined;
  const [state, onSubmit, pending] = useFormAction<ExtraState>(
    (correcting ? correctOpening : saveOpening).bind(null, staffId),
    {},
  );
  const o = 'staffDetail.opening';
  const segment =
    'text-label-sm flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] px-3 text-center has-[:checked]:bg-[var(--surface)] has-[:checked]:shadow-[var(--elevation-1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]';
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <fieldset>
        <legend className="text-label-sm">{t(`${o}.direction`)}</legend>
        <div className="mt-1 flex gap-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1">
          {(['dueTo', 'owes'] as const).map((k) => (
            <label key={k} className={segment}>
              <input
                type="radio"
                name="direction"
                value={k}
                defaultChecked={k === (correcting && current! < 0 ? 'owes' : 'dueTo')}
                className="sr-only"
              />
              {t(`${o}.${k}`, { name })}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-label-sm block">
          {t(`${o}.amount`)}
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={correcting ? paiseToInput(Math.abs(current!)) : undefined}
            className={`${inputClass} text-money-md`}
          />
        </label>
        {!correcting && <DateField name="date" label={t(`${o}.date`)} value={defaultDate} />}
      </div>
      <label className="text-body flex min-h-12 items-center gap-3">
        <input type="checkbox" name="confirm" className={checkbox} />
        {correcting ? t(`${o}.confirmCorrection`) : t(`${o}.confirm`)}
      </label>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={quietButtonClass}>
        {pending ? t('staffDetail.saving') : correcting ? t(`${o}.correctSave`) : t(`${o}.save`)}
      </button>
    </form>
  );
}
