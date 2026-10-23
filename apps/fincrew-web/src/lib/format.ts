import { businessDateOf } from '@fincrew/core';

const DATE = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-10-23" → "23 Oct 2026". Business dates carry no time zone, so format them as UTC. */
export function formatDate(date: string): string {
  return DATE.format(new Date(`${date}T00:00:00Z`));
}

/** Today's business date in IST, "YYYY-MM-DD". */
export const todayIST = () => businessDateOf(new Date());

/** Up to two initials for an avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}
