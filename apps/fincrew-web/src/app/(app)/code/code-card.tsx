'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Printer, RefreshCw } from 'lucide-react';
import { buttonClass, quietButtonClass } from '../../components';
import { newCodeAction } from './actions';

type Labels = {
  copy: string;
  copied: string;
  newCode: string;
  newConfirm: string;
  newYes: string;
  cancel: string;
};

/** Copy the code, and make a new one after a confirmation (the old QR stops working). */
export function CodeActions({ code, labels: l }: { code: string; labels: Labels }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ error?: string; done?: string }>({});
  const quiet = `${quietButtonClass} inline-flex items-center gap-2`;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className={quiet}
          onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true))}
        >
          <Copy size={18} aria-hidden="true" />
          {copied ? l.copied : l.copy}
        </button>
        {!asking && (
          <button type="button" className={quiet} onClick={() => setAsking(true)}>
            <RefreshCw size={18} aria-hidden="true" />
            {l.newCode}
          </button>
        )}
      </div>
      {asking && (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] bg-[var(--status-late-soft)] p-3">
          <p className="text-body">{l.newConfirm}</p>
          <div className="flex gap-2">
            <button type="button" className={quietButtonClass} onClick={() => setAsking(false)}>
              {l.cancel}
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${buttonClass} w-auto`}
              onClick={() =>
                start(async () => {
                  setMessage(await newCodeAction());
                  setAsking(false);
                  setCopied(false);
                  router.refresh();
                })
              }
            >
              {l.newYes}
            </button>
          </div>
        </div>
      )}
      {message.error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {message.error}
        </p>
      )}
      {message.done && (
        <p role="status" className="text-body text-[var(--status-present)]">
          {message.done}
        </p>
      )}
    </div>
  );
}

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className={`${quietButtonClass} inline-flex items-center gap-2 print:hidden`}
      onClick={() => window.print()}
    >
      <Printer size={18} aria-hidden="true" />
      {label}
    </button>
  );
}
