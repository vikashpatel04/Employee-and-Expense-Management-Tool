import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { AuthCard } from '../../components';
import { ShopForm } from '../shop-form';

/** Owners can add another shop; they become its owner. */
export default async function NewShopPage() {
  const me = await requireMe();
  const ownedOne = me?.memberships.find((m) => m.isOwner);
  if (!ownedOne) redirect('/');

  return (
    <AuthCard title={t('shops.newTitle')} subtitle={t('shops.newSubtitle')}>
      <ShopForm
        ownerName={ownedOne.name}
        labels={{
          shopName: t('setup.shopName'),
          yourName: t('setup.yourName'),
          create: t('setup.create'),
          creating: t('setup.creating'),
        }}
      />
      <Link href="/" className="mt-4 block text-center text-sm text-[var(--muted)] underline">
        {t('shops.cancel')}
      </Link>
    </AuthCard>
  );
}
