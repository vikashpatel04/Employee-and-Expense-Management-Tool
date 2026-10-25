'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { t } from '@/lib/i18n';
import { setAttendance } from './attendance/actions';
import { toast } from 'sonner';
import { buttonClass } from '../components';

/** Dashboard "Mark today present": everyone working today who isn't marked yet. */
export function MarkTodayButton({ cells }: { cells: { staffId: string; date: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || cells.length === 0}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            const r = await setAttendance(cells, 'present');
            if (r.ok) {
              toast.success(t('home.marked', { count: r.count }));
              router.refresh();
            } else toast.error(r.error);
          })
        }
        className={buttonClass + ' w-auto'}
      >
        <Check size={20} aria-hidden="true" />
        {pending ? t('home.marking') : t('home.markToday')}
      </button>
    </span>
  );
}
