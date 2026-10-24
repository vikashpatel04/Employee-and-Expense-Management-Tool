import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { formatINR } from '@fincrew/core';
import { categoryColour, categoryIcon } from '@/lib/expense-style';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { lastMonths, loadReport } from '@/lib/reports';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, quietButtonClass } from '../../components';

const RANGES = [3, 6, 12] as const;
const LONG = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const SHORT = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });
const at = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));
const card =
  'flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]';
const money = (v: number | null) => (v == null ? '—' : v === 0 ? '—' : formatINR(v));

/** Reports (design: "Web · reports"): money month by month and expenses by category. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const me = (await requireMe())!;
  const can = (k: string) => me.permissions.includes(k);
  if (!can('reports.view')) redirect('/');
  const asked = Number((await searchParams).months);
  const count = RANGES.find((r) => r === asked) ?? 6;
  const access = {
    salary: can('salary.view'),
    advances: can('salary.view') || can('advances.give'),
    expenses: can('expenses.view_all'),
  };

  const months = lastMonths(todayIST(), count);
  const supabase = await createClient();
  const { months: rows, categories } = await loadReport(supabase, me.shopId, months, access);
  const first = months[0]!;
  const last = months.at(-1)!;
  const sum = (f: (r: (typeof rows)[number]) => number | null) =>
    rows.reduce((a, r) => a + (f(r) ?? 0), 0);
  const total = (r: (typeof rows)[number]) => (r.salary ?? 0) + (r.expenses ?? 0);
  const biggest = Math.max(1, ...rows.map(total));

  const catTotals = new Map<string, number>();
  for (const r of rows)
    for (const [id, v] of Object.entries(r.byCategory))
      catTotals.set(id, (catTotals.get(id) ?? 0) + v);
  const catRows = [...catTotals.entries()].sort((a, b) => b[1] - a[1]);
  const cats = new Map(categories.map((c) => [c.id, c]));

  const th = 'px-3 py-2 text-right font-semibold';
  const td = 'px-3 py-2.5 text-right';
  const columns = [
    access.salary && ['salary', (r: (typeof rows)[number]) => r.salary, ''],
    access.salary && ['paid', (r: (typeof rows)[number]) => r.paid, 'text-[var(--money-paid)]'],
    access.advances && [
      'advances',
      (r: (typeof rows)[number]) => r.advances,
      'text-[var(--money-advance)]',
    ],
    access.expenses && ['expenses', (r: (typeof rows)[number]) => r.expenses, ''],
  ].filter(Boolean) as [string, (r: (typeof rows)[number]) => number | null, string][];
  const showTotal = access.salary || access.expenses;

  return (
    <>
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle', {
          shop: me.shopName,
          from: LONG.format(at(first.year, first.month)),
          to: LONG.format(at(last.year, last.month)),
        })}
        actions={
          <>
            <nav
              aria-label={t('reports.range')}
              className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1"
            >
              {RANGES.map((r) => (
                <Link
                  key={r}
                  href={`/reports?months=${r}`}
                  aria-current={r === count ? 'page' : undefined}
                  className={`text-label-sm flex min-h-10 items-center rounded-[var(--radius-sm)] px-3 ${
                    r === count
                      ? 'bg-[var(--surface)] shadow-[var(--elevation-1)]'
                      : 'text-[var(--ink-muted)]'
                  }`}
                >
                  {t('reports.months', { count: r })}
                </Link>
              ))}
            </nav>
            {can('reports.export') && (
              <a
                href={`/reports/export?months=${count}`}
                download
                className={`${quietButtonClass} inline-flex items-center gap-2`}
              >
                <Download size={20} aria-hidden="true" />
                {t('reports.csv')}
              </a>
            )}
          </>
        }
      />

      {columns.length === 0 ? (
        <p className="text-body-lg text-[var(--ink-muted)]">{t('reports.nothing')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {showTotal && (
              <Tile
                label={t('reports.tiles.total')}
                value={sum(total)}
                meta={t('reports.tiles.totalMeta')}
              />
            )}
            {access.salary && (
              <Tile
                label={t('reports.columns.salary')}
                value={sum((r) => r.salary)}
                meta={t('reports.tiles.salaryMeta')}
                tone="var(--accent-ink)"
              />
            )}
            {access.expenses && (
              <Tile
                label={t('reports.columns.expenses')}
                value={sum((r) => r.expenses)}
                meta={t('reports.tiles.expensesMeta', { count: sum((r) => r.expenseCount) })}
                tone="var(--status-late)"
              />
            )}
            {access.advances && (
              <Tile
                label={t('reports.columns.advances')}
                value={sum((r) => r.advances)}
                meta={t('reports.tiles.advancesMeta')}
                tone="var(--money-advance)"
              />
            )}
          </div>

          <section aria-labelledby="month-h" className={card}>
            <h2 id="month-h" className="text-title-md">
              {t('reports.byMonth')}
            </h2>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse tabular-nums">
                <thead>
                  <tr className="text-caption text-[var(--ink-muted)]">
                    <th scope="col" className={`${th} text-left`}>
                      {t('reports.columns.month')}
                    </th>
                    {columns.map(([k]) => (
                      <th key={k} scope="col" className={th}>
                        {t(`reports.columns.${k}`)}
                      </th>
                    ))}
                    {showTotal && (
                      <th scope="col" className={th}>
                        {t('reports.columns.total')}
                      </th>
                    )}
                    {showTotal && (
                      <th scope="col" className="w-40 px-3">
                        <span className="sr-only">{t('reports.share')}</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="text-money-sm">
                  {rows.map((r) => (
                    <tr key={`${r.year}-${r.month}`} className="border-t border-[var(--line)]">
                      <th scope="row" className="text-label-sm px-3 py-2.5 text-left">
                        {LONG.format(at(r.year, r.month))}
                        {r.salaryDraft && (
                          <span className="text-caption ml-2 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[var(--ink-muted)]">
                            {t('reports.draft')}
                          </span>
                        )}
                      </th>
                      {columns.map(([k, f, cls]) => (
                        <td key={k} className={`${td} ${cls}`}>
                          {money(f(r))}
                        </td>
                      ))}
                      {showTotal && <td className={`${td} font-semibold`}>{money(total(r))}</td>}
                      {showTotal && (
                        <td className="px-3">
                          <span className="block h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                            <span
                              className="flex h-2"
                              style={{ width: `${Math.round((total(r) / biggest) * 100)}%` }}
                            >
                              <span style={{ flex: r.salary ?? 0, background: 'var(--accent)' }} />
                              <span
                                style={{ flex: r.expenses ?? 0, background: 'var(--status-late)' }}
                              />
                            </span>
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[var(--line-strong)] font-semibold">
                    <th scope="row" className="text-label-sm px-3 py-2.5 text-left">
                      {t('reports.months', { count })}
                    </th>
                    {columns.map(([k, f]) => (
                      <td key={k} className={td}>
                        {money(sum(f))}
                      </td>
                    ))}
                    {showTotal && <td className={td}>{money(sum(total))}</td>}
                    {showTotal && <td />}
                  </tr>
                </tbody>
              </table>
            </div>
            {showTotal && (
              <span className="text-caption flex gap-4 text-[var(--ink-muted)]">
                {access.salary && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" />
                    {t('reports.columns.salary')}
                  </span>
                )}
                {access.expenses && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[var(--status-late)]" />
                    {t('reports.columns.expenses')}
                  </span>
                )}
              </span>
            )}
          </section>

          {access.expenses && (
            <section aria-labelledby="cat-h" className={card}>
              <h2 id="cat-h" className="text-title-md">
                {t('reports.byCategory')}
              </h2>
              {catRows.length === 0 ? (
                <p className="text-body text-[var(--ink-muted)]">{t('reports.noExpenses')}</p>
              ) : (
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse tabular-nums">
                    <thead>
                      <tr className="text-caption text-[var(--ink-muted)]">
                        <th scope="col" className={`${th} text-left`}>
                          {t('reports.columns.category')}
                        </th>
                        {rows.map((r) => (
                          <th key={`${r.year}-${r.month}`} scope="col" className={th}>
                            {SHORT.format(at(r.year, r.month))}
                          </th>
                        ))}
                        <th scope="col" className={th}>
                          {t('reports.columns.total')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-money-sm">
                      {catRows.map(([id, v]) => {
                        const c = cats.get(id);
                        const Icon = categoryIcon(c?.icon ?? 'receipt');
                        const col = categoryColour(c?.colour ?? 'slate');
                        return (
                          <tr key={id} className="border-t border-[var(--line)]">
                            <th scope="row" className="text-label-sm px-3 py-2.5 text-left">
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="grid h-7 w-7 place-items-center rounded-full"
                                  style={{ background: col.soft, color: col.fg }}
                                >
                                  <Icon size={16} aria-hidden="true" />
                                </span>
                                {c?.name}
                              </span>
                            </th>
                            {rows.map((r) => (
                              <td
                                key={`${r.year}-${r.month}`}
                                className={`${td} ${r.byCategory[id] ? '' : 'text-[var(--ink-muted)]'}`}
                              >
                                {money(r.byCategory[id] ?? 0)}
                              </td>
                            ))}
                            <td className={`${td} font-semibold`}>{formatINR(v)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          <p className="text-caption max-w-prose text-[var(--ink-muted)]">
            {t('reports.footnote')}
          </p>
        </>
      )}
    </>
  );
}

function Tile({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: number;
  meta: string;
  tone?: string;
}) {
  return (
    <section className="flex flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--elevation-1)]">
      <span className="text-caption font-semibold" style={tone ? { color: tone } : {}}>
        {label}
      </span>
      <span className="text-money-lg">{formatINR(value)}</span>
      <span className="text-caption text-[var(--ink-muted)]">{meta}</span>
    </section>
  );
}
