/**
 * Business dates are calendar dates in Asia/Kolkata (docs/PLAN.md §4.1).
 * They travel as ISO strings "YYYY-MM-DD". Times of day are whole minutes after IST midnight.
 */
export type BusinessDate = string;

export const SHOP_TIME_ZONE = 'Asia/Kolkata';
/** IST has no daylight saving: always UTC+05:30. */
const IST_OFFSET_MINUTES = 330;
const DAY_MS = 86_400_000;

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

/** Minutes after IST midnight for an instant (0–1439). */
export function minutesOfDayIST(instant: Date): number {
  const minutes = Math.floor(instant.getTime() / 60_000) + IST_OFFSET_MINUTES;
  return ((minutes % 1440) + 1440) % 1440;
}

/** Number of days in a month. `month` is 1–12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isBusinessDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

function toDayNumber(date: BusinessDate): number {
  if (!isBusinessDate(date)) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNumber(n: number): BusinessDate {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: BusinessDate, days: number): BusinessDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: BusinessDate, b: BusinessDate): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function compareDates(a: BusinessDate, b: BusinessDate): -1 | 0 | 1 {
  const diff = toDayNumber(a) - toDayNumber(b);
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

export const minDate = (a: BusinessDate, b: BusinessDate) => (compareDates(a, b) <= 0 ? a : b);
export const maxDate = (a: BusinessDate, b: BusinessDate) => (compareDates(a, b) >= 0 ? a : b);

/** Day of week, Sunday = 0 … Saturday = 6. */
export function weekday(date: BusinessDate): number {
  // Day 0 of the epoch (1970-01-01) was a Thursday.
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

/** Every date from `from` to `to`, inclusive. Empty when `to` is before `from`. */
export function eachDay(from: BusinessDate, to: BusinessDate): BusinessDate[] {
  const start = toDayNumber(from);
  const end = toDayNumber(to);
  const out: BusinessDate[] = [];
  for (let n = start; n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

export function monthStart(year: number, month: number): BusinessDate {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function monthEnd(year: number, month: number): BusinessDate {
  return `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
}

export function monthDates(year: number, month: number): BusinessDate[] {
  return eachDay(monthStart(year, month), monthEnd(year, month));
}

export function monthOf(date: BusinessDate): { year: number; month: number } {
  toDayNumber(date); // validates
  const [y, m] = date.split('-').map(Number) as [number, number];
  return { year: y, month: m };
}
