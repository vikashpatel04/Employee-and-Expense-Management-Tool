'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/lib/i18n';

export type SetupState = { error?: string };

export async function setupShop(_prev: SetupState, form: FormData): Promise<SetupState> {
  const shopName = String(form.get('shopName') ?? '').trim();
  const ownerName = String(form.get('ownerName') ?? '').trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc('setup_shop', {
    shop_name: shopName,
    owner_name: ownerName,
  });
  if (error) return { error: t('setup.failed', { reason: error.message }) };

  redirect('/');
}
