import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Camera, ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import { formatINR, monthOf, weekday } from '@fincrew/core';
import { loadExpenseMonth, toShopRules } from '@fincrew/data';
import { categoryColour, categoryIcon } from '@/lib/expense-style';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, quietButtonClass } from '../../components';
import { ExpenseForm, ExpensePanel, type FormExpense } from './expense-form';

const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const shift = (y: number, m: number, by: number) => {
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};
const card = 'rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]';

/** Expenses for a month (design: "Web · expenses"): totals, by category, list, add/edit panel. */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; add?: string; edit?: string; saved?: string }>;
}) {
  const me = (await requireMe())!;
  const can = (k: string) => me.permissions.includes(k);
  if (!can('expenses.add') && !can('expenses.view_all') && !can('expenses.edit')) redirect('/');

  const today = todayIST();
  const current = monthOf(today);
  const sp = await searchParams;
  const asked = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? monthOf(`${sp.month}-01`) : current;
  const { year, month } =
    ym(asked.year, asked.month) > ym(current.year, current.month) ? current : asked;
  const monthName = MONTH.format(new Date(Date.UTC(year, month - 1, 1)));
  const prev = shift(year, month, -1);
  const next = shift(year, month, 1);
  const hasNext = ym(next.year, next.month) <= ym(current.year, current.month);
  const here = `/expenses?month=${ym(year, month)}`;

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

  const byDay = new Map<string, typeof expenses>();
  for (const e of expenses) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const ranked = Object.entries(totals.byCategory).sort((a, b) => b[1] - a[1]);
  const top = ranked[0]?.[1] ?? 0;

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
              <Link
                href={`${here}&add=1`}
                className="text-label-sm inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[var(--on-accent)]"
              >
                <Plus size={20} aria-hidden="true" />
                {t('expenses.add')}
              </Link>
            )}
          </>
        }
      />

      <div className="flex items-center gap-1">
        <Link
          href={`/expenses?month=${ym(prev.year, prev.month)}`}
          aria-label={t('expenses.prevMonth')}
          className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <span className="text-title-md px-2">{monthName}</span>
        {hasNext && (
          <Link
            href={`/expenses?month=${ym(next.year, next.month)}`}
            aria-label={t('expenses.nextMonth')}
            className={`${quietButtonClass} inline-flex items-center border-0 px-2`}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        )}
      </div>

      {sp.saved && (
        <p
          role="status"
          className="text-body w-fit rounded-[var(--radius-md)] bg-[var(--status-present-soft)] px-4 py-3 text-[var(--status-present)]"
        >
          {t('expenses.form.saved')}
        </p>
      )}

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          <section
            key={k}
            className="flex flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--elevation-1)]"
          >
            <span className="text-caption font-semibold" style={colour ? { color: colour } : {}}>
              {t(`expenses.tiles.${k}`)}
            </span>
            <span className="text-money-lg">{formatINR(v)}</span>
            <span className="text-caption text-[var(--ink-muted)]">
              {t('expenses.tiles.count', { count: n })}
              {metaKey ? ` · ${t(`expenses.tiles.${metaKey}`)}` : ''}
            </span>
          </section>
        ))}
      </div>

      {!can('expenses.view_all') && (
        <p className="text-caption text-[var(--ink-muted)]">{t('expenses.ownOnly')}</p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="cat-h" className={`${card} flex flex-col gap-3`}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="cat-h" className="text-title-md">
              {t('expenses.byCategory')}
            </h2>
            {can('expenses.categories') && (
              <Link href="/settings/categories" className="text-label-sm text-[var(--accent-ink)]">
                {t('expenses.editCategories')}
              </Link>
            )}
          </div>
          {ranked.length === 0 ? (
            <p className="text-body text-[var(--ink-muted)]">
              {t('expenses.empty', { month: monthName })}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {ranked.map(([id, v]) => {
                const c = cats.get(id);
                const Icon = categoryIcon(c?.icon ?? 'receipt');
                const col = categoryColour(c?.colour ?? 'slate');
                return (
                  <li key={id} className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-2.5">
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                        style={{ background: col.soft, color: col.fg }}
                      >
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="text-label-sm flex-1">{c?.name}</span>
                      <span className="text-money-sm">{formatINR(v)}</span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                      <span
                        className="block h-1.5 rounded-full"
                        style={{ width: `${Math.round((v / top) * 100)}%`, background: col.fg }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="list-h" className={`${card} flex flex-col gap-2`}>
          <h2 id="list-h" className="text-title-md mb-1">
            {t('expenses.list')}
          </h2>
          {expenses.length === 0 ? (
            <p className="text-body text-[var(--ink-muted)]">
              {t('expenses.empty', { month: monthName })}
            </p>
          ) : (
            [...byDay.entries()].map(([date, rows]) => (
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
            ))
          )}
        </section>
      </div>

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
