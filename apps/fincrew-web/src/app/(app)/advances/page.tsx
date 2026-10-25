import { PendingLink as Link } from '@/components/app/pending-link';
import { redirect } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { Panel, PanelEmpty, StatCard, StatGrid } from '@/components/app/layout';
import { formatINR } from '@fincrew/core';
import { loadAdvanceBalances } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Avatar, PageHeader } from '../../components';

/** Who still owes advances, how much is cut each month, and their limit. */
export default async function AdvancesPage() {
  const me = (await requireMe())!;
  const can = (k: string) => me.permissions.includes(k);
  if (!can('salary.view') && !can('advances.give')) redirect('/');

  const { rows, total } = await loadAdvanceBalances(await createClient(), me.shopId);

  return (
    <>
      <PageHeader
        title={t('advances.title')}
        subtitle={t('advances.subtitle', { shop: me.shopName })}
      />
      <StatGrid>
        <StatCard
          label={t('advances.total')}
          icon={ArrowUpRight}
          tone="var(--money-advance)"
          paise={total}
          meta={t('advances.people', { count: rows.length })}
        />
        <StatCard
          label={t('advances.columns.cut')}
          paise={rows.reduce((a, r) => a + (r.cut ?? 0), 0)}
          meta={t('advances.cutMeta')}
        />
      </StatGrid>
      <Panel title={t('advances.owing')} flush>
        {rows.length === 0 ? (
          <PanelEmpty>{t('advances.empty')}</PanelEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse tabular-nums">
              <thead>
                <tr className="text-caption text-left text-[var(--ink-muted)]">
                  <th className="px-4 py-3 font-semibold">{t('advances.columns.name')}</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    {t('advances.columns.outstanding')}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    {t('advances.columns.cut')}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    {t('advances.columns.limit')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.staffId} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <Avatar name={r.name} size={32} />
                        <Link
                          href={`/staff/${r.staffId}`}
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
      </Panel>
    </>
  );
}
