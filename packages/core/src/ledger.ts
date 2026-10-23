/**
 * Staff ledger (docs/PLAN.md §4.7). One line per money event.
 * Sign: POSITIVE = the shop owes the staff member; negative = the staff member owes the shop.
 * Balance is the sum of lines and is never stored. Lines are never edited or deleted:
 * mistakes are fixed with a `reversal` (undo) or an `adjustment` (re-run).
 */
import { compareDates, type BusinessDate } from './dates';
import { assertPaise, type Paise } from './money';
import type { PayslipLine } from './salary';

export const LEDGER_TYPES = [
  'opening_balance',
  'salary_earned',
  'salary_payment',
  'advance',
  'advance_cut',
  'late_deduction',
  'deduction',
  'reimbursement',
  'staff_charge',
  'adjustment',
  'reversal',
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

/** A line to be written. */
export interface LedgerDraft {
  date: BusinessDate;
  type: LedgerType;
  amount: Paise;
  /** Allowance/deduction name, where relevant. */
  name?: string;
  /** For `reversal`: the line it undoes. */
  reversesId?: string;
  /** For `adjustment` from a re-run: the line type it corrects. */
  adjusts?: LedgerType;
}

/** A stored line. */
export interface LedgerLine extends LedgerDraft {
  id: string;
}

export function ledgerBalance(lines: readonly { amount: Paise }[]): Paise {
  return lines.reduce((sum, l) => sum + l.amount, 0);
}

/** Lines in date order (stable for same-day lines) with the balance after each. */
export function runningBalances<T extends LedgerLine>(
  lines: readonly T[],
): (T & { balance: Paise })[] {
  let balance = 0;
  return lines
    .map((line, i) => ({ line, i }))
    .sort((a, b) => compareDates(a.line.date, b.line.date) || a.i - b.i)
    .map(({ line }) => ({ ...line, balance: (balance += line.amount) }));
}

/** The reversal that undoes `line` (how "undo payment" works). */
export function reversalOf(
  line: LedgerLine,
  existing: readonly LedgerLine[],
  date: BusinessDate,
): LedgerDraft {
  if (line.type === 'reversal') {
    throw new Error("A reversal can't be reversed; add an adjustment instead");
  }
  if (existing.some((l) => l.type === 'reversal' && l.reversesId === line.id)) {
    throw new Error('This line is already reversed');
  }
  return { date, type: 'reversal', amount: -line.amount, reversesId: line.id };
}

/**
 * Lines a finalized payslip writes: gross as `salary_earned`, each deduction and the late
 * deduction as negatives. The advance cut is NOT a ledger line: the advance is already on the
 * ledger, and the smaller salary payment recovers it (see docs/DECISIONS.md).
 */
export function payslipLedgerLines(
  payslip: { gross: Paise; lines: readonly PayslipLine[] },
  date: BusinessDate,
): LedgerDraft[] {
  const out: LedgerDraft[] = [];
  if (payslip.gross !== 0) out.push({ date, type: 'salary_earned', amount: payslip.gross });
  for (const l of payslip.lines) {
    if (l.kind === 'deduction')
      out.push({ date, type: 'deduction', amount: -l.amount, name: l.name });
    if (l.kind === 'late_deduction') out.push({ date, type: 'late_deduction', amount: -l.amount });
  }
  return out;
}

const positive = (amount: Paise, what: string) => {
  assertPaise(amount);
  if (amount <= 0) throw new RangeError(`${what} must be more than zero`);
};

export function salaryPaymentLine(amount: Paise, date: BusinessDate): LedgerDraft {
  positive(amount, 'Payment');
  return { date, type: 'salary_payment', amount: -amount };
}

export function advanceLine(amount: Paise, date: BusinessDate): LedgerDraft {
  positive(amount, 'Advance');
  return { date, type: 'advance', amount: -amount };
}

/**
 * Re-running a finalized month: compare what was posted with the new payslip's lines and
 * write `adjustment` lines for the differences (old lines are never edited).
 */
export function rerunAdjustments(
  previous: readonly LedgerDraft[],
  next: readonly LedgerDraft[],
  date: BusinessDate,
): LedgerDraft[] {
  const key = (l: LedgerDraft) => `${l.type}\u0000${l.name ?? ''}`;
  const totals = new Map<
    string,
    { type: LedgerType; name?: string; before: number; after: number }
  >();
  const add = (l: LedgerDraft, side: 'before' | 'after') => {
    const k = key(l);
    const t = totals.get(k) ?? { type: l.type, name: l.name, before: 0, after: 0 };
    t[side] += l.amount;
    totals.set(k, t);
  };
  previous.forEach((l) => add(l, 'before'));
  next.forEach((l) => add(l, 'after'));

  const out: LedgerDraft[] = [];
  for (const t of totals.values()) {
    const delta = t.after - t.before;
    if (delta === 0) continue;
    const draft: LedgerDraft = { date, type: 'adjustment', amount: delta, adjusts: t.type };
    out.push(t.name ? { ...draft, name: t.name } : draft);
  }
  return out;
}

/** Advance still to recover: given − cut from salaries − repaid in cash. Never negative. */
export function outstandingAdvance(input: {
  given: readonly Paise[];
  cut: readonly Paise[];
  repaid?: readonly Paise[];
}): Paise {
  const sum = (xs: readonly Paise[]) => xs.reduce((a, b) => a + b, 0);
  return Math.max(0, sum(input.given) - sum(input.cut) - sum(input.repaid ?? []));
}

/** Giving an advance: crossing the person's limit needs an alert and confirmation. */
export function checkAdvance(input: { outstanding: Paise; amount: Paise; limit?: Paise }): {
  newOutstanding: Paise;
  crossesLimit: boolean;
} {
  positive(input.amount, 'Advance');
  const newOutstanding = input.outstanding + input.amount;
  return {
    newOutstanding,
    crossesLimit: input.limit !== undefined && newOutstanding > input.limit,
  };
}
