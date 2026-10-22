import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export type Me = {
  personId: string;
  name: string;
  isOwner: boolean;
  shopName: string;
  permissions: string[];
};

/**
 * The signed-in person, or a redirect:
 *   not signed in → /login, signed in but no shop yet → /setup.
 * Returns null when signed in, a shop exists, and this user isn't part of it.
 */
export async function requireMe(): Promise<Me | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect('/login');

  const { data: person } = await supabase
    .from('people')
    .select('id, name, is_owner, shops(name)')
    .eq('auth_user_id', claims.claims.sub)
    .maybeSingle();

  if (!person) {
    const { data: shopExists } = await supabase.rpc('shop_exists');
    if (!shopExists) redirect('/setup');
    return null;
  }

  const { data: perms } = await supabase.rpc('my_permissions');
  // people → shops is many-to-one, so this is a single object at runtime.
  // TODO: drop the cast once packages/db types are generated from the live project.
  const shop = person.shops as unknown as { name: string } | null;
  return {
    personId: person.id,
    name: person.name,
    isOwner: person.is_owner,
    shopName: shop?.name ?? '',
    permissions: (perms as string[] | null) ?? [],
  };
}
