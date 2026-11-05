import type { ReactNode } from 'react';
import {
  formatINR,
  numberInWords,
  type BusinessDate,
  type NumberWords,
  type Paise,
  type PayslipLine,
} from '@fincrew/core';
import { payslipPeriod, type PayslipView } from '@fincrew/data';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';

const EARNINGS = ['earned', 'overtime', 'allowance', 'leave_payout'];
const DEDUCTIONS = ['deduction', 'late_deduction'];

/** Print rules for this document only: a clean A4 page with its colours kept. */
const PRINT_CSS = `
@page { size: A4; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  .payslip-sheet { border: 0; border-radius: 0; box-shadow: none; }
  .payslip-sheet, .payslip-sheet * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .payslip-sheet section { break-inside: avoid; }
}
`;

/** Rupees large, paise at half size (design system: Money on hero amounts). */
function Hero({ paise }: { paise: Paise }) {
  const [rupees, fraction] = formatINR(paise).split('.');
  return (
    <span className="text-money-hero leading-none">
      {rupees}
      <span className="text-[0.5em] font-semibold text-[var(--ink-muted)]">.{fraction}</span>
    </span>
  );
}

function inWords(paise: Paise) {
  const words = t('payslip.words', { returnObjects: true }) as unknown as NumberWords;
  const rupees = numberInWords(Math.floor(paise / 100), words);
  return paise % 100
    ? t('payslip.inWordsPaise', { rupees, paise: numberInWords(paise % 100, words) })
    : t('payslip.inWords', { rupees });
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption text-[var(--ink-muted)]">{label}</dt>
      <dd className="text-label-sm">{children}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-caption font-semibold tracking-wider text-[var(--ink-muted)] uppercase">
      {children}
    </h2>
  );
}

