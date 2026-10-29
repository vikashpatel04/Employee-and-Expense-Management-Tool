'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDisplayDate, paiseToInput, type AdvanceCutMode } from '@fincrew/core';
import { useDialogDone } from '@/components/app/form-dialog';
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

/** Error line; successes are toasts (`useDialogDone`). */
const Message = ({ state }: { state: AdvanceState }) =>
  state.error ? (
    <p role="alert" className="text-body text-[var(--danger)]">
      {state.error}
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
  useDialogDone(state);
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
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass}>
        {pending ? labels.saving : labels.save}
      </button>
    </form>
  );
}

export type AdvanceSettingsLabels = {
  limit: string;
  how: string;
  modes: Record<AdvanceCutMode | `${AdvanceCutMode}Hint`, string>;
  cut: string;
  expenses: string;
  payback: string;
  paybackHint: string;
  recover: string;
  recoverHint: string;
  save: string;
  saving: string;
};

/**
 * How the salary run settles this person's money: advance limit, advance cut mode (all / a fixed
 * monthly cut, the rest carries / none) and whether expenses are paid back and charges cut.
 */
export function AdvanceSettingsForm({
  staffId,
  limit,
  mode: savedMode,
  cut,
  payback,
  recover,
  labels,
}: {
  staffId: string;
  limit: number | null;
  mode: AdvanceCutMode;
  cut: number | null;
  payback: boolean;
  recover: boolean;
  labels: AdvanceSettingsLabels;
}) {
  const [state, onSubmit, pending] = useFormAction<AdvanceState>(
    saveAdvanceSettings.bind(null, staffId),
    {},
  );
  const [mode, setMode] = useState(savedMode);
  useDialogDone(state);
  const option = 'flex cursor-pointer gap-3 rounded-[var(--radius-md)] border p-3';
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-label-sm mb-2">{labels.how}</legend>
        {(['all', 'fixed', 'none'] as const).map((m) => (
          <label
            key={m}
            className={`${option} ${mode === m ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line-strong)]'}`}
          >
            <input
              type="radio"
              name="mode"
              value={m}
              checked={mode === m}
              onChange={() => setMode(m)}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-label-sm">{labels.modes[m]}</span>
              <span className="text-muted-foreground text-xs">{labels.modes[`${m}Hint`]}</span>
            </span>
          </label>
        ))}
        {mode === 'fixed' && (
          <label className="text-label-sm block">
            {labels.cut}
            <input
              name="cut"
              inputMode="decimal"
              required
              defaultValue={cut == null ? '' : paiseToInput(cut)}
              className={inputClass}
            />
          </label>
        )}
      </fieldset>
      <label className="text-label-sm block">
        {labels.limit}
        <input
          name="limit"
          inputMode="decimal"
          defaultValue={limit == null ? '' : paiseToInput(limit)}
          className={inputClass}
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-label-sm mb-2">{labels.expenses}</legend>
        {(
          [
            ['payback', payback, labels.payback, labels.paybackHint],
            ['recover', recover, labels.recover, labels.recoverHint],
          ] as const
        ).map(([name, on, label, hint]) => (
          <label key={name} className={`${option} border-[var(--line-strong)]`}>
            <input
              type="checkbox"
              name={name}
              defaultChecked={on}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-label-sm">{label}</span>
              <span className="text-muted-foreground text-xs">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Message state={state} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
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
        aria-busy={pending}
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
