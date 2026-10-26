import { PERMISSIONS, type PermissionKey } from '@fincrew/core';
import type { Supabase } from './client';

/** Permissions grouped by area ("staff", "salary", …), in the catalogue's order (PLAN §3). */
export function permissionGroups(): { area: string; keys: PermissionKey[] }[] {
  const groups = new Map<string, PermissionKey[]>();
  for (const key of PERMISSIONS) {
    const area = key.split('.')[0]!;
    groups.set(area, [...(groups.get(area) ?? []), key]);
  }
  return [...groups].map(([area, keys]) => ({ area, keys }));
}

/**
 * A shop's roles with their permissions and people, and everyone who could hold one: staff and
 * helpers (people who aren't on the payroll). People are read under RLS, so without `staff.view`
 * the list is just yourself.
 */
export async function loadRoles(supabase: Supabase, shopId: string) {
  const [{ data: roles }, { data: perms }, { data: members }, { data: people }, { data: staff }] =
    await Promise.all([
      supabase.from('roles').select('id, name').eq('shop_id', shopId).order('name'),
      supabase.from('role_permissions').select('role_id, permission_key').eq('shop_id', shopId),
      supabase.from('person_roles').select('role_id, person_id').eq('shop_id', shopId),
      supabase
        .from('people')
        .select('id, name, phone, is_owner, auth_user_id, login_email')
        .eq('shop_id', shopId)
        .order('name'),
      supabase.from('staff').select('person_id').eq('shop_id', shopId),
    ]);
  const staffIds = new Set((staff ?? []).map((s) => s.person_id));
  return {
    roles: (roles ?? []).map((r) => ({
      ...r,
      permissions: (perms ?? []).filter((p) => p.role_id === r.id).map((p) => p.permission_key),
      people: (members ?? []).filter((m) => m.role_id === r.id).map((m) => m.person_id),
    })),
    people: (people ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      isOwner: p.is_owner,
      hasLogin: p.auth_user_id != null,
      /** The email a helper signs in with (helper sign-ins only). */
      loginEmail: p.login_email,
      /** On the payroll; everyone else (not the owner) is a helper. */
      isStaff: staffIds.has(p.id),
    })),
  };
}
