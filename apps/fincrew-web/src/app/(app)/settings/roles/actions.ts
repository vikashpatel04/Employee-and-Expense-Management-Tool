'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isPermissionKey } from '@fincrew/core';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';

export type RoleState = { error?: string; done?: string };

async function allowed() {
  const me = await requireMe();
  return me && me.permissions.includes(SETTINGS_SECTIONS.roles) ? me : null;
}

const ticked = (form: FormData) =>
  [...new Set(form.getAll('permission').map(String))].filter(isPermissionKey);

const nameError = (error: { code?: string; message: string }) =>
  error.code === '23505'
    ? { error: t('settings.roles.errors.nameTaken') }
    : { error: t('settings.errors.failed', { reason: error.message }) };

function refresh(roleId?: string) {
  revalidatePath('/settings/roles');
  if (roleId) revalidatePath(`/settings/roles/${roleId}`);
  // Permissions decide the sidebar and every page.
  revalidatePath('/', 'layout');
}

/** New role with its permissions; opens it so people can be added. */
export async function createRole(_prev: RoleState, form: FormData): Promise<RoleState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: t('settings.roles.errors.name') };

  const supabase = await createClient();
  const { data: role, error } = await supabase
    .from('roles')
    .insert({ shop_id: me.shopId, name })
    .select('id')
    .single();
  if (error) return nameError(error);
  const keys = ticked(form);
  if (keys.length) {
    const { error: pErr } = await supabase
      .from('role_permissions')
      .insert(keys.map((k) => ({ role_id: role.id, shop_id: me.shopId, permission_key: k })));
    if (pErr) return { error: t('settings.errors.failed', { reason: pErr.message }) };
  }
  refresh();
  redirect(`/settings/roles/${role.id}?saved=1`);
}

/** Make the role's permissions exactly the ticked ones. */
export async function savePermissions(
  roleId: string,
  _prev: RoleState,
  form: FormData,
): Promise<RoleState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const keys = ticked(form);
  const want = new Set<string>(keys);
  const supabase = await createClient();
  const { data: current } = await supabase
    .from('role_permissions')
    .select('permission_key')
    .eq('role_id', roleId);
  const have = new Set((current ?? []).map((p) => p.permission_key));
  const removed = [...have].filter((k) => !want.has(k));
  const added = keys.filter((k) => !have.has(k));

  if (removed.length) {
    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId)
      .in('permission_key', removed);
    if (error) return { error: t('settings.errors.failed', { reason: error.message }) };
  }
  if (added.length) {
    const { error } = await supabase
      .from('role_permissions')
      .insert(added.map((k) => ({ role_id: roleId, shop_id: me.shopId, permission_key: k })));
    if (error) return { error: t('settings.errors.failed', { reason: error.message }) };
  }
  refresh(roleId);
  return { done: t('settings.roles.detail.saved') };
}

/** Make the role's people exactly the ticked ones (never the owner: they have everything). */
export async function savePeople(
  roleId: string,
  _prev: RoleState,
  form: FormData,
): Promise<RoleState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const supabase = await createClient();
  // Only people this person can see are on the form; leave anyone else's role alone.
  const { data: visible } = await supabase
    .from('people')
    .select('id')
    .eq('shop_id', me.shopId)
    .eq('is_owner', false);
  const visibleIds = new Set((visible ?? []).map((p) => p.id));
  const want = new Set(
    form
      .getAll('person')
      .map(String)
      .filter((id) => visibleIds.has(id)),
  );
  const { data: current } = await supabase
    .from('person_roles')
    .select('person_id')
    .eq('role_id', roleId);
  const have = new Set((current ?? []).map((m) => m.person_id));
  const removed = [...have].filter((id) => visibleIds.has(id) && !want.has(id));
  const added = [...want].filter((id) => !have.has(id));

  if (removed.length) {
    const { error } = await supabase
      .from('person_roles')
      .delete()
      .eq('role_id', roleId)
      .in('person_id', removed);
    if (error) return { error: t('settings.errors.failed', { reason: error.message }) };
  }
  if (added.length) {
    const { error } = await supabase
      .from('person_roles')
      .insert(added.map((id) => ({ role_id: roleId, shop_id: me.shopId, person_id: id })));
    if (error) return { error: t('settings.errors.failed', { reason: error.message }) };
  }
  refresh(roleId);
  return { done: t('settings.roles.detail.saved') };
}

export async function renameRole(
  roleId: string,
  _prev: RoleState,
  form: FormData,
): Promise<RoleState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: t('settings.roles.errors.name') };
  const supabase = await createClient();
  const { error } = await supabase
    .from('roles')
    .update({ name })
    .eq('id', roleId)
    .eq('shop_id', me.shopId);
  if (error) return nameError(error);
  refresh(roleId);
  return { done: t('settings.roles.detail.saved') };
}

/** Delete a role; its permissions and people go with it (cascade). */
export async function deleteRole(roleId: string): Promise<RoleState> {
  const me = await allowed();
  if (!me) return { error: t('settings.errors.noPermission') };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('roles')
    .delete({ count: 'exact' })
    .eq('id', roleId)
    .eq('shop_id', me.shopId);
  if (error || count === 0)
    return { error: t('settings.errors.failed', { reason: error?.message ?? '—' }) };
  refresh();
  redirect('/settings/roles');
}

/**
 * A helper: someone who helps run the shop but isn't on the payroll (a person with no staff
 * record). Adding people needs `staff.edit` (RLS on people).
 */
export async function addHelper(_prev: RoleState, form: FormData): Promise<RoleState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('staff.edit'))
    return { error: t('settings.errors.noPermission') };
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: t('settings.roles.helpers.errors.name') };
  const phone = String(form.get('phone') ?? '').trim() || null;
  const supabase = await createClient();
  const { error } = await supabase.from('people').insert({ shop_id: me.shopId, name, phone });
  if (error) return { error: t('settings.errors.failed', { reason: error.message }) };
  refresh();
  return { done: t('settings.roles.helpers.added', { name }) };
}

/** Remove a helper (never staff or the owner); their roles go with them. */
export async function removeHelper(personId: string): Promise<RoleState> {
  const me = await requireMe();
  if (!me || !me.permissions.includes('staff.edit'))
    return { error: t('settings.errors.noPermission') };
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from('staff')
    .select('person_id')
    .eq('person_id', personId)
    .maybeSingle();
  if (staff) return { error: t('settings.roles.helpers.errors.isStaff') };
  const { error, count } = await supabase
    .from('people')
    .delete({ count: 'exact' })
    .eq('id', personId)
    .eq('shop_id', me.shopId)
    .eq('is_owner', false);
  if (error || count === 0)
    return { error: t('settings.errors.failed', { reason: error?.message ?? '—' }) };
  refresh();
  return {};
}
