'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Section tabs, same look as the staff detail tabs. */
export function SettingsTabs({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="flex w-fit max-w-full flex-wrap gap-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1"
    >
      {items.map((item) => {
        const current = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={`text-label-sm flex min-h-10 items-center rounded-[var(--radius-sm)] px-4 ${
              current
                ? 'bg-[var(--surface)] shadow-[var(--elevation-1)]'
                : 'text-[var(--ink-muted)]'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
