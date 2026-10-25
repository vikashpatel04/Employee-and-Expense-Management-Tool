'use client';

import { usePathname } from 'next/navigation';
import { TabLinks } from '@/components/app/tab-links';

/** Section tabs (same tabs as the staff page; the one being opened shows a spinner). */
export function SettingsTabs({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  return (
    <TabLinks
      label={label}
      className="flex-wrap"
      items={items.map((i) => ({ ...i, current: pathname.startsWith(i.href) }))}
    />
  );
}
