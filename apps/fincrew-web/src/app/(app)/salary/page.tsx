import { PendingLink as Link } from '@/components/app/pending-link';
import { redirect } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Clock, FileText, X } from 'lucide-react';
import { formatINR, monthOf, type PayslipLine } from '@fincrew/core';
import {
  loadSalaryRun,
  PAYSLIP_MINUS_LINES,
  SALARY_GROUPS,
  salaryGroup,
  salaryOverview,
  type SalaryGroup,
  type SalaryPerson,
} from '@fincrew/data';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, quietButtonClass } from '../../components';
import { finalizeSalary, paySalary, runSalary } from './actions';
import { ActionButton, PayControl } from './controls';
import { SalaryTable } from './salary-table';

const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (y: number, m: number) => MONTH.format(new Date(Date.UTC(y, m - 1, 1)));
const shiftMonth = (y: number, m: number, by: number) => {
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const card = 'rounded-lg border bg-card shadow-xs';

type StepKind = 'done' | 'warn' | 'current' | 'todo';
const STEP_STYLE: Record<StepKind, { dot: string; row: string; sub: string }> = {
  done: {
    dot: 'bg-[var(--status-present-soft)] text-[var(--status-present)]',
    row: '',
    sub: 'text-[var(--ink-muted)]',
  },
  warn: {
    dot: 'bg-[var(--status-late-soft)] text-[var(--status-late)]',
    row: '',
    sub: 'text-[var(--status-late)]',
  },
  current: {
    dot: 'bg-[var(--accent)] text-[var(--on-accent)]',
    row: 'bg-[var(--accent-soft)]',
    sub: 'text-[var(--ink-muted)]',
  },
  todo: {
    dot: 'bg-[var(--surface-muted)] text-[var(--ink-muted)]',
    row: '',
    sub: 'text-[var(--ink-muted)]',
  },
};
const GROUP_DOT: Record<SalaryGroup, string> = {
  look: 'var(--status-late)',
  ready: 'var(--accent)',
  due: 'var(--money-owed)',
  paid: 'var(--money-paid)',
};

/**
 * Salary (redesign, owner 29/10/2026; design "Web · salary in steps"): the month as steps
 * (Attendance → Work out → Check & finalize → Pay) with the next step and its one button first,
 * the big amount (take-home, then still to pay), how it adds up, and people grouped by what they
 * need (needs a look / ready / still to pay / paid). `?person=<payslip>` opens that payslip on
 * the side; `?table=1` shows the old wide table.
 */
export default async function SalaryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; person?: string; table?: string }>;
}) {
  const me = (await requireMe())!;
  const can = (k: string) => me.permissions.includes(k);
  if (!can('salary.view')) redirect('/');
  const canRun = can('salary.run');

  const today = todayIST();
  const current = monthOf(today);
  const sp = await searchParams;
  const asked = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? monthOf(`${sp.month}-01`) : current;
  const { year, month } =
    ym(asked.year, asked.month) > ym(current.year, current.month) ? current : asked;
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const hasNext = ym(next.year, next.month) <= ym(current.year, current.month);
  const mName = monthName(year, month);
  const base = `/salary?month=${ym(year, month)}`;
  const table = sp.table === '1';

  const supabase = await createClient();
  const { runId, people, overall } = await loadSalaryRun(supabase, me.shopId, year, month);
  const run = runId ? { id: runId } : null;
  const { groups, totals, unmarked, dueCount } = salaryOverview(people);
  const look = groups.look.length;
  const ready = groups.ready.length;
  const drafts = look + ready;
  const has = people.length > 0;
  const stage = !has ? 'none' : drafts > 0 ? 'draft' : dueCount > 0 ? 'pay' : 'paid';
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const s = 'salary.steps';

  const steps: { key: string; sub: string; kind: StepKind }[] = [
    {
      key: 'attendance',
      kind: unmarked > 0 ? 'warn' : has ? 'done' : 'todo',
      sub:
        unmarked > 0
          ? t(`${s}.sub.unmarked`, { count: unmarked })
          : has
            ? t(`${s}.sub.marked`)
            : t(`${s}.sub.markFirst`),
    },
    {
      key: 'workOut',
      kind: has ? 'done' : 'current',
      sub: has ? t(`${s}.sub.workedOut`) : t(`${s}.sub.notYet`),
    },
    {
      key: 'finalize',
      kind: drafts > 0 ? 'current' : has ? 'done' : 'todo',
      sub:
        drafts > 0
          ? t(`${s}.sub.ready`, { ready, count: drafts })
          : has
            ? t(`${s}.sub.finalized`, { count: people.length })
            : t(`${s}.sub.later`),
    },
    {
      key: 'pay',
      kind: stage === 'paid' ? 'done' : stage === 'pay' ? 'current' : 'todo',
      sub:
        stage === 'paid'
          ? t(`${s}.sub.allPaid`)
          : dueCount > 0
            ? t(`${s}.sub.due`, { amount: formatINR(totals.due), count: dueCount })
            : t(`${s}.sub.later`),
    },
  ];

  const nextCard =
    stage === 'none'
      ? { title: t(`${s}.next.noneTitle`, { month: mName }), body: t(`${s}.next.noneBody`) }
      : stage === 'draft'
        ? {
            title: t(`${s}.next.draftTitle`, { month: mName }),
            body:
              look > 0 ? t(`${s}.next.lookBody`, { count: look, ready }) : t(`${s}.next.readyBody`),
          }
        : stage === 'pay'
          ? {
              title: t(`${s}.next.payTitle`, { month: mName }),
              body: t(`${s}.next.payBody`, { amount: formatINR(totals.due), count: dueCount }),
            }
          : { title: t(`${s}.next.paidTitle`, { month: mName }), body: t(`${s}.next.paidBody`) };

  const workAgain = canRun && (
    <ActionButton
      action={runSalary.bind(null, year, month)}
      label={has ? t(`${s}.workOutAgain`) : t('salary.run')}
      working={t('salary.working')}
      variant={has ? 'secondary' : 'primary'}
    />
  );
  const nextActions = canRun && (
    <>
      {workAgain}
      {stage === 'draft' && run && ready > 0 && (
        <ActionButton
          action={finalizeSalary.bind(
            null,
            run.id,
            undefined,
            look > 0 ? groups.ready.map((p) => p.id) : undefined,
          )}
          label={look > 0 ? t(`${s}.finalizeReady`, { count: ready }) : t(`${s}.finalizeAll`)}
          working={t('salary.working')}
          variant="primary"
          confirm={{
            title:
              look > 0
                ? t(`${s}.confirmReadyTitle`, { count: ready })
                : t('salary.confirm.finalizeTitle', { month: mName }),
            body: look > 0 ? t(`${s}.confirmReadyBody`) : t('salary.confirm.finalizeBody'),
          }}
        />
      )}
      {stage === 'pay' && run && (
        <PayControl
          pay={paySalary.bind(null, run.id, null)}
          label={t('salary.payAll')}
          modeLabel={t('salary.payMode')}
          modes={modes}
          working={t('salary.working')}
          title={t('salary.confirm.payAllTitle', { month: mName })}
          body={t('salary.confirm.payBody')}
        />
      )}
    </>
  );

  const why = (p: SalaryPerson) => {
    const w = p.warnings[0];
    if (p.state === 'draft' && w)
      return {
        text: t(`mobile.money.salary.short.${w.code}`, { count: w.count ?? 0 }),
        warn: true,
      };
    if (p.state === 'paid') return { text: t(`${s}.why.paid`), warn: false };
    if (p.paidAmount > 0)
      return {
        text: t(`${s}.why.partly`, {
          paid: formatINR(p.paidAmount),
          left: formatINR(p.net - p.paidAmount),
        }),
        warn: false,
      };
    const parts = [
      t(`${s}.why.days`, { payable: p.summary.payableDays, employed: p.summary.employedDays }),
      p.cut ? t(`${s}.why.cut`, { amount: formatINR(p.cut) }) : null,
      p.payback ? t(`${s}.why.payback`, { amount: formatINR(p.payback) }) : null,
      p.expenseCut ? t(`${s}.why.expenseCut`, { amount: formatINR(p.expenseCut) }) : null,
    ];
    return { text: parts.filter(Boolean).join(' · '), warn: false };
  };
  const stateLabel = (p: SalaryPerson) =>
    p.state === 'finalized' && p.paidAmount > 0
      ? { text: t('salary.rowStatus.partly', { paid: formatINR(p.paidAmount) }), tone: 'owed' }
      : {
          text: t(`salary.rowStatus.${p.state}`),
          tone: p.state === 'paid' ? 'paid' : p.state === 'finalized' ? 'owed' : 'muted',
        };
  const toneClass: Record<string, string> = {
    paid: 'text-[var(--money-paid)]',
    owed: 'text-[var(--money-owed)]',
    muted: 'text-[var(--ink-muted)]',
  };

  const selected = sp.person ? people.find((p) => p.id === sp.person) : undefined;
  const lineLabel = (l: PayslipLine, p: SalaryPerson) =>
    t(`salary.lines.${l.kind}`, { name: l.name ?? '', days: p.summary.payableDays });

  const adds = (
    [
      ['earned', totals.earned, ''],
      ['extras', totals.extras, '+'],
      ['payback', totals.payback, '+'],
      ['cut', totals.cut, '−'],
      ['expenseCut', totals.expenseCut, '−'],
      ['deductions', totals.deductions, '−'],
    ] as const
  ).filter(([k, v]) => k === 'earned' || v > 0);

  const heroAmount = stage === 'pay' ? totals.due : totals.net;
  const heroBar = totals.net > 0 ? Math.round((totals.paid / totals.net) * 100) : 0;

  return (
    <>
      <PageHeader
        title={t('salary.title')}
        subtitle={t('salary.subtitle', { month: mName, count: people.length })}
        actions={
          has && (
            <Link
              href={table ? base : `${base}&table=1`}
              className={`${quietButtonClass} inline-flex items-center`}
            >
              {table ? t(`${s}.backToSteps`) : t(`${s}.fullTable`)}
            </Link>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={`/salary?month=${ym(prev.year, prev.month)}${table ? '&table=1' : ''}`}
            aria-label={t('salary.prevMonth')}
            className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <span className="text-title-md px-2">{mName}</span>
          {hasNext && (
            <Link
              href={`/salary?month=${ym(next.year, next.month)}${table ? '&table=1' : ''}`}
              aria-label={t('salary.nextMonth')}
              className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </Link>
          )}
        </div>
        <span
          className={`text-caption rounded-[var(--radius-pill)] px-3 py-1 ${
            overall === 'paid'
              ? 'bg-[var(--status-present-soft)] text-[var(--status-present)]'
              : overall === 'finalized'
                ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                : 'bg-[var(--surface-muted)] text-[var(--ink-muted)]'
          }`}
        >
          {t(`salary.status.${overall}`)}
        </span>
      </div>

      {table ? (
        <SalaryTable people={people} mName={mName} canRun={canRun} run={run} />
      ) : (
        <>
          <ol
            aria-label={t(`${s}.label`)}
            className={`${card} grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4`}
          >
            {steps.map((st, i) => {
              const style = STEP_STYLE[st.kind];
              return (
                <li
                  key={st.key}
                  aria-current={st.kind === 'current' ? 'step' : undefined}
                  className={`flex items-start gap-2.5 rounded-md px-2.5 py-2 ${style.row}`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${style.dot}`}
                  >
                    {st.kind === 'done' ? (
                      <Check size={16} aria-hidden="true" />
                    ) : st.kind === 'warn' ? (
                      <Clock size={16} aria-hidden="true" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold">{t(`${s}.${st.key}`)}</span>
                    <span className={`text-xs ${style.sub}`}>{st.sub}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-5 py-4">
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1">
              <span className="text-xs font-bold tracking-wider text-[var(--accent-ink)] uppercase">
                {stage === 'paid' ? t(`${s}.next.doneKicker`) : t(`${s}.next.kicker`)}
              </span>
              <span className="text-title-md">{nextCard.title}</span>
              <span className="max-w-prose text-sm text-[var(--ink-muted)]">{nextCard.body}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {nextActions}
              {stage === 'draft' && look > 0 && (
                <Link
                  href={`/attendance?view=month&month=${ym(year, month)}`}
                  className={`${quietButtonClass} inline-flex items-center`}
                >
                  {t('salary.warnings.openAttendance')}
                </Link>
              )}
            </div>
          </section>

          {!has ? (
            <div className={`${card} p-6`}>
              <h2 className="text-title-md">{t('salary.empty.title', { month: mName })}</h2>
              <p className="text-body-lg mt-1 max-w-prose text-[var(--ink-muted)]">
                {canRun ? t('salary.empty.body') : t('salary.empty.noPermission')}
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <section className={`${card} flex flex-col gap-2 p-5`}>
                  <span className="text-sm font-semibold text-[var(--ink-muted)]">
                    {stage === 'pay'
                      ? t(`${s}.hero.due`)
                      : stage === 'paid'
                        ? t(`${s}.hero.paid`, { month: mName })
                        : t(`${s}.hero.draft`)}
                  </span>
                  <span className="text-money-hero text-[2.75rem] leading-none">
                    {formatINR(heroAmount)}
                  </span>
                  <div
                    aria-hidden="true"
                    className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"
                  >
                    <div
                      className="h-2.5 rounded-full bg-[var(--money-paid)]"
                      style={{ width: `${heroBar}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--ink-muted)]">
                    {stage === 'draft'
                      ? t(`${s}.hero.draftSub`, { count: people.length })
                      : stage === 'paid'
                        ? t(`${s}.hero.paidSub`, { count: people.length })
                        : t(`${s}.hero.dueSub`, {
                            paid: formatINR(totals.paid),
                            net: formatINR(totals.net),
                          })}
                  </span>
                </section>
                <section className={`${card} flex flex-col px-5 py-4`}>
                  <span className="pb-1.5 text-sm font-semibold">{t(`${s}.adds.title`)}</span>
                  {adds.map(([k, v, sign]) => (
                    <div key={k} className="flex justify-between gap-3 py-1 text-sm">
                      <span className="text-[var(--ink-muted)]">{t(`${s}.adds.${k}`)}</span>
                      <span
                        className={`tabular-nums ${
                          sign === '−'
                            ? 'text-[var(--money-deduction)]'
                            : k === 'payback'
                              ? 'text-[var(--money-owed)]'
                              : ''
                        }`}
                      >
                        {sign}
                        {formatINR(v)}
                      </span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between gap-3 border-t border-[var(--line)] pt-2 text-sm font-semibold">
                    <span>{t(`${s}.adds.net`)}</span>
                    <span className="tabular-nums">{formatINR(totals.net)}</span>
                  </div>
                </section>
              </div>

              <div className="flex flex-wrap items-start gap-4">
                <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
                  {SALARY_GROUPS.filter((g) => groups[g].length > 0).map((g) => (
                    <section key={g} className={`${card} overflow-hidden`}>
                      <header className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: GROUP_DOT[g] }}
                          aria-hidden="true"
                        />
                        <h2 className="text-sm font-semibold">{t(`${s}.groups.${g}`)}</h2>
                        <span className="text-sm text-[var(--ink-muted)]">{groups[g].length}</span>
                        <span className="flex-1" />
                        <span className="text-xs text-[var(--ink-muted)] tabular-nums">
                          {formatINR(groups[g].reduce((a, p) => a + p.net, 0))}
                        </span>
                      </header>
                      <ul>
                        {groups[g].map((p) => {
                          const w = why(p);
                          const st = stateLabel(p);
                          return (
                            <li
                              key={p.id}
                              className={`flex items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 last:border-b-0 ${
                                selected?.id === p.id ? 'bg-[var(--accent-soft)]' : ''
                              }`}
                            >
                              <Link
                                href={`${base}&person=${p.id}`}
                                scroll={false}
                                aria-label={t(`${s}.open`, { name: p.name })}
                                className="flex min-w-0 flex-1 items-center gap-3"
                              >
                                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)] text-xs font-semibold">
                                  {initials(p.name)}
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span className="text-label-sm truncate">{p.name}</span>
                                  <span
                                    className={`truncate text-xs ${w.warn ? 'text-[var(--status-late)]' : 'text-[var(--ink-muted)]'}`}
                                  >
                                    {w.text}
                                  </span>
                                </span>
                                <span className="flex flex-col items-end">
                                  <span className="text-money-sm">{formatINR(p.net)}</span>
                                  <span className={`text-xs font-semibold ${toneClass[st.tone]}`}>
                                    {st.text}
                                  </span>
                                </span>
                              </Link>
                              {salaryGroup(p) === 'look' && (
                                <Link
                                  href={`/attendance?view=month&month=${ym(year, month)}`}
                                  className={`${quietButtonClass} inline-flex h-8 items-center text-xs`}
                                >
                                  {t(`${s}.markDays`)}
                                </Link>
                              )}
                              {canRun && run && p.state === 'finalized' && (
                                <PayControl
                                  pay={paySalary.bind(null, run.id, p.id)}
                                  label={p.paidAmount > 0 ? t(`${s}.payRest`) : t('salary.pay')}
                                  modeLabel={t('salary.payMode')}
                                  modes={modes}
                                  working={t('salary.working')}
                                  title={t('salary.confirm.payTitle', {
                                    name: p.name,
                                    month: mName,
                                  })}
                                  body={t('salary.confirm.payBody')}
                                  variant="secondary"
                                />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>

                {selected && (
                  <aside
                    aria-label={t(`${s}.panelLabel`, { name: selected.name })}
                    className={`${card} flex max-w-[400px] min-w-0 flex-[1_1_340px] flex-col gap-3 p-4 shadow-[var(--elevation-2)]`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)] text-sm font-semibold">
                        {initials(selected.name)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-base font-semibold">{selected.name}</span>
                        <span className="text-xs text-[var(--ink-muted)]">
                          {mName} ·{' '}
                          {t('salary.days.payable', {
                            payable: selected.summary.payableDays,
                            employed: selected.summary.employedDays,
                          })}
                        </span>
                      </span>
                      <Link
                        href={base}
                        scroll={false}
                        aria-label={t(`${s}.close`)}
                        className="grid size-8 place-items-center rounded-md hover:bg-[var(--surface-muted)]"
                      >
                        <X size={18} aria-hidden="true" />
                      </Link>
                    </div>
                    <ul className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ['present', selected.summary.present, 'present'],
                          ['half_day', selected.summary.halfDay, 'half-day'],
                          ['absent', selected.summary.absent, 'absent'],
                          ['paid_leave', selected.summary.paidLeave, 'paid-leave'],
                          ['unpaid_leave', selected.summary.unpaidLeave, 'unpaid-leave'],
                          [
                            'weekly_off',
                            selected.summary.paidWeeklyOff + selected.summary.unpaidWeeklyOff,
                            'weekly-off',
                          ],
                          [
                            'holiday',
                            selected.summary.paidHoliday + selected.summary.unpaidHoliday,
                            'holiday',
                          ],
                          ['unmarked', selected.summary.unmarked, null],
                        ] as const
                      )
                        .filter(([, n]) => n > 0)
                        .map(([st, n, tok]) => (
                          <li
                            key={st}
                            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={
                              tok
                                ? {
                                    background: `var(--status-${tok}-soft)`,
                                    color: `var(--status-${tok})`,
                                  }
                                : {
                                    outline: '1.5px dashed var(--line-strong)',
                                    color: 'var(--status-unmarked)',
                                  }
                            }
                          >
                            {n} · {t(`status.${st}`)}
                          </li>
                        ))}
                    </ul>
                    <ul className="flex flex-col border-t border-[var(--line)]">
                      {selected.lines.map((l, i) => {
                        const minus = PAYSLIP_MINUS_LINES.includes(l.kind);
                        return (
                          <li
                            key={i}
                            className="flex justify-between gap-3 border-b border-[var(--line)] py-2 text-sm"
                          >
                            <span>{lineLabel(l, selected)}</span>
                            <span
                              className={`tabular-nums ${minus ? 'text-[var(--money-deduction)]' : l.kind === 'expense_payback' ? 'text-[var(--money-owed)]' : ''}`}
                            >
                              {minus ? '−' : ''}
                              {formatINR(l.amount)}
                            </span>
                          </li>
                        );
                      })}
                      <li className="flex items-baseline justify-between pt-2.5 font-semibold">
                        <span className="text-sm">{t(`${s}.takeHome`)}</span>
                        <span className="text-money-md">{formatINR(selected.net)}</span>
                      </li>
                    </ul>
                    <span className="text-xs text-[var(--ink-muted)]">
                      {selected.state === 'draft'
                        ? t(`${s}.draftNote`)
                        : selected.paidAmount > 0
                          ? t(`${s}.paidSoFar`, { amount: formatINR(selected.paidAmount) })
                          : t(`${s}.nothingPaid`)}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {canRun && run && selected.state === 'draft' && (
                        <ActionButton
                          action={finalizeSalary.bind(null, run.id, selected.id)}
                          label={t('salary.finalizeOne')}
                          working={t('salary.working')}
                          variant="primary"
                          confirm={{
                            title: t('salary.confirm.finalizeOneTitle', { name: selected.name }),
                            body: t('salary.confirm.finalizeBody'),
                          }}
                        />
                      )}
                      {canRun && run && selected.state === 'finalized' && (
                        <PayControl
                          pay={paySalary.bind(null, run.id, selected.id)}
                          label={`${t('salary.pay')} ${formatINR(selected.net - selected.paidAmount)}`}
                          modeLabel={t('salary.payMode')}
                          modes={modes}
                          working={t('salary.working')}
                          title={t('salary.confirm.payTitle', {
                            name: selected.name,
                            month: mName,
                          })}
                          body={t('salary.confirm.payBody')}
                        />
                      )}
                      <Link
                        href={`/payslips/${selected.id}`}
                        target="_blank"
                        aria-label={t('payslip.openLabel', { name: selected.name })}
                        className={`${quietButtonClass} inline-flex items-center gap-2`}
                      >
                        <FileText size={18} aria-hidden="true" />
                        {t('payslip.open')}
                      </Link>
                    </div>
                  </aside>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}
