/**
 * Money is always integer paise (1 rupee = 100 paise). Never floats.
 * See docs/PLAN.md §4.1.
 */
export type Paise = number;

export function assertPaise(value: number): asserts value is Paise {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Money must be an integer number of paise, got ${value}`);
  }
}

/** Convert a rupee amount typed by a person (e.g. 19.99) to paise. */
export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

/** Round paise to the nearest whole rupee, half-up (away from zero for negatives). */
export function roundToRupee(paise: Paise): Paise {
  assertPaise(paise);
  const sign = paise < 0 ? -1 : 1;
  const abs = Math.abs(paise);
  return sign * Math.floor((abs + 50) / 100) * 100;
}

/** Format paise as ₹ with Indian digit grouping, e.g. 12500000 → "₹1,25,000.00". */
export function formatINR(
  paise: Paise,
  opts: { symbol?: boolean; decimals?: boolean } = {},
): string {
  assertPaise(paise);
  const { symbol = true, decimals = true } = opts;
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100).toString();
  const fraction = (abs % 100).toString().padStart(2, '0');

  const last3 = rupees.slice(-3);
  const rest = rupees.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;

  const body = decimals ? `${grouped}.${fraction}` : grouped;
  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${body}`;
}
