import { PendingLink as Link } from '@/components/app/pending-link';
import { redirect } from 'next/navigation';
import { Camera, ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import { addDays, formatINR, monthOf, parseDisplayDate, weekday } from '@fincrew/core';
import {
  dailySpending,
  expenseDay,
  expenseSummary,
  loadExpenseDues,
  loadExpenseMonth,
  loadExpenseOwed,
  toShopRules,
  type ExpenseRow,
} from '@fincrew/data';
import { PayBackForm } from '../staff/[id]/advance-forms';
import { payBackLabels } from '../staff/[id]/payback-labels';
import { categoryColour, categoryIcon } from '@/lib/expense-style';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { FormDialog } from '@/components/app/form-dialog';
import { TabLinks } from '@/components/app/tab-links';
import { dateFieldProps, inputClass, PageHeader, quietButtonClass } from '../../components';
import { ExpenseForm, ExpensePanel, type FormExpense } from './expense-form';
import { UrlToast } from '@/components/app/url-toast';

const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const shift = (y: number, m: number, by: number) => {
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};
const card = 'rounded-lg border bg-card shadow-xs';
const NO_BILL = 'nobill';

/**
 * Expenses (redesign, owner 29/10/2026; design "Web · expenses, today first + add in steps").
 * Add expense and the period's spending come first, then "Needs you" (what the shop owes staff,
 * what is charged to staff, expenses without a bill photo), then the expenses. **Day | Month**
 * picks the period; **List | By category** how it shows, so categories work for a day or a
 * month; category chips (or a category's row) filter the list (`cat`).
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    view?: string;
    show?: string;
    cat?: string;
    date?: string;
    day?: string;
    edit?: string;
    saved?: string;
    pb?: string;
  }>;
}) {
  const me = (await requireMe())!;
  const can = (k: string) => me.permissions.includes(k);
  if (!can('expenses.add') && !can('expenses.view_all') && !can('expenses.edit')) redirect('/');

  const today = todayIST();
  const current = monthOf(today);
  const sp = await searchParams;
  // Old links: view=list / view=categories were the month views.
  const period: 'day' | 'month' =
    sp.view === 'month' || sp.view === 'list' || sp.view === 'categories' ? 'month' : 'day';
  const show: 'list' | 'categories' =
    sp.show === 'categories' || sp.view === 'categories' ? 'categories' : 'list';
  const cat = show === 'list' ? (sp.cat ?? '') : '';
  // The day: typed DD/MM/YYYY (the filter), or YYYY-MM-DD from a link; never after today.
  const pickedDay =
    (sp.day ? parseDisplayDate(sp.day) : null) ??
    (/^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : today);
  const date = pickedDay > today ? today : pickedDay;
  const asked =
    period === 'day'
      ? monthOf(date)
      : /^\d{4}-\d{2}$/.test(sp.month ?? '')
        ? monthOf(`${sp.month}-01`)
        : current;
  const { year, month } =
    ym(asked.year, asked.month) > ym(current.year, current.month) ? current : asked;
  const monthName = MONTH.format(new Date(Date.UTC(year, month - 1, 1)));
  const prev = shift(year, month, -1);
  const next = shift(year, month, 1);
  const hasNext = ym(next.year, next.month) <= ym(current.year, current.month);

  const href = (o: {
    period?: 'day' | 'month';
    date?: string;
    month?: string;
    show?: string;
    cat?: string;
  }) => {
    const p = o.period ?? period;
    const q = new URLSearchParams({ view: p });
    if (p === 'day') q.set('date', o.date ?? date);
    else q.set('month', o.month ?? ym(year, month));
    const s = o.show ?? show;
    if (s === 'categories') q.set('show', s);
    const c = o.cat ?? cat;
    if (c && s !== 'categories') q.set('cat', c);
    return `/expenses?${q.toString()}`;
  };
  const here = href({});

  const supabase = await createClient();
  const seeDues = can('expenses.view_all') || can('salary.run');
  const [data, { data: shop }, dues] = await Promise.all([
    loadExpenseMonth(supabase, me.shopId, year, month),
    supabase.from('shops').select('settings').eq('id', me.shopId).single(),
    seeDues ? loadExpenseDues(supabase, me.shopId) : Promise.resolve([]),
  ]);
  const { expenses, categories, staff } = data;
  const cats = new Map(categories.map((c) => [c.id, c]));
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const activeCats = categories.filter((c) => !c.archived);
  const smallLimit = toShopRules(shop?.settings).smallExpenseLimit ?? null;
  const canRun = can('salary.run');

  const sum = period === 'day' ? expenseDay(expenses, date) : expenseSummary(expenses);
  const noBill = (e: ExpenseRow) => !e.bill_path && e.charged_to_kind !== 'not_tracked';
  const rows =
    cat === NO_BILL
      ? sum.rows.filter(noBill)
      : cat
        ? sum.rows.filter((e) => e.category_id === cat)
        : sum.rows;
  const byDay = new Map<string, ExpenseRow[]>();
  for (const e of rows) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  // Month view: spending by day, up to today in the current month.
  const isCurrent = year === current.year && month === current.month;
  const bars = dailySpending(expenses, year, month);
  const daysSoFar = isCurrent ? Number(today.slice(8, 10)) : bars.length;
  const top = Math.max(1, ...bars);
  const busiest = bars.indexOf(Math.max(...bars));

  const owed = dues.filter((d) => d.payback > 0);
  const charged = dues.filter((d) => d.charge > 0);

  const editing = sp.edit && can('expenses.edit') ? expenses.find((e) => e.id === sp.edit) : null;
  const owedFor =
    editing?.paid_by_kind === 'staff' && editing.reimburse && canRun
      ? editing.paid_by_staff_id
      : null;
  const owedForEdit = owedFor ? await loadExpenseOwed(supabase, owedFor) : 0;
  const formExpense: FormExpense | null = editing
    ? {
        id: editing.id,
        date: editing.date,
        amount: Number(editing.amount_paise),
        categoryId: editing.category_id,
        mode: editing.payment_mode,
        note: editing.note,
        paidBy: editing.paid_by_kind,
        paidByStaff: editing.paid_by_staff_id,
        chargedTo: editing.charged_to_kind,
        chargedToStaff: editing.charged_to_staff_id,
        reimburse: editing.reimburse,
        hasBill: !!editing.bill_path,
      }
    : null;
  const formStaff = staff
    .filter(
      (s) => s.active || s.id === formExpense?.paidByStaff || s.id === formExpense?.chargedToStaff,
    )
    .map((s) => ({ id: s.id, name: s.name }));

  const meta = (e: ExpenseRow) => {
    const m = 'expenses.meta';
    const payer =
      e.paid_by_kind === 'staff'
        ? `${t(`${m}.staffPaid`, { name: names.get(e.paid_by_staff_id!) ?? '' })}${e.reimburse ? `, ${t(`${m}.paidBack`)}` : ''}`
        : t(`${m}.${e.paid_by_kind}`);
    const ch =
      e.charged_to_kind === 'staff'
        ? ` · ${t(`${m}.chargedTo`, { name: names.get(e.charged_to_staff_id!) ?? '' })}`
        : '';
    return `${payer} · ${modes[e.payment_mode] ?? e.payment_mode}${ch}`;
  };

  const dayGroup = (d: string, list: ExpenseRow[]) => (
    <div key={d} className="flex flex-col">
      <span className="flex justify-between bg-[var(--surface-muted)] px-4 py-2 text-xs font-semibold text-[var(--ink-muted)]">
        <span>
          {days[weekday(d)]} {formatDate(d)}
        </span>
        <span className="tabular-nums">
          {formatINR(list.reduce((a, e) => a + Number(e.amount_paise), 0))}
        </span>
      </span>
      <ul>
        {list.map((e) => {
          const c = cats.get(e.category_id);
          const Icon = categoryIcon(c?.icon ?? 'receipt');
          const col = categoryColour(c?.colour ?? 'slate');
          const body = (
            <>
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                style={{ background: col.soft, color: col.fg }}
              >
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-label-sm truncate">{e.note || c?.name}</span>
                <span className="text-caption text-[var(--ink-muted)]">
                  {e.note ? `${c?.name} · ` : ''}
                  {meta(e)}
                </span>
              </span>
              {e.charged_to_kind !== 'shop' && (
                <span className="text-micro rounded-full bg-[var(--surface-muted)] px-2 py-0.5 font-semibold text-[var(--ink-muted)]">
                  {t(`expenses.tags.${e.charged_to_kind}`)}
                </span>
              )}
              {e.bill_path && (
                <Camera
                  size={16}
                  aria-label={t('expenses.hasBill')}
                  className="shrink-0 text-[var(--ink-muted)]"
                />
              )}
              <span
                className={`text-money-sm ${e.charged_to_kind === 'not_tracked' ? 'text-[var(--ink-muted)]' : ''}`}
              >
                {formatINR(Number(e.amount_paise))}
              </span>
            </>
          );
          const rowClass =
            'flex min-h-[60px] items-center gap-3 border-b border-[var(--line)] px-4 py-2';
          return (
            <li key={e.id}>
              {can('expenses.edit') ? (
                <Link
                  href={`${here}&edit=${e.id}`}
                  scroll={false}
                  aria-label={`${t('expenses.edit')}: ${e.note || c?.name}, ${formatINR(Number(e.amount_paise))}`}
                  className={`${rowClass} hover:bg-[var(--surface-muted)]`}
                >
                  {body}
                </Link>
              ) : e.bill_path ? (
                <a
                  href={`/expenses/bill/${e.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className={rowClass}
                >
                  {body}
                </a>
              ) : (
                <div className={rowClass}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  const chipClass = (on: boolean) =>
    `inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${
      on
        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
        : 'border-[var(--line-strong)] bg-[var(--surface)]'
    }`;
  const periodCats = [...new Set(sum.rows.map((e) => e.category_id))]
    .map((id) => cats.get(id))
    .filter((c) => !!c);

  return (
    <>
      <PageHeader
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle', {
          shop: me.shopName,
          count: expenses.length,
          month: monthName,
        })}
        actions={
          <>
            {can('reports.export') && expenses.length > 0 && (
              <a
                href={`/expenses/export?month=${ym(year, month)}`}
                download
                className={`${quietButtonClass} inline-flex items-center gap-2`}
              >
                <Download size={20} aria-hidden="true" />
                {t('expenses.csv')}
              </a>
            )}
            {can('expenses.add') && activeCats.length > 0 && (
              <FormDialog
                title={t('expenses.form.addTitle')}
                variant="default"
                size="lg"
                wide
                trigger={
                  <>
                    <Plus aria-hidden="true" />
                    {t('expenses.add')}
                  </>
                }
              >
                <ExpenseForm
                  expense={null}
                  categories={activeCats.map((c) => ({
                    id: c.id,
                    name: c.name,
                    icon: c.icon,
                    colour: c.colour,
                  }))}
                  staff={formStaff}
                  today={today}
                  monthName={monthName}
                  smallLimit={smallLimit}
                  canDelete={false}
                  canPayBack={canRun}
                />
              </FormDialog>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TabLinks
            label={t('expenses.period.label')}
            items={[
              {
                href: href({ period: 'day', date: period === 'day' ? date : today, cat: '' }),
                label: t('expenses.period.day'),
                current: period === 'day',
              },
              {
                href: href({ period: 'month', month: ym(year, month), cat: '' }),
                label: t('expenses.period.month'),
                current: period === 'month',
              },
            ]}
          />
          <TabLinks
            label={t('expenses.show.label')}
            items={[
              {
                href: href({ show: 'list', cat: '' }),
                label: t('expenses.show.list'),
                current: show === 'list',
              },
              {
                href: href({ show: 'categories' }),
                label: t('expenses.show.categories'),
                current: show === 'categories',
              },
            ]}
          />
        </div>
        {period === 'day' ? (
          <div className="flex flex-wrap items-center gap-1">
            <Link
              href={href({ date: addDays(date, -1) })}
              aria-label={t('expenses.day.prev')}
              className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </Link>
            <span className="text-title-md px-2">
              {days[weekday(date)]} {formatDate(date)}
            </span>
            {date < today && (
              <Link
                href={href({ date: addDays(date, 1) })}
                aria-label={t('expenses.day.next')}
                className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </Link>
            )}
            {date !== today && (
              <Link href={href({ date: today })} className={`${quietButtonClass} ml-1`}>
                {t('expenses.day.today_link')}
              </Link>
            )}
            <form action="/expenses" className="ml-2 flex items-center gap-2">
              <input type="hidden" name="view" value="day" />
              {show === 'categories' && <input type="hidden" name="show" value="categories" />}
              <label className="sr-only" htmlFor="expense-day">
                {t('expenses.day.pick')}
              </label>
              <input
                id="expense-day"
                name="day"
                {...dateFieldProps}
                defaultValue={formatDate(date)}
                className={`${inputClass} mt-0 w-36`}
              />
              <button type="submit" className={quietButtonClass}>
                {t('expenses.day.show')}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Link
              href={href({ month: ym(prev.year, prev.month) })}
              aria-label={t('expenses.prevMonth')}
              className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </Link>
            <span className="text-title-md px-2">{monthName}</span>
            {hasNext && (
              <Link
                href={href({ month: ym(next.year, next.month) })}
                aria-label={t('expenses.nextMonth')}
                className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>

      {sp.saved && (
        <UrlToast
          message={
            sp.pb === '1'
              ? t('expenses.form.paidBackDone')
              : sp.pb === '0'
                ? t('expenses.form.paidBackFailed')
                : t('expenses.form.saved')
          }
          error={sp.pb === '0'}
          params={['saved', 'pb']}
        />
      )}

      {activeCats.length === 0 && (
        <p className={`${card} text-body-lg p-5 text-[var(--ink-muted)]`}>
          {can('expenses.categories') ? (
            <Link href="/settings/categories" className="text-[var(--accent-ink)] underline">
              {t('expenses.noCategories')}
            </Link>
          ) : (
            t('expenses.noCategoriesAsk')
          )}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${card} flex flex-col gap-2.5 p-6 lg:col-span-2`}>
          <span className="text-sm font-semibold text-[var(--ink-muted)]">
            {period === 'month'
              ? t('expenses.month.spent', { month: monthName })
              : date === today
                ? t('expenses.day.today')
                : t('expenses.day.on', { date: formatDate(date) })}
          </span>
          <span className="text-money-hero text-[3.5rem] leading-none sm:text-[4rem]">
            {formatINR(sum.spent)}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs">
              {t('expenses.tiles.count', { count: sum.rows.length })}
            </span>
            {(
              [
                ['shop', sum.shop],
                ['staff', sum.chargedToStaff],
                ['notTracked', sum.notTracked],
              ] as const
            )
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs"
                >
                  <strong className="tabular-nums">{formatINR(v)}</strong>{' '}
                  {t(`expenses.split.${k}`)}
                </span>
              ))}
          </div>
          {period === 'month' ? (
            sum.spent > 0 && (
              <>
                <div
                  role="img"
                  aria-label={t('expenses.month.bars')}
                  className="flex h-24 items-end gap-1 pt-2"
                >
                  {bars.map((v, i) => (
                    <Link
                      key={i}
                      href={href({
                        period: 'day',
                        date: `${ym(year, month)}-${String(i + 1).padStart(2, '0')}`,
                        cat: '',
                      })}
                      title={`${String(i + 1).padStart(2, '0')}/${String(month).padStart(2, '0')} · ${formatINR(v)}`}
                      aria-hidden="true"
                      tabIndex={-1}
                      className="min-h-0.5 flex-1 rounded-t-sm"
                      style={{
                        height: `${Math.round((v / top) * 100)}%`,
                        background:
                          i === busiest
                            ? 'var(--accent)'
                            : i >= daysSoFar
                              ? 'var(--surface-muted)'
                              : 'var(--accent-soft)',
                      }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--ink-muted)]">
                  <span>
                    {t('expenses.month.perDay', {
                      amount: formatINR(Math.round(sum.spent / Math.max(1, daysSoFar))),
                    })}
                  </span>
                  <span>
                    {t('expenses.month.busiest', {
                      date: `${String(busiest + 1).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
                      amount: formatINR(bars[busiest] ?? 0),
                    })}
                  </span>
                </div>
              </>
            )
          ) : (
            <span className="text-xs text-[var(--ink-muted)]">
              {t('expenses.day.monthSoFar', {
                month: monthName,
                amount: formatINR(data.totals.total),
              })}
            </span>
          )}
        </section>

        <section className={`${card} flex flex-col gap-2.5 px-5 py-4`}>
          <h2 className="text-sm font-semibold">{t('expenses.needs.title')}</h2>
          {owed.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md bg-[var(--status-late-soft)] p-3">
              <span className="flex justify-between gap-2 text-sm font-semibold">
                <span>{t('expenses.needs.owed')}</span>
                <span className="tabular-nums">
                  {formatINR(owed.reduce((a, d) => a + d.payback, 0))}
                </span>
              </span>
              <span className="text-xs text-[var(--ink-muted)]">
                {t('expenses.needs.owedBody')}
              </span>
              <ul className="flex flex-col gap-1">
                {owed.map((d) => (
                  <li key={d.staffId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      {names.get(d.staffId) ?? ''}{' '}
                      <span className="tabular-nums">{formatINR(d.payback)}</span>
                    </span>
                    {canRun && (
                      <FormDialog
                        title={t('payBack.title')}
                        description={names.get(d.staffId) ?? ''}
                        trigger={t('payBack.button')}
                        size="sm"
                      >
                        <PayBackForm
                          staffId={d.staffId}
                          today={today}
                          amount={d.payback}
                          labels={payBackLabels(names.get(d.staffId) ?? '', d.payback)}
                        />
                      </FormDialog>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {charged.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md bg-[var(--surface-muted)] p-3">
              <span className="flex justify-between gap-2 text-sm font-semibold">
                <span>{t('expenses.needs.charged')}</span>
                <span className="tabular-nums">
                  {formatINR(charged.reduce((a, d) => a + d.charge, 0))}
                </span>
              </span>
              <span className="text-xs text-[var(--ink-muted)]">
                {charged
                  .map((d) => `${names.get(d.staffId) ?? ''} ${formatINR(d.charge)}`)
                  .join(' · ')}
                . {t('expenses.needs.chargedBody')}
              </span>
            </div>
          )}
          {sum.noBill > 0 && (
            <Link
              href={href({ show: 'list', cat: NO_BILL })}
              className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-xs text-[var(--ink-muted)] hover:bg-[var(--surface-muted)]"
            >
              <span className="inline-flex items-center gap-1.5">
                <Camera size={16} aria-hidden="true" />
                {t('expenses.needs.noBill', { count: sum.noBill })}
              </span>
              <span className="font-semibold text-[var(--accent-ink)]">
                {t('expenses.needs.show')}
              </span>
            </Link>
          )}
          {owed.length === 0 && charged.length === 0 && sum.noBill === 0 && (
            <p className="text-sm text-[var(--ink-muted)]">{t('expenses.needs.clear')}</p>
          )}
        </section>
      </div>

      {!can('expenses.view_all') && (
        <p className="text-caption text-[var(--ink-muted)]">{t('expenses.ownOnly')}</p>
      )}

      {show === 'categories' ? (
        <section className={`${card} overflow-hidden`}>
          <header className="flex flex-wrap justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold">
              {period === 'day'
                ? t('expenses.catTitle.day', { date: formatDate(date) })
                : t('expenses.catTitle.month', { month: monthName })}
            </h2>
            <span className="text-xs text-[var(--ink-muted)]">{t('expenses.catTitle.hint')}</span>
          </header>
          {sum.byCategory.length === 0 ? (
            <p className="text-body px-4 py-5 text-[var(--ink-muted)]">
              {period === 'day'
                ? t('expenses.day.empty', { date: formatDate(date) })
                : t('expenses.empty', { month: monthName })}
            </p>
          ) : (
            <ul>
              {sum.byCategory.map(({ categoryId, amount, count }) => {
                const c = cats.get(categoryId);
                const Icon = categoryIcon(c?.icon ?? 'receipt');
                const col = categoryColour(c?.colour ?? 'slate');
                const share = sum.shop > 0 ? Math.round((amount / sum.shop) * 100) : 0;
                return (
                  <li key={categoryId}>
                    <Link
                      href={href({ show: 'list', cat: categoryId })}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-[var(--line)] px-4 py-3 hover:bg-[var(--surface-muted)] md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_6rem_4rem_8rem]"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="grid size-8 shrink-0 place-items-center rounded-full"
                          style={{ background: col.soft, color: col.fg }}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="truncate text-sm font-semibold">{c?.name}</span>
                      </span>
                      <span className="col-span-2 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)] md:col-span-1">
                        <span
                          className="block h-2 rounded-full"
                          style={{
                            width: `${Math.round((amount / (sum.byCategory[0]?.amount || 1)) * 100)}%`,
                            background: col.fg,
                          }}
                        />
                      </span>
                      <span className="hidden text-xs text-[var(--ink-muted)] md:block">
                        {t('expenses.tiles.count', { count })}
                      </span>
                      <span className="hidden text-right text-xs text-[var(--ink-muted)] tabular-nums md:block">
                        {share}%
                      </span>
                      <span className="text-money-sm row-start-1 text-right md:row-start-auto">
                        {formatINR(amount)}
                      </span>
                    </Link>
                  </li>
                );
              })}
              <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 bg-[var(--surface-muted)]/50 px-4 py-3 font-semibold md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_6rem_4rem_8rem]">
                <span className="text-sm">{t('expenses.tiles.shop')}</span>
                <span className="hidden md:block" />
                <span className="hidden text-xs text-[var(--ink-muted)] md:block">
                  {t('expenses.tiles.count', {
                    count: sum.byCategory.reduce((a, c) => a + c.count, 0),
                  })}
                </span>
                <span className="hidden text-right text-xs md:block">100%</span>
                <span className="text-money-sm text-right">{formatINR(sum.shop)}</span>
              </li>
            </ul>
          )}
        </section>
      ) : (
        <>
          {sum.rows.length > 0 && (
            <nav aria-label={t('expenses.chips.label')} className="flex flex-wrap gap-1.5">
              <Link href={href({ cat: '' })} className={chipClass(!cat)}>
                {t('expenses.chips.all')}
              </Link>
              {periodCats.map((c) => (
                <Link key={c.id} href={href({ cat: c.id })} className={chipClass(cat === c.id)}>
                  {c.name}
                </Link>
              ))}
              {sum.noBill > 0 && (
                <Link href={href({ cat: NO_BILL })} className={chipClass(cat === NO_BILL)}>
                  {t('expenses.chips.noBill')}
                </Link>
              )}
            </nav>
          )}
          <section className={`${card} overflow-hidden`}>
            {rows.length === 0 ? (
              <p className="text-body px-4 py-5 text-[var(--ink-muted)]">
                {period === 'day'
                  ? t('expenses.day.empty', { date: formatDate(date) })
                  : t('expenses.empty', { month: monthName })}
              </p>
            ) : (
              <>
                {cat && (
                  <p className="border-b border-[var(--line)] px-4 py-2 text-xs text-[var(--ink-muted)]">
                    {t('expenses.filtered', {
                      name:
                        cat === NO_BILL ? t('expenses.chips.noBill') : (cats.get(cat)?.name ?? ''),
                      amount: formatINR(rows.reduce((a, e) => a + Number(e.amount_paise), 0)),
                    })}
                  </p>
                )}
                {[...byDay.entries()].map(([d, list]) => dayGroup(d, list))}
              </>
            )}
          </section>
        </>
      )}

      {formExpense && (
        <ExpensePanel title={t('expenses.form.editTitle')} closeHref={here}>
          <ExpenseForm
            expense={formExpense}
            categories={activeCats
              .concat(
                !activeCats.some((c) => c.id === formExpense.categoryId)
                  ? categories.filter((c) => c.id === formExpense.categoryId)
                  : [],
              )
              .map((c) => ({ id: c.id, name: c.name, icon: c.icon, colour: c.colour }))}
            staff={formStaff}
            today={today}
            monthName={monthName}
            smallLimit={smallLimit}
            closeHref={here}
            canDelete={can('expenses.edit')}
            canPayBack={false}
          />
          {owedFor && owedForEdit > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
              <span className="text-body text-[var(--ink-muted)]">
                {t('payBack.owed')}: {formatINR(owedForEdit)}
              </span>
              <FormDialog
                title={t('payBack.title')}
                description={names.get(owedFor) ?? ''}
                trigger={t('payBack.button')}
              >
                <PayBackForm
                  staffId={owedFor}
                  today={today}
                  amount={Math.min(owedForEdit, Number(editing!.amount_paise))}
                  labels={payBackLabels(names.get(owedFor) ?? '', owedForEdit)}
                />
              </FormDialog>
            </div>
          )}
        </ExpensePanel>
      )}
    </>
  );
}
