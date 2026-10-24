import type { Supabase } from './client';

export type Membership = {
  shopId: string;
  shopName: string;
  personId: string;
  name: string;
  isOwner: boolean;
};

export type Me = Membership & {
  permissions: string[];
  /** Every shop this login belongs to, by shop name. */
  memberships: Membership[];
};

/** Every shop a login has a record in, by shop name. */
export async function loadMemberships(supabase: Supabase, userId: string): Promise<Membership[]> {
  const { data } = await supabase
    .from('people')
    .select('id, name, is_owner, shop_id, shops(name)')
    .eq('auth_user_id', userId);
  return (data ?? [])
    .map((p) => ({
      shopId: p.shop_id,
      shopName: p.shops?.name ?? '',
      personId: p.id,
      name: p.name,
      isOwner: p.is_owner,
    }))
    .sort((a, b) => a.shopName.localeCompare(b.shopName));
}

/**
 * The signed-in person in the chosen shop (or their first one) with its permissions. The choice
 * is only a preference: RLS decides access. Null when the login belongs to no shop.
 */
export async function loadMe(
  supabase: Supabase,
  memberships: Membership[],
  chosenShopId?: string | null,
): Promise<Me | null> {
  if (memberships.length === 0) return null;
  const current = memberships.find((m) => m.shopId === chosenShopId) ?? memberships[0]!;
  const { data: perms } = await supabase.rpc('my_permissions', { p_shop: current.shopId });
  return { ...current, permissions: perms ?? [], memberships };
}
