import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock,
  Hourglass,
  IndianRupee,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  daysBetween,
  formatINR,
  formatTimeOfDay,
  minutesOfDayIST,
  monthEnd,
  monthOf,
  weekday,
} from '@fincrew/core';
import {
  loadMoney,
  loadSalary,
  loadSoon,
  loadToday,
  type SalaryState,
  type SoonItem,
} from '@/lib/dashboard';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Avatar, PageHeader, quietButtonClass } from '../components';
import { MarkTodayButton } from './mark-today-button';

const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const card =
  'flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]';
const STEPS = ['worked', 'finalized', 'paid'] as const;
const REACHED: Record<SalaryState, number> = { not_run: 0, draft: 1, finalized: 2, paid: 3 };

/**
 * Dashboard (design: "Web · dashboard"): today's attendance, money due to staff, advances,
 * this month's salary and what's coming up. Each part shows only with its permission.
 */
export default async function DashboardPage() {
  const me = (await requireMe())!; // the layout already handled "no access"
  const can = (k: string) => me.permissions.includes(k);
  const today = todayIST();
  const { year, month } = monthOf(today);
  const monthName = MONTH.format(new Date(Date.UTC(year, month - 1, 1)));
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const dayLabel = (d: string) => `${days[weekday(d)]} ${formatDate(d)}`;

  const showToday = can('staff.view');
  const showMoney = can('salary.view');
  const showAdvances = can('salary.view') || can('advances.give');
  const supabase = await createClient();
  const [todayData, money, salary, soon] = await Promise.all([
    showToday ? loadToday(supabase, me.shopId, today) : null,
    showAdvances ? loadMoney(supabase, me.shopId) : null,
    showMoney ? loadSalary(supabase, me.shopId, year, month) : null,
    loadSoon(supabase, me.shopId, today, can('staff.view')),
  ]);
  // Until it's finalized, this month's salary is something coming up.
  const soonItems: SoonItem[] = [
    ...soon,
    ...(salary && (salary.state === 'not_run' || salary.state === 'draft')
      ? [{ kind: 'salary' as const, date: monthEnd(year, month) }]
      : []),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const minutes = minutesOfDayIST(new Date());
  const greeting = minutes < 12 * 60 ? 'morning' : minutes < 17 * 60 ? 'afternoon' : 'evening';
  const nothing = !showToday && !showAdvances && soonItems.length === 0;

  return (
    <>
      <PageHeader
        title={t(`home.greeting.${greeting}`, { name: me.name.split(' ')[0] })}
        subtitle={
          todayData
            ? t('home.subtitle', {
                shop: me.shopName,
                date: dayLabel(today),
                count: todayData.working,
              })
            : t('home.subtitleShort', { shop: me.shopName, date: dayLabel(today) })
        }
        actions={
          showToday &&
          can('attendance.mark') &&
          todayData && (
            <MarkTodayButton
              cells={todayData.unmarked.map((u) => ({ staffId: u.staffId, date: today }))}
            />
          )
        }
      />

      {nothing && (
        <p className="text-body-lg max-w-prose text-[var(--ink-muted)]">{t('home.nothing')}</p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {todayData && (
          <section aria-labelledby="today-h" className={card}>
            <div className="flex items-center justify-between gap-3">
              <h2 id="today-h" className="text-title-md">
                {t('home.today.title')}
              </h2>
              <SeeLink href="/attendance">{t('home.today.open')}</SeeLink>
            </div>
            {todayData.working === 0 ? (
              <p className="text-body text-[var(--ink-muted)]">{t('home.today.nobody')}</p>
            ) : (
              <>
                <ul className="flex flex-wrap gap-2">
                  <Chip token="present" icon={Check} count={todayData.present} k="present" />
                  <Chip token="absent" icon={X} count={todayData.absent} k="absent" />
                  <Chip token="late" icon={Clock} count={todayData.late.length} k="late" />
                  <Chip token={null} icon={null} count={todayData.unmarked.length} k="unmarked" />
                </ul>
                {todayData.unmarked.length === 0 ? (
                  <p className="text-body inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--status-present-soft)] px-4 py-3 font-semibold text-[var(--status-present)]">
                    <Check size={20} aria-hidden="true" />
                    {t('home.today.allMarked')}
                  </p>
                ) : (
                  <PeopleList
                    title={t('home.today.unmarked')}
                    rows={todayData.unmarked.map((u) => ({
                      id: u.staffId,
                      name: u.name,
                      meta:
                        u.offWeekdays.length > 0
                          ? t('home.today.offs', {
                              days: u.offWeekdays.map((w) => days[w]).join(', '),
                            })
                          : '',
                      tag: (
                        <span className="text-caption rounded-[var(--radius-pill)] px-2.5 py-1 text-[var(--status-unmarked)] outline-[1.5px] outline-offset-[-2px] outline-[var(--line-strong)] outline-dashed">
                          {t('status.unmarked')}
                        </span>
                      ),
                    }))}
                  />
                )}
                {todayData.late.length > 0 && (
                  <PeopleList
                    title={t('home.today.late')}
                    rows={todayData.late.map((l) => ({
                      id: l.staffId,
                      name: l.name,
                      meta:
                        l.checkIn !== undefined
                          ? t('home.today.lateMeta', {
                              time: formatTimeOfDay(l.checkIn),
                              minutes: l.minutes,
                            })
                          : t('home.today.lateNoTime', { minutes: l.minutes }),
                      tag: (
                        <span className="text-caption inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--status-late-soft)] px-2.5 py-1 text-[var(--status-late)]">
                          <Clock size={14} aria-hidden="true" />
                          {t('status.late')}
                        </span>
                      ),
                    }))}
                  />
                )}
              </>
            )}
          </section>
        )}

        <div className="flex flex-col gap-4">
          {money && (
            <div className="grid gap-4 sm:grid-cols-2">
              {showMoney && (
                <Tile
                  href="/staff"
                  icon={Hourglass}
                  label={t('home.money.due')}
                  tone="var(--money-owed)"
                  amount={money.due}
                  meta={
                    money.dueCount > 0
                      ? t('home.money.dueMeta', { count: money.dueCount })
                      : t('home.money.none')
                  }
                />
              )}
              <Tile
                href="/advances"
                icon={ArrowUpRight}
                label={t('home.money.advances')}
                tone="var(--money-advance)"
                amount={money.advances}
                meta={
                  money.advanceCount === 0
                    ? t('home.money.none')
                    : money.monthlyCut > 0
                      ? t('home.money.advMeta', {
                          count: money.advanceCount,
                          cut: formatINR(money.monthlyCut),
                        })
                      : t('home.money.advMetaNoCut', { count: money.advanceCount })
                }
              />
            </div>
          )}

          {salary && (
            <section aria-labelledby="salary-h" className={card}>
              <div className="flex items-center justify-between gap-3">
                <h2 id="salary-h" className="text-title-md">
                  {t('home.salary.title', { month: monthName })}
                </h2>
                <span
                  className={`text-caption rounded-[var(--radius-pill)] px-2.5 py-1 font-semibold ${
                    salary.state === 'paid'
                      ? 'bg-[var(--status-present-soft)] text-[var(--status-present)]'
                      : salary.state === 'finalized'
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                        : 'bg-[var(--surface-muted)] text-[var(--ink-muted)]'
                  }`}
                >
                  {t(`home.salary.state.${salary.state}`)}
                </span>
              </div>
              <ol aria-label={t('home.salary.steps')} className="grid grid-cols-3 gap-2">
                {STEPS.map((s, i) => {
                  const done = i < REACHED[salary.state];
                  return (
                    <li key={s} className="flex flex-col gap-1.5">
                      <span
                        className={`h-1.5 rounded-[var(--radius-pill)] ${done ? 'bg-[var(--accent)]' : 'bg-[var(--surface-pressed)]'}`}
                      />
                      <span
                        className={`text-caption inline-flex items-center gap-1 font-semibold ${done ? '' : 'text-[var(--ink-muted)]'}`}
                      >
                        {done && <Check size={16} aria-hidden="true" />}
                        {t(`home.salary.step.${s}`)}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {salary.state !== 'not_run' && (
                <dl className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ['net', salary.net, ''],
                      ['paid', salary.paid, 'text-[var(--money-paid)]'],
                      ['left', salary.net - salary.paid, 'text-[var(--money-owed)]'],
                    ] as const
                  ).map(([k, v, cls]) => (
                    <div key={k} className="flex flex-col gap-0.5">
                      <dt className="text-caption text-[var(--ink-muted)]">
                        {t(`home.salary.${k}`)}
                      </dt>
                      <dd className={`text-money-md ${cls}`}>{formatINR(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="text-body text-[var(--ink-muted)]">
                {salary.state === 'draft'
                  ? salary.unmarkedPeople > 0
                    ? t('home.salary.note.draftUnmarked', { count: salary.unmarkedPeople })
                    : t('home.salary.note.draft')
                  : t(`home.salary.note.${salary.state}`, {
                      month: monthName,
                      paid: salary.paidPeople,
                      count: salary.people,
                    })}
              </p>
              <Link
                href="/salary"
                className={`text-label-sm inline-flex min-h-12 w-fit items-center gap-1 rounded-[var(--radius-md)] px-4 ${
                  salary.state === 'paid'
                    ? 'border border-[var(--line-strong)]'
                    : 'bg-[var(--accent)] text-[var(--on-accent)]'
                }`}
              >
                {t(`home.salary.button.${salary.state}`)}
                <ChevronRight size={20} aria-hidden="true" />
              </Link>
            </section>
          )}

          <section aria-labelledby="soon-h" className={`${card} gap-2`}>
            <h2 id="soon-h" className="text-title-md mb-1">
              {t('home.soon.title')}
            </h2>
            {soonItems.length === 0 ? (
              <p className="text-body text-[var(--ink-muted)]">{t('home.soon.none')}</p>
            ) : (
              <ul>
                {soonItems.map((x) => {
                  const away = daysBetween(today, x.date);
                  const when =
                    away === 0
                      ? t('home.soon.today')
                      : away === 1
                        ? t('home.soon.tomorrow')
                        : t('home.soon.in', { count: away });
                  const [Icon, bg, fg, title, meta] =
                    x.kind === 'holiday'
                      ? ([
                          Sparkles,
                          'var(--status-holiday-soft)',
                          'var(--status-holiday)',
                          t(x.paid ? 'home.soon.holidayPaid' : 'home.soon.holidayUnpaid', {
                            name: x.name,
                          }),
                          `${dayLabel(x.date)} · ${when}`,
                        ] as const)
                      : x.kind === 'leaving'
                        ? ([
                            Users,
                            'var(--surface-muted)',
                            'var(--ink-muted)',
                            t('home.soon.leaving', { name: x.name }),
                            t('home.soon.lastDay', { date: dayLabel(x.date) }),
                          ] as const)
                        : ([
                            IndianRupee,
                            'var(--accent-soft)',
                            'var(--accent-ink)',
                            t('home.soon.salary', { month: monthName }),
                            t('home.soon.salaryFrom', { date: dayLabel(x.date) }),
                          ] as const);
                  return (
                    <li
                      key={`${x.kind}-${x.date}-${'name' in x ? x.name : ''}`}
                      className="flex min-h-12 items-center gap-3 border-b border-[var(--line)] py-2 last:border-0"
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                        style={{ background: bg, color: fg }}
                      >
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-label-sm">{title}</span>
                        <span className="text-caption text-[var(--ink-muted)]">{meta}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function SeeLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-label-sm inline-flex min-h-11 items-center gap-0.5 text-[var(--accent-ink)]"
    >
      {children}
      <ChevronRight size={20} aria-hidden="true" />
    </Link>
  );
}

/** Count chip (design system SummaryChip): status colour + icon + number + word. */
function Chip({
  token,
  icon: Icon,
  count,
  k,
}: {
  token: string | null;
  icon: LucideIcon | null;
  count: number;
  k: 'present' | 'absent' | 'late' | 'unmarked';
}) {
  return (
    <li
      className="flex min-h-14 min-w-28 flex-1 items-center gap-2 rounded-[var(--radius-md)] px-3 py-2"
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
      {Icon && <Icon size={20} strokeWidth={2.6} aria-hidden="true" />}
      <span className="flex flex-col">
        <span className="text-money-md">{count}</span>
        <span className="text-caption">{t(`home.today.chips.${k}`)}</span>
      </span>
    </li>
  );
}

function PeopleList({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; name: string; meta: string; tag: ReactNode }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-label-sm text-[var(--ink-muted)]">
        {title} · {rows.length}
      </h3>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="border-b border-[var(--line)] last:border-0">
            <Link
              href={`/staff/${r.id}`}
              className="flex min-h-14 items-center gap-3 py-2 hover:bg-[var(--surface-muted)]"
            >
              <Avatar name={r.name} size={36} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-label-sm truncate">{r.name}</span>
                {r.meta && <span className="text-caption text-[var(--ink-muted)]">{r.meta}</span>}
              </span>
              {r.tag}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tile({
  href,
  icon: Icon,
  label,
  tone,
  amount,
  meta,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tone: string;
  amount: number;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] bg-[var(--surface)] px-5 py-4 shadow-[var(--elevation-1)] hover:bg-[var(--surface-muted)]"
    >
      <span
        className="text-caption inline-flex items-center gap-1.5 font-semibold"
        style={{ color: tone }}
      >
        <Icon size={16} aria-hidden="true" />
        {label}
      </span>
      <span className="text-money-lg">{formatINR(amount)}</span>
      <span className="text-caption text-[var(--ink-muted)]">{meta}</span>
    </Link>
  );
}
