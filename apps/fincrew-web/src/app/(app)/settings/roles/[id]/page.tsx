import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { loadRoles, permissionGroups } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { quietButtonClass } from '../../../../components';
import { DeleteRoleButton, PeopleForm, PermissionsForm, RenameRoleForm } from '../role-forms';

const card = 'rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]';

/** One role: what it may do, who has it, rename, delete. */
export default async function RolePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const me = (await requireMe())!;
  if (!me.permissions.includes(SETTINGS_SECTIONS.roles)) redirect('/settings');
  const { id } = await params;
  const { saved } = await searchParams;

  const supabase = await createClient();
  const { roles, people } = await loadRoles(supabase, me.shopId);
  const role = roles.find((r) => r.id === id);
  if (!role) notFound();
  // The owner has everything already; without staff.view only yourself is visible.
  const choosable = people.filter((p) => !p.isOwner);
  const canSeeStaff = me.permissions.includes('staff.view');

  return (
    <>
      <Link
        href="/settings/roles"
        className={`${quietButtonClass} inline-flex w-fit items-center gap-1 border-0 px-2`}
      >
        <ChevronLeft size={20} aria-hidden="true" />
        {t('settings.roles.detail.back')}
      </Link>
      <h2 className="text-title-lg">{role.name}</h2>
      {saved && (
        <p
          role="status"
          className="text-body w-fit rounded-[var(--radius-md)] bg-[var(--status-present-soft)] px-4 py-3 text-[var(--status-present)]"
        >
          {t('settings.roles.detail.saved')}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className={card}>
          <h3 className="text-title-md mb-4">{t('settings.roles.detail.permissions')}</h3>
          <PermissionsForm roleId={id} groups={permissionGroups()} checked={role.permissions} />
        </section>

        <div className="flex flex-col gap-4">
          <section className={card}>
            <h3 className="text-title-md">{t('settings.roles.detail.people')}</h3>
            <p className="text-body mt-1 mb-4 text-[var(--ink-muted)]">
              {t('settings.roles.detail.peopleHint')}
            </p>
            {!canSeeStaff ? (
              <p className="text-body text-[var(--ink-muted)]">
                {t('settings.roles.detail.needStaffView')}
              </p>
            ) : choosable.length === 0 ? (
              <p className="text-body text-[var(--ink-muted)]">
                {t('settings.roles.detail.noPeople')}
              </p>
            ) : (
              <PeopleForm
                roleId={id}
                people={choosable.map((p) => ({
                  id: p.id,
                  name: p.name,
                  hasLogin: p.hasLogin,
                  isStaff: p.isStaff,
                  checked: role.people.includes(p.id),
                }))}
              />
            )}
          </section>

          <section className={`${card} flex flex-col gap-4`}>
            <RenameRoleForm roleId={id} name={role.name} />
            <div className="flex flex-col gap-1">
              <DeleteRoleButton roleId={id} />
              <p className="text-caption text-[var(--ink-muted)]">
                {t('settings.roles.detail.deleteHint')}
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
