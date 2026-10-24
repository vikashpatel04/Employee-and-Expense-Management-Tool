import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  formatINR,
  maxDate,
  minDate,
  monthEnd,
  monthStart,
  type DaySummary,
  type PayslipLine,
} from '@fincrew/core';
import { paidByPayslip } from '@fincrew/data';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { quietButtonClass } from '../../components';
import { PrintButton } from './print-button';

const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const EARNINGS = ['earned', 'overtime', 'allowance', 'leave_payout'];
const DEDUCTIONS = ['deduction', 'late_deduction'];

/**
 * One payslip as a printable page (outside the app shell). "Print or save as PDF" uses the
 * browser's print dialog. People see their own finalized payslips; `salary.view` sees all (RLS).
 */
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  if (!me) redirect('/');
  const { id } = await params;

  const supabase = await createClient();
  const { data: slip } = await supabase
    .from('payslips')
    .select(
      '*, salary_runs!inner(year, month), staff!inner(joining_date, leaving_date, people!inner(name)), shops!inner(name)',
    )
    .eq('id', id)
    .maybeSingle();
  if (!slip) notFound();

  const { year, month } = slip.salary_runs;
  const from = maxDate(monthStart(year, month), slip.staff.joining_date);
  const to = slip.staff.leaving_date
    ? minDate(monthEnd(year, month), slip.staff.leaving_date)
    : monthEnd(year, month);
  const lines = slip.lines as unknown as PayslipLine[];
  const summary = slip.summary as unknown as DaySummary;
  const net = Number(slip.net_pay_paise);
  const paid =
    slip.status === 'finalized'
      ? ((await paidByPayslip(supabase, [slip.id])).get(slip.id) ?? 0)
      : 0;
  const label = (l: PayslipLine) =>
    t(`salary.lines.${l.kind}`, { name: l.name ?? '', days: summary.payableDays });

  const row = 'flex items-center justify-between gap-4 border-b border-[var(--line)] py-2';
  const days: [string, number][] = (
    [
      [t('status.present'), summary.present],
      [t('status.half_day'), summary.halfDay],
      [t('status.absent'), summary.absent],
      [t('status.paid_leave'), summary.paidLeave],
      [t('status.unpaid_leave'), summary.unpaidLeave],
      [t('status.weekly_off'), summary.paidWeeklyOff + summary.unpaidWeeklyOff],
      [t('status.holiday'), summary.paidHoliday + summary.unpaidHoliday],
      [t('payslip.extraDays'), summary.extraWorkingDays],
      [t('status.unmarked'), summary.unmarked],
    ] as [string, number][]
  ).filter(([, n]) => n > 0);

  const Lines = ({ kinds }: { kinds: string[] }) => (
    <>
      {lines
        .filter((l) => kinds.includes(l.kind))
        .map((l, i) => (
          <li key={i} className={row}>
            <span className="text-body">{label(l)}</span>
            <span className="text-money-sm">{formatINR(l.amount)}</span>
          </li>
        ))}
    </>
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/salary?month=${year}-${String(month).padStart(2, '0')}`}
          className={`${quietButtonClass} inline-flex items-center gap-1 border-0 px-2`}
        >
          <ChevronLeft size={20} aria-hidden="true" />
          {t('payslip.back')}
        </Link>
        <PrintButton label={t('payslip.print')} />
      </div>

      <article className="flex flex-col gap-6 rounded-[var(--radius-lg)] bg-[var(--surface)] p-6 shadow-[var(--elevation-1)] print:rounded-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line-strong)] pb-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-label-sm text-[var(--ink-muted)]">{slip.shops.name}</span>
            <h1 className="text-title-xl">{t('payslip.title')}</h1>
            <span className="text-title-md">
              {MONTH.format(new Date(Date.UTC(year, month - 1, 1)))}
            </span>
          </div>
          <dl className="text-body grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
            <dt className="text-[var(--ink-muted)]">{t('payslip.employee')}</dt>
            <dd className="text-label-sm">{slip.staff.people.name}</dd>
            <dt className="text-[var(--ink-muted)]">{t('payslip.joined')}</dt>
            <dd>{formatDate(slip.staff.joining_date)}</dd>
            <dt className="text-[var(--ink-muted)]">{t('payslip.period')}</dt>
            <dd>
              {formatDate(from)} – {formatDate(to)}
            </dd>
            {slip.revision > 1 && (
              <>
                <dt className="sr-only">{t('payslip.revision', { n: slip.revision })}</dt>
                <dd className="col-span-2 text-[var(--ink-muted)]">
                  {t('payslip.revision', { n: slip.revision })}
                </dd>
              </>
            )}
          </dl>
        </header>

        {slip.status === 'draft' && (
          <p
            role="note"
            className="text-body rounded-[var(--radius-md)] border border-[var(--status-late)] bg-[var(--status-late-soft)] px-4 py-3 text-[var(--status-late)]"
          >
            {t('payslip.draft')}
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-title-md">{t('payslip.days')}</h2>
          <ul className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
            {days.map(([name, n]) => (
              <li key={name} className={row}>
                <span className="text-body">{name}</span>
                <span className="text-money-sm">{n}</span>
              </li>
            ))}
            <li className={row}>
              <span className="text-label-sm">{t('payslip.payable')}</span>
              <span className="text-money-sm">
                {summary.payableDays} / {summary.employedDays}
              </span>
            </li>
          </ul>
        </section>

        <div className="grid gap-6 sm:grid-cols-2">
          <section className="flex flex-col gap-2">
            <h2 className="text-title-md">{t('payslip.earnings')}</h2>
            <ul>
              <Lines kinds={EARNINGS} />
              <li className="flex items-center justify-between gap-4 py-2">
                <span className="text-label-sm">{t('payslip.gross')}</span>
                <span className="text-money-md">{formatINR(Number(slip.gross_paise))}</span>
              </li>
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-title-md">{t('payslip.deductions')}</h2>
            <ul>
              {lines.some((l) => DEDUCTIONS.includes(l.kind)) ? (
                <Lines kinds={DEDUCTIONS} />
              ) : (
                <li className={`${row} text-body text-[var(--ink-muted)]`}>
                  {t('payslip.noDeductions')}
                </li>
              )}
              <li className="flex items-center justify-between gap-4 py-2">
                <span className="text-label-sm">{t('payslip.totalDeductions')}</span>
                <span className="text-money-md">{formatINR(Number(slip.deductions_paise))}</span>
              </li>
            </ul>
          </section>
        </div>

        <section className="flex flex-col border-t border-[var(--line-strong)] pt-2">
          <div className={row}>
            <span className="text-body">{t('payslip.netBeforeAdvance')}</span>
            <span className="text-money-sm">
              {formatINR(Number(slip.net_before_advance_paise))}
            </span>
          </div>
          {Number(slip.advance_cut_paise) > 0 && (
            <div className={row}>
              <span className="text-body">{t('salary.lines.advance_cut')}</span>
              <span className="text-money-sm">−{formatINR(Number(slip.advance_cut_paise))}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-title-md">{t('payslip.net')}</span>
            <span className="text-money-lg">{formatINR(net)}</span>
          </div>
          {slip.status === 'finalized' && (
            <>
              <div className={row}>
                <span className="text-body">{t('payslip.paid')}</span>
                <span className="text-money-sm">{formatINR(paid)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-label-sm">{t('payslip.due')}</span>
                <span className="text-money-sm">{formatINR(Math.max(0, net - paid))}</span>
              </div>
            </>
          )}
        </section>

        <footer className="text-caption text-[var(--ink-muted)]">
          {t('payslip.generated', { date: formatDate(todayIST()) })}
        </footer>
      </article>
    </main>
  );
}
