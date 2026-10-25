'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDisplayDate } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { useDialogDone } from '@/components/app/form-dialog';
import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, dateFieldProps, inputClass } from '../../../components';
import { removeHoliday, saveHoliday, type HolidayState } from './actions';

/** Add (or replace) a holiday. */
export function HolidayForm({ defaultDate }: { defaultDate: string }) {
  const [state, onSubmit, pending] = useFormAction<HolidayState>(saveHoliday, {});
  useDialogDone(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="text-label-sm block">
        {t('settings.holidays.fields.date')}
        <input
          name="date"
          required
          {...dateFieldProps}
          defaultValue={formatDisplayDate(defaultDate)}
          className={inputClass}
        />
      </label>
      <label className="text-label-sm block">
        {t('settings.holidays.fields.name')}
        <input name="name" required maxLength={80} className={inputClass} />
      </label>
      <label className="text-body flex min-h-12 items-center gap-3">
        <input
          type="checkbox"
          name="paid"
          defaultChecked
          className="h-5 w-5 accent-[var(--accent)]"
        />
        {t('settings.holidays.fields.paid')}
      </label>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass}>
        {pending ? t('settings.saving') : t('settings.holidays.save')}
      </button>
    </form>
  );
}

export function RemoveHolidayButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-label={t('settings.holidays.removeLabel', { name })}
        onClick={() =>
          start(async () => {
            const r = await removeHoliday(id);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
        className="text-caption min-h-8 rounded-[var(--radius-sm)] px-2 text-[var(--accent-ink)] underline disabled:opacity-[var(--opacity-disabled)]"
      >
        {t('settings.holidays.remove')}
      </button>
      {error && (
        <span role="alert" className="text-caption text-[var(--danger)]">
          {error}
        </span>
      )}
    </span>
  );
}

/** A form's error line. Successes show as a toast (`useDialogDone`), not in the page. */
export function FormMessage({ state }: { state: { error?: string; done?: string } }) {
  return state.error ? (
    <p role="alert" className="text-body text-[var(--danger)]">
      {state.error}
    </p>
  ) : null;
}
