import { PendingLink as Link } from '@/components/app/pending-link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatTimeOfDay, monthDates, monthOf, weekday } from '@fincrew/core';
import { loadAttendanceMonth } from '@fincrew/data';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { quietButtonClass } from '../../../components';
import { STATUS_ICON, STATUS_TOKEN } from '@/lib/status-style';
import { DayChange } from './day-change';

const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const shift = (y: number, m: number, by: number) => {
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};
/** Monday first, like the design's calendar. */
const COLUMN = (wd: number) => (wd + 6) % 7;

/**
 * Staff detail · Attendance (design: "Staff detail · Attendance"): the person's month as a
 * calendar, the chosen day's status, times and lateness (with Change when allowed), and the
 * month's counts. Days come from the same core rules as the grid.
 */
export async function AttendanceTab({
  staffId,
  shopId,
  month: askedMonth,
  day: askedDay,
  canMark,
  canEditPast,
}: {
  staffId: string;
  shopId: string;
  month?: string;
  day?: string;
  canMark: boolean;
  canEditPast: boolean;
}) {
  const today = todayIST();
  const current = monthOf(today);
  const asked = /^\d{4}-\d{2}$/.test(askedMonth ?? '') ? monthOf(`${askedMonth}-01`) : current;
  const { year, month } =
    ym(asked.year, asked.month) > ym(current.year, current.month) ? current : asked;
  const prev = shift(year, month, -1);
  const next = shift(year, month, 1);
  const hasNext = ym(next.year, next.month) <= ym(current.year, current.month);

  const supabase = await createClient();
  const { rows } = await loadAttendanceMonth(supabase, shopId, year, month, today);
  const row = rows.find((r) => r.staffId === staffId);
  const dates = monthDates(year, month);
  const base = `?tab=attendance&month=${ym(year, month)}`;
  if (!row) {
    return (
      <p className="text-body-lg text-[var(--ink-muted)]">
        {t('staffDetail.attendance.notEmployed', {
          month: MONTH.format(new Date(Date.UTC(year, month - 1, 1))),
        })}
      </p>
    );
  }
  const cells = new Map(row.cells.map((c) => [c.date, c]));
  const day =
    askedDay && cells.has(askedDay)
      ? askedDay
      : cells.has(today)
        ? today
        : [...dates].reverse().find((d) => cells.get(d)?.status !== 'future')!;
  const cell = cells.get(day)!;
  const short = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const tiny = t('weekdays.tiny', { returnObjects: true }) as unknown as string[];
  const status = t('status', { returnObjects: true }) as unknown as Record<string, string>;
  const canChange =
    canMark &&
    cell.status !== 'future' &&
    cell.status !== 'not_employed' &&
    (day === today || (day < today && canEditPast));

  const count = (s: string) => row.cells.filter((c) => c.status === s).length;
  const totals = (
    [
      ['present', count('present')],
      ['late', row.lateDays],
      ['half_day', count('half_day')],
      ['absent', count('absent')],
      ['paid_leave', count('paid_leave')],
      ['unpaid_leave', count('unpaid_leave')],
      ['weekly_off', count('weekly_off')],
      ['holiday', count('holiday')],
      ['unmarked', count('unmarked')],
    ] as const
  ).filter(([, n]) => n > 0);

  const lead = COLUMN(weekday(dates[0]!));

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`?tab=attendance&month=${ym(prev.year, prev.month)}`}
            aria-label={t('attendance.prevMonth')}
            className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <h2 className="text-title-md">{MONTH.format(new Date(Date.UTC(year, month - 1, 1)))}</h2>
          {hasNext ? (
            <Link
              href={`?tab=attendance&month=${ym(next.year, next.month)}`}
              aria-label={t('attendance.nextMonth')}
              className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </Link>
          ) : (
            <span className="w-11" />
          )}
        </div>
        <div
          role="grid"
          aria-label={t('staffDetail.attendance.calendar')}
          className="grid grid-cols-7 gap-1"
        >
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <span
              key={wd}
              role="columnheader"
              className="text-caption text-center font-semibold text-[var(--ink-muted)]"
            >
              {tiny[wd]}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {dates.map((d) => {
            const c = cells.get(d)!;
            const Icon = STATUS_ICON[c.status];
            const token = STATUS_TOKEN[c.status];
            const selected = d === day;
            const future = c.status === 'future' || c.status === 'not_employed';
            const label = `${short[weekday(d)]} ${formatDate(d)}, ${status[c.status] ?? c.status}${c.late ? `, ${status.late}` : ''}`;
            const style =
              token != null
                ? { background: `var(--status-${token}-soft)`, color: `var(--status-${token})` }
                : c.status === 'unmarked'
                  ? { outline: '1.5px dashed var(--line-strong)', outlineOffset: '-3px' }
                  : { boxShadow: 'inset 0 0 0 1px var(--line)', color: 'var(--ink-muted)' };
            const inner = (
              <>
                <span className="text-caption font-semibold">{Number(d.slice(8))}</span>
                {Icon && <Icon size={16} strokeWidth={2.6} aria-hidden="true" />}
                {c.late && (
                  <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--status-late)]" />
                )}
              </>
            );
            const cls = `relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] ${
              selected ? 'shadow-[inset_0_0_0_2px_var(--accent-ink)]' : ''
            } ${d === today ? 'font-bold' : ''}`;
            return future ? (
              <span key={d} role="gridcell" aria-label={label} className={cls} style={style}>
                {inner}
              </span>
            ) : (
              <Link
                key={d}
                role="gridcell"
                href={`${base}&day=${d}`}
                aria-label={label}
                aria-selected={selected}
                scroll={false}
                className={cls}
                style={style}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-xs">
          <h3 className="text-title-md">
            {short[weekday(day)]} {formatDate(day)}
          </h3>
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={cell.status} label={status[cell.status] ?? cell.status} />
            {cell.late && (
              <span className="text-caption rounded-[var(--radius-pill)] bg-[var(--status-late-soft)] px-2.5 py-1 font-semibold text-[var(--status-late)]">
                {t('attendance.minutesLate', { minutes: cell.lateMinutes ?? 0 })}
              </span>
            )}
          </span>
          {(cell.checkIn !== undefined || cell.checkOut !== undefined) && (
            <span className="text-body font-[family-name:var(--font-num)] tabular-nums">
              {t('staffDetail.attendance.times', {
                in: cell.checkIn !== undefined ? formatTimeOfDay(cell.checkIn) : '—',
                out: cell.checkOut !== undefined ? formatTimeOfDay(cell.checkOut) : '—',
              })}
            </span>
          )}
          {!cell.marked && cell.status !== 'unmarked' && (
            <span className="text-caption text-[var(--ink-muted)]">
              {t('staffDetail.attendance.fromRules')}
            </span>
          )}
          {canChange && <DayChange staffId={staffId} date={day} current={cell.status} />}
        </section>

        <section className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-xs">
          <h3 className="text-label-sm">
            {t('staffDetail.attendance.payable', {
              days: row.payableDays,
            })}
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {totals.map(([s, n]) => (
              <li key={s}>
                <StatusPill status={s} label={`${n} ${status[s]}`} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const token = STATUS_TOKEN[status];
  const Icon = STATUS_ICON[status];
  return (
    <span
      className="text-caption inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1"
      style={
        token
          ? { background: `var(--status-${token}-soft)`, color: `var(--status-${token})` }
          : {
              outline: '1.5px dashed var(--line-strong)',
              outlineOffset: '-2px',
              color: 'var(--status-unmarked)',
            }
      }
    >
      {Icon && <Icon size={14} strokeWidth={2.6} aria-hidden="true" />}
      {label}
    </span>
  );
}
