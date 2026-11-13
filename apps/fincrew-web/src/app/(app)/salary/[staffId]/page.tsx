import { PendingLink as Link } from '@/components/app/pending-link';
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, FileText } from 'lucide-react';
import { formatINR, type PayslipLine } from '@fincrew/core';
import {
  dayOfMonthText,
  daysLeft,
  leftToPay,
  loadMoneyNow,
  loadPersonSalary,
  PAYSLIP_MINUS_LINES,
  type PersonSalary,
} from '@fincrew/data';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Avatar, quietButtonClass } from '../../../components';
import { StatementButton } from '../../staff/[id]/statement-button';
import { finalizeSalary, paySalary } from '../actions';
import { AddLess } from '../add-less';
import { ActionButton, PayControl } from '../controls';
import { PayNowDialog } from '../pay-now';

const s = 'salaryPeople';
const card = 'rounded-lg border bg-card shadow-xs';

/** "We owe ₹…" beside the name (the same sum as the staff page). */
async function OwedTag({ shopId, staffId }: { shopId: string; staffId: string }) {
  const now = await loadMoneyNow(await createClient(), shopId, staffId, todayIST());
  if (!now || now.total === 0) return null;
  return (
    <span className="rounded-full bg-[var(--status-late-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--money-owed)] tabular-nums">
      {now.total > 0
        ? t('statement.tagOwe', { amount: formatINR(now.total) })
        : t('statement.tagOwes', { amount: formatINR(-now.total) })}
    </span>
  );
}

/** A salary's lines (add or less entries show apart, in Add or less). */
function Lines({ salary }: { salary: PersonSalary }) {
  const label = (l: PayslipLine) =>
    t(`salary.lines.${l.kind}`, { name: l.name ?? '', days: salary.summary.payableDays });
  return (
    <ul className="flex max-w-2xl flex-col border-t border-[var(--line)]">
      {salary.lines
        .filter((l) => !l.oneOff)
        .map((l, i) => {
          const minus = PAYSLIP_MINUS_LINES.includes(l.kind);
          return (
            <li
              key={i}
              className="flex justify-between gap-3 border-b border-[var(--line)] py-1.5 text-sm"
            >
              <span>{label(l)}</span>
              <span
                className={`tabular-nums ${minus ? 'text-[var(--money-deduction)]' : l.kind === 'expense_payback' ? 'text-[var(--money-owed)]' : ''}`}
              >
                {minus ? '−' : ''}
                {formatINR(l.amount)}
              </span>
            </li>
          );
        })}
    </ul>
  );
}

/**
 * One person's salary (owner 13/11/2026; design "Web · salary by person"): what needs doing first
 * (a salary that ended and isn't finalized: Finalize; one finalized and not fully paid: Pay), then
 * the salary running now (Add or less, Pay now), then every earlier salary with what was paid.
 * Each salary is shown by its own dates, never by month.
 */
