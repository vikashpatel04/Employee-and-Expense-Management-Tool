import { monthOf } from '@fincrew/core';
import { toCsv } from '@/lib/csv';
import { loadExpenseMonth } from '@/lib/expenses';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

/** GET /expenses/export?month=YYYY-MM → that month's expenses you can see, as CSV (`reports.export`). */
export async function GET(request: Request) {
  const me = await requireMe();
  if (!me || !me.permissions.includes('reports.export')) {
    return new Response(t('attendance.export.noPermission'), { status: 403 });
  }
  const asked = new URL(request.url).searchParams.get('month') ?? '';
  const { year, month } = /^\d{4}-\d{2}$/.test(asked)
    ? monthOf(`${asked}-01`)
    : monthOf(todayIST());
  const supabase = await createClient();
  const { expenses, categories, staff } = await loadExpenseMonth(supabase, me.shopId, year, month);
  const cats = new Map(categories.map((c) => [c.id, c.name]));
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const c = 'expenses.csvColumns';
  const by = (kind: string, id: string | null, group: 'paidByOptions' | 'chargedOptions') =>
    kind === 'staff' ? (names.get(id!) ?? '') : t(`expenses.form.${group}.${kind}`);

  const csv = toCsv([
    ['date', 'category', 'amount', 'mode', 'paidBy', 'chargedTo', 'paidBack', 'note'].map((k) =>
      t(`${c}.${k}`),
    ),
    ...[...expenses]
      .reverse()
      .map((e) => [
        formatDate(e.date),
        cats.get(e.category_id) ?? '',
        (Number(e.amount_paise) / 100).toFixed(2),
        modes[e.payment_mode] ?? e.payment_mode,
        by(e.paid_by_kind, e.paid_by_staff_id, 'paidByOptions'),
        by(e.charged_to_kind, e.charged_to_staff_id, 'chargedOptions'),
        e.reimburse ? t(`${c}.yes`) : t(`${c}.no`),
        e.note ?? '',
      ]),
  ]);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="expenses-${year}-${String(month).padStart(2, '0')}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
