'use client';

import { useTransition } from 'react';
import { usePathname } from 'next/navigation';
import {
  ArrowUpRight,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronsUpDown,
  House,
  Inbox,
  IndianRupee,
  LogOut,
  Plus,
  QrCode,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { PendingLink } from '@/components/app/pending-link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/lib/i18n';
import { signOut } from '../login/actions';
import { switchShop } from '../shops/actions';

const ICONS: Record<string, LucideIcon> = {
  home: House,
  calendar: CalendarDays,
  users: Users,
  rupee: IndianRupee,
  receipt: Receipt,
  reports: ChartColumn,
  advance: ArrowUpRight,
  settings: Settings,
  qr: QrCode,
  inbox: Inbox,
};

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** A count shown beside the label (requests waiting). */
  badge?: number;
};

export type SidebarShop = { shopId: string; shopName: string };

/**
 * The app's sidebar (shadcn Sidebar on FinCrew tokens): shop switcher, the sections this person
 * may open, sign out. It stays put while the page beside it scrolls; on a phone it slides in
 * from the menu button. The section being opened shows a spinner until its page is ready.
 */
export function AppSidebar({
  items,
  shopId,
  shopName,
  shops,
  canAddShop,
}: {
  items: NavItem[];
  shopId: string;
  shopName: string;
  shops: SidebarShop[];
  canAddShop: boolean;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const [switching, startSwitch] = useTransition();
  const [signingOut, startSignOut] = useTransition();

  const choose = (id: string) =>
    startSwitch(async () => {
      const form = new FormData();
      form.set('shopId', id);
      await switchShop(form);
    });

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 p-3">
        <span className="text-primary px-2 pt-1 text-lg font-semibold">{t('appName')}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={t('nav.switchShop', { name: shopName })}
              className="bg-muted data-[state=open]:bg-accent"
            >
              <span className="bg-background text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md text-xs font-semibold">
                {shopName.slice(0, 2).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                <span className="truncate text-sm font-semibold">{shopName}</span>
                <span className="text-muted-foreground text-xs">
                  {t('nav.shopCount', { count: shops.length })}
                </span>
              </span>
              {switching ? <Spinner /> : <ChevronsUpDown className="text-muted-foreground" />}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
            <DropdownMenuLabel>{t('nav.yourShops')}</DropdownMenuLabel>
            {shops.map((s) => (
              <DropdownMenuItem
                key={s.shopId}
                onSelect={() => s.shopId !== shopId && choose(s.shopId)}
              >
                <span className="flex-1 truncate">{s.shopName}</span>
                {s.shopId === shopId && <Check />}
              </DropdownMenuItem>
            ))}
            {canAddShop && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <PendingLink href="/shops/new">
                    <Plus />
                    {t('shops.add')}
                  </PendingLink>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label={t('nav.main')}>
              {items.map((item) => {
                const current =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                const Icon = ICONS[item.icon]!;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={current} className="h-9">
                      <PendingLink
                        href={item.href}
                        aria-current={current ? 'page' : undefined}
                        onClick={() => setOpenMobile(false)}
                        spinner
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </PendingLink>
                    </SidebarMenuButton>
                    {item.badge ? (
                      <SidebarMenuBadge className="bg-primary text-primary-foreground rounded-full">
                        {item.badge}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-muted-foreground"
              disabled={signingOut}
              onClick={() => startSignOut(() => signOut())}
            >
              {signingOut ? <Spinner /> : <LogOut />}
              <span>{t('auth.signOut')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
