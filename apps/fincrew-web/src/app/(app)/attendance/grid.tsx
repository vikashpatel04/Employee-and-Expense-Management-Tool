'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Contrast,
  Eraser,
  Moon,
  Sparkles,
  Umbrella,
  UmbrellaOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import { formatDisplayDate, weekday } from '@fincrew/core';
import type { GridRow } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { Avatar } from '../../components';
import { clearAttendance, setAttendance } from './actions';

const ICON: Record<string, LucideIcon> = {
  present: Check,
  half_day: Contrast,
  absent: X,
  paid_leave: Umbrella,
  unpaid_leave: UmbrellaOff,
  weekly_off: Moon,
  holiday: Sparkles,
};
const TOKEN: Record<string, string> = {
  present: 'present',
  half_day: 'half-day',
  absent: 'absent',
  paid_leave: 'paid-leave',
  unpaid_leave: 'unpaid-leave',
  weekly_off: 'weekly-off',
  holiday: 'holiday',
};
const SETTABLE = ['present', 'half_day', 'absent', 'paid_leave', 'unpaid_leave'] as const;

export type GridLabels = {
  status: Record<string, string>;
  weekdaysTiny: string[];
  columns: { staff: string; days: string; late: string; absent: string };
  grid: string;
  cell: string;
  cellLate: string;
  selectedOne: string;
  selectedOther: string;
  setTo: string;
  clear: string;
  clearMark: string;
  hint: string;
  readOnly: string;
  markToday: string;
  markTodayNone: string;
  saving: string;
  savedOne: string;
  savedOther: string;
  clearedOne: string;
  clearedOther: string;
};

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));

/**
 * Staff × days grid (design: "Web · attendance grid"). Click days to select, then "Set to" one
 * status for all of them; "Mark today present" fills today's unmarked working days.
 */
