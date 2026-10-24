'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

/**
 * The sidebar. On a phone (below `md`) it folds into a top bar with the shop name and a Menu
 * button (design: "Web · attendance on a phone"); the menu closes again after navigating.
 */
export function NavShell({
  label,
  brand,
  shopName,
  menuLabel,
  closeLabel,
  children,
}: {
  label: string;
  brand: string;
  shopName: string;
  menuLabel: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <nav
      aria-label={label}
      className="flex flex-[1_1_208px] flex-col bg-[var(--surface)] shadow-[inset_0_-1px_0_var(--line)] md:gap-1 md:px-3 md:py-5 md:shadow-[inset_-1px_0_0_var(--line)]"
    >
      <div className="flex min-h-14 items-center gap-2.5 pr-2 pl-4 md:hidden">
        <span className="text-title-md text-[var(--accent-ink)]">{brand}</span>
        <span className="text-caption min-w-0 flex-1 truncate font-semibold text-[var(--ink-muted)]">
          {shopName}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="main-menu"
          aria-label={open ? closeLabel : menuLabel}
          onClick={() => setOpen((o) => !o)}
          className="grid h-12 w-12 place-items-center rounded-[var(--radius-md)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
        >
          {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>
      </div>
      <div
        id="main-menu"
        className={`${open ? 'flex' : 'hidden'} flex-1 flex-col gap-1 px-3 pb-4 md:flex md:p-0`}
      >
        {children}
      </div>
    </nav>
  );
}