export default async function PersonSalaryPage({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const me = (await requireMe())!;
  const can = (k: string) => me.permissions.includes(k);
  if (!can('salary.view')) redirect('/');
  const canRun = can('salary.run');
  const { staffId } = await params;
  const today = todayIST();
  const supabase = await createClient();
  const view = await loadPersonSalary(supabase, me.shopId, staffId, today);
  if (!view) notFound();
  const first = view.name.trim().split(/\s+/)[0] ?? view.name;
  const days = (x: PersonSalary, soFar: boolean) =>
    t(`${s}.${soFar ? 'daysSoFar' : 'days'}`, {
      payable: x.summary.payableDays,
      employed: x.summary.employedDays,
    });
  const entriesOf = (x: PersonSalary) =>
    x.state === 'draft'
      ? x.entries
      : x.lines
          .filter((l) => l.oneOff)
          .map((l) => ({
            kind: l.kind === 'deduction' ? ('less' as const) : ('add' as const),
            name: l.name ?? '',
            amount: l.amount,
          }));
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const current = view.current;

  return (
    <>
      <Link
        href="/salary"
        className="inline-flex w-fit items-center gap-1 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t(`${s}.back`)}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={view.name} size={44} />
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{view.name}</h1>
              <Suspense fallback={<Skeleton className="h-5 w-28 rounded-full" />}>
                <OwedTag shopId={me.shopId} staffId={staffId} />
              </Suspense>
            </div>
            <p className="text-sm text-[var(--ink-muted)]">
              {t(`${s}.payDayLine`, { day: dayOfMonthText(view.payDay, t) })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatementButton
            staffId={staffId}
            label={t('statement.view')}
            moreLabel={t('statement.more')}
            historical={t('statement.historical')}
            historicalHint={t('statement.historicalHint', { date: formatDate(view.joiningDate) })}
          />
          <Link href={`/staff/${staffId}`} className={quietButtonClass}>
            {t(`${s}.staffPage`)}
          </Link>
        </div>
      </div>

      {view.needs.map((n) => (
        <section
          key={`${n.year}-${n.month}`}
          className="flex flex-col gap-3 rounded-lg border border-[var(--status-late)] bg-[var(--status-late-soft)] px-5 py-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-bold tracking-wider text-[var(--status-late)] uppercase">
                {n.stage === 'finalize' ? t(`${s}.ended`) : t(`${s}.stillToPay`)}
              </span>
              <span className="text-base font-semibold">
                {formatDate(n.period.from)} – {formatDate(n.period.to)} · {days(n, false)}
              </span>
              <span className="text-[13px] text-[var(--ink-muted)]">
                {n.stage === 'finalize'
                  ? t(`${s}.endedNote`, { date: formatDate(n.period.payDate) })
                  : t(`${s}.payNote`, {
                      net: formatINR(n.net),
                      paid: formatINR(n.paidAmount),
                    })}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-3">
              <span className="text-money-md">{formatINR(leftToPay(n))}</span>
              {canRun && n.stage === 'finalize' && (
                <ActionButton
                  action={finalizeSalary.bind(null, n.year, n.month, [staffId])}
                  label={t('salary.finalizeOne')}
                  working={t('salary.working')}
                  variant="primary"
                  confirm={{
                    title: t('salary.confirm.finalizeOneTitle', { name: first }),
                    body: t('salary.confirm.finalizeOneBody', {
                      amount: formatINR(n.net),
                      name: first,
                    }),
                  }}
                />
              )}
              {canRun && n.stage === 'pay' && n.runId && (
                <PayControl
                  today={today}
                  due={leftToPay(n)}
                  pay={paySalary.bind(null, n.runId, n.id)}
                  label={t('salary.pay')}
                  modeLabel={t('salary.payMode')}
                  modes={modes}
                  working={t('salary.working')}
                  title={t(`${s}.payTitle`, { name: view.name })}
                  body={t('salary.confirm.payBody')}
                />
              )}
              {n.stage === 'pay' && (
                <Link
                  href={`/payslips/${n.id}`}
                  target="_blank"
                  className={`${quietButtonClass} inline-flex items-center gap-2`}
                >
                  <FileText size={18} aria-hidden="true" />
                  {t(`${s}.payslip`)}
                </Link>
              )}
            </span>
          </div>
          {n.stage === 'finalize' && (
            <div className="flex max-w-2xl flex-col gap-3 rounded-md bg-[var(--surface)] p-3">
              <Lines salary={n} />
              <AddLess
                year={n.year}
                month={n.month}
                staffId={staffId}
                canEdit={canRun}
                entries={entriesOf(n)}
              />
            </div>
          )}
        </section>
      ))}

      <section className={`${card} flex flex-col gap-3 px-5 py-4`}>
        {current ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="flex flex-col">
                <span className="text-xs font-bold tracking-wider text-[var(--accent-ink)] uppercase">
                  {t(`${s}.current`)}
                </span>
                <span className="text-base font-semibold">
                  {formatDate(current.period.from)} – {formatDate(current.period.to)}
                </span>
                <span className="text-[13px] text-[var(--ink-muted)]">
                  {t(`${s}.pays`, {
                    date: formatDate(current.period.payDate),
                    count: daysLeft(current, today),
                  })}{' '}
                  · {days(current, true)}
                </span>
              </span>
              <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink-muted)]">
                {t(`${s}.notFinalized`)}
              </span>
            </div>
            <Lines salary={current} />
            <AddLess
              year={current.year}
              month={current.month}
              staffId={staffId}
              canEdit={canRun}
              entries={entriesOf(current)}
            />
            {current.paidAmount > 0 && (
              <div className="flex max-w-2xl justify-between gap-3 text-sm">
                <span>{t('salary.payNow.paidSoFar')}</span>
                <span className="text-[var(--money-paid)] tabular-nums">
                  −{formatINR(current.paidAmount)}
                </span>
              </div>
            )}
            <div className="flex max-w-2xl items-baseline justify-between gap-3 font-semibold">
              <span className="text-sm">
                {current.paidAmount > 0
                  ? t('salary.payNow.stillToPaySoFar')
                  : t(`${s}.takeHomeSoFar`)}
              </span>
              <span className="text-money-md">{formatINR(leftToPay(current))}</span>
            </div>
            {canRun && (
              <div>
                <PayNowDialog
                  year={current.year}
                  month={current.month}
                  staffId={staffId}
                  name={view.name}
                  monthName=""
                  payDay={view.payDay}
                  period={current.period}
                  today={today}
                  soFar={current.net}
                  paid={current.paidAmount}
                  additions={current.entries
                    .filter((e) => e.kind === 'add')
                    .map((e) => ({ name: e.name, amount: e.amount }))}
                />
              </div>
            )}
          </>
        ) : (
          <span className="text-sm text-[var(--ink-muted)]">{t(`${s}.noCurrent`)}</span>
        )}
      </section>

      <section className={`${card} flex flex-col gap-2 px-5 py-4`}>
        <h2 className="text-xs font-bold tracking-wider text-[var(--ink-muted)] uppercase">
          {t(`${s}.earlier`)}
        </h2>
        {view.earlier.length === 0 ? (
          <span className="text-sm text-[var(--ink-muted)]">{t(`${s}.noEarlier`)}</span>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-xs text-[var(--ink-muted)]">
                  <th className="border-b border-[var(--line-strong)] pr-3 pb-1.5 text-left font-medium">
                    {t(`${s}.cols.salary`)}
                  </th>
                  <th className="border-b border-[var(--line-strong)] pb-1.5 pl-3 text-right font-medium">
                    {t(`${s}.cols.takeHome`)}
                  </th>
                  <th className="border-b border-[var(--line-strong)] pb-1.5 pl-3 text-right font-medium">
                    {t(`${s}.cols.paid`)}
                  </th>
                  <th className="border-b border-[var(--line-strong)] pb-1.5 pl-3 text-right font-medium">
                    {t(`${s}.cols.left`)}
                  </th>
                  <th className="border-b border-[var(--line-strong)] pb-1.5 pl-3" />
                </tr>
              </thead>
              <tbody>
                {view.earlier.map((r) => (
                  <tr key={r.payslipId}>
                    <td className="border-b border-[var(--line)] py-2 pr-3">
                      <span className="font-semibold">
                        {r.from && r.to ? `${formatDate(r.from)} – ${formatDate(r.to)}` : ''}
                      </span>
                      <span className="block text-xs text-[var(--ink-muted)]">
                        {t(`${s}.days`, { payable: r.payableDays, employed: r.employedDays })}
                        {r.newCycleFrom
                          ? ` · ${t('statement.closedEarly', { date: formatDate(r.newCycleFrom) })}`
                          : ''}
                      </span>
                    </td>
                    <td className="border-b border-[var(--line)] py-2 pl-3 text-right tabular-nums">
                      {formatINR(r.net)}
                    </td>
                    <td className="border-b border-[var(--line)] py-2 pl-3 text-right text-[var(--money-paid)] tabular-nums">
                      {formatINR(r.paid)}
                    </td>
                    <td className="border-b border-[var(--line)] py-2 pl-3 text-right font-semibold tabular-nums">
                      {r.left > 0 ? formatINR(r.left) : '—'}
                    </td>
                    <td className="border-b border-[var(--line)] py-2 pl-3 text-right text-xs whitespace-nowrap">
                      <span
                        className={`block font-semibold ${r.left > 0 ? 'text-[var(--money-owed)]' : 'text-[var(--money-paid)]'}`}
                      >
                        {r.left === 0 && r.paidOn
                          ? t(`${s}.paidOn`, { date: formatDate(r.paidOn) })
                          : r.paid > 0
                            ? t(`${s}.partPaid`)
                            : r.left > 0
                              ? t(`${s}.notPaid`)
                              : ''}
                      </span>
                      <Link
                        href={`/payslips/${r.payslipId}`}
                        target="_blank"
                        className="text-[var(--accent-ink)] hover:underline"
                      >
                        {t(`${s}.payslip`)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
