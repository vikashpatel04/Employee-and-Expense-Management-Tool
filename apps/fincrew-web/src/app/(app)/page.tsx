import Link from 'next/link';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { buttonClass, PageHeader } from '../components';

export default async function DashboardPage() {
  const me = (await requireMe())!; // the layout already handled "no access"

  return (
    <>
      <PageHeader title={t('home.welcome', { name: me.name })} subtitle={me.shopName} />
      {me.isOwner && (
        <span className="text-caption w-fit rounded-[var(--radius-pill)] bg-[var(--accent-soft)] px-3 py-1 text-[var(--accent-ink)]">
          {t('home.owner')}
        </span>
      )}
      <p className="text-body-lg max-w-prose text-[var(--ink-muted)]">{t('home.comingSoon')}</p>
      {me.permissions.includes('staff.edit') && (
        <Link href="/staff/new" className={`${buttonClass} inline-flex w-fit items-center`}>
          {t('staff.add')}
        </Link>
      )}
    </>
  );
}
