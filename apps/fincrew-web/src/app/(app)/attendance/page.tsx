import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Contrast,
  Download,
  Moon,
  Sparkles,
  Umbrella,
  UmbrellaOff,
  X,
} from 'lucide-react';
import { monthOf } from '@fincrew/core';
import { loadAttendanceMonth } from '@/lib/attendance-month';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, quietButtonClass } from '../../components';
import { AttendanceGrid } from './grid';

const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (y: number, m: number) => MONTH.format(new Date(Date.UTC(y, m - 1, 1)));
const shift = (y: number, m: number, by: number) => {
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

const LEGEND = [
  ['present', Check, 'present'],
  ['half_day', Contrast, 'half-day'],
  ['absent', X, 'absent'],
  ['paid_leave', Umbrella, 'paid-leave'],
  ['unpaid_leave', UmbrellaOff, 'unpaid-leave'],
  ['weekly_off', Moon, 'weekly-off'],
  ['holiday', Sparkles, 'holiday'],
] as const;

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const me = (await requireMe())!;
  const can = (k: string) => me.permissions.includes(k);
  if (!can('staff.view') && !can('attendance.mark')) redirect('/');

  const today = todayIST();
  const sp = await searchParams;
  const current = monthOf(today);
  const asked = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? monthOf(`${sp.month}-01`) : current;
  const isFuture = ym(asked.year, asked.month) > ym(current.year, current.month);
  const { year, month } = isFuture ? current : asked;
  const prev = shift(year, month, -1);
  const next = shift(year, month, 1);
  const hasNext = ym(next.year, next.month) <= ym(current.year, current.month);

  const supabase = await createClient();
  const { days, rows } = await loadAttendanceMonth(supabase, me.shopId, year, month, today);

  const short = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const offLabels = Object.fromEntries(
    rows.map((r) => [
      r.staffId,
      !r.hasTemplate
        ? t('attendance.noTemplate')
        : r.offWeekdays.length === 0
          ? t('attendance.noOffs')
          : t('attendance.offs', { days: r.offWeekdays.map((w) => short[w]).join(', ') }),
    ]),
  );

  return (
    <>
      <PageHeader
        title={t('attendance.title')}
        subtitle={t('attendance.subtitle', {
          shop: me.shopName,
          count: rows.length,
          today: formatDate(today),
        })}
        actions={
          can('reports.export') &&
          rows.length > 0 && (
            <a
              href={`/attendance/export?month=${ym(year, month)}`}
              download
              className={`${quietButtonClass} inline-flex items-center gap-2`}
            >
              <Download size={20} aria-hidden="true" />
              {t('attendance.export.button')}
            </a>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={`/attendance?month=${ym(prev.year, prev.month)}`}
            aria-label={t('attendance.prevMonth')}
            className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <span className="text-title-md px-2">{monthName(year, month)}</span>
          {hasNext ? (
            <Link
              href={`/attendance?month=${ym(next.year, next.month)}`}
              aria-label={t('attendance.nextMonth')}
              className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </Link>
          ) : (
            <span
              className={`${quietButtonClass} inline-flex items-center border-0 px-2 opacity-[var(--opacity-disabled)]`}
              aria-hidden="true"
            >
              <ChevronRight size={20} />
            </span>
          )}
        </div>
        <ul aria-label={t('attendance.legend')} className="flex flex-wrap gap-1.5">
          {LEGEND.map(([s, Icon, token]) => (
            <li
              key={s}
              className="text-caption inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1"
              style={{ background: `var(--status-${token}-soft)`, color: `var(--status-${token})` }}
            >
              <Icon size={14} strokeWidth={2.6} aria-hidden="true" />
              {t(`status.${s}`)}
            </li>
          ))}
          <li className="text-caption inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--status-late-soft)] px-2.5 py-1 text-[var(--status-late)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-late)]" aria-hidden="true" />
            {t('attendance.lateDot')}
          </li>
          <li className="text-caption inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-1 text-[var(--status-unmarked)] outline-[1.5px] outline-offset-[-2px] outline-[var(--line-strong)] outline-dashed">
            {t('status.unmarked')}
          </li>
        </ul>
      </div>

      {rows.length === 0 ? (
        <p className="text-body-lg text-[var(--ink-muted)]">
          {t('attendance.empty', { month: monthName(year, month) })}
        </p>
      ) : (
        <AttendanceGrid
          days={days}
          rows={rows}
          today={today}
          canMark={can('attendance.mark')}
          canEditPast={can('attendance.edit_past')}
          offLabels={offLabels}
          monthName={monthName(year, month)}
          labels={{
            status: t('status', { returnObjects: true }) as unknown as Record<string, string>,
            weekdaysTiny: t('weekdays.tiny', { returnObjects: true }) as unknown as string[],
            columns: {
              staff: t('attendance.columns.staff'),
              days: t('attendance.columns.days'),
              late: t('attendance.columns.late'),
              absent: t('attendance.columns.absent'),
            },
            grid: t('attendance.grid', { month: monthName(year, month) }),
            cell: t('attendance.cell', {
              name: '{{name}}',
              date: '{{date}}',
              status: '{{status}}',
            }),
            cellLate: t('attendance.cellLate', {
              name: '{{name}}',
              date: '{{date}}',
              status: '{{status}}',
            }),
            selectedOne: t('attendance.selected_one', { count: '{{count}}' }),
            selectedOther: t('attendance.selected_other', { count: '{{count}}' }),
            setTo: t('attendance.setTo'),
            clear: t('attendance.clear'),
            clearMark: t('attendance.clearMark'),
            hint: t('attendance.hint'),
            readOnly: t('attendance.readOnly'),
            markToday: t('attendance.markToday'),
            markTodayNone: t('attendance.markTodayNone'),
            saving: t('attendance.saving'),
            savedOne: t('attendance.saved_one', { count: '{{count}}' }),
            savedOther: t('attendance.saved_other', { count: '{{count}}' }),
            clearedOne: t('attendance.cleared_one', { count: '{{count}}' }),
            clearedOther: t('attendance.cleared_other', { count: '{{count}}' }),
          }}
        />
      )}
      <p className="text-caption max-w-prose text-[var(--ink-muted)]">{t('attendance.footnote')}</p>
    </>
  );
}