export function AttendanceGrid({
  days,
  rows,
  today,
  canMark,
  canEditPast,
  offLabels,
  monthName,
  labels,
}: {
  days: { date: string; weekday: number }[];
  rows: GridRow[];
  today: string;
  canMark: boolean;
  canEditPast: boolean;
  offLabels: Record<string, string>;
  monthName: string;
  labels: GridLabels;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Phones show one day at a time (design: "Web · attendance on a phone"); md+ always the grid.
  const [view, setView] = useState<'day' | 'month'>('day');
  const pastDates = days.map((d) => d.date).filter((d) => d <= today);
  const [dayDate, setDayDate] = useState(
    pastDates.includes(today) ? today : (pastDates.at(-1) ?? days[0]?.date ?? today),
  );
  const switchTo = (next: { view?: 'day' | 'month'; date?: string }) => {
    setSelected(new Set());
    if (next.view) setView(next.view);
    if (next.date) setDayDate(next.date);
  };
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const editable = (status: string, date: string) =>
    canMark &&
    status !== 'future' &&
    status !== 'not_employed' &&
    (date === today || (date < today && canEditPast));

  const todayUnmarked = useMemo(
    () =>
      rows
        .filter((r) => r.cells.find((c) => c.date === today)?.status === 'unmarked')
        .map((r) => ({ staffId: r.staffId, date: today })),
    [rows, today],
  );

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = (
    cells: { staffId: string; date: string }[],
    status: (typeof SETTABLE)[number] | 'clear',
  ) =>
    start(async () => {
      setMessage(null);
      const res =
        status === 'clear' ? await clearAttendance(cells) : await setAttendance(cells, status);
      if (res.ok) {
        setSelected(new Set());
        setMessage({
          ok: true,
          text: fill(
            status === 'clear'
              ? res.count === 1
                ? labels.clearedOne
                : labels.clearedOther
              : res.count === 1
                ? labels.savedOne
                : labels.savedOther,
            { count: res.count },
          ),
        });
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error });
      }
    });

  const count = selected.size;
  // Names (left) and totals (right) stay pinned while the days scroll between them.
  const cols = `176px repeat(${days.length}, 28px) 174px`;
  const pinLeft = 'sticky left-0 z-10 bg-[var(--surface)] shadow-[1px_0_0_var(--line)]';
  const pinRight =
    'sticky right-0 z-10 grid grid-cols-3 gap-0.5 bg-[var(--surface)] shadow-[-1px_0_0_var(--line)]';

  return (
    <div className="flex flex-col gap-4">
      {canMark ? (
        <div className="flex flex-wrap items-center gap-3">
          {count > 0 ? (
            <div
              role="toolbar"
              aria-label={labels.setTo}
              className="flex flex-1 flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface)] py-2.5 pr-3 pl-4 shadow-[var(--elevation-2)]"
            >
              <span className="text-label-sm mr-2">
                {fill(count === 1 ? labels.selectedOne : labels.selectedOther, { count })}
              </span>
              <span className="text-caption text-[var(--ink-muted)]">{labels.setTo}</span>
              {SETTABLE.map((s) => {
                const Icon = ICON[s]!;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={pending}
                    aria-busy={pending}
                    onClick={() =>
                      save(
                        [...selected].map((k) => {
                          const [staffId, date] = k.split('|') as [string, string];
                          return { staffId, date };
                        }),
                        s,
                      )
                    }
                    className="text-caption inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-pill)] px-3 disabled:opacity-[var(--opacity-disabled)]"
                    style={{
                      background: `var(--status-${TOKEN[s]}-soft)`,
                      color: `var(--status-${TOKEN[s]})`,
                    }}
                  >
                    <Icon size={16} strokeWidth={2.6} aria-hidden="true" />
                    {labels.status[s]}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={pending}
                aria-busy={pending}
                onClick={() =>
                  save(
                    [...selected].map((k) => {
                      const [staffId, date] = k.split('|') as [string, string];
                      return { staffId, date };
                    }),
                    'clear',
                  )
                }
                className="text-caption inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-pill)] px-3 text-[var(--status-unmarked)] outline-[1.5px] outline-[var(--line-strong)] outline-dashed disabled:opacity-[var(--opacity-disabled)]"
              >
                <Eraser size={16} strokeWidth={2.6} aria-hidden="true" />
                {labels.clearMark}
              </button>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-label-sm min-h-10 px-3 text-[var(--accent-ink)]"
              >
                {labels.clear}
              </button>
            </div>
          ) : (
            <p className="text-body flex min-h-10 flex-1 items-center text-[var(--ink-muted)]">
              <span className={view === 'day' ? 'hidden md:inline' : ''}>{labels.hint}</span>
              <span className={view === 'day' ? 'md:hidden' : 'hidden'}>
                {t('attendance.dayHint')}
              </span>
            </p>
          )}
          <button
            type="button"
            disabled={pending || todayUnmarked.length === 0}
            aria-busy={pending}
            onClick={() => save(todayUnmarked, 'present')}
            title={todayUnmarked.length === 0 ? labels.markTodayNone : undefined}
            className="text-label-sm inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[var(--on-accent)] disabled:opacity-[var(--opacity-disabled)]"
          >
            <Check size={20} aria-hidden="true" />
            {pending ? labels.saving : labels.markToday}
          </button>
        </div>
      ) : (
        <p className="text-body text-[var(--ink-muted)]">{labels.readOnly}</p>
      )}

      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`text-body rounded-[var(--radius-md)] px-4 py-3 ${
            message.ok
              ? 'bg-[var(--status-present-soft)] text-[var(--status-present)]'
              : 'bg-[var(--status-absent-soft)] text-[var(--status-absent)]'
          }`}
        >
          {message.text}
        </p>
      )}

      <div
        role="group"
        aria-label={t('attendance.views.label')}
        className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1 md:hidden"
      >
        {(['day', 'month'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => switchTo({ view: v })}
            className={`text-label-sm min-h-10 flex-1 rounded-[var(--radius-sm)] ${
              view === v
                ? 'bg-[var(--surface)] shadow-[var(--elevation-1)]'
                : 'text-[var(--ink-muted)]'
            }`}
          >
            {t(`attendance.views.${v}`)}
          </button>
        ))}
      </div>

      {view === 'day' && (
        <div className="md:hidden">
          <DayView
            rows={rows}
            date={dayDate}
            dates={pastDates}
            today={today}
            monthName={monthName}
            statusLabels={labels.status}
            selected={selected}
            editable={editable}
            onToggle={toggle}
            onDate={(d) => switchTo({ date: d })}
          />
        </div>
      )}

      <div
        className={`${view === 'day' ? 'hidden md:block' : ''} overflow-x-auto rounded-[var(--radius-lg)] bg-[var(--surface)] py-2 shadow-[var(--elevation-1)]`}
      >
        <div
          role="table"
          aria-label={labels.grid}
          className="flex w-max flex-col gap-0.5 font-[family-name:var(--font-num)] tabular-nums"
        >
          <div
            role="row"
            className="grid items-end gap-0.5 pb-1"
            style={{ gridTemplateColumns: cols }}
          >
            <span
              role="columnheader"
              className={`text-caption self-stretch px-3 font-semibold text-[var(--ink-muted)] ${pinLeft} flex items-end`}
            >
              {labels.columns.staff}
            </span>
            {days.map((d) => (
              <span key={d.date} role="columnheader" className="flex flex-col items-center gap-0.5">
                <span className="text-micro text-[var(--ink-muted)]">
                  {labels.weekdaysTiny[d.weekday]}
                </span>
                <span
                  className={`text-caption grid h-6 w-[26px] place-items-center rounded-[var(--radius-pill)] font-semibold ${
                    d.date === today ? 'shadow-[inset_0_0_0_2px_var(--ink)]' : ''
                  }`}
                >
                  {Number(d.date.slice(8))}
                </span>
              </span>
            ))}
            <span className={`${pinRight} self-stretch items-end pr-2`}>
              {[labels.columns.days, labels.columns.late, labels.columns.absent].map((h) => (
                <span
                  key={h}
                  role="columnheader"
                  className="text-caption text-right font-semibold text-[var(--ink-muted)]"
                >
                  {h}
                </span>
              ))}
            </span>
          </div>

          {rows.map((r) => (
            <div
              key={r.staffId}
              role="row"
              className="grid min-h-9 items-center gap-0.5"
              style={{ gridTemplateColumns: cols }}
            >
              <span
                role="rowheader"
                className={`flex min-w-0 items-center gap-2 self-stretch px-3 font-[family-name:var(--font-sans)] ${pinLeft}`}
              >
                <Avatar name={r.name} size={28} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] leading-[18px] font-semibold">
                    {r.name}
                  </span>
                  <span className="text-micro truncate font-medium text-[var(--ink-muted)]">
                    {offLabels[r.staffId]}
                  </span>
                </span>
              </span>
              {r.cells.map((c) => {
                const key = `${r.staffId}|${c.date}`;
                const isSel = selected.has(key);
                const can = editable(c.status, c.date);
                const statusLabel = labels.status[c.status] ?? c.status;
                const aria = fill(c.late ? labels.cellLate : labels.cell, {
                  name: r.name,
                  date: `${c.date.slice(8)}/${c.date.slice(5, 7)}/${c.date.slice(0, 4)}`,
                  status: statusLabel,
                });
                const Icon = ICON[c.status];
                const token = TOKEN[c.status];
                const style =
                  token != null
                    ? { background: `var(--status-${token}-soft)`, color: `var(--status-${token})` }
                    : c.status === 'unmarked'
                      ? { outline: '1.5px dashed var(--line-strong)', outlineOffset: '-3px' }
                      : { boxShadow: 'inset 0 0 0 1px var(--line)' };
                return (
                  <button
                    key={c.date}
                    type="button"
                    role="cell"
                    aria-label={aria}
                    aria-pressed={can ? isSel : undefined}
                    disabled={!can}
                    onClick={() => toggle(key)}
                    className={`relative grid h-8 w-7 place-items-center rounded-[var(--radius-xs)] ${
                      can ? 'cursor-pointer' : 'cursor-default'
                    } ${isSel ? 'shadow-[inset_0_0_0_2px_var(--accent-ink)]' : ''}`}
                    style={style}
                  >
                    {Icon && <Icon size={16} strokeWidth={2.6} aria-hidden="true" />}
                    {c.late && (
                      <span className="absolute top-[3px] right-[3px] h-1.5 w-1.5 rounded-full bg-[var(--status-late)]" />
                    )}
                  </button>
                );
              })}
              <span className={`${pinRight} items-center self-stretch pr-2`}>
                <span role="cell" className="text-money-sm text-right">
                  {r.payableDays}
                </span>
                <span role="cell" className="text-money-sm text-right text-[var(--ink-muted)]">
                  {r.lateDays}
                </span>
                <span role="cell" className="text-money-sm text-right text-[var(--ink-muted)]">
                  {r.absentDays}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One day, one row per person (phones): status, minutes late, and the month's totals so far. */
function DayView({
  rows,
  date,
  dates,
  today,
  monthName,
  statusLabels,
  selected,
  editable,
  onToggle,
  onDate,
}: {
  rows: GridRow[];
  date: string;
  dates: string[];
  today: string;
  monthName: string;
  statusLabels: Record<string, string>;
  selected: Set<string>;
  editable: (status: string, date: string) => boolean;
  onToggle: (key: string) => void;
  onDate: (date: string) => void;
}) {
  const weekdays = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const at = dates.indexOf(date);
  const prev = at > 0 ? dates[at - 1] : undefined;
  const next = at >= 0 && at < dates.length - 1 ? dates[at + 1] : undefined;
  const people = rows
    .map((r) => ({ row: r, cell: r.cells.find((c) => c.date === date)! }))
    .filter((x) => x.cell && x.cell.status !== 'not_employed' && x.cell.status !== 'future');
  const count = (f: (x: (typeof people)[number]) => boolean) => people.filter(f).length;
  const chips = [
    ['present', count((x) => ['present', 'half_day'].includes(x.cell.status)), Check],
    ['absent', count((x) => x.cell.status === 'absent'), X],
    ['late', count((x) => x.cell.late), Clock],
    ['unmarked', count((x) => x.cell.status === 'unmarked'), null],
  ] as const;
  const arrow =
    'grid h-12 w-12 place-items-center rounded-[var(--radius-sm)] disabled:opacity-[var(--opacity-disabled)]';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-1 rounded-[var(--radius-md)] bg-[var(--surface)] p-1 shadow-[var(--elevation-1)]">
        <button
          type="button"
          aria-label={t('attendance.prevDay')}
          disabled={!prev}
          onClick={() => prev && onDate(prev)}
          className={arrow}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span className="flex flex-col items-center" aria-live="polite">
          <span className="text-label-sm">
            {weekdays[weekday(date)]} {formatDisplayDate(date)}
          </span>
          {date === today && (
            <span className="text-caption text-[var(--ink-muted)]">{t('attendance.today')}</span>
          )}
        </span>
        <button
          type="button"
          aria-label={t('attendance.nextDay')}
          disabled={!next}
          onClick={() => next && onDate(next)}
          className={arrow}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      <ul className="flex gap-2 overflow-x-auto">
        {chips.map(([k, n, Icon]) => (
          <li
            key={k}
            className="flex min-h-12 min-w-20 flex-1 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5"
            style={
              k === 'unmarked'
                ? {
                    outline: '1.5px dashed var(--line-strong)',
                    outlineOffset: '-2px',
                    color: 'var(--status-unmarked)',
                  }
                : { background: `var(--status-${k}-soft)`, color: `var(--status-${k})` }
            }
          >
            {Icon && <Icon size={18} strokeWidth={2.6} aria-hidden="true" />}
            <span className="flex flex-col">
              <span className="text-money-sm">{n}</span>
              <span className="text-micro">{statusLabels[k]}</span>
            </span>
          </li>
        ))}
      </ul>

      {people.length === 0 ? (
        <p className="text-body text-[var(--ink-muted)]">{t('attendance.dayEmpty')}</p>
      ) : (
        <ul className="overflow-hidden rounded-lg border bg-card shadow-xs">
          {people.map(({ row: r, cell: c }) => {
            const key = `${r.staffId}|${date}`;
            const isSel = selected.has(key);
            const can = editable(c.status, date);
            const Icon = ICON[c.status];
            const token = TOKEN[c.status];
            return (
              <li key={r.staffId} className="border-b border-[var(--line)] last:border-0">
                <button
                  type="button"
                  aria-pressed={can ? isSel : undefined}
                  disabled={!can}
                  onClick={() => onToggle(key)}
                  className={`flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left ${
                    isSel
                      ? 'bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]'
                      : 'bg-[var(--surface)]'
                  }`}
                >
                  <Avatar name={r.name} size={36} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-label-sm truncate">{r.name}</span>
                    <span className="text-caption font-[family-name:var(--font-num)] text-[var(--ink-muted)] tabular-nums">
                      {t('attendance.dayTotals', {
                        days: r.payableDays,
                        late: r.lateDays,
                        absent: r.absentDays,
                      })}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span
                      className="text-caption inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1"
                      style={
                        token
                          ? {
                              background: `var(--status-${token}-soft)`,
                              color: `var(--status-${token})`,
                            }
                          : {
                              outline: '1.5px dashed var(--line-strong)',
                              outlineOffset: '-2px',
                              color: 'var(--status-unmarked)',
                            }
                      }
                    >
                      {Icon && <Icon size={14} strokeWidth={2.6} aria-hidden="true" />}
                      {statusLabels[c.status] ?? c.status}
                    </span>
                    {c.late && (
                      <span className="text-micro font-semibold text-[var(--status-late)]">
                        {t('attendance.minutesLate', { minutes: c.lateMinutes ?? 0 })}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-caption text-[var(--ink-muted)]">
        {t('attendance.dayFootnote', { month: monthName })}
      </p>
    </div>
  );
}
