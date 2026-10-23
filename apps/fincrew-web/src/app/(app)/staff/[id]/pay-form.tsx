'use client';

import { useActionState, useState } from 'react';
import { formatDisplayDate, minutesToInput, paiseToInput } from '@fincrew/core';
import { buttonClass, dateFieldProps, inputClass } from '../../../components';
import { savePay, type PayState } from './actions';

type PayType = 'monthly' | 'daily' | 'hourly';

type Labels = {
  effectiveFrom: string;
  payType: string;
  types: Record<PayType, string>;
  amount: string;
  overtime: string;
  shiftStart: string;
  shiftEnd: string;
  grace: string;
  hoursPerDay: string;
  save: string;
  saving: string;
};

type Current = {
  payType: PayType;
  amount: number;
  overtime: number | null;
  shiftStart: number | null;
  shiftEnd: number | null;
  grace: number;
  dayMinutes: number | null;
} | null;

/** "Change pay from a date". Prefilled with the current pay so a raise is one field. */
export function PayForm({
  staffId,
  defaultDate,
  current,
  labels,
}: {
  staffId: string;
  defaultDate: string;
  current: Current;
  labels: Labels;
}) {
  const [state, action, pending] = useActionState<PayState, FormData>(
    savePay.bind(null, staffId),
    {},
  );
  const [payType, setPayType] = useState<PayType>(current?.payType ?? 'monthly');

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="text-label-sm block">
        {labels.effectiveFrom}
        <input
          id="effectiveFrom"
          name="effectiveFrom"
          {...dateFieldProps}
          required
          defaultValue={formatDisplayDate(defaultDate)}
          className={inputClass}
        />
      </label>

      <fieldset>
        <legend className="text-label-sm">{labels.payType}</legend>
        <div className="mt-1 flex gap-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1">
          {(['monthly', 'daily', 'hourly'] as const).map((p) => (
            <label
              key={p}
              className="text-label-sm flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] px-3 has-[:checked]:bg-[var(--surface)] has-[:checked]:shadow-[var(--elevation-1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]"
            >
              <input
                type="radio"
                name="payType"
                value={p}
                checked={payType === p}
                onChange={() => setPayType(p)}
                className="sr-only"
              />
              {labels.types[p]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="text-label-sm block">
        {labels.amount}
        <input
          id="amount"
          name="amount"
          required
          inputMode="decimal"
          defaultValue={current ? paiseToInput(current.amount) : ''}
          className={`${inputClass} text-money-md`}
        />
      </label>

      <label className="text-label-sm block">
        {labels.overtime}
        <input
          id="overtime"
          name="overtime"
          inputMode="decimal"
          defaultValue={current?.overtime != null ? paiseToInput(current.overtime) : ''}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-label-sm block">
          {labels.shiftStart}
          <input
            id="shiftStart"
            name="shiftStart"
            type="time"
            defaultValue={current?.shiftStart != null ? minutesToInput(current.shiftStart) : ''}
            className={inputClass}
          />
        </label>
        <label className="text-label-sm block">
          {labels.shiftEnd}
          <input
            id="shiftEnd"
            name="shiftEnd"
            type="time"
            defaultValue={current?.shiftEnd != null ? minutesToInput(current.shiftEnd) : ''}
            className={inputClass}
          />
        </label>
      </div>

      <label className="text-label-sm block">
        {labels.grace}
        <input
          id="grace"
          name="grace"
          type="number"
          min={0}
          step={1}
          defaultValue={current?.grace ?? 10}
          className={inputClass}
        />
      </label>

      {payType === 'hourly' && (
        <label className="text-label-sm block">
          {labels.hoursPerDay}
          <input
            id="hoursPerDay"
            name="hoursPerDay"
            inputMode="decimal"
            defaultValue={current?.dayMinutes != null ? String(current.dayMinutes / 60) : ''}
            className={inputClass}
          />
        </label>
      )}

      {state.error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? labels.saving : labels.save}
      </button>
    </form>
  );
}
