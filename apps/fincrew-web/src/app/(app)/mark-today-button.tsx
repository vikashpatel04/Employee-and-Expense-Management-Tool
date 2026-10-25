'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { t } from '@/lib/i18n';
import { setAttendance } from './attendance/actions';

/** Dashboard "Mark today present": everyone working today who isn't marked yet. */
export function MarkTodayButton({ cells }: { cells: { staffId: string; date: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || cells.length === 0}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            const r = await setAttendance(cells, 'present');
            setMessage(
              r.ok
                ? { ok: true, text: t('home.marked', { count: r.count }) }
                : { ok: false, text: r.error },
            );
            if (r.ok) router.refresh();
          })
        }
        className="text-label-sm inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[var(--on-accent)] disabled:opacity-[var(--opacity-disabled)]"
      >
        <Check size={20} aria-hidden="true" />
        {pending ? t('home.marking') : t('home.markToday')}
      </button>
      {message && (
        <span
          role={message.ok ? 'status' : 'alert'}
          className={`text-caption ${message.ok ? 'text-[var(--status-present)]' : 'text-[var(--danger)]'}`}
        >
          {message.text}
        </span>
      )}
    </span>
  );
}
