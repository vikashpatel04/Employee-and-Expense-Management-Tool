'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowUpRight,
  ChartColumn,
  CalendarDays,
  House,
  Inbox,
  IndianRupee,
  QrCode,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

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

/** Sidebar links; the current section gets the accent background (design: Web · attendance grid). */
export function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <ul aria-label={label} className="flex flex-col gap-1">
      {items.map((item) => {
        const current = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const Icon = ICONS[item.icon]!;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? 'page' : undefined}
              className={`text-label-sm flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 focus-visible:outline-2 focus-visible:outline-[var(--focus)] ${
                current
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                  : 'text-[var(--ink)] hover:bg-[var(--surface-muted)]'
              }`}
            >
              <Icon size={20} strokeWidth={2} aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="text-micro min-w-5 rounded-[var(--radius-pill)] bg-[var(--accent)] px-1.5 text-center text-[var(--on-accent)]">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
