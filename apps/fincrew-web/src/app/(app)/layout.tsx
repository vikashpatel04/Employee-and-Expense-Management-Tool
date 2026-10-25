import type { ReactNode } from 'react';
import { countPendingRequests } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { settingsSections } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { NavDim } from '@/components/app/pending-link';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AuthCard, buttonClass } from '../components';
import { signOut } from '../login/actions';
import { AppSidebar, type NavItem } from './app-sidebar';

/**
 * Signed-in shell: a fixed sidebar (`app-sidebar.tsx`, shadcn Sidebar) with the shop switcher
 * and the sections this person may open; beside it a slim top bar and the page, which is the only
 * part that scrolls. On a phone the sidebar slides in from the menu button.
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
  if (can('attendance.code')) items.push({ href: '/code', label: t('nav.code'), icon: 'qr' });
  if (can('requests.decide')) {
    const waiting = await countPendingRequests(await createClient(), me.shopId);
    items.push({ href: '/requests', label: t('nav.requests'), icon: 'inbox', badge: waiting });
  }
  if (can('staff.view')) items.push({ href: '/staff', label: t('nav.staff'), icon: 'users' });
  if (can('salary.view')) items.push({ href: '/salary', label: t('nav.salary'), icon: 'rupee' });
  if (can('expenses.add') || can('expenses.view_all') || can('expenses.edit')) {
    items.push({ href: '/expenses', label: t('nav.expenses'), icon: 'receipt' });
  }
  if (can('salary.view') || can('advances.give')) {
    items.push({ href: '/advances', label: t('nav.advances'), icon: 'advance' });
  }
  if (can('reports.view'))
    items.push({ href: '/reports', label: t('nav.reports'), icon: 'reports' });
  if (settingsSections(me.permissions).length > 0) {
    items.push({ href: '/settings', label: t('nav.settings'), icon: 'settings' });
  }

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        items={items}
        shopId={me.shopId}
        shopName={me.shopName}
        shops={me.memberships.map((m) => ({ shopId: m.shopId, shopName: m.shopName }))}
        canAddShop={me.memberships.some((m) => m.isOwner)}
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="bg-background/95 flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <span className="text-muted-foreground truncate text-sm font-medium">{me.shopName}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavDim>
            <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 md:p-6">
              {children}
            </div>
          </NavDim>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
