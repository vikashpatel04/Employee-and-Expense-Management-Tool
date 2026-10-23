import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Avatar, buttonClass, inputClass, PageHeader, quietButtonClass } from '../../components';

type Filter = 'active' | 'left' | 'all';

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; added?: string }>;
}) {
  const me = (await requireMe())!;
  if (!me.permissions.includes('staff.view')) redirect('/');
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const filter: Filter =
    params.status === 'left' || params.status === 'all' ? params.status : 'active';

  const supabase = await createClient();
  let query = supabase
    .from('staff')
    .select('person_id, joining_date, leaving_date, status, people!inner(name, phone)')
    .eq('shop_id', me.shopId)
    .order('name', { referencedTable: 'people' });
  if (filter !== 'all') query = query.eq('status', filter);
  const { data } = await query;

  const all = (data ?? []).map((s) => ({
    id: s.person_id,
    name: s.people.name,
    phone: s.people.phone,
    joined: s.joining_date,
    status: s.status as 'active' | 'left',
  }));
  const needle = q.toLowerCase();
  const rows = needle
    ? all.filter((r) => r.name.toLowerCase().includes(needle) || (r.phone ?? '').includes(q))
    : all;
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const canAdd = me.permissions.includes('staff.edit');
  const filters: Filter[] = ['active', 'left', 'all'];

  return (
    <>
      <PageHeader
        title={t('staff.title')}
        subtitle={t('staff.subtitle', { shop: me.shopName, count: all.length })}
        actions={
          canAdd && (
            <Link
              href="/staff/new"
              className={`${buttonClass} inline-flex w-auto items-center gap-2`}
            >
              <Plus size={20} aria-hidden="true" />
              {t('staff.add')}
            </Link>
          )
        }
      />

      {params.added && (
        <p
          role="status"
          className="text-body rounded-[var(--radius-md)] bg-[var(--status-present-soft)] px-4 py-3 text-[var(--status-present)]"
        >
          {t('staff.added', { name: params.added })}
        </p>
      )}

      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="text-label-sm flex min-w-0 flex-[1_1_280px] flex-col">
          {t('staff.search')}
          <input name="q" defaultValue={q} type="search" className={inputClass} />
        </label>
        <fieldset className="flex flex-col">
          <legend className="text-label-sm">{t('staff.filter.label')}</legend>
          <div className="mt-1 flex gap-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1">
            {filters.map((f) => (
              <label
                key={f}
                className="text-label-sm flex min-h-10 cursor-pointer items-center rounded-[var(--radius-sm)] px-3 has-[:checked]:bg-[var(--surface)] has-[:checked]:shadow-[var(--elevation-1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]"
              >
                <input
                  type="radio"
                  name="status"
                  value={f}
                  defaultChecked={f === filter}
                  className="sr-only"
                />
                {t(`staff.filter.${f}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <button className={`${quietButtonClass} inline-flex items-center gap-2`}>
          <Search size={18} aria-hidden="true" />
          {t('staff.searchButton')}
        </button>
      </form>

      {all.length === 0 && filter === 'active' && !q ? (
        <div className="flex flex-col items-start gap-2 rounded-[var(--radius-lg)] bg-[var(--surface)] p-6 shadow-[var(--elevation-1)]">
          <h2 className="text-title-md">{t('staff.empty.title')}</h2>
          <p className="text-body-lg max-w-prose text-[var(--ink-muted)]">
            {t('staff.empty.body')}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-body-lg text-[var(--ink-muted)]">{t('staff.noMatch', { q })}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="text-caption text-left text-[var(--ink-muted)]">
                <th className="px-4 py-3 font-semibold">{t('staff.columns.name')}</th>
                <th className="px-4 py-3 font-semibold">{t('staff.columns.phone')}</th>
                <th className="px-4 py-3 font-semibold">{t('staff.columns.joined')}</th>
                <th className="px-4 py-3 font-semibold">{t('staff.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={r.name} size={32} />
                      <span className="text-label-sm">{r.name}</span>
                    </span>
                  </td>
                  <td className="text-body px-4 py-3 text-[var(--ink-muted)] tabular-nums">
                    {r.phone ?? '—'}
                  </td>
                  <td className="text-body px-4 py-3 tabular-nums">{formatDate(r.joined)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-caption rounded-[var(--radius-pill)] px-2.5 py-1 ${
                        r.status === 'active'
                          ? 'bg-[var(--status-present-soft)] text-[var(--status-present)]'
                          : 'bg-[var(--status-weekly-off-soft)] text-[var(--status-weekly-off)]'
                      }`}
                    >
                      {t(`staff.status.${r.status}`)}
                    </span>
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
