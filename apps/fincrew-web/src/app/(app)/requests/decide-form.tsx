'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { buttonClass, inputClass, quietButtonClass } from '../../components';
import { decideAction, type DecideState } from './actions';
import { toast } from 'sonner';

export type DecideLabels = {
  markAs: string;
  leaveStatus: { paid_leave: string; unpaid_leave: string };
  paidWith: string;
  modes: Record<string, string>;
  reply: string;
  approve: string;
  approveAnyway: string;
  reject: string;
  working: string;
};

/** Approve or reject one waiting request (design: "Web · requests"). */
export function DecideForm({
  requestId,
  kind,
  defaultLeave,
  labels: l,
}: {
  requestId: string;
  kind: 'leave' | 'advance';
  defaultLeave: 'paid_leave' | 'unpaid_leave';
  labels: DecideLabels;
}) {
  const router = useRouter();
  const [leaveStatus, setLeaveStatus] = useState(defaultLeave);
  const [mode, setMode] = useState('cash');
  const [note, setNote] = useState('');
  const [state, setState] = useState<DecideState>({});
  const [pending, start] = useTransition();

  const decide = (decision: 'approve' | 'reject') =>
    start(async () => {
      const r = await decideAction({
        requestId,
        decision,
        leaveStatus,
        mode,
        note,
        confirmOverLimit: decision === 'approve' && !!state.needsConfirm,
      });
      setState(r);
      if (r.done) {
        toast.success(r.done);
        router.refresh();
      }
    });

  const select = `${inputClass} text-body`;
  return (
    <div className="flex flex-col gap-3">
      {kind === 'leave' ? (
        <label className="text-label-sm text-[var(--ink-muted)]">
          {l.markAs}
          <select
            className={select}
            value={leaveStatus}
            onChange={(e) => setLeaveStatus(e.target.value as typeof leaveStatus)}
          >
            <option value="paid_leave">{l.leaveStatus.paid_leave}</option>
            <option value="unpaid_leave">{l.leaveStatus.unpaid_leave}</option>
          </select>
        </label>
      ) : (
        <label className="text-label-sm text-[var(--ink-muted)]">
          {l.paidWith}
          <select className={select} value={mode} onChange={(e) => setMode(e.target.value)}>
            {Object.entries(l.modes).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-label-sm text-[var(--ink-muted)]">
        {l.reply}
        <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {state.error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {state.error}
        </p>
      )}
      {!state.done && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            aria-busy={pending}
            className={`${quietButtonClass} flex-1`}
            onClick={() => decide('reject')}
          >
            {l.reject}
          </button>
          <button
            type="button"
            disabled={pending}
            aria-busy={pending}
            className={`${buttonClass} inline-flex flex-[1.4] items-center justify-center gap-2`}
            onClick={() => decide('approve')}
          >
            <Check size={20} aria-hidden="true" />
            {pending ? l.working : state.needsConfirm ? l.approveAnyway : l.approve}
          </button>
        </div>
      )}
    </div>
  );
}