function Row({
  label,
  amount,
  sign = '',
  total = false,
}: {
  label: string;
  amount: Paise;
  sign?: '' | '+' | '−';
  total?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2 ${
        total
          ? 'border-t border-[var(--line-strong)] font-semibold'
          : 'border-b border-[var(--line)] last:border-b-0'
      }`}
    >
      <dt className={total ? 'text-label-sm' : 'text-body'}>{label}</dt>
      <dd
        className={`${total ? 'text-money-md' : 'text-money-sm'} ${
          sign === '−' ? 'text-[var(--money-deduction)]' : ''
        }`}
      >
        {sign}
        {formatINR(amount)}
      </dd>
    </div>
  );
}

/**
 * One payslip as a designed A4 page (the "Print or save as PDF" document): the shop and month, the
 * person and their pay period, net pay in figures and words, the days, earnings beside deductions
 * and how they add up. Light on paper, colour only where it means something (design system).
 */
export function PayslipDocument({ slip, today }: { slip: PayslipView; today: BusinessDate }) {
  const { from, to, payDate } = payslipPeriod(slip);
  const months = t('months.long', { returnObjects: true }) as unknown as string[];
  const { summary } = slip;
  const left = Math.max(0, slip.net - slip.paid);
  const state = slip.status === 'draft' ? 'draft' : left === 0 ? 'paid' : 'finalized';
  const label = (l: PayslipLine) =>
    t(`salary.lines.${l.kind}`, { name: l.name ?? '', days: summary.payableDays });
  const of = (kinds: string[]) => slip.lines.filter((l) => kinds.includes(l.kind));

  const days = (
    [
      ['status.present', summary.present, 'present'],
      ['status.half_day', summary.halfDay, 'half-day'],
      ['status.absent', summary.absent, 'absent'],
      ['status.paid_leave', summary.paidLeave, 'paid-leave'],
      ['status.unpaid_leave', summary.unpaidLeave, 'unpaid-leave'],
      ['status.weekly_off', summary.paidWeeklyOff + summary.unpaidWeeklyOff, 'weekly-off'],
      ['status.holiday', summary.paidHoliday + summary.unpaidHoliday, 'holiday'],
      ['payslip.extraDays', summary.extraWorkingDays, 'present'],
      ['status.unmarked', summary.unmarked, null],
    ] as const
  ).filter(([, n]) => n > 0);

  const settled = (
    [
      ['payslip.totalDeductions', slip.deductions, '−'],
      ['salary.lines.expense_payback', slip.payback, '+'],
      ['salary.lines.advance_cut', slip.cut, '−'],
      ['salary.lines.expense_cut', slip.expenseCut, '−'],
    ] as const
  ).filter(([, amount]) => amount > 0);

  return (
    <article className="payslip-sheet bg-card overflow-hidden rounded-lg border shadow-xs">
      <style>{PRINT_CSS}</style>
      <div aria-hidden="true" className="h-2 bg-[var(--accent)]" />

      <div className="flex flex-col gap-7 p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-title-lg">{slip.shopName}</span>
            <span className="text-body text-[var(--ink-muted)]">
              {t('payslip.title')} · {months[slip.month - 1]} {slip.year}
            </span>
          </div>
          <span
            className={`text-caption rounded-[var(--radius-pill)] px-3 py-1 font-semibold ${
              state === 'paid'
                ? 'bg-[var(--status-present-soft)] text-[var(--status-present)]'
                : state === 'finalized'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                  : 'bg-[var(--status-late-soft)] text-[var(--status-late)]'
            }`}
          >
            {t(`payslip.status.${state}`)}
          </span>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-[var(--line)] py-4 sm:grid-cols-4">
          <Fact label={t('payslip.employee')}>{slip.name}</Fact>
          <Fact label={t('payslip.joined')}>{formatDate(slip.joiningDate)}</Fact>
          <Fact label={t('payslip.period')}>
            {formatDate(from)} – {formatDate(to)}
          </Fact>
          <Fact label={t('payslip.payDate')}>{formatDate(payDate)}</Fact>
        </dl>

        {slip.status === 'draft' && (
          <p
            role="note"
            className="text-body rounded-[var(--radius-md)] border border-[var(--status-late)] bg-[var(--status-late-soft)] px-4 py-3 text-[var(--status-late)]"
          >
            {t('payslip.draft')}
          </p>
        )}

        <section className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-[var(--radius-lg)] bg-[var(--accent-soft)] px-6 py-5">
          <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-2">
            <span className="text-label-sm text-[var(--accent-ink)]">{t('payslip.net')}</span>
            <Hero paise={slip.net} />
            {slip.net >= 0 && (
              <span className="text-caption text-[var(--ink-muted)]">{inWords(slip.net)}</span>
            )}
          </div>
          {slip.status === 'finalized' && (
            <dl className="flex gap-8">
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption text-[var(--ink-muted)]">{t('payslip.paid')}</dt>
                <dd className="text-money-md text-[var(--money-paid)]">{formatINR(slip.paid)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption text-[var(--ink-muted)]">{t('payslip.due')}</dt>
                <dd
                  className={`text-money-md ${left > 0 ? 'text-[var(--money-owed)]' : 'text-[var(--ink-muted)]'}`}
                >
                  {formatINR(left)}
                </dd>
              </div>
            </dl>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <SectionTitle>{t('payslip.days')}</SectionTitle>
            <span className="text-caption inline-flex items-baseline gap-1.5 text-[var(--ink-muted)]">
              {t('payslip.payable')}
              <span className="text-money-sm text-[var(--ink)]">
                {summary.payableDays} / {summary.employedDays}
              </span>
            </span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {days.map(([key, n, token]) => (
              <li
                key={key}
                className="text-caption inline-flex items-baseline gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 font-semibold"
                style={
                  token
                    ? {
                        background: `var(--status-${token}-soft)`,
                        color: `var(--status-${token})`,
                      }
                    : {
                        outline: '1.5px dashed var(--line-strong)',
                        color: 'var(--status-unmarked)',
                      }
                }
              >
                <span className="text-money-sm">{n}</span>
                {t(key)}
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-8 sm:grid-cols-2">
          <section className="flex flex-col gap-2">
            <SectionTitle>{t('payslip.earnings')}</SectionTitle>
            <dl>
              {of(EARNINGS).map((l, i) => (
                <Row key={i} label={label(l)} amount={l.amount} />
              ))}
              <Row label={t('payslip.gross')} amount={slip.gross} total />
            </dl>
          </section>
          <section className="flex flex-col gap-2">
            <SectionTitle>{t('payslip.deductions')}</SectionTitle>
            <dl>
              {of(DEDUCTIONS).length === 0 ? (
                <div className="text-body border-b border-[var(--line)] py-2 text-[var(--ink-muted)]">
                  {t('payslip.noDeductions')}
                </div>
              ) : (
                of(DEDUCTIONS).map((l, i) => (
                  <Row key={i} label={label(l)} amount={l.amount} sign="−" />
                ))
              )}
              <Row
                label={t('payslip.totalDeductions')}
                amount={slip.deductions}
                sign={slip.deductions > 0 ? '−' : ''}
                total
              />
            </dl>
          </section>
        </div>

        {settled.length > 0 && (
          <section className="flex flex-col gap-2 sm:ml-auto sm:w-1/2 sm:pl-4">
            <SectionTitle>{t('payslip.takeHome')}</SectionTitle>
            <dl>
              <Row label={t('payslip.gross')} amount={slip.gross} />
              {settled.map(([key, amount, sign]) => (
                <Row key={key} label={t(key)} amount={amount} sign={sign} />
              ))}
              <Row label={t('payslip.net')} amount={slip.net} total />
            </dl>
          </section>
        )}

        <footer className="text-caption flex flex-wrap justify-between gap-2 border-t border-[var(--line)] pt-3 text-[var(--ink-muted)]">
          <span>{t('payslip.generated', { date: formatDate(today) })}</span>
          {slip.revision > 1 && <span>{t('payslip.revision', { n: slip.revision })}</span>}
        </footer>
      </div>
    </article>
  );
}
