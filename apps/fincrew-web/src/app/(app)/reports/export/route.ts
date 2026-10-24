import { toCsv } from '@/lib/csv';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { lastMonths, loadReport } from '@/lib/reports';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const rupees = (v: number | null) => (v == null ? '' : (v / 100).toFixed(2));

/**
 * GET /reports/export?months=3|6|12 → CSV: one row per month (the columns this person may see),
 * then a blank line and shop expenses by category × month. Needs `reports.export`.
 */
export async function GET(request: Request) {
  const me = await requireMe();
  if (!me || !me.permissions.includes('reports.export')) {
    return new Response(t('attendance.export.noPermission'), { status: 403 });
  }
  const can = (k: string) => me.permissions.includes(k);
  const asked = Number(new URL(request.url).searchParams.get('months'));
  const count = [3, 6, 12].includes(asked) ? asked : 6;
  const access = {
    salary: can('salary.view'),
    advances: can('salary.view') || can('advances.give'),
    expenses: can('expenses.view_all'),
  };
  const supabase = await createClient();
  const { months, categories } = await loadReport(
    supabase,
    me.shopId,
    lastMonths(todayIST(), count),
    access,
  );
  const c = 'reports.columns';
  const label = (y: number, m: number) => `${String(m).padStart(2, '0')}/${y}`;
  const cols = [
    ...(access.salary ? (['salary', 'paid'] as const) : []),
    ...(access.advances ? (['advances'] as const) : []),
    ...(access.expenses ? (['expenses'] as const) : []),
  ];
  const rows: (string | number)[][] = [
    [t(`${c}.month`), ...cols.map((k) => t(`${c}.${k}`))],
    ...months.map((r) => [label(r.year, r.month), ...cols.map((k) => rupees(r[k]))]),
  ];
  if (access.expenses) {
    const names = new Map(categories.map((x) => [x.id, x.name]));
    const ids = [...new Set(months.flatMap((r) => Object.keys(r.byCategory)))];
    rows.push(
      [],
      [t(`${c}.category`), ...months.map((r) => label(r.year, r.month))],
      ...ids.map((id) => [
        names.get(id) ?? '',
        ...months.map((r) => rupees(r.byCategory[id] ?? 0)),
      ]),
    );
  }
  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="report-${count}-months.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
