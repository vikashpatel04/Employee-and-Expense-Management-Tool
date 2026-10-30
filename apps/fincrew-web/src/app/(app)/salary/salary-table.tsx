import { PendingLink as Link } from '@/components/app/pending-link';
import { ChevronDown, FileText } from 'lucide-react';
import { formatINR, type PayslipLine } from '@fincrew/core';
import { PAYSLIP_MINUS_LINES, type SalaryPerson } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { quietButtonClass } from '../../components';
import { finalizeSalary, paySalary } from './actions';
import { ActionButton, PayControl } from './controls';

const cols =
  'grid-cols-[minmax(200px,1.6fr)_56px_repeat(6,minmax(96px,1fr))_minmax(112px,1fr)_minmax(150px,1.2fr)_40px]';

/**
 * The salary run as one wide table (every column, open a row for the payslip): the accountant's
 * view behind "Full table" on the step-by-step Salary page (`?table=1`).
 */
export function SalaryTable({
  people,
  mName,
  canRun,
  run,
  year,
  month,
}: {
  people: SalaryPerson[];
  mName: string;
  canRun: boolean;
  run: { id: string } | null;
  year: number;
  month: number;
}) {
  const total = (
    k: 'earned' | 'overtime' | 'allowances' | 'gross' | 'deductions' | 'cut' | 'net',
  ) => people.reduce((a, p) => a + p[k], 0);
  const lineLabel = (l: PayslipLine, p: SalaryPerson) =>
    t(`salary.lines.${l.kind}`, { name: l.name ?? '', days: p.summary.payableDays });
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const money = (v: number, neg = false) => (v === 0 ? '—' : `${neg ? '−' : ''}${formatINR(v)}`);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
        <div role="table" aria-label={t('salary.title')} className="min-w-[1180px] tabular-nums">
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
              <span key={c} role="columnheader" className={i >= 1 && i <= 8 ? 'text-right' : ''}>
                {t(`salary.columns.${c}`)}
              </span>
            ))}
            <span role="columnheader" className="sr-only">
              {t('salary.columns.details')}
            </span>
          </div>

          {people.map((p) => (
            <details key={p.staffId} className="group border-b border-[var(--line)]">
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
                    const minus = PAYSLIP_MINUS_LINES.includes(l.kind);
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
                  <span className="text-label-sm">{t('salary.days.title', { month: mName })}</span>
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
                  {p.state !== 'draft' && (
                    <Link
                      href={`/payslips/${p.id}`}
                      target="_blank"
                      aria-label={t('payslip.openLabel', { name: p.name })}
                      className={`${quietButtonClass} inline-flex w-fit items-center gap-2`}
                    >
                      <FileText size={20} aria-hidden="true" />
                      {t('payslip.open')}
                    </Link>
                  )}
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
                  {canRun && p.state === 'draft' && (
                    <ActionButton
                      action={finalizeSalary.bind(null, year, month, [p.staffId])}
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
            <span role="cell" className="text-money-sm text-right text-[var(--money-deduction)]">
              {money(total('deductions'), true)}
            </span>
            <span role="cell" className="text-money-sm text-right text-[var(--money-deduction)]">
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
  );
}
