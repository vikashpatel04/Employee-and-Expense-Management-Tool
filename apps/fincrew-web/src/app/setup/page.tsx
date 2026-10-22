import { redirect } from 'next/navigation';
import { t } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { AuthCard } from '../components';
import { SetupForm } from './setup-form';

export default async function SetupPage() {
  const supabase = await createClient();
  const { data: shopExists } = await supabase.rpc('shop_exists');
  if (shopExists) redirect('/');

  return (
    <AuthCard title={t('setup.title')} subtitle={t('setup.subtitle')}>
      <SetupForm
        labels={{
          shopName: t('setup.shopName'),
          yourName: t('setup.yourName'),
          create: t('setup.create'),
          creating: t('setup.creating'),
        }}
      />
    </AuthCard>
  );
}
