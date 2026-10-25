import { cn } from 'cn';
import { PendingLink } from './pending-link';

export type TabLink = { href: string; label: string; current: boolean };

/**
 * Tabs that are links (the tab lives in the address, so it survives a reload): shadcn Tabs look,
 * and the tab being opened shows a spinner until it is ready. Pair with a `<Suspense key={tab}>`
 * around the tab's content so its skeleton shows at once.
 */
export function TabLinks({
  label,
  items,
  className,
}: {
  label: string;
  items: TabLink[];
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'bg-muted text-muted-foreground inline-flex h-9 w-fit max-w-full items-center overflow-x-auto rounded-lg p-1',
        className,
      )}
    >
      {items.map((i) => (
        <PendingLink
          key={i.href}
          href={i.href}
          aria-current={i.current ? 'page' : undefined}
          scroll={false}
          spinner
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors',
            i.current ? 'bg-card text-foreground shadow-sm' : 'hover:text-foreground',
          )}
        >
          {i.label}
        </PendingLink>
      ))}
    </nav>
  );
}
