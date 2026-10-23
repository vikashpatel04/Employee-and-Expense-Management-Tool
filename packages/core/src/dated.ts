import { addDays, compareDates, maxDate, type BusinessDate } from './dates';

/**
 * Anything that changes over time and must recalculate old months with the version that applied
 * then: pay settings, leave template versions, template assignments (docs/PLAN.md §4.2, §4.6).
 */
export interface Dated {
  readonly effectiveFrom: BusinessDate;
}

function sorted<T extends Dated>(items: readonly T[]): T[] {
  const out = [...items].sort((a, b) => compareDates(a.effectiveFrom, b.effectiveFrom));
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.effectiveFrom === out[i - 1]!.effectiveFrom) {
      throw new Error(`Two versions start on the same date (${out[i]!.effectiveFrom})`);
    }
  }
  return out;
}

/** The version in effect on `date`: the latest one starting on or before it. */
export function effectiveOn<T extends Dated>(
  items: readonly T[],
  date: BusinessDate,
): T | undefined {
  let found: T | undefined;
  for (const item of sorted(items)) {
    if (compareDates(item.effectiveFrom, date) <= 0) found = item;
    else break;
  }
  return found;
}

export interface Segment<T> {
  from: BusinessDate;
  to: BusinessDate;
  item: T;
}

/** Split `from`–`to` (inclusive) into runs that share one version. Days with none are left out. */
export function segments<T extends Dated>(
  items: readonly T[],
  from: BusinessDate,
  to: BusinessDate,
): Segment<T>[] {
  const list = sorted(items);
  const out: Segment<T>[] = [];
  list.forEach((item, i) => {
    const next = list[i + 1];
    const segFrom = maxDate(item.effectiveFrom, from);
    const segTo = next ? addDays(next.effectiveFrom, -1) : to;
    const end = compareDates(segTo, to) < 0 ? segTo : to;
    if (compareDates(segFrom, end) <= 0) out.push({ from: segFrom, to: end, item });
  });
  return out;
}
