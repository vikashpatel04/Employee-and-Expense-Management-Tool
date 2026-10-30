import { PendingLink as Link } from '@/components/app/pending-link';
import { redirect } from 'next/navigation';
import Form from 'next/form';
import { Plus, Search } from 'lucide-react';
import { FormDialog } from '@/components/app/form-dialog';
import { FormSubmit } from '@/components/app/form-submit';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Avatar, inputClass, PageHeader, quietButtonClass } from '../../components';
import { AddStaffForm } from './new/add-staff-form';
import { TabLinks } from '@/components/app/tab-links';
import { UrlToast } from '@/components/app/url-toast';

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
            <FormDialog
              title={t('staff.newTitle')}
              description={t('staff.newSubtitle')}
              variant="default"
              trigger={
                <>
                  <Plus aria-hidden="true" />
                  {t('staff.add')}
                </>
              }
            >
              <AddStaffForm
                today={todayIST()}
                labels={{
                  name: t('staff.fields.name'),
                  phone: t('staff.fields.phone'),
                  joiningDate: t('staff.fields.joiningDate'),
                  save: t('staff.save'),
                  saving: t('staff.saving'),
                  cancel: t('staff.cancel'),
                }}
              />
            </FormDialog>
          )
        }
      />

      {params.added && (
        <UrlToast message={t('staff.added', { name: params.added })} params={['added']} />
      )}

      <Form action="/staff" className="flex flex-wrap items-center gap-2" role="search">
        <label className="relative min-w-0 flex-[1_1_260px]">
          <span className="sr-only">{t('staff.search')}</span>
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            name="q"
            defaultValue={q}
            type="search"
            placeholder={t('staff.search')}
            className={`${inputClass} mt-0 pl-9`}
          />
        </label>
        {/* Searching keeps the chosen filter; the filter itself is links (applies at once). */}
        <input type="hidden" name="status" value={filter} />
        <FormSubmit className={quietButtonClass}>
          <Search aria-hidden="true" />
          {t('staff.searchButton')}
        </FormSubmit>
      </Form>

      <TabLinks
        label={t('staff.filter.label')}
        items={filters.map((f) => ({
          href: `/staff?${new URLSearchParams({ status: f, ...(q ? { q } : {}) })}`,
          label: t(`staff.filter.${f}`),
          current: f === filter,
        }))}
      />

      {all.length === 0 && filter === 'active' && !q ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border bg-card p-6 shadow-xs">
          <h2 className="text-title-md">{t('staff.empty.title')}</h2>
          <p className="text-body-lg max-w-prose text-[var(--ink-muted)]">
            {t('staff.empty.body')}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-body-lg text-[var(--ink-muted)]">{t('staff.noMatch', { q })}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
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
                      <Link
                        href={`/staff/${r.id}`}
                        className="text-label-sm text-[var(--accent-ink)] underline-offset-2 hover:underline"
                      >
                        {r.name}
                      </Link>
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
