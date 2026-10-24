import { monthOf } from '@fincrew/core';
import { loadAttendanceMonth } from '@fincrew/data';
import { toCsv } from '@/lib/csv';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /attendance/export?month=YYYY-MM → the month's grid as CSV: one row per person, one
 * column per day (DD/MM/YYYY), then payable / late / absent days. Needs `reports.export`.
 */
export async function GET(request: Request) {
  const me = await requireMe();
  if (!me || !me.permissions.includes('reports.export')) {
    return new Response(t('attendance.export.noPermission'), { status: 403 });
  }
  const today = todayIST();
  const asked = new URL(request.url).searchParams.get('month') ?? '';
  const { year, month } = /^\d{4}-\d{2}$/.test(asked) ? monthOf(`${asked}-01`) : monthOf(today);

  const supabase = await createClient();
  const { days, rows } = await loadAttendanceMonth(supabase, me.shopId, year, month, today);
  const status = t('status', { returnObjects: true }) as unknown as Record<string, string>;
  const c = 'attendance.columns';

  const csv = toCsv([
    [
      t(`${c}.staff`),
      ...days.map((d) => formatDate(d.date)),
      t(`${c}.days`),
      t(`${c}.late`),
      t(`${c}.absent`),
    ],
    ...rows.map((r) => [
      r.name,
      ...r.cells.map((cell) =>
        cell.status === 'future'
          ? ''
          : `${status[cell.status] ?? cell.status}${cell.late ? ` (${status.late})` : ''}`,
      ),
      r.payableDays,
      r.lateDays,
      r.absentDays,
    ]),
  ]);
  const name = `attendance-${year}-${String(month).padStart(2, '0')}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
