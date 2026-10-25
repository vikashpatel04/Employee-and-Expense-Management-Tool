'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MoreHorizontal, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, inputClass } from '../../components';
import { clearAttendance, setAttendance } from './actions';

const MARKS = ['present', 'absent', 'half_day', 'paid_leave', 'unpaid_leave'] as const;
type Mark = (typeof MARKS)[number];
const TOKEN: Record<string, string> = {
  present: 'present',
  half_day: 'half-day',
  absent: 'absent',
  paid_leave: 'paid-leave',
  unpaid_leave: 'unpaid-leave',
  weekly_off: 'weekly-off',
  holiday: 'holiday',
};
type Filter = 'all' | 'present' | 'absent' | 'half_day' | 'leave' | 'off' | 'unmarked';

export type RosterRow = {
  staffId: string;
  name: string;
  /** Weekly offs and the month's Days · Late · Absent so far. */
  meta: string;
  /** What the day is now: a mark, or what the rules give (unmarked, weekly off, holiday…). */
  status: string;
  /** Set by someone (vs filled in from the calendar). */
  marked: boolean;
  /** "In 9:42 AM" when there is a check-in. */
  checkIn: string | null;
  lateLabel: string | null;
};

export type RosterLabels = {
  status: Record<string, string>;
  short: Record<Mark, string>;
  chips: Record<Exclude<Filter, 'all'>, string>;
  columns: { staff: string; checkIn: string; mark: string };
  search: string;
  markAllOne: string;
  markAllOther: string;
  marked: string;
  markedAll: string;
  allMarked: string;
  cleared: string;
  undo: string;
  more: string;
  clearMark: string;
  noMatch: string;
  empty: string;
  hint: string;
  readOnly: string;
};

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));

/**
 * Mark attendance for one day (design: "Web · mark attendance (day)", PagarBook-style): every
 * person on a row with one-tap P / A / HD / PL / UL. A tap saves at once (the button fills in
 * before the server answers) and the toast offers Undo; "Mark N present" fills everyone not
 * marked. Chips count and filter. Same rules as the grid and the app (`writeAttendance`).
 */
