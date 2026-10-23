'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { formatDisplayDate } from '@fincrew/core';
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
  const [state, action, pending] = useActionState<AddStaffState, FormData>(addStaff, {});

  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
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
        <button type="submit" disabled={pending} className={`${buttonClass} w-auto flex-1`}>
          {pending ? labels.saving : labels.save}
        </button>
        <Link href="/staff" className={`${quietButtonClass} inline-flex items-center`}>
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
