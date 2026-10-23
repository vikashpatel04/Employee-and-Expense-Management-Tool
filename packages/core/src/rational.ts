/**
 * Exact fractions on BigInt, for money that must be rounded only once per payslip line
 * (docs/PLAN.md §4.1). Values are paise unless stated otherwise.
 */
export type Rat = { readonly n: bigint; readonly d: bigint };

const big = (v: number | bigint): bigint => {
  if (typeof v === 'bigint') return v;
  if (!Number.isSafeInteger(v)) throw new TypeError(`Expected a safe integer, got ${v}`);
  return BigInt(v);
};

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};

export function rat(n: number | bigint, d: number | bigint = 1): Rat {
  let nn = big(n);
  let dd = big(d);
  if (dd === 0n) throw new RangeError('Denominator is zero');
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  const g = gcd(nn, dd) || 1n;
  return { n: nn / g, d: dd / g };
}

export const ZERO: Rat = rat(0);

export const ratAdd = (a: Rat, b: Rat): Rat => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const ratSub = (a: Rat, b: Rat): Rat => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const ratMul = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d);
export const ratSum = (xs: readonly Rat[]): Rat => xs.reduce(ratAdd, ZERO);

export function ratCompare(a: Rat, b: Rat): -1 | 0 | 1 {
  const diff = a.n * b.d - b.n * a.d;
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

export const ratMin = (a: Rat, b: Rat): Rat => (ratCompare(a, b) <= 0 ? a : b);

/** Round a paise amount to whole rupees, half-up (away from zero), and return paise. */
export function ratToRupeePaise(r: Rat): number {
  const negative = r.n < 0n;
  const abs = negative ? -r.n : r.n;
  const rupees = (abs + 50n * r.d) / (100n * r.d);
  const paise = Number(rupees * 100n);
  return negative ? -paise : paise;
}
