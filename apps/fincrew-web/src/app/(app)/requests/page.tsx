import { PendingLink as Link } from '@/components/app/pending-link';
import { redirect } from 'next/navigation';
import { formatINR, formatTimeOfDay, minutesOfDayIST, weekday } from '@fincrew/core';
import {
  dateOfInstant,
  loadRequestContext,
  loadRequests,
  requestDays,
  type RequestContext,
  type RequestItem,
} from '@fincrew/data';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Avatar, PageHeader } from '../../components';
import { DecideForm, type DecideLabels } from './decide-form';

const card = 'rounded-lg border bg-card p-5 shadow-xs';
const time = (iso: string) => formatTimeOfDay(minutesOfDayIST(new Date(iso)));

/** "Mon 26/10/2026 – Tue 27/10/2026 · 2 days" or "₹2,000.00". */
function requestWhat(r: RequestItem) {
  if (r.kind === 'advance') return formatINR(r.amount ?? 0);
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const d = (x: string) => `${days[weekday(x)]} ${formatDate(x)}`;
  const count = requestDays(r.from!, r.to!).length;
  return t('requests.days', { from: d(r.from!), to: d(r.to!), count });
}

function contextText(c: RequestContext | undefined) {
  if (!c) return '';
  if (c.kind === 'leave')
    return c.paidLeft === null
      ? t('requests.leaveFits')
      : t('requests.leaveShort', { count: c.paidLeft });
  return [
    t('requests.owes', { amount: formatINR(c.outstanding) }),
    c.limit != null ? t('requests.limit', { amount: formatINR(c.limit) }) : t('requests.noLimit'),
    c.mode === 'all'
      ? t('requests.cutAll')
      : c.mode === 'fixed'
        ? t('requests.cut', { amount: formatINR(c.cut ?? 0) })
        : t('requests.cutAtRun'),
  ].join(' · ');
}

/**
 * Requests (design: "Web · requests"): leave and advances staff asked for in Staffora, waiting
 * ones to approve or reject, and the decided ones. Needs requests.decide.
 */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const me = (await requireMe())!;
  if (!me.permissions.includes('requests.decide')) redirect('/');
  const show = (await searchParams).show === 'decided' ? 'decided' : 'pending';
  const supabase = await createClient();
  const [pending, decided] = await Promise.all([
    loadRequests(supabase, me.shopId, 'pending'),
    show === 'decided' ? loadRequests(supabase, me.shopId, 'decided') : Promise.resolve([]),
  ]);
  const context =
    show === 'pending' ? await loadRequestContext(supabase, me.shopId, pending) : new Map();
  const items = show === 'pending' ? pending : decided;

  const labels: DecideLabels = {
    markAs: t('requests.markAs'),
    leaveStatus: {
      paid_leave: t('requests.leaveStatus.paid_leave'),
      unpaid_leave: t('requests.leaveStatus.unpaid_leave'),
    },
    paidWith: t('requests.paidWith'),
    modes: t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>,
    reply: t('requests.reply'),
    approve: t('requests.approve'),
    approveAnyway: t('requests.approveAnyway'),
    reject: t('requests.reject'),
    working: t('requests.working'),
  };
  const tab = (value: 'pending' | 'decided', label: string) => (
    <Link
      href={value === 'pending' ? '/requests' : '/requests?show=decided'}
      aria-current={show === value ? 'page' : undefined}
      className={`text-label-sm flex min-h-10 items-center rounded-[var(--radius-sm)] px-4 ${
        show === value
          ? 'bg-[var(--surface)] shadow-[var(--elevation-1)]'
          : 'text-[var(--ink-muted)]'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={t('requests.title')}
        subtitle={t('requests.subtitle', { shop: me.shopName })}
        actions={
          <nav
            aria-label={t('requests.tabs.label')}
            className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1"
          >
            {tab('pending', t('requests.tabs.pending', { count: pending.length }))}
            {tab('decided', t('requests.tabs.decided'))}
          </nav>
        }
      />

      {items.length === 0 ? (
        <p className="text-body-lg text-[var(--ink-muted)]">{t(`requests.empty.${show}`)}</p>
      ) : (
        <div className="grid items-stretch gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr))]">
          {items.map((r) => {
            const ctx = context.get(r.id) as RequestContext | undefined;
            return (
              <section key={r.id} className={`${card} flex flex-col gap-3`}>
                <div className="flex items-center gap-3">
                  <Avatar name={r.name} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={`/staff/${r.staffId}`}
                      className="text-label truncate underline-offset-2 hover:underline"
                    >
                      {r.name}
                    </Link>
                    <span className="text-caption text-[var(--ink-muted)]">
                      {t('requests.asked', {
                        date: formatDate(dateOfInstant(r.createdAt)),
                        time: time(r.createdAt),
                      })}
                    </span>
                  </span>
                  <span
                    className={`text-caption rounded-[var(--radius-pill)] px-2.5 py-1 ${
                      r.kind === 'leave'
                        ? 'bg-[var(--status-paid-leave-soft)] text-[var(--status-paid-leave)]'
                        : 'bg-[var(--surface-muted)] text-[var(--money-advance)]'
                    }`}
                  >
                    {t(`requests.kind.${r.kind}`)}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-title-md tabular-nums">{requestWhat(r)}</span>
                  {r.note && <span className="text-body">“{r.note}”</span>}
                  {ctx && (
                    <span className="text-caption text-[var(--ink-muted)]">{contextText(ctx)}</span>
                  )}
                </div>
                {r.status === 'pending' ? (
                  <DecideForm
                    requestId={r.id}
                    kind={r.kind}
                    defaultLeave={
                      ctx?.kind === 'leave' && ctx.paidLeft !== null ? 'unpaid_leave' : 'paid_leave'
                    }
                    labels={labels}
                  />
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <span
                      className={`text-label-sm ${
                        r.status === 'approved'
                          ? 'text-[var(--money-paid)]'
                          : r.status === 'rejected'
                            ? 'text-[var(--danger)]'
                            : 'text-[var(--ink-muted)]'
                      }`}
                    >
                      {t(`requests.decided.${r.status}`, {
                        name: r.decidedBy ?? r.name,
                        date: r.decidedAt ? formatDate(dateOfInstant(r.decidedAt)) : '',
                      })}
                    </span>
                    {r.leaveStatus && (
                      <span className="text-caption text-[var(--ink-muted)]">
                        {t('requests.approvedAs', {
                          status: t(`requests.leaveStatus.${r.leaveStatus}`),
                        })}
                      </span>
                    )}
                    {r.decisionNote && (
                      <span className="text-caption text-[var(--ink-muted)]">
                        “{r.decisionNote}”
                      </span>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <p className="text-caption text-[var(--ink-muted)]">{t('requests.footnote')}</p>
    </>
  );
}
