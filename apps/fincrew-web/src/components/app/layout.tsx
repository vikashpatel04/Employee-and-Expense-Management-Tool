import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';
import { formatINR } from '@fincrew/core';
import { PendingLink } from './pending-link';

/*
 * Page layout pieces for the website, so every page lines up the same way:
 *   PageHeader (components.tsx) → StatGrid of StatCards → Bento of Panels.
 * StatGrid fills its row evenly whatever the number of cards; Bento is a 12-column grid whose
 * panels stretch to the tallest one in the row.
 */

/** Row of figures: equal widths, wraps evenly (2 on a tablet, up to 4 on a desk). */
export function StatGrid({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]',
        className,
      )}
      {...props}
    />
  );
}

/** One figure: label (with icon and colour), the amount or count, a line under it. */
export function StatCard({
  label,
  icon: Icon,
  tone,
  value,
  paise,
  meta,
  href,
  className,
}: {
  label: string;
  icon?: LucideIcon;
  /** CSS colour for the label, e.g. `var(--money-owed)`. */
  tone?: string;
  /** A ready value (count, text); or `paise` for money. */
  value?: ReactNode;
  paise?: number;
  meta?: ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <span
        className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold"
        style={tone ? { color: tone } : undefined}
      >
        {Icon && <Icon className="size-4" aria-hidden="true" />}
        {label}
      </span>
      <span className="text-money-lg">{paise !== undefined ? formatINR(paise) : value}</span>
      {meta && <span className="text-muted-foreground text-xs">{meta}</span>}
    </>
  );
  const cls = cn(
    'bg-card flex h-full min-h-28 flex-col justify-between gap-1 rounded-lg border p-4 shadow-xs',
    href && 'hover:bg-muted/60 transition-colors',
    className,
  );
  return href ? (
    <PendingLink href={href} className={cls}>
      {body}
    </PendingLink>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** 12-column grid; children set their width with `span` (Panel) or `lg:col-span-*`. */
export function Bento({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid items-stretch gap-4 lg:grid-cols-12', className)} {...props} />;
}

const SPAN: Record<number, string> = {
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  12: 'lg:col-span-12',
};

/**
 * A card with a title row (title, optional count or line, actions on the right) and its body.
 * In a Bento, `span` is its width out of 12; it stretches to the row's height.
 */
export function Panel({
  title,
  description,
  actions,
  span = 12,
  flush = false,
  className,
  children,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  span?: keyof typeof SPAN;
  /** No padding around the body (for lists and tables that run edge to edge). */
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        'bg-card flex min-w-0 flex-col rounded-lg border shadow-xs',
        SPAN[span],
        className,
      )}
      {...props}
    >
      {(title || actions) && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 px-4 pt-4',
            flush ? 'border-b pb-3' : 'pb-2',
          )}
        >
          <div className="flex min-w-0 flex-col">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="text-muted-foreground text-xs">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div
        className={cn(
          'flex flex-1 flex-col gap-3',
          flush ? '' : 'px-4 pb-4',
          !title && !actions && !flush && 'pt-4',
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Rows inside a Panel: one per line, divided, edge to edge. */
export function PanelList({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('divide-y [&>li]:px-4', className)} {...props} />;
}

/** "Nothing here yet" inside a Panel. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground px-4 py-6 text-center text-sm">{children}</p>;
}
