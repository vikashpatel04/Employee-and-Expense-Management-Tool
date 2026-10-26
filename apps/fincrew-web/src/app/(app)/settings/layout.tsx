import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { settingsSections } from '@/lib/settings-access';
import { PageHeader } from '../../components';
import { SettingsTabs } from './tabs';

/** Settings area: one tab per section this person may change (every rule is a setting). */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const me = (await requireMe())!;
  const sections = settingsSections(me.permissions);
  if (sections.length === 0) redirect('/');

  return (
    <>
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle', { shop: me.shopName })}
      />
      <SettingsTabs
        label={t('settings.tabs.label')}
        items={[
          ...sections.map((s) => ({ href: `/settings/${s}`, label: t(`settings.tabs.${s}`) })),
          // Owner only: clear all data.
          ...(me.isOwner ? [{ href: '/settings/data', label: t('settings.tabs.data') }] : []),
        ]}
      />
      {children}
    </>
  );
}
