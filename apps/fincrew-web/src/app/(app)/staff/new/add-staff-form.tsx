'use client';

import { PendingLink as Link } from '@/components/app/pending-link';
import { formatDisplayDate } from '@fincrew/core';
import { useDialogClose, useDialogDone } from '@/components/app/form-dialog';
import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, dateFieldProps, inputClass, quietButtonClass } from '../../../components';
import { addStaff, type AddStaffState } from '../actions';

type Labels = {
  name: string;
  phone: string;
  joiningDate: string;
  save: string;
  saving: string;
  cancel: string;
};

export function AddStaffForm({ labels, today }: { labels: Labels; today: string }) {
  const [state, onSubmit, pending] = useFormAction<AddStaffState>(addStaff, {});
  useDialogDone(state);
  const close = useDialogClose();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="text-label-sm block">
        {labels.name}
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          autoComplete="off"
          className={inputClass}
        />
      </label>
      <label className="text-label-sm block">
        {labels.phone}
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          maxLength={20}
          className={inputClass}
        />
      </label>
      <label className="text-label-sm block">
        {labels.joiningDate}
        <input
          id="joiningDate"
          name="joiningDate"
          {...dateFieldProps}
          required
          defaultValue={formatDisplayDate(today)}
          className={inputClass}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={`${buttonClass} w-auto flex-1`}
        >
          {pending ? labels.saving : labels.save}
        </button>
        {close ? (
          <button type="button" onClick={close} className={quietButtonClass}>
            {labels.cancel}
          </button>
        ) : (
          <Link href="/staff" className={quietButtonClass}>
            {labels.cancel}
          </Link>
        )}
      </div>
    </form>
  );
}
