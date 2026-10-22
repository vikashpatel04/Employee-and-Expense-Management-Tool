import type { ReactNode } from 'react';

/** Centered card used by the sign-in and setup screens until the design system exists. */
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
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export const inputClass =
  'mt-1 block w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2.5 outline-none focus:border-[var(--accent)]';

export const buttonClass =
  'w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 font-medium text-white disabled:opacity-60 dark:text-black';
