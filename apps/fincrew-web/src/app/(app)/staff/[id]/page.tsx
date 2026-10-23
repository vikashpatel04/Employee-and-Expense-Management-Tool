import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowUpRight, ChevronLeft, Hourglass, MessageCircle, Phone } from 'lucide-react';
import {
  formatINR,
  formatTimeOfDay,
  runningBalances,
  type LedgerLine,
  type LedgerType,
} from '@fincrew/core';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Avatar, quietButtonClass } from '../../../components';
import { AdvanceForm, AdvanceSettingsForm, UndoButton } from './advance-forms';
import { PayForm } from './pay-form';

type Tab = 'overview' | 'ledger' | 'pay';

const card = 'rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]';
const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const me = (await requireMe())!;
  const { id } = await params;
  const sp = await searchParams;
  const self = me.personId === id;
  const can = (k: string) => me.permissions.includes(k);
  if (!self && !can('staff.view')) redirect('/');

  const canLedger = self || can('salary.view');
  const canPay = self || can('staff.pay.view');
  const tabs: Tab[] = [
    'overview',
    ...(canLedger ? (['ledger'] as const) : []),
    ...(canPay ? (['pay'] as const) : []),
  ];
  const tab: Tab = tabs.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'overview';

  const supabase = await createClient();
  const { data: s } = await supabase
    .from('staff')
    .select(
      'person_id, joining_date, leaving_date, status, advance_limit_paise, advance_cut_paise, people!inner(name, phone)',
    )
    .eq('person_id', id)
    .eq('shop_id', me.shopId)
    .maybeSingle();
  if (!s) notFound();
  const name = s.people.name;
  const phone = s.people.phone;

  return (
    <>
      <Link
        href="/staff"
        className={`${quietButtonClass} inline-flex w-fit items-center gap-1 border-0 px-2`}
      >
        <ChevronLeft size={20} aria-hidden="true" />
        {t('staffDetail.back')}
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <Avatar name={name} size={56} />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-title-lg">{name}</h1>
          <p className="text-body text-[var(--ink-muted)]">
            {t('staffDetail.joined', { date: formatDate(s.joining_date) })}
            {s.leaving_date && ` · ${t('staffDetail.left', { date: formatDate(s.leaving_date) })}`}
            {phone && ` · ${phone}`}
          </p>
        </div>
      </header>

      <nav
        aria-label={t('staffDetail.tabs.label')}
        className="flex w-fit gap-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1"
      >
        {tabs.map((x) => (
          <Link
            key={x}
            href={`/staff/${id}?tab=${x}`}
            aria-current={x === tab ? 'page' : undefined}
            className={`text-label-sm flex min-h-10 items-center rounded-[var(--radius-sm)] px-4 ${
              x === tab
                ? 'bg-[var(--surface)] shadow-[var(--elevation-1)]'
                : 'text-[var(--ink-muted)]'
            }`}
          >
            {t(`staffDetail.tabs.${x}`)}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && (
        <Overview
          staffId={id}
          name={name}
          phone={phone}
          canMoney={canLedger}
          advanceLimit={s.advance_limit_paise}
          advanceCut={s.advance_cut_paise}
          canGive={can('advances.give')}
          canEditStaff={can('staff.edit')}
        />
      )}
      {tab === 'ledger' && <Ledger staffId={id} canUndo={can('salary.undo_payment')} />}
      {tab === 'pay' && (
        <Pay
          staffId={id}
          canEdit={can('staff.pay.edit')}
          joiningDate={s.joining_date}
          saved={sp.saved}
        />
      )}
    </>
  );
}

async function Overview(props: {
  staffId: string;
  name: string;
  phone: string | null;
  canMoney: boolean;
  advanceLimit: number | null;
  advanceCut: number | null;
  canGive: boolean;
  canEditStaff: boolean;
}) {
  const supabase = await createClient();
  const [{ data: bal }, { data: adv }] = props.canMoney
    ? await Promise.all([
        supabase
          .from('ledger_balances')
          .select('balance_paise')
          .eq('staff_id', props.staffId)
          .maybeSingle(),
        supabase
          .from('advance_balances')
          .select('outstanding_paise')
          .eq('staff_id', props.staffId)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];
  const balance = Number(bal?.balance_paise ?? 0);
  const outstanding = Number(adv?.outstanding_paise ?? 0);
  const digits = (props.phone ?? '').replace(/\D/g, '');
  const wa = digits.length === 10 ? `91${digits}` : digits;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {props.canMoney && (
        <section className={`${card} flex flex-col gap-2`}>
          <span
            className={`text-label-sm inline-flex items-center gap-1.5 ${
              balance > 0
                ? 'text-[var(--money-owed)]'
                : balance < 0
                  ? 'text-[var(--money-advance)]'
                  : 'text-[var(--ink-muted)]'
            }`}
          >
            <Hourglass size={20} aria-hidden="true" />
            {balance > 0
              ? t('staffDetail.balance.due', { name: props.name })
              : balance < 0
                ? t('staffDetail.balance.owes', { name: props.name })
                : t('staffDetail.balance.settled')}
          </span>
          <span className="text-money-hero">{formatINR(Math.abs(balance))}</span>
          <div className="my-2 h-px bg-[var(--line)]" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-label-sm inline-flex items-center gap-1.5 text-[var(--money-advance)]">
              <ArrowUpRight size={20} aria-hidden="true" />
              {t('staffDetail.advance.title')}
            </span>
            <span className="text-money-md">{formatINR(outstanding)}</span>
          </div>
          <span className="text-caption text-[var(--ink-muted)]">
            {props.advanceCut != null
              ? t('staffDetail.advance.cut', { amount: formatINR(Number(props.advanceCut)) })
              : t('staffDetail.advance.noCut')}
            {' · '}
            {props.advanceLimit != null
              ? t('staffDetail.advance.limit', { amount: formatINR(Number(props.advanceLimit)) })
              : t('staffDetail.advance.noLimit')}
          </span>
        </section>
      )}
      {props.phone && (
        <section className="grid content-start gap-2 sm:grid-cols-2">
          <a
            href={`tel:${digits}`}
            className={`${quietButtonClass} inline-flex items-center justify-center gap-2`}
          >
            <Phone size={20} aria-hidden="true" />
            {t('staffDetail.actions.call')}
          </a>
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noreferrer"
            className={`${quietButtonClass} inline-flex items-center justify-center gap-2`}
          >
            <MessageCircle size={20} aria-hidden="true" />
            {t('staffDetail.actions.whatsapp')}
          </a>
        </section>
      )}
      {props.canGive && (
        <section className={card}>
          <h2 className="text-title-md mb-3">{t('advances.give')}</h2>
          <AdvanceForm
            staffId={props.staffId}
            today={todayIST()}
            labels={{
              kind: {
                label: t('advances.kind.label'),
                given: t('advances.kind.given'),
                repaid: t('advances.kind.repaid'),
              },
              amount: t('advances.fields.amount'),
              date: t('advances.fields.date'),
              mode: t('advances.fields.mode'),
              modes: t('salary.modes', { returnObjects: true }) as unknown as Record<
                string,
                string
              >,
              note: t('advances.fields.note'),
              confirm: t('advances.fields.confirm'),
              save: t('advances.save'),
              saving: t('advances.saving'),
            }}
          />
        </section>
      )}
      {props.canEditStaff && (
        <section className={card}>
          <h2 className="text-title-md mb-3">{t('advances.settings.title')}</h2>
          <AdvanceSettingsForm
            staffId={props.staffId}
            limit={props.advanceLimit == null ? null : Number(props.advanceLimit)}
            cut={props.advanceCut == null ? null : Number(props.advanceCut)}
            labels={{
              limit: t('advances.settings.limit'),
              cut: t('advances.settings.cut'),
              save: t('advances.settings.save'),
              saving: t('advances.saving'),
            }}
          />
        </section>
      )}
    </div>
  );
}

async function Ledger({ staffId, canUndo }: { staffId: string; canUndo: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('ledger_entries')
    .select(
      'id, date, type, amount_paise, name, note, payment_mode, adjusts, reverses_id, created_at',
    )
    .eq('staff_id', staffId)
    .order('date')
    .order('created_at');
  const lines: (LedgerLine & { note: string | null; mode: string | null })[] = (data ?? []).map(
    (l) => ({
      id: l.id,
      date: l.date,
      type: l.type as LedgerType,
      amount: Number(l.amount_paise),
      name: l.name ?? undefined,
      adjusts: (l.adjusts ?? undefined) as LedgerType | undefined,
      note: l.note,
      mode: l.payment_mode,
    }),
  );
  if (lines.length === 0)
    return <p className="text-body-lg text-[var(--ink-muted)]">{t('staffDetail.ledger.empty')}</p>;

  const reversed = new Set((data ?? []).map((l) => l.reverses_id).filter(Boolean));
  const withBalance = runningBalances(lines).reverse();
  const byMonth = new Map<string, typeof withBalance>();
  for (const l of withBalance) {
    const key = l.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), l]);
  }
  const balance = withBalance[0]!.balance;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <section className={`${card} flex items-center justify-between`}>
        <span className="text-caption text-[var(--ink-muted)]">
          {t('staffDetail.ledger.balance')}
        </span>
        <span className="text-money-lg">{formatINR(balance)}</span>
      </section>
      {[...byMonth.entries()].map(([month, rows]) => (
        <section key={month} className="flex flex-col gap-2">
          <h2 className="text-title-md px-1">{MONTH.format(new Date(`${month}-01T00:00:00Z`))}</h2>
          <ul className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
            {rows.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-label-sm">
                    {t(`ledgerTypes.${l.type}`)}
                    {l.name ? ` · ${l.name}` : ''}
                    {l.adjusts ? ` · ${t(`ledgerTypes.${l.adjusts}`)}` : ''}
                  </span>
                  <span className="text-caption text-[var(--ink-muted)]">
                    {formatDate(l.date)}
                    {l.mode ? ` · ${l.mode.toUpperCase()}` : ''}
                    {l.note ? ` · ${l.note}` : ''}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span
                    className={`text-money-sm ${l.amount > 0 ? 'text-[var(--money-owed)]' : ''}`}
                  >
                    {l.amount > 0 ? '+' : ''}
                    {formatINR(l.amount)}
                  </span>
                  <span className="text-caption text-[var(--ink-muted)]">
                    {t('staffDetail.ledger.runningBalance', { amount: formatINR(l.balance) })}
                  </span>
                  {reversed.has(l.id) ? (
                    <span className="text-caption text-[var(--ink-muted)]">
                      {t('advances.undone')}
                    </span>
                  ) : (
                    canUndo &&
                    (l.type === 'salary_payment' || l.type === 'advance') && (
                      <UndoButton staffId={staffId} lineId={l.id} label={t('advances.undo')} />
                    )
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

async function Pay(props: {
  staffId: string;
  canEdit: boolean;
  joiningDate: string;
  saved?: string;
}) {
  const supabase = await createClient();
  const [{ data: pays }, { data: allowances }, { data: deductions }, { data: tpl }] =
    await Promise.all([
      supabase
        .from('pay_settings')
        .select('*')
        .eq('staff_id', props.staffId)
        .order('effective_from', { ascending: false }),
      supabase.from('allowances').select('*').eq('staff_id', props.staffId).order('effective_from'),
      supabase
        .from('fixed_deductions')
        .select('*')
        .eq('staff_id', props.staffId)
        .order('effective_from'),
      supabase
        .from('staff_leave_templates')
        .select('effective_from, leave_templates(name)')
        .eq('staff_id', props.staffId)
        .order('effective_from', { ascending: false })
        .limit(1),
    ]);
  const today = todayIST();
  const current = (pays ?? []).find((p) => p.effective_from <= today) ?? null;
  const amountOf = (p: NonNullable<typeof current>) =>
    Number(
      p.pay_type === 'monthly'
        ? p.monthly_salary_paise
        : p.pay_type === 'daily'
          ? p.daily_wage_paise
          : p.hourly_rate_paise,
    );
  const row =
    'flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0';
  const template = tpl?.[0];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        {props.saved && (
          <p
            role="status"
            className="text-body rounded-[var(--radius-md)] bg-[var(--status-present-soft)] px-4 py-3 text-[var(--status-present)]"
          >
            {t('staffDetail.pay.form.saved', { date: formatDate(props.saved) })}
          </p>
        )}
        {!current ? (
          <p className={`${card} text-body-lg text-[var(--ink-muted)]`}>
            {t('staffDetail.pay.none')}
          </p>
        ) : (
          <section className="flex flex-col gap-2">
            <h2 className="text-title-md px-1">{t('staffDetail.pay.current')}</h2>
            <ul className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
              <li className={row}>
                <span className="flex flex-col">
                  <span className="text-label-sm">
                    {t(`staffDetail.pay.amount.${current.pay_type}`)}
                  </span>
                  <span className="text-caption text-[var(--ink-muted)]">
                    {t(`staffDetail.pay.types.${current.pay_type}`)} ·{' '}
                    {t('staffDetail.pay.since', { date: formatDate(current.effective_from) })}
                  </span>
                </span>
                <span className="text-money-sm">{formatINR(amountOf(current))}</span>
              </li>
              {current.overtime_rate_paise != null && (
                <li className={row}>
                  <span className="text-label-sm">{t('staffDetail.pay.overtime')}</span>
                  <span className="text-money-sm">
                    {formatINR(Number(current.overtime_rate_paise))}
                  </span>
                </li>
              )}
              <li className={row}>
                <span className="flex flex-col">
                  <span className="text-label-sm">{t('staffDetail.pay.shift')}</span>
                  {current.shift_start != null && (
                    <span className="text-caption text-[var(--ink-muted)]">
                      {t('staffDetail.pay.grace', { minutes: current.grace_minutes })}
                    </span>
                  )}
                </span>
                <span className="text-body">
                  {current.shift_start != null && current.shift_end != null
                    ? `${formatTimeOfDay(current.shift_start)} – ${formatTimeOfDay(current.shift_end)}`
                    : t('staffDetail.pay.noShift')}
                </span>
              </li>
              <li className={row}>
                <span className="flex flex-col">
                  <span className="text-label-sm">{t('staffDetail.pay.template')}</span>
                  {template && (
                    <span className="text-caption text-[var(--ink-muted)]">
                      {t('staffDetail.pay.templateSince', {
                        date: formatDate(template.effective_from),
                      })}
                    </span>
                  )}
                </span>
                <span className="text-body text-right">
                  {template?.leave_templates?.name ?? t('staffDetail.pay.noTemplate')}
                </span>
              </li>
            </ul>
          </section>
        )}

        {[
          { title: t('staffDetail.pay.allowances'), rows: allowances ?? [] },
          { title: t('staffDetail.pay.deductions'), rows: deductions ?? [] },
        ].map(
          (group) =>
            group.rows.length > 0 && (
              <section key={group.title} className="flex flex-col gap-2">
                <h2 className="text-title-md px-1">{group.title}</h2>
                <ul className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
                  {group.rows.map((a) => (
                    <li key={a.id} className={row}>
                      <span className="flex flex-col">
                        <span className="text-label-sm">{a.name}</span>
                        <span className="text-caption text-[var(--ink-muted)]">
                          {'prorated' in a && a.prorated
                            ? t('staffDetail.pay.prorated')
                            : t('staffDetail.pay.fixed')}{' '}
                          · {t('staffDetail.pay.since', { date: formatDate(a.effective_from) })}
                        </span>
                      </span>
                      <span className="text-money-sm">{formatINR(Number(a.amount_paise))}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}

        {(pays ?? []).length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-title-md px-1">{t('staffDetail.pay.history')}</h2>
            <ul className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
              {(pays ?? []).map((p) => (
                <li key={p.id} className={row}>
                  <span className="flex flex-col">
                    <span className="text-label-sm">
                      {t('staffDetail.pay.since', { date: formatDate(p.effective_from) })}
                    </span>
                    <span className="text-caption text-[var(--ink-muted)]">
                      {t(`staffDetail.pay.types.${p.pay_type}`)}
                    </span>
                  </span>
                  <span className="text-money-sm">{formatINR(amountOf(p))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {props.canEdit && (
        <section className={card}>
          <h2 className="text-title-md">{t('staffDetail.pay.form.title')}</h2>
          <p className="text-body mt-1 mb-4 text-[var(--ink-muted)]">
            {t('staffDetail.pay.form.hint')}
          </p>
          <PayForm
            staffId={props.staffId}
            defaultDate={current ? today : props.joiningDate}
            current={
              current && {
                payType: current.pay_type as 'monthly' | 'daily' | 'hourly',
                amount: amountOf(current),
                overtime:
                  current.overtime_rate_paise == null ? null : Number(current.overtime_rate_paise),
                shiftStart: current.shift_start,
                shiftEnd: current.shift_end,
                grace: current.grace_minutes,
                dayMinutes: current.day_minutes,
              }
            }
            labels={{
              effectiveFrom: t('staffDetail.pay.form.effectiveFrom'),
              payType: t('staffDetail.pay.form.payType'),
              types: {
                monthly: t('staffDetail.pay.types.monthly'),
                daily: t('staffDetail.pay.types.daily'),
                hourly: t('staffDetail.pay.types.hourly'),
              },
              amount: t('staffDetail.pay.form.amount'),
              overtime: t('staffDetail.pay.form.overtime'),
              shiftStart: t('staffDetail.pay.form.shiftStart'),
              shiftEnd: t('staffDetail.pay.form.shiftEnd'),
              grace: t('staffDetail.pay.form.grace'),
              hoursPerDay: t('staffDetail.pay.form.hoursPerDay'),
              save: t('staffDetail.pay.form.save'),
              saving: t('staffDetail.pay.form.saving'),
            }}
          />
        </section>
      )}
    </div>
  );
}
