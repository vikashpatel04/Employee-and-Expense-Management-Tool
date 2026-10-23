import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatINR } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Avatar, PageHeader } from '../../components';

/** Who still owes advances, how much is cut each month, and their limit. */
export default async function AdvancesPage() {
  const me = (await requireMe())!;
  const can = (k: string) => me.permissions.includes(k);
  if (!can('salary.view') && !can('advances.give')) redirect('/');

  const supabase = await createClient();
  const [{ data: balances }, { data: staff }] = await Promise.all([
    supabase
      .from('advance_balances')
      .select('staff_id, outstanding_paise, advance_limit_paise, advance_cut_paise')
      .eq('shop_id', me.shopId),
    supabase.from('staff').select('person_id, people!inner(name)').eq('shop_id', me.shopId),
  ]);
  const names = new Map((staff ?? []).map((s) => [s.person_id, s.people.name]));
  const rows = (balances ?? [])
    .map((b) => ({
      id: b.staff_id!,
      name: names.get(b.staff_id!) ?? '',
      outstanding: Number(b.outstanding_paise ?? 0),
      cut: b.advance_cut_paise == null ? null : Number(b.advance_cut_paise),
      limit: b.advance_limit_paise == null ? null : Number(b.advance_limit_paise),
    }))
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
  const total = rows.reduce((a, r) => a + r.outstanding, 0);

  return (
    <>
      <PageHeader
        title={t('advances.title')}
        subtitle={t('advances.subtitle', { shop: me.shopName })}
      />
      <section className="flex w-fit flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--elevation-1)]">
        <span className="text-caption text-[var(--ink-muted)]">{t('advances.total')}</span>
        <span className="text-money-lg text-[var(--money-advance)]">{formatINR(total)}</span>
      </section>
      {rows.length === 0 ? (
        <p className="text-body-lg text-[var(--ink-muted)]">{t('advances.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
          <table className="w-full min-w-[520px] border-collapse tabular-nums">
            <thead>
              <tr className="text-caption text-left text-[var(--ink-muted)]">
                <th className="px-4 py-3 font-semibold">{t('advances.columns.name')}</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t('advances.columns.outstanding')}
                </th>
                <th className="px-4 py-3 text-right font-semibold">{t('advances.columns.cut')}</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t('advances.columns.limit')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={r.name} size={32} />
                      <Link
                        href={`/staff/${r.id}`}
                        className="text-label-sm text-[var(--accent-ink)] underline-offset-2 hover:underline"
                      >
                        {r.name}
                      </Link>
                    </span>
                  </td>
                  <td className="text-money-sm px-4 py-3 text-right text-[var(--money-advance)]">
                    {formatINR(r.outstanding)}
                  </td>
                  <td className="text-money-sm px-4 py-3 text-right">
                    {r.cut == null ? '—' : formatINR(r.cut)}
                  </td>
                  <td className="text-money-sm px-4 py-3 text-right">
                    {r.limit == null ? '—' : formatINR(r.limit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
