import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { settingsSections } from '@/lib/settings-access';
import { AuthCard, buttonClass } from '../components';
import { signOut } from '../login/actions';
import { NavLinks, type NavItem } from './nav';
import { NavShell } from './nav-shell';
import { ShopSwitcher } from './shop-switcher';

/**
 * Signed-in shell (design: "Web · attendance grid"): sidebar with the shop switcher and the
 * sections this person may open, main area beside it; on a phone the sidebar folds into a top
 * bar with a Menu button (`nav-shell.tsx`).
 * Sections appear here as they are built.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();

  if (!me) {
    return (
      <AuthCard title={t('appName')}>
        <p className="text-body text-[var(--ink-muted)]">{t('auth.noAccess')}</p>
        <form action={signOut} className="mt-6">
          <button className={buttonClass}>{t('auth.signOut')}</button>
        </form>
      </AuthCard>
    );
  }

  const can = (key: string) => me.permissions.includes(key);
  const items: NavItem[] = [{ href: '/', label: t('nav.dashboard'), icon: 'home' }];
  if (can('staff.view') || can('attendance.mark')) {
    items.push({ href: '/attendance', label: t('nav.attendance'), icon: 'calendar' });
  }
  if (can('staff.view')) items.push({ href: '/staff', label: t('nav.staff'), icon: 'users' });
  if (can('salary.view')) items.push({ href: '/salary', label: t('nav.salary'), icon: 'rupee' });
  if (can('salary.view') || can('advances.give')) {
    items.push({ href: '/advances', label: t('nav.advances'), icon: 'advance' });
  }
  if (settingsSections(me.permissions).length > 0) {
    items.push({ href: '/settings', label: t('nav.settings'), icon: 'settings' });
  }

  return (
    <div className="flex min-h-dvh flex-wrap items-stretch">
      <NavShell
        label={t('nav.main')}
        brand={t('appName')}
        shopName={me.shopName}
        menuLabel={t('nav.menu')}
        closeLabel={t('nav.closeMenu')}
      >
        <span className="text-title-md hidden px-3 pb-3 text-[var(--accent-ink)] md:block">
          {t('appName')}
        </span>
        <ShopSwitcher me={me} />
        <NavLinks items={items} label={t('nav.main')} />
        <form action={signOut} className="mt-auto pt-4">
          <button className="text-label-sm flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-[var(--ink-muted)] hover:bg-[var(--surface-muted)]">
            <LogOut size={20} aria-hidden="true" />
            {t('auth.signOut')}
          </button>
        </form>
      </NavShell>
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-4 py-6 sm:px-8">
        {children}
      </main>
    </div>
  );
}
