'use client';

import { usePathname } from 'next/navigation';
import { PendingLink } from '@/components/app/pending-link';
import { cn } from 'cn';

export type SettingsGroup = { title: string; items: { href: string; label: string }[] };

/**
 * Settings sub-menu (design "Web · settings"): grouped links down the left on a desk, a
 * scrolling row of links on a phone. The page being opened shows a spinner.
 */
export function SettingsNav({ label, groups }: { label: string; groups: SettingsGroup[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex gap-4 overflow-x-auto lg:w-52 lg:flex-none lg:flex-col lg:overflow-visible">
      {groups.map((g) => (
        <div key={g.title} className="flex shrink-0 flex-col gap-0.5">
          <span className="text-muted-foreground px-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">
            {g.title}
          </span>
          {g.items.map((i) => {
            const current = pathname.startsWith(i.href);
            return (
              <PendingLink
                key={i.href}
                href={i.href}
                spinner
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex h-8 items-center rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                  current ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                )}
              >
                {i.label}
              </PendingLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
