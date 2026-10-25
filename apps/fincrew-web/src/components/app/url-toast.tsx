'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

/**
 * A confirmation carried in the address after a save that redirects (`?added=`, `?saved=`):
 * shows it as a toast once, then takes those parameters out of the address so a reload or the
 * back button doesn't show it again.
 */
export function UrlToast({ message, params }: { message: string; params: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.success(message);
    const next = new URLSearchParams(search.toString());
    for (const p of params) next.delete(p);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [message, params, pathname, router, search]);
  return null;
}
