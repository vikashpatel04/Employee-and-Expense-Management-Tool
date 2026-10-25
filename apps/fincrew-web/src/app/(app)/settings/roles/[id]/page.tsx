import { PendingLink as Link } from '@/components/app/pending-link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Pencil } from 'lucide-react';
import { FormDialog } from '@/components/app/form-dialog';
import { loadRoles, permissionGroups } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { DeleteRoleButton, PeopleForm, PermissionsForm, RenameRoleForm } from '../role-forms';
import { UrlToast } from '@/components/app/url-toast';

const card = 'rounded-lg border bg-card p-4 shadow-xs';

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
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t('settings.roles.detail.back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{role.name}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <FormDialog
            title={t('settings.roles.detail.rename')}
            trigger={
              <>
                <Pencil aria-hidden="true" />
                {t('settings.roles.detail.rename')}
              </>
            }
          >
            <RenameRoleForm roleId={id} name={role.name} />
          </FormDialog>
          <DeleteRoleButton roleId={id} />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">{t('settings.roles.detail.deleteHint')}</p>
      {saved && <UrlToast message={t('settings.roles.detail.saved')} params={['saved']} />}

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
        </div>
      </div>
    </>
  );
}
