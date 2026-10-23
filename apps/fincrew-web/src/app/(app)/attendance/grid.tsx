'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Contrast,
  Moon,
  Sparkles,
  Umbrella,
  UmbrellaOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { GridRow } from '@/lib/attendance-month';
import { Avatar } from '../../components';
import { setAttendance } from './actions';

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
  hint: string;
  readOnly: string;
  markToday: string;
  markTodayNone: string;
  saving: string;
  savedOne: string;
  savedOther: string;
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
  labels,
}: {
  days: { date: string; weekday: number }[];
  rows: GridRow[];
  today: string;
  canMark: boolean;
  canEditPast: boolean;
  offLabels: Record<string, string>;
  labels: GridLabels;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const save = (cells: { staffId: string; date: string }[], status: (typeof SETTABLE)[number]) =>
    start(async () => {
      setMessage(null);
      const res = await setAttendance(cells, status);
      if (res.ok) {
        setSelected(new Set());
        setMessage({
          ok: true,
          text: fill(res.count === 1 ? labels.savedOne : labels.savedOther, { count: res.count }),
        });
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error });
      }
    });

  const count = selected.size;
  const cols = `176px repeat(${days.length}, 28px) repeat(3, 56px)`;

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
              {labels.hint}
            </p>
          )}
          <button
            type="button"
            disabled={pending || todayUnmarked.length === 0}
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

      <div className="overflow-x-auto rounded-[var(--radius-lg)] bg-[var(--surface)] p-2 shadow-[var(--elevation-1)]">
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
              className="text-caption px-2 font-semibold text-[var(--ink-muted)]"
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
            {[labels.columns.days, labels.columns.late, labels.columns.absent].map((h) => (
              <span
                key={h}
                role="columnheader"
                className="text-caption pr-1.5 text-right font-semibold text-[var(--ink-muted)]"
              >
                {h}
              </span>
            ))}
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
                className="flex min-w-0 items-center gap-2 px-2 font-[family-name:var(--font-sans)]"
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
              <span role="cell" className="text-money-sm pr-1.5 text-right">
                {r.payableDays}
              </span>
              <span role="cell" className="text-money-sm pr-1.5 text-right text-[var(--ink-muted)]">
                {r.lateDays}
              </span>
              <span role="cell" className="text-money-sm pr-1.5 text-right text-[var(--ink-muted)]">
                {r.absentDays}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
