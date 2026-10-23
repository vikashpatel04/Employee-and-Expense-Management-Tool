'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from './actions';

/** A button that runs a bound server action and reports the outcome below the header. */
export function ActionButton({
  action,
  label,
  working,
  variant = 'secondary',
  disabled,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  working: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const cls =
    variant === 'primary'
      ? 'bg-[var(--accent)] text-[var(--on-accent)]'
      : 'border border-[var(--line-strong)] bg-[var(--surface)]';
  return (
    <span className="inline-flex flex-col gap-1 self-start">
      <button
        type="button"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const r = await action();
            setResult(r);
            if (r.ok) router.refresh();
          })
        }
        className={`text-label-sm min-h-12 rounded-[var(--radius-md)] px-4 disabled:opacity-[var(--opacity-disabled)] ${cls}`}
      >
        {pending ? working : label}
      </button>
      {result && (
        <span
          role={result.ok ? 'status' : 'alert'}
          className={`text-caption ${result.ok ? 'text-[var(--status-present)]' : 'text-[var(--danger)]'}`}
        >
          {result.ok ? result.message : result.error}
        </span>
      )}
    </span>
  );
}

/** Payment mode + Pay button; `pay(mode)` is a bound server action. */
export function PayControl({
  pay,
  label,
  modeLabel,
  modes,
  working,
}: {
  pay: (mode: string) => Promise<ActionResult>;
  label: string;
  modeLabel: string;
  modes: Record<string, string>;
  working: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState('cash');
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-1">
        <select
          aria-label={modeLabel}
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="text-body min-h-10 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-2"
        >
          {Object.entries(modes).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await pay(mode);
              setResult(r);
              if (r.ok) router.refresh();
            })
          }
          className="text-label-sm min-h-10 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-[var(--on-accent)] disabled:opacity-[var(--opacity-disabled)]"
        >
          {pending ? working : label}
        </button>
      </span>
      {result && !result.ok && (
        <span role="alert" className="text-caption text-[var(--danger)]">
          {result.error}
        </span>
      )}
    </span>
  );
}