export function DayRoster({
  date,
  rows,
  editable,
  labels: l,
}: {
  date: string;
  rows: RosterRow[];
  /** Can this person change this day (permission, today / past rules). */
  editable: boolean;
  labels: RosterLabels;
}) {
  const router = useRouter();
  // Statuses shown before the server has answered (and after, until the page reloads).
  const [shown, setShown] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  useEffect(() => setShown({}), [rows]);

  const now = (r: RosterRow) => shown[r.staffId] ?? r.status;
  const working = (ids: string[], on: boolean) =>
    setBusy((b) => {
      const n = new Set(b);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  /** Save `status` (or clear) for these people; put the old look back if it fails. */
  const save = async (
    people: RosterRow[],
    status: Mark | 'clear',
    shownAs: Record<string, string>,
  ) => {
    const ids = people.map((p) => p.staffId);
    const before = Object.fromEntries(ids.map((id) => [id, shown[id]]));
    setShown((s) => ({ ...s, ...shownAs }));
    working(ids, true);
    const cells = ids.map((staffId) => ({ staffId, date }));
    const res =
      status === 'clear' ? await clearAttendance(cells) : await setAttendance(cells, status);
    working(ids, false);
    if (!res.ok) {
      setShown((s) => {
        const n = { ...s };
        for (const id of ids) {
          if (before[id] === undefined) delete n[id];
          else n[id] = before[id]!;
        }
        return n;
      });
      toast.error(res.error);
      return false;
    }
    router.refresh();
    return true;
  };

  /** Undo one person: their earlier mark again, or no mark if the day was filled by the rules. */
  const putBack = (r: RosterRow, was: { status: string; marked: boolean }) =>
    void save(
      [r],
      was.marked && (MARKS as readonly string[]).includes(was.status)
        ? (was.status as Mark)
        : 'clear',
      { [r.staffId]: was.marked ? was.status : r.marked ? 'unmarked' : r.status },
    );

  const mark = async (r: RosterRow, status: Mark) => {
    const current = now(r);
    if (current === status) return;
    const was = { status: current, marked: shown[r.staffId] !== undefined || r.marked };
    if (await save([r], status, { [r.staffId]: status }))
      toast.success(fill(l.marked, { name: r.name, status: l.status[status] ?? status }), {
        action: { label: l.undo, onClick: () => putBack(r, was) },
      });
  };

  const clear = async (r: RosterRow) => {
    const was = { status: now(r), marked: true };
    if (await save([r], 'clear', { [r.staffId]: 'unmarked' }))
      toast.success(fill(l.cleared, { name: r.name }), {
        action: { label: l.undo, onClick: () => putBack(r, was) },
      });
  };

  const unmarked = rows.filter((r) => now(r) === 'unmarked');
  const markAll = async () => {
    const people = unmarked;
    if (people.length === 0) return;
    const asPresent = Object.fromEntries(people.map((p) => [p.staffId, 'present']));
    if (await save(people, 'present', asPresent))
      toast.success(fill(l.markedAll, { count: people.length }), {
        action: {
          label: l.undo,
          onClick: () =>
            void save(
              people,
              'clear',
              Object.fromEntries(people.map((p) => [p.staffId, 'unmarked'])),
            ),
        },
      });
  };

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, half_day: 0, leave: 0, off: 0, unmarked: 0 };
    for (const r of rows) {
      const s = shown[r.staffId] ?? r.status;
      if (s === 'present') c.present++;
      else if (s === 'absent') c.absent++;
      else if (s === 'half_day') c.half_day++;
      else if (s === 'paid_leave' || s === 'unpaid_leave') c.leave++;
      else if (s === 'weekly_off' || s === 'holiday') c.off++;
      else if (s === 'unmarked') c.unmarked++;
    }
    return c;
  }, [rows, shown]);

  const needle = q.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (needle && !r.name.toLowerCase().includes(needle)) return false;
    const s = now(r);
    switch (filter) {
      case 'all':
        return true;
      case 'leave':
        return s === 'paid_leave' || s === 'unpaid_leave';
      case 'off':
        return s === 'weekly_off' || s === 'holiday';
      default:
        return s === filter;
    }
  });

  const chips: { key: Exclude<Filter, 'all'>; token: string | null; n: number }[] = [
    { key: 'present', token: 'present', n: counts.present },
    { key: 'absent', token: 'absent', n: counts.absent },
    { key: 'half_day', token: 'half-day', n: counts.half_day },
    { key: 'leave', token: 'paid-leave', n: counts.leave },
    { key: 'off', token: 'weekly-off', n: counts.off },
    { key: 'unmarked', token: null, n: counts.unmarked },
  ];

  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{l.empty}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {chips.map((c) => {
          const on = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(on ? 'all' : c.key)}
              className={cn(
                'flex h-16 items-center justify-between gap-2 rounded-lg border px-4 text-left transition-shadow',
                on ? 'ring-foreground/70 ring-2' : 'hover:shadow-sm',
                c.token
                  ? 'border-transparent'
                  : 'border-dashed border-[var(--line-strong)] bg-card',
              )}
              style={
                c.token
                  ? {
                      background: `var(--status-${c.token}-soft)`,
                      color: `var(--status-${c.token})`,
                    }
                  : { color: 'var(--status-unmarked)' }
              }
            >
              <span className="text-sm font-semibold">{l.chips[c.key]}</span>
              <span className="text-money-lg">{c.n}</span>
            </button>
          );
        })}
      </div>

      <section className="bg-card flex flex-col rounded-lg border shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <label className="relative min-w-0 flex-[1_1_240px] sm:max-w-xs">
            <span className="sr-only">{l.search}</span>
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={l.search}
              className={`${inputClass} mt-0 pl-9`}
            />
          </label>
          {editable ? (
            <Button
              disabled={unmarked.length === 0 || busy.size > 0}
              aria-busy={busy.size > 0 && unmarked.some((u) => busy.has(u.staffId))}
              onClick={() => void markAll()}
            >
              <Check aria-hidden="true" />
              {unmarked.length === 0
                ? l.allMarked
                : fill(unmarked.length === 1 ? l.markAllOne : l.markAllOther, {
                    count: unmarked.length,
                  })}
            </Button>
          ) : (
            <span className="text-muted-foreground text-sm">{l.readOnly}</span>
          )}
        </div>

        <div
          role="row"
          className="text-muted-foreground hidden grid-cols-[minmax(12rem,1fr)_110px_auto_36px] gap-3 border-b px-4 py-2 text-xs font-semibold lg:grid"
        >
          <span role="columnheader">{l.columns.staff}</span>
          <span role="columnheader">{l.columns.checkIn}</span>
          <span role="columnheader">{l.columns.mark}</span>
          <span />
        </div>

        {visible.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            {fill(l.noMatch, { q })}
          </p>
        ) : (
          <ul className="divide-y">
            {visible.map((r) => {
              const s = now(r);
              const isBusy = busy.has(r.staffId);
              const locked = !editable || s === 'future' || s === 'not_employed';
              const isMarked = shown[r.staffId] !== undefined ? s !== 'unmarked' : r.marked;
              return (
                <li
                  key={r.staffId}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:grid-cols-[minmax(12rem,1fr)_110px_auto_36px]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={r.name} size={32} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{r.name}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {(s === 'weekly_off' || s === 'holiday') && (
                          <span
                            className="mr-1 font-semibold"
                            style={{ color: `var(--status-${TOKEN[s]})` }}
                          >
                            {l.status[s]} ·
                          </span>
                        )}
                        {r.meta}
                      </span>
                    </span>
                  </span>
                  <span className="hidden flex-col text-xs tabular-nums lg:flex">
                    <span>{r.checkIn ?? '—'}</span>
                    {r.lateLabel && s === 'present' && (
                      <span className="font-semibold text-[var(--status-late)]">{r.lateLabel}</span>
                    )}
                  </span>
                  <span
                    role="group"
                    aria-label={`${r.name}: ${l.status[s] ?? s}`}
                    className="col-span-2 flex gap-1.5 lg:col-span-1"
                  >
                    {MARKS.map((m) => {
                      const on = s === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          title={l.status[m]}
                          aria-label={`${l.status[m]} · ${r.name}`}
                          aria-pressed={on}
                          disabled={locked || isBusy}
                          onClick={() => void mark(r, m)}
                          className={cn(
                            'h-8 min-w-11 flex-1 rounded-md border px-2 text-xs font-semibold transition-colors lg:flex-none',
                            'disabled:cursor-not-allowed',
                            on
                              ? 'text-[var(--surface)]'
                              : 'bg-card text-muted-foreground hover:bg-muted',
                            locked && !on && 'opacity-50',
                          )}
                          style={
                            on
                              ? {
                                  background: `var(--status-${TOKEN[m]})`,
                                  borderColor: `var(--status-${TOKEN[m]})`,
                                }
                              : undefined
                          }
                        >
                          {l.short[m]}
                        </button>
                      );
                    })}
                  </span>
                  <span className="row-start-1 justify-self-end lg:row-start-auto">
                    {!locked && isMarked && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={fill(l.more, { name: r.name })}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => void clear(r)}>
                            {l.clearMark}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-muted-foreground text-xs">{l.hint}</p>
    </div>
  );
}
