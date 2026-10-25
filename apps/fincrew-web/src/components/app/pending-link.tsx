'use client';

import Link, { useLinkStatus } from 'next/link';
import { useEffect, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import { cn } from 'cn';
import { Spinner } from '@/components/ui/spinner';

// How many links are loading right now (the bar at the top shows while any is).
let pendingCount = 0;
const listeners = new Set<() => void>();
const bump = (by: number) => {
  pendingCount += by;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** True while a page or tab opened with `PendingLink` is still loading. */
export function useNavPending() {
  return useSyncExternalStore(
    subscribe,
    () => pendingCount > 0,
    () => false,
  );
}

function Reporter({ spinner }: { spinner: boolean }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    bump(1);
    return () => bump(-1);
  }, [pending]);
  return spinner && pending ? <Spinner className="ml-auto size-4 shrink-0" /> : null;
}

/**
 * A Next.js `Link` that answers the click at once: the bar at the top of the page runs while the
 * next page loads, and with `spinner` the link itself shows one (sidebar, tabs, month arrows).
 */
export function PendingLink({
  spinner = false,
  children,
  ...props
}: ComponentProps<typeof Link> & { spinner?: boolean }) {
  return (
    <Link {...props}>
      {children}
      <Reporter spinner={spinner} />
    </Link>
  );
}

/** Thin moving bar across the top of the window while a link is loading. */
export function NavProgress() {
  const pending = useNavPending();
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity',
        pending ? 'opacity-100 delay-75' : 'opacity-0',
      )}
    >
      <div className="bg-primary h-full w-1/3 animate-[nav-progress_1.1s_ease-in-out_infinite]" />
    </div>
  );
}

/** The page area: fades a little while a link is loading, so every click visibly answers. */
export function NavDim({ children }: { children: ReactNode }) {
  const pending = useNavPending();
  return (
    <div
      aria-busy={pending}
      className={cn(
        'transition-opacity duration-200',
        pending && 'pointer-events-none opacity-60 delay-150',
      )}
    >
      {children}
    </div>
  );
}
