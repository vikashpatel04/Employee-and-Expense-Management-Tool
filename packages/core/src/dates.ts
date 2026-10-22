/**
 * Business dates are calendar dates in Asia/Kolkata (docs/PLAN.md §4.1).
 * They travel as ISO strings "YYYY-MM-DD".
 */
export type BusinessDate = string;

export const SHOP_TIME_ZONE = 'Asia/Kolkata';

/** The business date (in Asia/Kolkata) for a given instant. */
export function businessDateOf(instant: Date): BusinessDate {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Number of days in a month. `month` is 1–12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
