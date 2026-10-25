import { PendingLink as Link } from '@/components/app/pending-link';
import { redirect } from 'next/navigation';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { formatINR, monthOf, type PayslipLine } from '@fincrew/core';
import { loadSalaryRun } from '@fincrew/data';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, quietButtonClass } from '../../components';
import { finalizeSalary, paySalary, runSalary } from './actions';
import { StatCard, StatGrid } from '@/components/app/layout';
import { ActionButton, PayControl } from './controls';

const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (y: number, m: number) => MONTH.format(new Date(Date.UTC(y, m - 1, 1)));
const shiftMonth = (y: number, m: number, by: number) => {
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const cols =
  'grid-cols-[minmax(200px,1.6fr)_56px_repeat(6,minmax(96px,1fr))_minmax(112px,1fr)_minmax(150px,1.2fr)_40px]';

export default async function SalaryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
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

  const supabase = await createClient();
  const { runId, people, overall } = await loadSalaryRun(supabase, me.shopId, year, month);
  const run = runId ? { id: runId } : null;
  const total = (
    k: 'earned' | 'overtime' | 'allowances' | 'gross' | 'deductions' | 'cut' | 'net',
  ) => people.reduce((a, p) => a + p[k], 0);
  const warnings = people.flatMap((p) =>
    p.warnings.map((w) => t(`salary.warnings.${w.code}`, { name: p.name, count: w.count ?? 0 })),
  );
  const lineLabel = (l: PayslipLine, p: (typeof people)[number]) =>
    t(`salary.lines.${l.kind}`, { name: l.name ?? '', days: p.summary.payableDays });
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const money = (v: number, neg = false) => (v === 0 ? '—' : `${neg ? '−' : ''}${formatINR(v)}`);

  return (
    <>
      <PageHeader
        title={t('salary.title')}
        subtitle={t('salary.subtitle', { month: mName, count: people.length })}
        actions={
          canRun && (
            <>
              <ActionButton
                action={runSalary.bind(null, year, month)}
                label={people.length ? t('salary.runAgain') : t('salary.run')}
                working={t('salary.working')}
                variant={people.length ? 'secondary' : 'primary'}
              />
              {run && overall === 'draft' && (
                <ActionButton
                  action={finalizeSalary.bind(null, run.id, undefined)}
                  label={t('salary.finalize')}
                  working={t('salary.working')}
                  variant="primary"
                  confirm={{
                    title: t('salary.confirm.finalizeTitle', { month: mName }),
                    body: t('salary.confirm.finalizeBody'),
                  }}
                />
              )}
              {run && overall === 'finalized' && (
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
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={`/salary?month=${ym(prev.year, prev.month)}`}
            aria-label={t('salary.prevMonth')}
            className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <span className="text-title-md px-2">{mName}</span>
          {hasNext && (
            <Link
              href={`/salary?month=${ym(next.year, next.month)}`}
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

      {people.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 shadow-xs">
          <h2 className="text-title-md">{t('salary.empty.title', { month: mName })}</h2>
          <p className="text-body-lg mt-1 max-w-prose text-[var(--ink-muted)]">
            {canRun ? t('salary.empty.body') : t('salary.empty.noPermission')}
          </p>
        </div>
      ) : (
        <>
          <StatGrid>
            {(
              [
                ['net', total('net'), false],
                ['gross', total('gross'), false],
                ['deductions', total('deductions'), true],
                ['advance', total('cut'), true],
              ] as const
            ).map(([k, v, neg]) => (
              <StatCard
                key={k}
                label={t(`salary.totals.${k}`)}
                value={
                  <span className={neg ? 'text-[var(--money-deduction)]' : undefined}>
                    {money(v, neg)}
                  </span>
                }
              />
            ))}
          </StatGrid>

          {warnings.length > 0 && overall === 'draft' && (
            <div
              role="note"
              className="flex flex-wrap items-start gap-3 rounded-[var(--radius-md)] bg-[var(--status-late-soft)] px-4 py-3 text-[var(--status-late)]"
            >
              <AlertTriangle size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
              <div className="text-body flex min-w-0 flex-1 flex-col gap-1">
                <strong className="font-semibold">{t('salary.warnings.title')}</strong>
                <ul className="flex flex-col gap-0.5">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
              <Link
                href={`/attendance?view=month&month=${ym(year, month)}`}
                className="text-label-sm underline"
              >
                {t('salary.warnings.openAttendance')}
              </Link>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
            <div
              role="table"
              aria-label={t('salary.title')}
              className="min-w-[1180px] tabular-nums"
            >
              <div
                role="row"
                className={`text-caption grid ${cols} items-end gap-2 border-b border-[var(--line)] px-4 py-3 font-semibold text-[var(--ink-muted)]`}
              >
                {(
                  [
                    'staff',
                    'days',
                    'earned',
                    'overtime',
                    'allowances',
                    'gross',
                    'deductions',
                    'advance',
                    'net',
                    'status',
                  ] as const
                ).map((c, i) => (
                  <span
                    key={c}
                    role="columnheader"
                    className={i >= 1 && i <= 8 ? 'text-right' : ''}
                  >
                    {t(`salary.columns.${c}`)}
                  </span>
                ))}
                <span role="columnheader" className="sr-only">
                  {t('salary.columns.details')}
                </span>
              </div>

              {people.map((p) => (
                <details key={p.id} className="group border-b border-[var(--line)]">
                  <summary
                    role="row"
                    aria-label={t('salary.showDetails', { name: p.name })}
                    className={`grid ${cols} cursor-pointer list-none items-center gap-2 px-4 py-3 hover:bg-[var(--surface-muted)] [&::-webkit-details-marker]:hidden`}
                  >
                    <span role="rowheader" className="flex min-w-0 flex-col">
                      <span className="text-label-sm truncate">{p.name}</span>
                      {p.revision > 1 && (
                        <span className="text-caption text-[var(--ink-muted)]">
                          {t('salary.revision', { n: p.revision })}
                        </span>
                      )}
                    </span>
                    <span role="cell" className="text-money-sm text-right">
                      {p.summary.payableDays}
                    </span>
                    <span role="cell" className="text-money-sm text-right">
                      {money(p.earned)}
                    </span>
                    <span role="cell" className="text-money-sm text-right">
                      {money(p.overtime)}
                    </span>
                    <span role="cell" className="text-money-sm text-right">
                      {money(p.allowances)}
                    </span>
                    <span role="cell" className="text-money-sm text-right">
                      {money(p.gross)}
                    </span>
                    <span
                      role="cell"
                      className="text-money-sm text-right text-[var(--money-deduction)]"
                    >
                      {money(p.deductions, true)}
                    </span>
                    <span
                      role="cell"
                      className="text-money-sm text-right text-[var(--money-deduction)]"
                    >
                      {money(p.cut, true)}
                    </span>
                    <span role="cell" className="text-money-md text-right">
                      {formatINR(p.net)}
                    </span>
                    <span role="cell">
                      {p.state === 'draft' ? (
                        <span className="text-caption rounded-[var(--radius-pill)] bg-[var(--surface-muted)] px-2.5 py-1 text-[var(--ink-muted)]">
                          {t('salary.rowStatus.draft')}
                        </span>
                      ) : p.state === 'paid' ? (
                        <span className="text-caption rounded-[var(--radius-pill)] bg-[var(--status-present-soft)] px-2.5 py-1 text-[var(--status-present)]">
                          {t('salary.rowStatus.paid')}
                        </span>
                      ) : (
                        <span className="text-caption rounded-[var(--radius-pill)] bg-[var(--accent-soft)] px-2.5 py-1 text-[var(--accent-ink)]">
                          {p.paidAmount > 0
                            ? t('salary.rowStatus.partly', { paid: formatINR(p.paidAmount) })
                            : t('salary.rowStatus.finalized')}
                        </span>
                      )}
                    </span>
                    <span role="cell" className="grid place-items-center">
                      <ChevronDown
                        size={20}
                        aria-hidden="true"
                        className="transition group-open:rotate-180"
                      />
                    </span>
                  </summary>

                  <div className="grid gap-4 bg-[var(--canvas)] px-4 py-4 md:grid-cols-2">
                    <ul className="rounded-[var(--radius-md)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
                      {p.lines.map((l, i) => {
                        const minus = ['deduction', 'late_deduction', 'advance_cut'].includes(
                          l.kind,
                        );
                        return (
                          <li
                            key={i}
                            className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2.5"
                          >
                            <span className="text-body">{lineLabel(l, p)}</span>
                            <span
                              className={`text-money-sm ${minus ? 'text-[var(--money-deduction)]' : ''}`}
                            >
                              {minus ? '−' : ''}
                              {formatINR(l.amount)}
                            </span>
                          </li>
                        );
                      })}
                      <li className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-label-sm">{t('salary.lines.net')}</span>
                        <span className="text-money-md">{formatINR(p.net)}</span>
                      </li>
                    </ul>
                    <div className="flex flex-col gap-2">
                      <span className="text-label-sm">
                        {t('salary.days.title', { month: mName })}
                      </span>
                      <ul className="flex flex-wrap gap-1.5">
                        {(
                          [
                            ['present', p.summary.present, 'present'],
                            ['half_day', p.summary.halfDay, 'half-day'],
                            ['absent', p.summary.absent, 'absent'],
                            ['paid_leave', p.summary.paidLeave, 'paid-leave'],
                            ['unpaid_leave', p.summary.unpaidLeave, 'unpaid-leave'],
                            [
                              'weekly_off',
                              p.summary.paidWeeklyOff + p.summary.unpaidWeeklyOff,
                              'weekly-off',
                            ],
                            ['holiday', p.summary.paidHoliday + p.summary.unpaidHoliday, 'holiday'],
                            ['unmarked', p.summary.unmarked, null],
                          ] as const
                        )
                          .filter(([, n]) => n > 0)
                          .map(([s, n, tok]) => (
                            <li
                              key={s}
                              className="text-caption rounded-[var(--radius-pill)] px-2.5 py-1"
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
                              {n} · {t(`status.${s}`)}
                            </li>
                          ))}
                      </ul>
                      <span className="text-caption text-[var(--ink-muted)]">
                        {t('salary.days.payable', {
                          payable: p.summary.payableDays,
                          employed: p.summary.employedDays,
                        })}
                        {p.leave &&
                          ` ${t('salary.days.leaveLeft', { month: mName, left: p.leave.carried ?? 0 })}`}
                      </span>
                      <Link
                        href={`/payslips/${p.id}`}
                        target="_blank"
                        aria-label={t('payslip.openLabel', { name: p.name })}
                        className={`${quietButtonClass} inline-flex w-fit items-center gap-2`}
                      >
                        <FileText size={20} aria-hidden="true" />
                        {t('payslip.open')}
                      </Link>
                      {canRun && run && p.state === 'finalized' && (
                        <PayControl
                          pay={paySalary.bind(null, run.id, p.id)}
                          label={t('salary.pay')}
                          modeLabel={t('salary.payMode')}
                          modes={modes}
                          working={t('salary.working')}
                          title={t('salary.confirm.payTitle', { name: p.name, month: mName })}
                          body={t('salary.confirm.payBody')}
                          variant="secondary"
                        />
                      )}
                      {canRun && run && p.state === 'draft' && (
                        <ActionButton
                          action={finalizeSalary.bind(null, run.id, p.id)}
                          label={t('salary.finalizeOne')}
                          working={t('salary.working')}
                          confirm={{
                            title: t('salary.confirm.finalizeOneTitle', { name: p.name }),
                            body: t('salary.confirm.finalizeBody'),
                          }}
                        />
                      )}
                    </div>
                  </div>
                </details>
              ))}

              <div role="row" className={`grid ${cols} items-center gap-2 px-4 py-3 font-semibold`}>
                <span role="rowheader" className="text-label-sm">
                  {t('salary.total', { count: people.length })}
                </span>
                <span role="cell" />
                <span role="cell" className="text-money-sm text-right">
                  {money(total('earned'))}
                </span>
                <span role="cell" className="text-money-sm text-right">
                  {money(total('overtime'))}
                </span>
                <span role="cell" className="text-money-sm text-right">
                  {money(total('allowances'))}
                </span>
                <span role="cell" className="text-money-sm text-right">
                  {money(total('gross'))}
                </span>
                <span
                  role="cell"
                  className="text-money-sm text-right text-[var(--money-deduction)]"
                >
                  {money(total('deductions'), true)}
                </span>
                <span
                  role="cell"
                  className="text-money-sm text-right text-[var(--money-deduction)]"
                >
                  {money(total('cut'), true)}
                </span>
                <span role="cell" className="text-money-md text-right">
                  {formatINR(total('net'))}
                </span>
                <span role="cell" />
                <span role="cell" />
              </div>
            </div>
          </div>
          <p className="text-caption max-w-prose text-[var(--ink-muted)]">{t('salary.footnote')}</p>
        </>
      )}
    </>
  );
}
