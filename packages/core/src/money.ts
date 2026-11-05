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

/** The words a number is spelled with (packages/i18n `payslip.words`). */
export interface NumberWords {
  /** 0–19. */
  ones: readonly string[];
  /** By tens digit: index 2 is 20, 9 is 90. */
  tens: readonly string[];
  hundred: string;
  thousand: string;
  lakh: string;
  crore: string;
}

/** A whole number in words with Indian grouping: 125000 → "One Lakh Twenty Five Thousand". */
export function numberInWords(n: number, w: NumberWords): string {
  if (n === 0) return w.ones[0]!;
  const small = (x: number) =>
    x < 20
      ? w.ones[x]!
      : [w.tens[Math.floor(x / 10)]!, ...(x % 10 ? [w.ones[x % 10]!] : [])].join(' ');
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const hundred = Math.floor((n % 1_000) / 100);
  const rest = n % 100;
  return [
    ...(crore ? [`${numberInWords(crore, w)} ${w.crore}`] : []),
    ...(lakh ? [`${small(lakh)} ${w.lakh}`] : []),
    ...(thousand ? [`${small(thousand)} ${w.thousand}`] : []),
    ...(hundred ? [`${w.ones[hundred]!} ${w.hundred}`] : []),
    ...(rest ? [small(rest)] : []),
  ].join(' ');
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

/**
 * Parse an amount someone typed ("22,000", "₹1,25,000.50", "1250.5") into paise, exactly:
 * digits are read as text, never through a float. Null for anything that isn't a plain
 * non-negative amount with at most 2 decimals.
 */
export function parseRupees(text: string): Paise | null {
  const s = text.trim().replace(/^₹\s*/, '').replace(/,/g, '');
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) return null;
  const paise = Number(m[1] || '0') * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** Paise as plain text for an input field ("125000.50"; whole rupees without decimals). */
export function paiseToInput(paise: Paise): string {
  assertPaise(paise);
  const rupees = Math.trunc(paise / 100);
  const rest = Math.abs(paise % 100);
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, '0')}`;
}
