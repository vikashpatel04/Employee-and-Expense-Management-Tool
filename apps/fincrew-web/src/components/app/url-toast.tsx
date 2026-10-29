'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

/**
 * A confirmation carried in the address after a save that redirects (`?added=`, `?saved=`):
 * shows it as a toast once, then takes those parameters out of the address so a reload or the
 * back button doesn't show it again.
 */
export function UrlToast({
  message,
  params,
  error = false,
}: {
  message: string;
  params: string[];
  /** Show it as an error (something after the save didn't work). */
  error?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    if (error) toast.error(message);
    else toast.success(message);
    const next = new URLSearchParams(search.toString());
    for (const p of params) next.delete(p);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [message, params, pathname, router, search, error]);
  return null;
}
