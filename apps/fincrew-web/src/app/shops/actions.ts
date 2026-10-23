'use server';

import { redirect } from 'next/navigation';
import { t } from '@/lib/i18n';
import { myMemberships, rememberShop } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export async function switchShop(form: FormData) {
  const shopId = String(form.get('shopId') ?? '');
  const memberships = await myMemberships();
  if (memberships.some((m) => m.shopId === shopId)) await rememberShop(shopId);
  redirect('/');
}

export type CreateShopState = { error?: string };

/** First-run setup and "Add a shop" both create a shop owned by the caller. */
export async function createShop(_prev: CreateShopState, form: FormData): Promise<CreateShopState> {
  const shopName = String(form.get('shopName') ?? '').trim();
  const ownerName = String(form.get('ownerName') ?? '').trim();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_shop', {
    shop_name: shopName,
    owner_name: ownerName,
  });
  if (error || !data) return { error: t('setup.failed', { reason: error?.message ?? '' }) };

  await rememberShop(data);
  redirect('/');
}
