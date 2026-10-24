import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadMe, loadMemberships, type Me, type Membership } from '@fincrew/data';
import { createClient } from './supabase/server';

/** The shop the signed-in person last chose. Only a preference: RLS decides access. */
export const SHOP_COOKIE = 'fincrew_shop';

export type { Me, Membership } from '@fincrew/data';

/** Every shop the signed-in login has a record in. */
export async function myMemberships(): Promise<Membership[]> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect('/login');

  return loadMemberships(supabase, claims.claims.sub);
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

  return loadMe(supabase, memberships, (await cookies()).get(SHOP_COOKIE)?.value);
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
