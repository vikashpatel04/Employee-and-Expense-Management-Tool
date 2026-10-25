import type { ReactNode } from 'react';
import { initials } from '@/lib/format';

/** Neutral initials avatar (design system: avatars stay neutral, colour is for meaning). */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className="inline-grid shrink-0 place-items-center rounded-full bg-[var(--surface-pressed)] font-semibold text-[var(--ink-muted)]"
    >
      {initials(name)}
    </span>
  );
}

/** Screen title, subtitle and actions (design: web screens' header row). */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Centered card used by the sign-in and setup screens. Colours, type and sizes come from the
 * FinCrew Design System tokens (`@fincrew/ui/tokens.css`, docs/DESIGN.md).
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-xs">
        <h1 className="text-title-lg">{title}</h1>
        {subtitle && <p className="text-body mt-1 text-[var(--ink-muted)]">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

// Form classes in the shadcn/ui look (src/components/ui) on FinCrew tokens, for the forms that
// still use plain elements; new screens use the components.
export const inputClass =
  'mt-1 flex min-h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive';

export const buttonClass =
  'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium whitespace-nowrap text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

/**
 * Props for a date field. Dates are typed as DD/MM/YYYY everywhere (a browser date picker would
 * follow the browser's language), and server actions read them with `parseDisplayDate`.
 */
export const dateFieldProps = {
  inputMode: 'numeric',
  placeholder: 'DD/MM/YYYY',
  // Raw string keeps the backslashes; no character class, because browsers compile `pattern`
  // with the `v` flag, where "/" inside [...] must be escaped.
  pattern: String.raw`\d{1,2}(\/|\.|-)\d{1,2}(\/|\.|-)\d{4}`,
  autoComplete: 'off',
} as const;

/** Secondary, outlined button (sign out, switch shop). */
export const quietButtonClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium whitespace-nowrap shadow-xs transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';
