'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eraser } from 'lucide-react';
import { t } from '@/lib/i18n';
import { STATUS_ICON, STATUS_TOKEN } from '@/lib/status-style';
import { clearAttendance, setAttendance } from '../../attendance/actions';

const SETTABLE = ['present', 'half_day', 'absent', 'paid_leave', 'unpaid_leave'] as const;

/** "Change" on the chosen day: set a status or clear the mark (same rules as the grid). */
export function DayChange({
  staffId,
  date,
  current,
}: {
  staffId: string;
  date: string;
  current: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const status = t('status', { returnObjects: true }) as unknown as Record<string, string>;
  const run = (next: (typeof SETTABLE)[number] | 'clear') =>
    start(async () => {
      setError(null);
      const cells = [{ staffId, date }];
      const r = next === 'clear' ? await clearAttendance(cells) : await setAttendance(cells, next);
      if (!r.ok) setError(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-label-sm min-h-11 w-fit rounded-[var(--radius-md)] px-3 text-[var(--accent-ink)] underline"
      >
        {t('staffDetail.attendance.change')}
      </button>
    );
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label={t('attendance.setTo')} className="flex flex-wrap gap-1.5">
        {SETTABLE.filter((s) => s !== current).map((s) => {
          const Icon = STATUS_ICON[s]!;
          return (
            <button
              key={s}
              type="button"
              disabled={pending}
              aria-busy={pending}
              onClick={() => run(s)}
              className="text-caption inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-pill)] px-3 disabled:opacity-[var(--opacity-disabled)]"
              style={{
                background: `var(--status-${STATUS_TOKEN[s]}-soft)`,
                color: `var(--status-${STATUS_TOKEN[s]})`,
              }}
            >
              <Icon size={16} strokeWidth={2.6} aria-hidden="true" />
              {status[s]}
            </button>
          );
        })}
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={() => run('clear')}
          className="text-caption inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-pill)] px-3 text-[var(--status-unmarked)] outline-[1.5px] outline-[var(--line-strong)] outline-dashed disabled:opacity-[var(--opacity-disabled)]"
        >
          <Eraser size={16} strokeWidth={2.6} aria-hidden="true" />
          {t('attendance.clearMark')}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
