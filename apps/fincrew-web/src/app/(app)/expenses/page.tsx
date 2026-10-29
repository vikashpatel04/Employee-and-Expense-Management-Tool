import { PendingLink as Link } from '@/components/app/pending-link';
import { redirect } from 'next/navigation';
import { Camera, ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import { addDays, formatINR, monthOf, parseDisplayDate, weekday } from '@fincrew/core';
import { expenseDay, loadExpenseMonth, toShopRules } from '@fincrew/data';
import { categoryColour, categoryIcon } from '@/lib/expense-style';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { FormDialog } from '@/components/app/form-dialog';
import { Panel, PanelEmpty, StatCard, StatGrid } from '@/components/app/layout';
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
const card = 'rounded-lg border bg-card p-5 shadow-xs';

/**
 * Expenses (design: "Web · expenses"). Opens on **Day** (owner, 29/10/2026): the day's spending as
 * a big figure and the day's list, with previous / next day and a DD/MM/YYYY date filter.
 * **Month** has the month switcher, totals and the list by day; **By category** the month's
 * categories.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    view?: string;
    date?: string;
    day?: string;
    add?: string;
    edit?: string;
    saved?: string;
  }>;
}) {
  const me = (await requireMe())!;
  const can = (k: string) => me.permissions.includes(k);
  if (!can('expenses.add') && !can('expenses.view_all') && !can('expenses.edit')) redirect('/');

  const today = todayIST();
  const current = monthOf(today);
  const sp = await searchParams;
  // Three views: one day (default), the month's list, or the month by category.
  const view: 'day' | 'list' | 'categories' =
    sp.view === 'categories'
      ? 'categories'
      : sp.view === 'month' || sp.view === 'list'
        ? 'list'
        : 'day';
  // The day: typed DD/MM/YYYY (the filter), or YYYY-MM-DD from a link; never after today.
  const pickedDay =
    (sp.day ? parseDisplayDate(sp.day) : null) ??
    (/^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : today);
  const date = pickedDay > today ? today : pickedDay;
  const asked =
    view === 'day'
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
  const viewParam = view === 'categories' ? '&view=categories' : '&view=month';
  const dayHref = (d: string) => `/expenses?view=day&date=${d}`;
  const here = view === 'day' ? dayHref(date) : `/expenses?month=${ym(year, month)}${viewParam}`;

  const supabase = await createClient();
  const [data, { data: shop }] = await Promise.all([
    loadExpenseMonth(supabase, me.shopId, year, month),
    supabase.from('shops').select('settings').eq('id', me.shopId).single(),
  ]);
  const { expenses, categories, staff, totals, counts } = data;
  const cats = new Map(categories.map((c) => [c.id, c]));
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const activeCats = categories.filter((c) => !c.archived);

  const day = expenseDay(expenses, date);
  const byDay = new Map<string, typeof expenses>();
  for (const e of expenses) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const ranked = Object.entries(totals.byCategory).sort((a, b) => b[1] - a[1]);
  const top = ranked[0]?.[1] ?? 0;
  // How many shop-charged expenses each category has (the ones its total counts).
  const catCount = new Map<string, number>();
  for (const e of expenses)
    if (e.charged_to_kind === 'shop')
      catCount.set(e.category_id, (catCount.get(e.category_id) ?? 0) + 1);

  const editing = sp.edit && can('expenses.edit') ? expenses.find((e) => e.id === sp.edit) : null;
  const adding = sp.add === '1' && can('expenses.add') && !editing;
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

  const meta = (e: (typeof expenses)[number]) => {
    const m = 'expenses.meta';
    const payer =
      e.paid_by_kind === 'staff'
        ? `${t(`${m}.staffPaid`, { name: names.get(e.paid_by_staff_id!) ?? '' })}${e.reimburse ? `, ${t(`${m}.paidBack`)}` : ''}`
        : t(`${m}.${e.paid_by_kind}`);
    const charged =
      e.charged_to_kind === 'staff'
        ? ` · ${t(`${m}.chargedTo`, { name: names.get(e.charged_to_staff_id!) ?? '' })}`
        : '';
    return `${payer} · ${modes[e.payment_mode] ?? e.payment_mode}${charged}`;
  };

  const dayGroup = (date: string, rows: typeof expenses) => (
    <div key={date} className="flex flex-col">
      <span className="text-caption flex justify-between pt-2 pb-1 font-semibold text-[var(--ink-muted)]">
        <span>
          {days[weekday(date)]} {formatDate(date)}
        </span>
        <span>{formatINR(rows.reduce((a, e) => a + Number(e.amount_paise), 0))}</span>
      </span>
      <ul>
        {rows.map((e) => {
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
            'flex min-h-[60px] items-center gap-3 border-b border-[var(--line)] py-2';
          return (
            <li key={e.id}>
              {can('expenses.edit') ? (
                <Link
                  href={`${here}&edit=${e.id}`}
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
                trigger={
                  <>
                    <Plus aria-hidden="true" />
                    {t('expenses.add')}
                  </>
                }
              >
                <ExpenseForm
                  expense={null}
                  categories={activeCats.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
                  staff={staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))}
                  today={today}
                  monthName={monthName}
                  smallLimit={toShopRules(shop?.settings).smallExpenseLimit ?? null}
                  canDelete={false}
                />
              </FormDialog>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {view === 'day' ? (
          <div className="flex flex-wrap items-center gap-1">
            <Link
              href={dayHref(addDays(date, -1))}
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
                href={dayHref(addDays(date, 1))}
                aria-label={t('expenses.day.next')}
                className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </Link>
            )}
            {date !== today && (
              <Link href="/expenses" className={`${quietButtonClass} ml-1`}>
                {t('expenses.day.today_link')}
              </Link>
            )}
            <form action="/expenses" className="ml-2 flex items-center gap-2">
              <input type="hidden" name="view" value="day" />
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
              href={`/expenses?month=${ym(prev.year, prev.month)}${viewParam}`}
              aria-label={t('expenses.prevMonth')}
              className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </Link>
            <span className="text-title-md px-2">{monthName}</span>
            {hasNext && (
              <Link
                href={`/expenses?month=${ym(next.year, next.month)}${viewParam}`}
                aria-label={t('expenses.nextMonth')}
                className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
        <TabLinks
          label={t('expenses.views.label')}
          items={[
            {
              href: dayHref(view === 'day' ? date : today),
              label: t('expenses.views.day'),
              current: view === 'day',
            },
            {
              href: `/expenses?month=${ym(year, month)}&view=month`,
              label: t('expenses.views.list'),
              current: view === 'list',
            },
            {
              href: `/expenses?month=${ym(year, month)}&view=categories`,
              label: t('expenses.views.categories'),
              current: view === 'categories',
            },
          ]}
        />
      </div>

      {sp.saved && <UrlToast message={t('expenses.form.saved')} params={['saved']} />}

      {activeCats.length === 0 && (
        <p className={`${card} text-body-lg text-[var(--ink-muted)]`}>
          {can('expenses.categories') ? (
            <Link href="/settings/categories" className="text-[var(--accent-ink)] underline">
              {t('expenses.noCategories')}
            </Link>
          ) : (
            t('expenses.noCategoriesAsk')
          )}
        </p>
      )}

      {view === 'day' && (
        <section className={`${card} flex flex-col gap-2`}>
          <span className="text-label-sm text-[var(--ink-muted)]">
            {date === today
              ? t('expenses.day.today')
              : t('expenses.day.on', { date: formatDate(date) })}
          </span>
          <span className="text-money-hero text-[3.5rem] leading-none sm:text-[4.5rem]">
            {formatINR(day.spent)}
          </span>
          <span className="text-muted-foreground text-sm">
            {t('expenses.tiles.count', { count: day.rows.length })}
            {day.rows.length > 0 &&
              ` · ${t('expenses.day.split', {
                shop: formatINR(day.shop),
                staff: formatINR(day.chargedToStaff),
                notTracked: formatINR(day.notTracked),
              })}`}
          </span>
          <span className="text-muted-foreground text-xs">
            {t('expenses.day.monthSoFar', { month: monthName, amount: formatINR(totals.total) })}
          </span>
        </section>
      )}

      {view !== 'day' && (
        <StatGrid>
          {(
            [
              ['shop', totals.total, counts.shop, '', ''],
              ['staff', totals.chargedToStaff, counts.staff, 'var(--money-advance)', 'staffMeta'],
              [
                'reimbursed',
                totals.reimbursed,
                counts.reimbursed,
                'var(--money-owed)',
                'reimbursedMeta',
              ],
              [
                'notTracked',
                totals.notTracked,
                counts.notTracked,
                'var(--ink-muted)',
                'notTrackedMeta',
              ],
            ] as const
          ).map(([k, v, n, colour, metaKey]) => (
            <StatCard
              key={k}
              label={t(`expenses.tiles.${k}`)}
              tone={colour || undefined}
              paise={v}
              meta={`${t('expenses.tiles.count', { count: n })}${metaKey ? ` · ${t(`expenses.tiles.${metaKey}`)}` : ''}`}
            />
          ))}
        </StatGrid>
      )}

      {!can('expenses.view_all') && (
        <p className="text-caption text-[var(--ink-muted)]">{t('expenses.ownOnly')}</p>
      )}

      {view === 'categories' && (
        <Panel
          title={t('expenses.byCategory')}
          description={t('expenses.byCategoryHint')}
          flush
          actions={
            can('expenses.categories') && (
              <Link
                href="/settings/categories"
                className="text-xs font-medium text-[var(--accent-ink)]"
              >
                {t('expenses.editCategories')}
              </Link>
            )
          }
        >
          {ranked.length === 0 ? (
            <PanelEmpty>{t('expenses.empty', { month: monthName })}</PanelEmpty>
          ) : (
            <ul className="divide-y">
              {ranked.map(([id, v]) => {
                const c = cats.get(id);
                const Icon = categoryIcon(c?.icon ?? 'receipt');
                const col = categoryColour(c?.colour ?? 'slate');
                const share = totals.total > 0 ? Math.round((v / totals.total) * 100) : 0;
                return (
                  <li
                    key={id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_6rem_4rem_8rem]"
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
                        style={{ width: `${Math.round((v / top) * 100)}%`, background: col.fg }}
                      />
                    </span>
                    <span className="text-muted-foreground hidden text-xs md:block">
                      {t('expenses.tiles.count', { count: catCount.get(id) ?? 0 })}
                    </span>
                    <span className="text-muted-foreground hidden text-right text-xs tabular-nums md:block">
                      {share}%
                    </span>
                    <span className="text-money-sm row-start-1 text-right md:row-start-auto">
                      {formatINR(v)}
                    </span>
                  </li>
                );
              })}
              <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 bg-[var(--surface-muted)]/50 px-4 py-3 font-semibold md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_6rem_4rem_8rem]">
                <span className="text-sm">{t('expenses.tiles.shop')}</span>
                <span className="hidden md:block" />
                <span className="text-muted-foreground hidden text-xs md:block">
                  {t('expenses.tiles.count', { count: counts.shop })}
                </span>
                <span className="hidden text-right text-xs md:block">100%</span>
                <span className="text-money-sm text-right">{formatINR(totals.total)}</span>
              </li>
            </ul>
          )}
        </Panel>
      )}

      {view === 'day' && (
        <Panel title={t('expenses.list')}>
          {day.rows.length === 0 ? (
            <p className="text-body text-[var(--ink-muted)]">
              {t('expenses.day.empty', { date: formatDate(date) })}
            </p>
          ) : (
            dayGroup(date, day.rows)
          )}
        </Panel>
      )}

      {view === 'list' && (
        <Panel title={t('expenses.list')}>
          {expenses.length === 0 ? (
            <p className="text-body text-[var(--ink-muted)]">
              {t('expenses.empty', { month: monthName })}
            </p>
          ) : (
            [...byDay.entries()].map(([d, rows]) => dayGroup(d, rows))
          )}
        </Panel>
      )}

      {(adding || formExpense) && (
        <ExpensePanel
          title={formExpense ? t('expenses.form.editTitle') : t('expenses.form.addTitle')}
          closeHref={here}
        >
          <ExpenseForm
            expense={formExpense}
            categories={activeCats
              .concat(
                formExpense && !activeCats.some((c) => c.id === formExpense.categoryId)
                  ? categories.filter((c) => c.id === formExpense.categoryId)
                  : [],
              )
              .map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
            staff={staff
              .filter(
                (s) =>
                  s.active ||
                  s.id === formExpense?.paidByStaff ||
                  s.id === formExpense?.chargedToStaff,
              )
              .map((s) => ({ id: s.id, name: s.name }))}
            today={today}
            monthName={monthName}
            smallLimit={toShopRules(shop?.settings).smallExpenseLimit ?? null}
            closeHref={here}
            canDelete={can('expenses.edit')}
          />
        </ExpensePanel>
      )}
    </>
  );
}
