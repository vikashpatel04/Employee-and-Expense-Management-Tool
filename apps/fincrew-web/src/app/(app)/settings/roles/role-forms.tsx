'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PermissionKey } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { useDialogDone } from '@/components/app/form-dialog';
import { useFormAction } from '@/lib/use-form-action';
import { buttonClass, inputClass, quietButtonClass } from '../../../components';
import { FormMessage } from '../holidays/holiday-forms';
import {
  addHelper,
  createRole,
  deleteRole,
  removeHelper,
  renameRole,
  savePeople,
  savePermissions,
  type RoleState,
} from './actions';

type Groups = { area: string; keys: PermissionKey[] }[];

const checkbox = 'h-5 w-5 shrink-0 accent-[var(--accent)]';

/** Permission checkboxes grouped by area (PLAN §3 table). */
function PermissionChecklist({ groups, checked }: { groups: Groups; checked: readonly string[] }) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <fieldset key={g.area} className="flex flex-col">
          <legend className="text-label-sm mb-1">{t(`permissionAreas.${g.area}`)}</legend>
          {g.keys.map((k) => (
            <label key={k} className="text-body flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                name="permission"
                value={k}
                defaultChecked={checked.includes(k)}
                className={checkbox}
              />
              {t(`permissions.${k}`)}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

export function NewRoleForm({ groups }: { groups: Groups }) {
  const [state, onSubmit, pending] = useFormAction<RoleState>(createRole, {});
  useDialogDone(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="text-label-sm block">
        {t('settings.roles.name')}
        <input name="name" required maxLength={60} className={inputClass} />
      </label>
      <PermissionChecklist groups={groups} checked={[]} />
      <FormMessage state={state} />
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass}>
        {pending ? t('settings.saving') : t('settings.roles.create')}
      </button>
    </form>
  );
}

export function PermissionsForm({
  roleId,
  groups,
  checked,
}: {
  roleId: string;
  groups: Groups;
  checked: string[];
}) {
  const [state, onSubmit, pending] = useFormAction<RoleState>(
    savePermissions.bind(null, roleId),
    {},
  );
  useDialogDone(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <PermissionChecklist groups={groups} checked={checked} />
      <FormMessage state={state} />
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass}>
        {pending ? t('settings.saving') : t('settings.roles.detail.savePermissions')}
      </button>
    </form>
  );
}

export function PeopleForm({
  roleId,
  people,
}: {
  roleId: string;
  people: { id: string; name: string; hasLogin: boolean; isStaff: boolean; checked: boolean }[];
}) {
  const [state, onSubmit, pending] = useFormAction<RoleState>(savePeople.bind(null, roleId), {});
  useDialogDone(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <ul className="flex max-h-96 flex-col overflow-y-auto rounded-[var(--radius-md)] border border-[var(--line)]">
        {people.map((p) => (
          <li key={p.id} className="border-b border-[var(--line)] last:border-0">
            <label className="flex min-h-12 items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                name="person"
                value={p.id}
                defaultChecked={p.checked}
                className={checkbox}
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-label-sm">
                  {p.name}
                  {!p.isStaff && (
                    <span className="text-caption ml-2 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[var(--ink-muted)]">
                      {t('settings.roles.helpers.tag')}
                    </span>
                  )}
                </span>
                {!p.hasLogin && (
                  <span className="text-caption text-[var(--ink-muted)]">
                    {t('settings.roles.detail.noLogin')}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass}>
        {pending ? t('settings.saving') : t('settings.roles.detail.savePeople')}
      </button>
    </form>
  );
}

export function RenameRoleForm({ roleId, name }: { roleId: string; name: string }) {
  const [state, onSubmit, pending] = useFormAction<RoleState>(renameRole.bind(null, roleId), {});
  useDialogDone(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="text-label-sm block flex-1">
          {t('settings.roles.name')}
          <input name="name" required maxLength={60} defaultValue={name} className={inputClass} />
        </label>
        <button type="submit" disabled={pending} aria-busy={pending} className={quietButtonClass}>
          {pending ? t('settings.saving') : t('settings.roles.detail.rename')}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/** Two steps: "Delete role", then "Yes, delete this role". */
export function DeleteRoleButton({ roleId }: { roleId: string }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          asking
            ? start(async () => {
                const r = await deleteRole(roleId);
                if (r?.error) setError(r.error);
              })
            : setAsking(true)
        }
        className={`${quietButtonClass} w-fit ${asking ? 'border-[var(--danger)] text-[var(--danger)]' : ''} disabled:opacity-[var(--opacity-disabled)]`}
      >
        {asking ? t('settings.roles.detail.deleteConfirm') : t('settings.roles.detail.delete')}
      </button>
      {error && (
        <span role="alert" className="text-caption text-[var(--danger)]">
          {error}
        </span>
      )}
    </span>
  );
}

/** Add a helper (name and phone). */
export function HelperForm() {
  const [state, onSubmit, pending] = useFormAction<RoleState>(addHelper, {});
  useDialogDone(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-label-sm block">
          {t('settings.roles.helpers.name')}
          <input name="name" required maxLength={80} className={inputClass} />
        </label>
        <label className="text-label-sm block">
          {t('settings.roles.helpers.phone')}
          <input name="phone" type="tel" inputMode="tel" maxLength={20} className={inputClass} />
        </label>
      </div>
      <FormMessage state={state} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={`${quietButtonClass} w-fit`}
      >
        {pending ? t('settings.saving') : t('settings.roles.helpers.add')}
      </button>
    </form>
  );
}

/** Two-step remove for a helper. */
export function RemoveHelperButton({ personId, name }: { personId: string; name: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-label={asking ? undefined : t('settings.roles.helpers.removeLabel', { name })}
        onClick={() =>
          asking
            ? start(async () => {
                const r = await removeHelper(personId);
                if (r.error) setError(r.error);
                else router.refresh();
              })
            : setAsking(true)
        }
        className={`text-caption min-h-8 rounded-[var(--radius-sm)] px-2 underline disabled:opacity-[var(--opacity-disabled)] ${
          asking ? 'text-[var(--danger)]' : 'text-[var(--accent-ink)]'
        }`}
      >
        {asking ? t('settings.roles.helpers.removeConfirm') : t('settings.roles.helpers.remove')}
      </button>
      {error && (
        <span role="alert" className="text-caption text-[var(--danger)]">
          {error}
        </span>
      )}
    </span>
  );
}
