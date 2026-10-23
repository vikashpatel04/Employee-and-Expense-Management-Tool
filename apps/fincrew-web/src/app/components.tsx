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
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-title-xl">{title}</h1>
        {subtitle && <p className="text-body text-[var(--ink-muted)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-[var(--surface)] p-6 shadow-[var(--elevation-1)]">
        <h1 className="text-title-lg">{title}</h1>
        {subtitle && <p className="text-body mt-1 text-[var(--ink-muted)]">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export const inputClass =
  'text-body-lg mt-1 block w-full min-h-[var(--tap-min)] rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]';

export const buttonClass =
  'text-label w-full min-h-[var(--tap-primary)] rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[var(--on-accent)] active:bg-[var(--accent-strong)] disabled:opacity-[var(--opacity-disabled)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]';

/** Secondary, outlined button (sign out, switch shop). */
export const quietButtonClass =
  'text-label-sm min-h-[var(--tap-min)] rounded-[var(--radius-md)] border border-[var(--line-strong)] px-4 active:bg-[var(--surface-pressed)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]';
