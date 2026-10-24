'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDisplayDate, paiseToInput } from '@fincrew/core';
import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, dateFieldProps, inputClass } from '../../../components';
import { recordAdvance, saveAdvanceSettings, undoLine, type AdvanceState } from './advance-actions';

type AdvanceLabels = {
  kind: { label: string; given: string; repaid: string };
  amount: string;
  date: string;
  mode: string;
  modes: Record<string, string>;
  note: string;
  confirm: string;
  save: string;
  saving: string;
};

const Message = ({ state }: { state: AdvanceState }) =>
  state.error ? (
    <p role="alert" className="text-body text-[var(--danger)]">
      {state.error}
    </p>
  ) : state.done ? (
    <p role="status" className="text-body text-[var(--status-present)]">
      {state.done}
    </p>
  ) : null;

/** Give an advance or record cash repaid; asks to confirm when the limit would be crossed. */
export function AdvanceForm({
  staffId,
  today,
  labels,
}: {
  staffId: string;
  today: string;
  labels: AdvanceLabels;
}) {
  const [state, onSubmit, pending] = useFormAction<AdvanceState>(
    recordAdvance.bind(null, staffId),
    {},
  );
  const [kind, setKind] = useState<'given' | 'repaid'>('given');

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <fieldset>
        <legend className="text-label-sm">{labels.kind.label}</legend>
        <div className="mt-1 flex gap-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1">
          {(['given', 'repaid'] as const).map((k) => (
            <label
              key={k}
              className="text-label-sm flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] px-3 has-[:checked]:bg-[var(--surface)] has-[:checked]:shadow-[var(--elevation-1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]"
            >
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="sr-only"
              />
              {labels.kind[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-label-sm block">
          {labels.amount}
          <input
            name="amount"
            required
            inputMode="decimal"
            className={`${inputClass} text-money-md`}
          />
        </label>
        <label className="text-label-sm block">
          {labels.date}
          <input
            name="date"
            required
            {...dateFieldProps}
            defaultValue={formatDisplayDate(today)}
            className={inputClass}
          />
        </label>
      </div>
      <label className="text-label-sm block">
        {labels.mode}
        <select name="mode" defaultValue="cash" className={inputClass}>
          {Object.entries(labels.modes).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="text-label-sm block">
        {labels.note}
        <input name="note" maxLength={200} className={inputClass} />
      </label>
      {state.needsConfirm && kind === 'given' && (
        <label className="text-body flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            name="confirmOverLimit"
            className="h-5 w-5 accent-[var(--accent)]"
          />
          {labels.confirm}
        </label>
      )}
      <Message state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? labels.saving : labels.save}
      </button>
    </form>
  );
}

/** The person's advance limit and default monthly cut. */
export function AdvanceSettingsForm({
  staffId,
  limit,
  cut,
  labels,
}: {
  staffId: string;
  limit: number | null;
  cut: number | null;
  labels: { limit: string; cut: string; save: string; saving: string };
}) {
  const [state, onSubmit, pending] = useFormAction<AdvanceState>(
    saveAdvanceSettings.bind(null, staffId),
    {},
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="text-label-sm block">
        {labels.limit}
        <input
          name="limit"
          inputMode="decimal"
          defaultValue={limit == null ? '' : paiseToInput(limit)}
          className={inputClass}
        />
      </label>
      <label className="text-label-sm block">
        {labels.cut}
        <input
          name="cut"
          inputMode="decimal"
          defaultValue={cut == null ? '' : paiseToInput(cut)}
          className={inputClass}
        />
      </label>
      <Message state={state} />
      <button
        type="submit"
        disabled={pending}
        className="text-label-sm min-h-12 rounded-[var(--radius-md)] border border-[var(--line-strong)] px-4 disabled:opacity-[var(--opacity-disabled)]"
      >
        {pending ? labels.saving : labels.save}
      </button>
    </form>
  );
}

/** Undo a ledger line with an exact reversal. */
export function UndoButton({
  staffId,
  lineId,
  label,
}: {
  staffId: string;
  lineId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await undoLine(staffId, lineId);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
        className="text-caption min-h-8 rounded-[var(--radius-sm)] px-2 text-[var(--accent-ink)] underline disabled:opacity-[var(--opacity-disabled)]"
      >
        {label}
      </button>
      {error && (
        <span role="alert" className="text-caption text-[var(--danger)]">
          {error}
        </span>
      )}
    </span>
  );
}
