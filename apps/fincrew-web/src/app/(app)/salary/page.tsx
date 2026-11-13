import { PendingLink as Link } from '@/components/app/pending-link';
import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { formatINR } from '@fincrew/core';
import {
  dayOfMonthText,
  daysLeft,
  leftToPay,
  loadSalaryPeople,
  type SalaryPersonRow,
} from '@fincrew/data';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Avatar, PageHeader } from '../../components';

const card = 'rounded-lg border bg-card shadow-xs';
const s = 'salaryPeople';

/**
 * Salary by person (owner 13/11/2026; design "Web · salary by person"): each person is on their own
 * pay day, so there is no month view. What's to pay now, what's running so far and the next pay
 * dates, then the people who need something (a salary ended and not finalized, or finalized and not
 * fully paid) and everyone else running. Open someone for their salary page (`/salary/<staff id>`).
 */
export default async function SalaryPage() {
  const me = (await requireMe())!;
  if (!me.permissions.includes('salary.view')) redirect('/');
  const today = todayIST();
  const supabase = await createClient();
  const data = await loadSalaryPeople(supabase, me.shopId, today);
  const needs = data.people.filter((p) => p.needs.length > 0);
  const running = data.people.filter((p) => p.needs.length === 0);

  const row = (p: SalaryPersonRow) => {
    const first = p.needs[0];
    const shown = first ?? p.current!;
    const stage = first ? first.stage : 'running';
    const amount = first ? p.needs.reduce((a, n) => a + leftToPay(n), 0) : leftToPay(p.current!);
    const line = first
      ? t(`${s}.${first.stage === 'finalize' ? 'rowFinalize' : 'rowPay'}`, {
          from: formatDate(first.period.from),
          to: formatDate(first.period.to),
        })
      : t(`${s}.rowRunning`, {
          from: formatDate(shown.period.from),
          to: formatDate(shown.period.to),
          payDate: formatDate(shown.period.payDate),
          count: daysLeft(shown, today),
        });
    return (
      <li key={p.staffId} className="border-b border-[var(--line)] last:border-b-0">
        <Link
          href={`/salary/${p.staffId}`}
          aria-label={t(`${s}.open`, { name: p.name })}
          className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-muted)]"
        >
          <Avatar name={p.name} size={36} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">
              {p.name}{' '}
              <span className="font-normal text-[var(--ink-muted)]">
                · {t(`${s}.payDay`, { day: dayOfMonthText(p.payDay, t) })}
              </span>
            </span>
            <span className="truncate text-[13px] text-[var(--ink-muted)]">{line}</span>
          </span>
          <span className="flex flex-col items-end gap-0.5">
            <span className="text-money-sm">{formatINR(amount)}</span>
            <span
              className={`rounded-full px-2 text-[11px] leading-4 font-semibold ${
                stage === 'running'
                  ? 'bg-[var(--surface-muted)] text-[var(--ink-muted)]'
                  : 'bg-[var(--status-late-soft)] text-[var(--status-late)]'
              }`}
            >
              {t(`${s}.badge.${stage}`)}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
        </Link>
      </li>
    );
  };

  const group = (title: string, dot: string, list: SalaryPersonRow[]) =>
    list.length > 0 && (
      <section className={`${card} overflow-hidden`}>
        <header className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <span className="size-2 rounded-full" style={{ background: dot }} aria-hidden="true" />
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="text-sm text-[var(--ink-muted)]">{list.length}</span>
        </header>
        <ul>{list.map(row)}</ul>
      </section>
    );

  return (
    <>
      <PageHeader title={t('salary.title')} subtitle={t(`${s}.subtitle`)} />
      {data.people.length === 0 ? (
        <div className={`${card} p-6 text-[var(--ink-muted)]`}>{t(`${s}.empty`)}</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <section className="flex flex-col gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-5 py-4">
              <span className="text-[13px] font-semibold text-[var(--accent-ink)]">
                {t(`${s}.toPay`)}
              </span>
              <span className="text-money-hero text-[2rem] leading-tight">
                {formatINR(data.toPay)}
              </span>
              <span className="text-[13px] text-[var(--ink-muted)]">
                {t(`${s}.toPaySub`, { count: data.toPayPeople })}
              </span>
            </section>
            <section className={`${card} flex flex-col gap-1 px-5 py-4`}>
              <span className="text-[13px] font-semibold text-[var(--ink-muted)]">
                {t(`${s}.runningSoFar`)}
              </span>
              <span className="text-money-hero text-[2rem] leading-tight">
                {formatINR(data.runningSoFar)}
              </span>
              <span className="text-[13px] text-[var(--ink-muted)]">
                {t(`${s}.runningSub`, { count: data.runningPeople })}
              </span>
            </section>
            <section className={`${card} flex flex-col gap-1 px-5 py-4`}>
              <span className="text-[13px] font-semibold text-[var(--ink-muted)]">
                {t(`${s}.nextPays`)}
              </span>
              {data.nextPays.length === 0 ? (
                <span className="text-sm text-[var(--ink-muted)]">{t(`${s}.nobody`)}</span>
              ) : (
                <ul className="text-sm leading-6">
                  {data.nextPays.slice(0, 3).map((n) => (
                    <li key={n.staffId}>
                      {t(`${s}.nextPay`, { date: formatDate(n.date), name: n.name })}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          {group(t(`${s}.needs`), 'var(--status-late)', needs)}
          {group(t(`${s}.running`), 'var(--accent)', running)}
        </>
      )}
    </>
  );
}
