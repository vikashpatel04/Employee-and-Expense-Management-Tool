import { PendingLink as Link } from '@/components/app/pending-link';
import { Suspense, type ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  FileText,
  Hourglass,
  MessageCircle,
  Minus,
  Pencil,
  Phone,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import {
  formatINR,
  formatTimeOfDay,
  runningBalances,
  type AdvanceCutMode,
  type LatePolicy,
  type LedgerLine,
  type LedgerType,
  type PayRules,
} from '@fincrew/core';
import { toShopRules } from '@fincrew/data';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { FormDialog } from '@/components/app/form-dialog';
import { Bento, Panel, PanelEmpty, StatCard } from '@/components/app/layout';
import { PanelSkeleton } from '@/components/app/skeletons';
import { TabLinks } from '@/components/app/tab-links';
import { Button } from '@/components/ui/button';
import { Avatar } from '../../../components';
import { AttendanceTab } from './attendance-tab';
import {
  AdvanceForm,
  AdvanceSettingsForm,
  UndoButton,
  type AdvanceSettingsLabels,
} from './advance-forms';
import { DetailsForm, ItemButtons, ItemForm, OpeningForm, TemplateForm } from './extra-forms';
import { OverridesForm } from './overrides-form';
import { PayForm } from './pay-form';
import { SignInSection } from './signin-section';
import { DocumentsTab } from './documents-tab';
import { UrlToast } from '@/components/app/url-toast';

type Tab = 'overview' | 'attendance' | 'ledger' | 'pay' | 'documents';

const card = 'rounded-lg border bg-card p-4 shadow-xs';

/** Labels for the give-advance form (header button and staff page). */
function advanceLabels() {
  return {
    kind: {
      label: t('advances.kind.label'),
      given: t('advances.kind.given'),
      repaid: t('advances.kind.repaid'),
    },
    amount: t('advances.fields.amount'),
    date: t('advances.fields.date'),
    mode: t('advances.fields.mode'),
    modes: t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>,
    note: t('advances.fields.note'),
    confirm: t('advances.fields.confirm'),
    save: t('advances.save'),
    saving: t('advances.saving'),
  };
}
const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; saved?: string; month?: string; day?: string }>;
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
    'attendance',
    ...(canLedger ? (['ledger'] as const) : []),
    ...(canPay ? (['pay'] as const) : []),
    // The person themself, or staff.view (page needs it anyway).
    'documents',
  ];
  const tab: Tab = tabs.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'overview';

  const supabase = await createClient();
  const { data: s } = await supabase
    .from('staff')
    .select(
      'person_id, joining_date, leaving_date, status, self_attendance, advance_limit_paise, advance_cut_paise, advance_cut_mode, expense_payback, expense_recover, people!inner(name, phone)',
    )
    .eq('person_id', id)
    .eq('shop_id', me.shopId)
    .maybeSingle();
  if (!s) notFound();
  const name = s.people.name;
  const phone = s.people.phone;
  const digits = (phone ?? '').replace(/\D/g, '');
  const wa = digits.length === 10 ? `91${digits}` : digits;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link
          href="/staff"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t('staffDetail.back')}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={name} size={44} />
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-xl font-semibold tracking-tight">{name}</h1>
              <p className="text-muted-foreground text-sm">
                {t('staffDetail.joined', { date: formatDate(s.joining_date) })}
                {s.leaving_date &&
                  ` · ${t('staffDetail.left', { date: formatDate(s.leaving_date) })}`}
                {phone && ` · ${phone}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {phone && (
              <>
                <Button asChild variant="outline">
                  <a href={`tel:${digits}`}>
                    <Phone aria-hidden="true" />
                    {t('staffDetail.actions.call')}
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                    <MessageCircle aria-hidden="true" />
                    {t('staffDetail.actions.whatsapp')}
                  </a>
                </Button>
              </>
            )}
            {can('staff.edit') && (
              <FormDialog
                title={t('staffDetail.details.title')}
                trigger={
                  <>
                    <Pencil aria-hidden="true" />
                    {t('staffDetail.details.edit')}
                  </>
                }
              >
                <DetailsForm
                  staffId={id}
                  details={{
                    name,
                    phone,
                    joiningDate: s.joining_date,
                    leavingDate: s.leaving_date,
                  }}
                />
              </FormDialog>
            )}
            {can('advances.give') && s.status === 'active' && (
              <FormDialog
                title={t('advances.give')}
                description={name}
                variant="default"
                trigger={
                  <>
                    <ArrowUpRight aria-hidden="true" />
                    {t('advances.give')}
                  </>
                }
              >
                <AdvanceForm staffId={id} today={todayIST()} labels={advanceLabels()} />
              </FormDialog>
            )}
          </div>
        </div>
      </div>

      <TabLinks
        label={t('staffDetail.tabs.label')}
        items={tabs.map((x) => ({
          href: `/staff/${id}?tab=${x}`,
          label: t(`staffDetail.tabs.${x}`),
          current: x === tab,
        }))}
      />

      <Suspense key={tab} fallback={<PanelSkeleton />}>
        {tab === 'overview' && (
          <Overview
            staffId={id}
            name={name}
            phone={phone}
            canMoney={canLedger}
            advanceLimit={s.advance_limit_paise}
            advanceCut={s.advance_cut_paise}
            advanceMode={s.advance_cut_mode as AdvanceCutMode}
            expensePayback={s.expense_payback}
            expenseRecover={s.expense_recover}
            canEditStaff={can('staff.edit')}
            canEditPay={can('staff.pay.edit')}
            canRun={can('salary.run')}
            joiningDate={s.joining_date}
          >
            {can('staff.edit') && (
              <SignInSection
                shopId={me.shopId}
                staffId={id}
                name={name}
                phone={phone}
                active={s.status === 'active'}
                selfAttendance={s.self_attendance}
              />
            )}
          </Overview>
        )}
        {tab === 'attendance' && (
          <AttendanceTab
            staffId={id}
            shopId={me.shopId}
            month={sp.month}
            day={sp.day}
            canMark={can('attendance.mark')}
            canEditPast={can('attendance.edit_past')}
          />
        )}
        {tab === 'ledger' && <Ledger staffId={id} canUndo={can('salary.undo_payment')} />}
        {tab === 'documents' && (
          <DocumentsTab staffId={id} name={name} canEdit={can('staff.edit')} />
        )}
        {tab === 'pay' && (
          <Pay
            staffId={id}
            shopId={me.shopId}
            name={name}
            canEdit={can('staff.pay.edit')}
            canEditStaff={can('staff.edit')}
            joiningDate={s.joining_date}
            saved={sp.saved}
          />
        )}
      </Suspense>
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
  advanceMode: AdvanceCutMode;
  expensePayback: boolean;
  expenseRecover: boolean;
  canEditStaff: boolean;
  canEditPay: boolean;
  canRun: boolean;
  joiningDate: string;
  /** Shown full width under the cards (the Staffora sign-in card). */
  children?: ReactNode;
}) {
  const supabase = await createClient();
  const { data: opening } = props.canEditPay
    ? await supabase
        .from('ledger_entries')
        .select('id, amount_paise, date')
        .eq('staff_id', props.staffId)
        .eq('type', 'opening_balance')
        .maybeSingle()
    : { data: null };
  // Corrections are adjustment lines linked to the opening line.
  const { data: fixes } = opening
    ? await supabase
        .from('ledger_entries')
        .select('amount_paise')
        .eq('staff_id', props.staffId)
        .eq('type', 'adjustment')
        .eq('ref_table', 'ledger_entries')
        .eq('ref_id', opening.id)
    : { data: null };
  const openingNow = opening
    ? Number(opening.amount_paise) + (fixes ?? []).reduce((a, f) => a + Number(f.amount_paise), 0)
    : 0;
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

  return (
    <Bento>
      {props.canMoney && (
        <section className={`${card} flex flex-col gap-1 lg:col-span-6`}>
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
              balance > 0
                ? 'text-[var(--money-owed)]'
                : balance < 0
                  ? 'text-[var(--money-advance)]'
                  : 'text-muted-foreground'
            }`}
          >
            <Hourglass className="size-4" aria-hidden="true" />
            {balance > 0
              ? t('staffDetail.balance.due', { name: props.name })
              : balance < 0
                ? t('staffDetail.balance.owes', { name: props.name })
                : t('staffDetail.balance.settled')}
          </span>
          <span className="text-money-hero">{formatINR(Math.abs(balance))}</span>
          <div className="my-2 h-px bg-[var(--line)]" />
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--money-advance)]">
              <ArrowUpRight className="size-4" aria-hidden="true" />
              {t('staffDetail.advance.title')}
            </span>
            <span className="text-money-md">{formatINR(outstanding)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              {props.advanceMode === 'all'
                ? t('staffDetail.advance.cutAll')
                : props.advanceMode === 'fixed'
                  ? t('staffDetail.advance.cut', {
                      amount: formatINR(Number(props.advanceCut ?? 0)),
                    })
                  : t('staffDetail.advance.noCut')}
              {' · '}
              {props.advanceLimit != null
                ? t('staffDetail.advance.limit', { amount: formatINR(Number(props.advanceLimit)) })
                : t('staffDetail.advance.noLimit')}
            </span>
            {props.canEditStaff && (
              <FormDialog
                title={t('advances.settings.title')}
                description={props.name}
                variant="ghost"
                size="sm"
                trigger={
                  <>
                    <SlidersHorizontal aria-hidden="true" />
                    {t('staffDetail.advance.edit')}
                  </>
                }
              >
                <AdvanceSettingsForm
                  staffId={props.staffId}
                  limit={props.advanceLimit == null ? null : Number(props.advanceLimit)}
                  mode={props.advanceMode}
                  cut={props.advanceCut == null ? null : Number(props.advanceCut)}
                  payback={props.expensePayback}
                  recover={props.expenseRecover}
                  labels={{
                    limit: t('advances.settings.limit'),
                    how: t('advances.settings.how'),
                    modes: Object.fromEntries(
                      ['all', 'fixed', 'none', 'allHint', 'fixedHint', 'noneHint'].map((k) => [
                        k,
                        t(`advances.settings.modes.${k}`),
                      ]),
                    ) as AdvanceSettingsLabels['modes'],
                    cut: t('advances.settings.cut'),
                    expenses: t('advances.settings.expenses'),
                    payback: t('advances.settings.payback'),
                    paybackHint: t('advances.settings.paybackHint'),
                    recover: t('advances.settings.recover'),
                    recoverHint: t('advances.settings.recoverHint'),
                    save: t('advances.settings.save'),
                    saving: t('advances.saving'),
                  }}
                />
              </FormDialog>
            )}
          </div>
        </section>
      )}
      {props.canEditPay && (
        <section className={`${card} flex flex-col gap-2 lg:col-span-6`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t('staffDetail.opening.title')}</h2>
            {opening ? (
              props.canRun && (
                <FormDialog
                  title={t('staffDetail.opening.correct')}
                  description={t('staffDetail.opening.correctHint')}
                  variant="ghost"
                  size="sm"
                  trigger={
                    <>
                      <Pencil aria-hidden="true" />
                      {t('staffDetail.opening.correct')}
                    </>
                  }
                >
                  <OpeningForm
                    staffId={props.staffId}
                    name={props.name}
                    defaultDate={opening.date}
                    current={openingNow}
                  />
                </FormDialog>
              )
            ) : (
              <FormDialog
                title={t('staffDetail.opening.title')}
                description={t('staffDetail.opening.hint')}
                size="sm"
                trigger={
                  <>
                    <Plus aria-hidden="true" />
                    {t('staffDetail.opening.save')}
                  </>
                }
              >
                <OpeningForm
                  staffId={props.staffId}
                  name={props.name}
                  defaultDate={props.joiningDate}
                />
              </FormDialog>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {opening
              ? `${t(
                  openingNow < 0 ? 'staffDetail.opening.setOwes' : 'staffDetail.opening.setDue',
                  {
                    name: props.name,
                    amount: formatINR(Math.abs(openingNow)),
                    date: formatDate(opening.date),
                  },
                )}${(fixes ?? []).length > 0 ? ` ${t('staffDetail.opening.wasCorrected')}` : ''}`
              : t('staffDetail.opening.hint')}
          </p>
        </section>
      )}
      {props.children && <div className="flex flex-col lg:col-span-12">{props.children}</div>}
    </Bento>
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
    <Bento>
      <div className="lg:col-span-4 lg:order-2">
        <StatCard
          className="h-auto lg:sticky lg:top-0"
          label={t('staffDetail.ledger.balance')}
          paise={balance}
          meta={t('staffDetail.ledger.lines', { count: lines.length })}
        />
      </div>
      <div className="flex flex-col gap-4 lg:order-1 lg:col-span-8">
        {[...byMonth.entries()].map(([month, rows]) => (
          <Panel key={month} title={MONTH.format(new Date(`${month}-01T00:00:00Z`))} flush>
            <ul>
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
          </Panel>
        ))}
      </div>
    </Bento>
  );
}

