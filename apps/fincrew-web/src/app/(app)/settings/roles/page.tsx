import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { t } from '@/lib/i18n';
import { loadRoles, permissionGroups } from '@/lib/roles';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { NewRoleForm } from './role-forms';

const card = 'rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]';

/** Custom roles: sets of permissions given to people who help run the shop (PLAN §3). */
export default async function RolesPage() {
  const me = (await requireMe())!;
  if (!me.permissions.includes(SETTINGS_SECTIONS.roles)) redirect('/settings');

  const supabase = await createClient();
  const { roles, people } = await loadRoles(supabase, me.shopId);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const owner = people.find((p) => p.isOwner);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="flex flex-col gap-3">
        <p className="text-body text-[var(--ink-muted)]">{t('settings.roles.subtitle')}</p>
        {owner && (
          <p className="text-body text-[var(--ink-muted)]">
            {t('settings.roles.owner', { name: owner.name })}
          </p>
        )}
        {roles.length === 0 ? (
          <p className={`${card} text-body-lg text-[var(--ink-muted)]`}>
            {t('settings.roles.empty')}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
            {roles.map((r) => {
              const holders = r.people.map((id) => names.get(id)).filter(Boolean);
              return (
                <li key={r.id} className="border-b border-[var(--line)] last:border-0">
                  <Link
                    href={`/settings/roles/${r.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-muted)]"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-label-sm">{r.name}</span>
                      <span className="text-caption text-[var(--ink-muted)]">
                        {t('settings.roles.permCount', { count: r.permissions.length })} ·{' '}
                        {r.people.length === 0
                          ? t('settings.roles.nobody')
                          : holders.length === r.people.length
                            ? holders.join(', ')
                            : t('settings.roles.peopleCount', { count: r.people.length })}
                      </span>
                    </span>
                    <ChevronRight
                      size={20}
                      aria-hidden="true"
                      className="shrink-0 text-[var(--ink-muted)]"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className={card}>
        <h2 className="text-title-md">{t('settings.roles.new')}</h2>
        <p className="text-body mt-1 mb-4 text-[var(--ink-muted)]">{t('settings.roles.newHint')}</p>
        <NewRoleForm groups={permissionGroups()} />
      </section>
    </div>
  );
}
