import { businessDateOf, formatDisplayDate } from '@fincrew/core';

/** Every date shown in the app: DD/MM/YYYY (owner's rule; docs/DECISIONS.md). */
export const formatDate = formatDisplayDate;

/** Today's business date in IST, "YYYY-MM-DD". */
export const todayIST = () => businessDateOf(new Date());

/** Up to two initials for an avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}
