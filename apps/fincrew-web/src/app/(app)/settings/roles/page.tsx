import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { t } from '@/lib/i18n';
import { loadRoles, permissionGroups } from '@/lib/roles';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { HelperForm, NewRoleForm, RemoveHelperButton } from './role-forms';

const card = 'rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]';

/** Custom roles: sets of permissions given to people who help run the shop (PLAN §3). */
export default async function RolesPage() {
  const me = (await requireMe())!;
  if (!me.permissions.includes(SETTINGS_SECTIONS.roles)) redirect('/settings');

  const supabase = await createClient();
  const { roles, people } = await loadRoles(supabase, me.shopId);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const owner = people.find((p) => p.isOwner);
  const helpers = people.filter((p) => !p.isOwner && !p.isStaff);

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
      <div className="flex flex-col gap-4">
        <section className={card}>
          <h2 className="text-title-md">{t('settings.roles.new')}</h2>
          <p className="text-body mt-1 mb-4 text-[var(--ink-muted)]">
            {t('settings.roles.newHint')}
          </p>
          <NewRoleForm groups={permissionGroups()} />
        </section>
        {me.permissions.includes('staff.edit') && (
          <section className={`${card} flex flex-col gap-3`}>
            <div>
              <h2 className="text-title-md">{t('settings.roles.helpers.title')}</h2>
              <p className="text-body mt-1 text-[var(--ink-muted)]">
                {t('settings.roles.helpers.hint')}
              </p>
            </div>
            {helpers.length > 0 && (
              <ul className="rounded-[var(--radius-md)] border border-[var(--line)]">
                {helpers.map((h) => (
                  <li
                    key={h.id}
                    className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2 last:border-0"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-label-sm">{h.name}</span>
                      <span className="text-caption text-[var(--ink-muted)]">
                        {[
                          h.phone,
                          t('settings.roles.helpers.roleCount', {
                            count: roles.filter((r) => r.people.includes(h.id)).length,
                          }),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <RemoveHelperButton personId={h.id} name={h.name} />
                  </li>
                ))}
              </ul>
            )}
            <HelperForm />
          </section>
        )}
      </div>
    </div>
  );
}
