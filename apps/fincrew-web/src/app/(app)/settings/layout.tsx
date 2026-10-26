import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { settingsSections } from '@/lib/settings-access';
import { SettingsNav, type SettingsGroup } from './tabs';

/** Settings area: one tab per section this person may change (every rule is a setting). */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const me = (await requireMe())!;
  const sections = settingsSections(me.permissions);
  if (sections.length === 0) redirect('/');

  const has = (x: string) => sections.includes(x as never);
  const link = (x: string) => ({ href: `/settings/${x}`, label: t(`settings.tabs.${x}`) });
  const groups: SettingsGroup[] = [
    { title: t('settings.groups.rules'), items: [has('rules') && link('rules')].filter(Boolean) as SettingsGroup['items'] },
    { title: t('settings.groups.leave'), items: [has('leave') && link('leave'), has('holidays') && link('holidays')].filter(Boolean) as SettingsGroup['items'] },
    { title: t('settings.groups.money'), items: [has('categories') && link('categories')].filter(Boolean) as SettingsGroup['items'] },
    { title: t('settings.groups.team'), items: [has('roles') && link('roles')].filter(Boolean) as SettingsGroup['items'] },
    // Owner only: clear all data.
    { title: t('settings.groups.owner'), items: me.isOwner ? [link('data')] : [] },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <div className="flex flex-col gap-4 lg:w-52 lg:flex-none">
        <h1 className="text-xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <SettingsNav label={t('settings.tabs.label')} groups={groups} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}
