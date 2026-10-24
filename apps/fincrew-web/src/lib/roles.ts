import { PERMISSIONS, type PermissionKey } from '@fincrew/core';
import type { createClient } from './supabase/server';

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
 * A shop's roles with their permissions and people, and everyone who could hold one. People are
 * read under RLS, so without `staff.view` the list is just yourself.
 */
export async function loadRoles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shopId: string,
) {
  const [{ data: roles }, { data: perms }, { data: members }, { data: people }] = await Promise.all(
    [
      supabase.from('roles').select('id, name').eq('shop_id', shopId).order('name'),
      supabase.from('role_permissions').select('role_id, permission_key').eq('shop_id', shopId),
      supabase.from('person_roles').select('role_id, person_id').eq('shop_id', shopId),
      supabase
        .from('people')
        .select('id, name, is_owner, auth_user_id')
        .eq('shop_id', shopId)
        .order('name'),
    ],
  );
  return {
    roles: (roles ?? []).map((r) => ({
      ...r,
      permissions: (perms ?? []).filter((p) => p.role_id === r.id).map((p) => p.permission_key),
      people: (members ?? []).filter((m) => m.role_id === r.id).map((m) => m.person_id),
    })),
    people: (people ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      isOwner: p.is_owner,
      hasLogin: p.auth_user_id != null,
    })),
  };
}
