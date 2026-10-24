'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, MessageCircle, Plus, RefreshCw, Unlock, X } from 'lucide-react';
import { buttonClass, quietButtonClass } from '../../../components';
import {
  inviteAction,
  selfAttendanceAction,
  signInChange,
  type SignInState,
} from './signin-actions';

export type SignInLabels = {
  title: string;
  pill: string;
  pillTone: 'none' | 'invited' | 'ok' | 'locked';
  body: string;
  noPhone?: string;
  invite: string;
  newLink: string;
  cancelInvite: string;
  copy: string;
  copied: string;
  whatsapp: string;
  /** WhatsApp message with `{url}` where the link goes. */
  whatsappText: string;
  linkOnce: string;
  unlock: string;
  newPhone: string;
  newPhoneHint: string;
  resetPin: string;
  selfAttendance: string;
};

const PILL: Record<SignInLabels['pillTone'], string> = {
  none: 'bg-[var(--surface-muted)] text-[var(--ink-muted)]',
  invited: 'bg-[var(--status-late-soft)] text-[var(--ink)]',
  ok: 'bg-[var(--status-present-soft)] text-[var(--status-present)]',
  locked: 'bg-[var(--status-absent-soft)] text-[var(--status-absent)]',
};

/**
 * Staffora sign-in for one person (design: "Web · staff sign-in card"): invite link (shown
 * once), cancel, unlock after wrong PINs, free the phone, and whether they may check in with
 * the attendance code. Needs staff.edit.
 */
export function SignInCard({
  staffId,
  labels: l,
  state,
  active,
  selfAttendance,
  phone,
}: {
  staffId: string;
  labels: SignInLabels;
  state: 'none' | 'invited' | 'signedIn';
  active: boolean;
  selfAttendance: boolean;
  /** The person's phone number, for WhatsApp. */
  phone: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SignInState>({});
  const [copied, setCopied] = useState(false);
  const run = (fn: () => Promise<SignInState>) =>
    start(async () => {
      setCopied(false);
      const r = await fn();
      setResult(r);
      router.refresh();
    });
  const digits = (phone ?? '').replace(/\D/g, '');
  const wa = digits.length === 10 ? `91${digits}` : digits;
  const link = result.link;
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
      {l.noPhone && <p className="text-caption text-[var(--ink-muted)]">{l.noPhone}</p>}

      {link && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3">
          <code className="text-caption break-all">{link}</code>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={quiet}
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => setCopied(true));
              }}
            >
              <Copy size={18} aria-hidden="true" />
              {copied ? l.copied : l.copy}
            </button>
            <a
              className={quiet}
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/${wa}?text=${encodeURIComponent(l.whatsappText.replace('{url}', link))}`}
            >
              <MessageCircle size={18} aria-hidden="true" />
              {l.whatsapp}
            </a>
          </div>
          <p className="text-caption text-[var(--ink-muted)]">{l.linkOnce}</p>
        </div>
      )}

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

      <div className="flex flex-wrap gap-2">
        {state === 'none' && active && (
          <button
            type="button"
            disabled={pending}
            className={`${buttonClass} inline-flex w-auto items-center gap-2`}
            onClick={() => run(() => inviteAction(staffId))}
          >
            <Plus size={20} aria-hidden="true" />
            {l.invite}
          </button>
        )}
        {state === 'invited' && (
          <>
            <button
              type="button"
              disabled={pending}
              className={quiet}
              onClick={() => run(() => inviteAction(staffId))}
            >
              <RefreshCw size={18} aria-hidden="true" />
              {l.newLink}
            </button>
            <button
              type="button"
              disabled={pending}
              className={quiet}
              onClick={() => run(() => signInChange(staffId, 'cancel'))}
            >
              <X size={18} aria-hidden="true" />
              {l.cancelInvite}
            </button>
          </>
        )}
        {state === 'signedIn' && (
          <>
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
                onClick={() => run(() => inviteAction(staffId))}
              >
                <MessageCircle size={18} aria-hidden="true" />
                {l.resetPin}
              </button>
            )}
          </>
        )}
      </div>
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
