'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, RefreshCw, Unlock } from 'lucide-react';
import { buttonClass, quietButtonClass } from '../../../components';
import { selfAttendanceAction, signInChange, type SignInState } from './signin-actions';

export type SignInLabels = {
  state: 'noPhone' | 'waiting' | 'signedIn';
  title: string;
  pill: string;
  pillTone: 'none' | 'invited' | 'ok' | 'locked';
  body: string;
  phoneBound?: string;
  userId: string;
  /** The person's phone number as Staffora matches it ("98765 43210"), or null. */
  phone: string | null;
  unlock: string;
  newPhone: string;
  newPhoneHint: string;
  resetPin: string;
  resetConfirm: string;
  selfAttendance: string;
};

const PILL: Record<SignInLabels['pillTone'], string> = {
  none: 'bg-[var(--surface-muted)] text-[var(--ink-muted)]',
  invited: 'bg-[var(--status-late-soft)] text-[var(--ink)]',
  ok: 'bg-[var(--status-present-soft)] text-[var(--status-present)]',
  locked: 'bg-[var(--status-absent-soft)] text-[var(--status-absent)]',
};

/**
 * Staffora sign-in for one person (design: "Web · staff sign-in card"): the phone number is
 * their Staffora user id and they choose a PIN on their phone the first time. Here: reset a
 * forgotten PIN, unlock after wrong PINs, free the phone, and whether they may check in with
 * the attendance code. Needs staff.edit.
 */
export function SignInCard({
  staffId,
  labels: l,
  active,
  selfAttendance,
}: {
  staffId: string;
  labels: SignInLabels;
  active: boolean;
  selfAttendance: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SignInState>({});
  const run = (fn: () => Promise<SignInState>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      router.refresh();
    });
  const quiet = `${quietButtonClass} inline-flex items-center gap-2`;

  return (
    <section
      aria-labelledby="signin-h"
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="signin-h" className="text-title-md">
          {l.title}
        </h2>
        <span
          className={`text-caption rounded-[var(--radius-pill)] px-2.5 py-1 ${PILL[l.pillTone]}`}
        >
          {l.pill}
        </span>
      </div>
      <p className="text-body text-[var(--ink-muted)]">{l.body}</p>
      {l.phone && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3">
          <span className="text-caption text-[var(--ink-muted)]">{l.userId}</span>
          <span className="text-money-md tabular-nums">{l.phone}</span>
        </div>
      )}
      {l.phoneBound && <p className="text-caption text-[var(--ink-muted)]">{l.phoneBound}</p>}

      {active && (
        <label className="text-body flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--accent)]"
            defaultChecked={selfAttendance}
            disabled={pending}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              run(() => selfAttendanceAction(staffId, on));
            }}
          />
          {l.selfAttendance}
        </label>
      )}

      {l.state === 'signedIn' && (
        <div className="flex flex-wrap gap-2">
          {l.pillTone === 'locked' && (
            <button
              type="button"
              disabled={pending}
              className={`${buttonClass} inline-flex w-auto items-center gap-2`}
              onClick={() => run(() => signInChange(staffId, 'unlock'))}
            >
              <Unlock size={20} aria-hidden="true" />
              {l.unlock}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            title={l.newPhoneHint}
            className={quiet}
            onClick={() => run(() => signInChange(staffId, 'phone'))}
          >
            <RefreshCw size={18} aria-hidden="true" />
            {l.newPhone}
          </button>
          {active && (
            <button
              type="button"
              disabled={pending}
              className={quiet}
              onClick={() => {
                if (window.confirm(l.resetConfirm)) run(() => signInChange(staffId, 'reset'));
              }}
            >
              <KeyRound size={18} aria-hidden="true" />
              {l.resetPin}
            </button>
          )}
        </div>
      )}
      {result.error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {result.error}
        </p>
      )}
      {result.done && (
        <p role="status" className="text-body text-[var(--status-present)]">
          {result.done}
        </p>
      )}
    </section>
  );
}