async function Pay(props: {
  staffId: string;
  shopId: string;
  name: string;
  canEdit: boolean;
  canEditStaff: boolean;
  joiningDate: string;
  saved?: string;
}) {
  const supabase = await createClient();
  const [{ data: templates }, { data: shop }] = await Promise.all([
    props.canEditStaff
      ? supabase
          .from('leave_templates')
          .select('id, name')
          .eq('archived', false)
          .eq('shop_id', props.shopId)
          .order('name')
      : Promise.resolve({ data: null }),
    props.canEdit
      ? supabase.from('shops').select('settings').eq('id', props.shopId).single()
      : Promise.resolve({ data: null }),
  ]);
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
        .select('effective_from, template_id, leave_templates(name)')
        .eq('staff_id', props.staffId)
        .order('effective_from', { ascending: false }),
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
  const template = (tpl ?? []).find((a) => a.effective_from <= today) ?? tpl?.[0];
  const ownRules = current
    ? Object.keys(current.pay_rules_override ?? {}).length +
      Object.keys(current.late_policy_override ?? {}).length
    : 0;

  const payCurrent = current && {
    payType: current.pay_type as 'monthly' | 'daily' | 'hourly',
    amount: amountOf(current),
    overtime: current.overtime_rate_paise == null ? null : Number(current.overtime_rate_paise),
    shiftStart: current.shift_start,
    shiftEnd: current.shift_end,
    grace: current.grace_minutes,
    dayMinutes: current.day_minutes,
  };

  return (
    <div className="flex flex-col gap-4">
      {(props.canEdit || props.canEditStaff) && (
        <div className="flex flex-wrap gap-2">
          {props.canEdit && (
            <FormDialog
              title={t('staffDetail.pay.form.title')}
              description={t('staffDetail.pay.form.hint')}
              variant="default"
              wide
              trigger={
                <>
                  <CalendarClock aria-hidden="true" />
                  {t('staffDetail.pay.change')}
                </>
              }
            >
              <PayForm
                staffId={props.staffId}
                defaultDate={current ? today : props.joiningDate}
                current={payCurrent}
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
            </FormDialog>
          )}
          {props.canEdit &&
            (['allowance', 'deduction'] as const).map((kind) => (
              <FormDialog
                key={kind}
                title={t(
                  kind === 'allowance'
                    ? 'staffDetail.items.addAllowance'
                    : 'staffDetail.items.addDeduction',
                )}
                description={t('staffDetail.items.hint')}
                trigger={
                  <>
                    {kind === 'allowance' ? (
                      <Plus aria-hidden="true" />
                    ) : (
                      <Minus aria-hidden="true" />
                    )}
                    {t(
                      kind === 'allowance'
                        ? 'staffDetail.items.addAllowance'
                        : 'staffDetail.items.addDeduction',
                    )}
                  </>
                }
              >
                <ItemForm staffId={props.staffId} kind={kind} defaultDate={today} />
              </FormDialog>
            ))}
          {props.canEditStaff && (
            <FormDialog
              title={t('staffDetail.templateForm.title')}
              description={t('staffDetail.templateForm.hint')}
              trigger={
                <>
                  <FileText aria-hidden="true" />
                  {t('staffDetail.templateForm.title')}
                </>
              }
            >
              {(templates ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t('staffDetail.templateForm.none')}
                </p>
              ) : (
                <TemplateForm
                  staffId={props.staffId}
                  templates={templates ?? []}
                  current={template?.template_id ?? null}
                  defaultDate={template ? today : props.joiningDate}
                />
              )}
            </FormDialog>
          )}
          {props.canEdit && (
            <FormDialog
              title={t('staffDetail.rules.title', { name: props.name })}
              description={t('staffDetail.rules.hint')}
              wide
              trigger={
                <>
                  <SlidersHorizontal aria-hidden="true" />
                  {t('staffDetail.rules.label')}
                </>
              }
            >
              {current ? (
                <OverridesForm
                  staffId={props.staffId}
                  shop={toShopRules(shop?.settings)}
                  pay={(current.pay_rules_override ?? {}) as Partial<PayRules>}
                  late={(current.late_policy_override ?? {}) as Partial<LatePolicy>}
                  defaultDate={today}
                />
              ) : (
                <p className="text-muted-foreground text-sm">{t('staffDetail.rules.noPay')}</p>
              )}
            </FormDialog>
          )}
        </div>
      )}
      {props.saved && (
        <UrlToast
          message={t('staffDetail.pay.form.saved', { date: formatDate(props.saved) })}
          params={['saved', 'at']}
        />
      )}
      <Bento>
        <Panel span={6} title={t('staffDetail.pay.current')} flush>
          {!current ? (
            <PanelEmpty>{t('staffDetail.pay.none')}</PanelEmpty>
          ) : (
            <ul>
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
              <li className={row}>
                <span className="text-label-sm">{t('staffDetail.rules.label')}</span>
                <span className="text-body text-right">
                  {ownRules > 0
                    ? t('staffDetail.rules.own', { count: ownRules })
                    : t('staffDetail.rules.none')}
                </span>
              </li>
            </ul>
          )}
        </Panel>

        <Panel span={6} title={t('staffDetail.pay.history')} flush>
          {(pays ?? []).length === 0 ? (
            <PanelEmpty>{t('staffDetail.pay.none')}</PanelEmpty>
          ) : (
            <ul>
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
          )}
        </Panel>

        {(
          [
            { kind: 'allowance', title: t('staffDetail.pay.allowances'), rows: allowances ?? [] },
            { kind: 'deduction', title: t('staffDetail.pay.deductions'), rows: deductions ?? [] },
          ] as const
        ).map((group) => (
          <Panel key={group.kind} span={6} title={group.title} flush>
            {group.rows.length === 0 ? (
              <PanelEmpty>{t('staffDetail.items.none')}</PanelEmpty>
            ) : (
              <ul>
                {group.rows.map((a) => {
                  const ended = a.effective_to != null && a.effective_to < today;
                  return (
                    <li key={a.id} className={row}>
                      <span className="flex flex-col">
                        <span className="text-label-sm">
                          {a.name}
                          {ended && (
                            <span className="text-caption ml-2 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[var(--ink-muted)]">
                              {t('staffDetail.items.ended')}
                            </span>
                          )}
                        </span>
                        <span className="text-caption text-[var(--ink-muted)]">
                          {'prorated' in a && a.prorated
                            ? t('staffDetail.pay.prorated')
                            : t('staffDetail.pay.fixed')}{' '}
                          · {t('staffDetail.pay.since', { date: formatDate(a.effective_from) })}
                          {a.effective_to &&
                            ` · ${t('staffDetail.items.until', { date: formatDate(a.effective_to) })}`}
                        </span>
                      </span>
                      <span className="flex flex-col items-end">
                        <span className="text-money-sm">{formatINR(Number(a.amount_paise))}</span>
                        {props.canEdit && (
                          <ItemButtons
                            staffId={props.staffId}
                            kind={group.kind}
                            id={a.id}
                            name={a.name}
                            canEnd={a.effective_to == null || a.effective_to > today}
                          />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        ))}
      </Bento>
    </div>
  );
}
