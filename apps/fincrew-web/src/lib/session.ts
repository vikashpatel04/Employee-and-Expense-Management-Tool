import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

/** The shop the signed-in person last chose. Only a preference: RLS decides access. */
export const SHOP_COOKIE = 'fincrew_shop';

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

/** Every shop the signed-in login has a record in. */
export async function myMemberships(): Promise<Membership[]> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect('/login');

  const { data } = await supabase
    .from('people')
    .select('id, name, is_owner, shop_id, shops(name)')
    .eq('auth_user_id', claims.claims.sub);

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
 * The signed-in person in their current shop, or a redirect:
 *   not signed in → /login, nobody has set up a shop yet → /setup.
 * Returns null when signed in but not part of any shop.
 */
export async function requireMe(): Promise<Me | null> {
  const memberships = await myMemberships();
  const supabase = await createClient();

  if (memberships.length === 0) {
    const { data: shopExists } = await supabase.rpc('shop_exists');
    if (!shopExists) redirect('/setup');
    return null;
  }

  const chosen = (await cookies()).get(SHOP_COOKIE)?.value;
  const current = memberships.find((m) => m.shopId === chosen) ?? memberships[0]!;
  const { data: perms } = await supabase.rpc('my_permissions', { p_shop: current.shopId });
  return { ...current, permissions: perms ?? [], memberships };
}

export async function rememberShop(shopId: string) {
  (await cookies()).set(SHOP_COOKIE, shopId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}
