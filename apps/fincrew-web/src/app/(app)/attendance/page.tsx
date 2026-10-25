import { PendingLink as Link } from '@/components/app/pending-link';
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
import { addDays, formatTimeOfDay, monthOf, weekday } from '@fincrew/core';
import { loadAttendanceMonth } from '@fincrew/data';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { TabLinks } from '@/components/app/tab-links';
import { PageHeader, quietButtonClass } from '../../components';
import { DayRoster, type RosterRow } from './day-roster';
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
  searchParams: Promise<{ month?: string; view?: string; date?: string }>;
}) {
  const me = (await requireMe())!;
  const can = (k: string) => me.permissions.includes(k);
  if (!can('staff.view') && !can('attendance.mark')) redirect('/');

  const today = todayIST();
  const sp = await searchParams;
  const view: 'day' | 'month' = sp.view === 'month' ? 'month' : 'day';
  // Day view: the chosen day (never after today); Month view: the chosen month.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') && sp.date! <= today ? sp.date! : today;
  const current = monthOf(today);
  const asked =
    view === 'day'
      ? monthOf(date)
      : /^\d{4}-\d{2}$/.test(sp.month ?? '')
        ? monthOf(`${sp.month}-01`)
        : current;
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
          <>
            <TabLinks
              label={t('attendance.views.label')}
              items={[
                {
                  href: `/attendance?view=day&date=${date}`,
                  label: t('attendance.views.day'),
                  current: view === 'day',
                },
                {
                  href: `/attendance?view=month&month=${ym(year, month)}`,
                  label: t('attendance.views.month'),
                  current: view === 'month',
                },
              ]}
            />
            {can('reports.export') && rows.length > 0 && (
              <a
                href={`/attendance/export?month=${ym(year, month)}`}
                download
                className={`${quietButtonClass} inline-flex items-center gap-2`}
              >
                <Download size={20} aria-hidden="true" />
                {t('attendance.export.button')}
              </a>
            )}
          </>
        }
      />

      {view === 'day' && (
        <DayView
          date={date}
          today={today}
          rows={rows}
          offLabels={offLabels}
          editable={
            can('attendance.mark') &&
            (date === today || (date < today && can('attendance.edit_past')))
          }
        />
      )}

      {view === 'month' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Link
                href={`/attendance?view=month&month=${ym(prev.year, prev.month)}`}
                aria-label={t('attendance.prevMonth')}
                className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </Link>
              <span className="text-title-md px-2">{monthName(year, month)}</span>
              {hasNext ? (
                <Link
                  href={`/attendance?view=month&month=${ym(next.year, next.month)}`}
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
                  style={{
                    background: `var(--status-${token}-soft)`,
                    color: `var(--status-${token})`,
                  }}
                >
                  <Icon size={14} strokeWidth={2.6} aria-hidden="true" />
                  {t(`status.${s}`)}
                </li>
              ))}
              <li className="text-caption inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--status-late-soft)] px-2.5 py-1 text-[var(--status-late)]">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--status-late)]"
                  aria-hidden="true"
                />
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
          <p className="text-caption max-w-prose text-[var(--ink-muted)]">
            {t('attendance.footnote')}
          </p>
        </>
      )}
    </>
  );
}

/** Day view (design "Web · mark attendance (day)"): date bar, then the one-tap roster. */
function DayView({
  date,
  today,
  rows,
  offLabels,
  editable,
}: {
  date: string;
  today: string;
  rows: Awaited<ReturnType<typeof loadAttendanceMonth>>['rows'];
  offLabels: Record<string, string>;
  editable: boolean;
}) {
  const short = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const arrow = `${quietButtonClass} border-0 px-2`;
  const roster: RosterRow[] = rows
    .map((r) => ({ r, cell: r.cells.find((c) => c.date === date) }))
    .filter(({ cell }) => cell && cell.status !== 'not_employed')
    .map(({ r, cell }) => ({
      staffId: r.staffId,
      name: r.name,
      meta: `${offLabels[r.staffId]} · ${t('attendance.dayTotals', {
        days: r.payableDays,
        late: r.lateDays,
        absent: r.absentDays,
      })}`,
      status: cell!.status,
      marked: cell!.marked,
      checkIn:
        cell!.checkIn !== undefined
          ? t('attendance.roster.in', { time: formatTimeOfDay(cell!.checkIn) })
          : null,
      lateLabel:
        cell!.late && cell!.lateMinutes
          ? t('attendance.minutesLate', { minutes: cell!.lateMinutes })
          : null,
    }));
  const status = t('status', { returnObjects: true }) as unknown as Record<string, string>;

  return (
    <>
      <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2 shadow-xs">
        <div className="flex items-center gap-1">
          <Link
            href={`/attendance?view=day&date=${prev}`}
            aria-label={t('attendance.prevDay')}
            className={arrow}
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
          <span className="flex min-w-36 flex-col items-center leading-tight">
            <span className="text-sm font-semibold">
              {short[weekday(date)]} {formatDate(date)}
            </span>
            {date === today ? (
              <span className="text-xs font-semibold text-[var(--accent-ink)]">
                {t('attendance.today')}
              </span>
            ) : (
              <Link
                href="/attendance?view=day"
                className="text-xs font-medium text-[var(--accent-ink)] underline-offset-2 hover:underline"
              >
                {t('attendance.roster.backToToday')}
              </Link>
            )}
          </span>
          {next <= today ? (
            <Link
              href={`/attendance?view=day&date=${next}`}
              aria-label={t('attendance.nextDay')}
              className={arrow}
            >
              <ChevronRight aria-hidden="true" />
            </Link>
          ) : (
            <span className={`${arrow} opacity-40`} aria-hidden="true">
              <ChevronRight />
            </span>
          )}
        </div>
      </div>
      <DayRoster
        key={date}
        date={date}
        rows={roster}
        editable={editable}
        labels={{
          status,
          short: {
            present: t('attendance.short.present'),
            absent: t('attendance.short.absent'),
            half_day: t('attendance.short.half_day'),
            paid_leave: t('attendance.short.paid_leave'),
            unpaid_leave: t('attendance.short.unpaid_leave'),
          },
          chips: {
            present: status.present!,
            absent: status.absent!,
            half_day: status.half_day!,
            leave: t('attendance.roster.leave'),
            off: t('attendance.roster.off'),
            unmarked: status.unmarked!,
          },
          columns: {
            staff: t('attendance.columns.staff'),
            checkIn: t('attendance.roster.checkIn'),
            mark: t('attendance.roster.mark'),
          },
          search: t('attendance.roster.search'),
          markAllOne: t('attendance.roster.markAll', { count: '{{count}}' }),
          markAllOther: t('attendance.roster.markAll', { count: '{{count}}' }),
          marked: t('attendance.roster.marked', { name: '{{name}}', status: '{{status}}' }),
          markedAll: t('attendance.roster.markedAll', { count: '{{count}}' }),
          allMarked: t('attendance.roster.allMarked'),
          cleared: t('attendance.roster.cleared', { name: '{{name}}' }),
          undo: t('attendance.roster.undo'),
          more: t('attendance.roster.more', { name: '{{name}}' }),
          clearMark: t('attendance.roster.clearMark'),
          noMatch: t('attendance.roster.noMatch', { q: '{{q}}' }),
          empty: t('attendance.dayEmpty'),
          hint: t('attendance.roster.hint'),
          readOnly: date > today ? t('attendance.errors.future') : t('attendance.roster.locked'),
        }}
      />
    </>
  );
}
