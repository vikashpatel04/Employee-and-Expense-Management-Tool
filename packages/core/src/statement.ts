/**
 * What the shop owes one person, in two views (owner 05/11/2026; docs/features/statements.md).
 *
 *   Statement:  what is still open today. Salary left of each month, advance still to recover,
 *               expenses still open, and the total.
 *   Historical: every line from the day they joined, with a running balance.
 *
 * Both end on the same total as `moneyNow`: the ledger balance plus the salary of each month not
 * finalized yet. A month not finalized counts before advance and expenses (gross − deductions), so
 * the advance comes off once, here, and not from each month. A finalized month counts what's left
 * of its take-home, which already took its own advance cut and expenses.
 */
import { compareDates, type BusinessDate } from './dates';
import { ledgerBalance, moneyNow, type LedgerType } from './ledger';
import type { Paise } from './money';
import type { PayslipLine, PayslipLineKind } from './salary';

/** `running` = the period isn't over yet: its figure is the salary so far. */
export type StatementMonthState = 'finalized' | 'draft' | 'running';

export interface StatementMonth {
  year: number;
  month: number;
  /** The days it covers (cut to joining and leaving). */
  from: BusinessDate;
  to: BusinessDate;
  state: StatementMonthState;
  /** Finalized: the take-home. Otherwise gross − deductions (salary so far while running). */
  amount: Paise;
  /** Paid against a finalized month. */
  paid: Paise;
  lines: readonly PayslipLine[];
  payableDays: number;
  employedDays: number;
  /** The finalized payslip, which ties its ledger lines to this month. */
  payslipId?: string;
}

export interface StatementLedgerLine {
  id: string;
  date: BusinessDate;
  type: LedgerType;
  amount: Paise;
  name?: string;
  note?: string | null;
  mode?: string | null;
  reversesId?: string;
  /** For a reversal: the type of the line it undoes. */
  reverses?: LedgerType;
  /** This line has been undone by a reversal. */
  undone: boolean;
  /** For salary lines: the payslip that posted it. */
  payslipId?: string | null;
}

export interface StatementInput {
  today: BusinessDate;
  months: readonly StatementMonth[];
  /** Every ledger line, oldest first. */
  ledger: readonly StatementLedgerLine[];
  advance: Paise;
  expenseOwed: Paise;
  expenseCharged: Paise;
}

/**
 * The items making up an amount still open, oldest first. Recovery works from the oldest, so what's
 * open is the newest; the oldest of those may be only partly left.
 */
export function openItems<T extends { amount: Paise }>(
  items: readonly T[],
  open: Paise,
): (T & { left: Paise })[] {
  const out: (T & { left: Paise })[] = [];
  let remaining = open;
  for (const item of [...items].reverse()) {
    if (remaining <= 0) break;
    const left = Math.min(Math.abs(item.amount), remaining);
    out.unshift({ ...item, left });
    remaining -= left;
  }
  return out;
}

const standing = (input: StatementInput, type: LedgerType) =>
  input.ledger.filter((l) => l.type === type && !l.undone);

const notFinalized = (m: StatementMonth) => m.state !== 'finalized';

function totalNow(input: StatementInput) {
  return moneyNow({
    balance: ledgerBalance(input.ledger),
    advance: input.advance,
    expenseOwed: input.expenseOwed,
    expenseCharged: input.expenseCharged,
    unfinalized: input.months.filter(notFinalized).map((m) => m.amount),
  }).total;
}

/** What's open today. `other` is anything else on the ledger, so the sum always adds up. */
export function buildStatement(input: StatementInput) {
  const total = totalNow(input);
  const months = input.months
    .map((m) => ({ ...m, left: m.amount - m.paid }))
    .filter((m) => notFinalized(m) || m.left !== 0);
  const salaryLeft = months.reduce((a, m) => a + m.left, 0);
  const { advance, expenseOwed, expenseCharged } = input;
  return {
    total,
    salaryLeft,
    advance,
    expenseOwed,
    expenseCharged,
    other: total - salaryLeft + advance - expenseOwed + expenseCharged,
    months,
    advances: openItems(standing(input, 'advance'), advance),
    owed: openItems(standing(input, 'reimbursement'), expenseOwed),
    charged: openItems(standing(input, 'staff_charge'), expenseCharged),
  };
}

export type HistoryKind =
  | 'salary'
  | 'addition'
  | 'deduction'
  | 'late'
  | 'payment'
  | 'advance'
  | 'expense'
  | 'expense_paid'
  | 'charge'
  | 'opening'
  | 'correction'
  | 'undone';

export interface HistoryRow {
  id: string;
  date: BusinessDate;
  kind: HistoryKind;
  amount: Paise;
  balance: Paise;
  /** `final` is on the ledger; the others are figures not finalized yet. */
  state: 'final' | 'draft' | 'running';
  name?: string;
  note?: string | null;
  mode?: string | null;
  /** The month a salary row belongs to. */
  month?: StatementMonth;
  /** What an `undone` row undid. */
  reverses?: LedgerType;
}

const KIND_OF_TYPE: Record<LedgerType, HistoryKind> = {
  opening_balance: 'opening',
  salary_earned: 'salary',
  salary_payment: 'payment',
  advance: 'advance',
  advance_cut: 'correction',
  late_deduction: 'late',
  deduction: 'deduction',
  reimbursement: 'expense',
  reimbursement_paid: 'expense_paid',
  staff_charge: 'charge',
  adjustment: 'correction',
  reversal: 'undone',
};

const GROSS_KINDS: readonly PayslipLineKind[] = ['earned', 'overtime', 'allowance', 'leave_payout'];

/** Add or less entries that went into a month's gross. */
const additionsOf = (m: StatementMonth) =>
  m.lines.filter((l) => l.kind === 'allowance' && l.oneOff);

type Row = Omit<HistoryRow, 'balance'>;

/** A salary line on the ledger, with any bonus shown apart from it. */
function postedSalary(line: StatementLedgerLine, month: StatementMonth | undefined): Row[] {
  const base: Row = {
    id: line.id,
    date: line.date,
    kind: 'salary',
    amount: line.amount,
    state: 'final',
  };
  if (!month) return [base];
  const additions = additionsOf(month);
  const extra = additions.reduce((a, l) => a + l.amount, 0);
  return [
    { ...base, amount: line.amount - extra, month },
    ...additions.map((l, i): Row => ({
      id: `${line.id}:${i}`,
      date: line.date,
      kind: 'addition',
      amount: l.amount,
      state: 'final',
      name: l.name,
    })),
  ];
}

/** A month not finalized yet, as it would post: dated at its end, or today while running. */
function liveSalary(month: StatementMonth, today: BusinessDate): Row[] {
  const date = compareDates(month.to, today) > 0 ? today : month.to;
  const state = month.state === 'running' ? 'running' : 'draft';
  const id = `${month.year}-${month.month}`;
  const row = (at: string, kind: HistoryKind, amount: Paise, name?: string): Row => ({
    id: `${id}:${at}`,
    date,
    kind,
    amount,
    state,
    ...(name === undefined ? {} : { name }),
  });
  const additions = additionsOf(month);
  const gross = month.lines
    .filter((l) => GROSS_KINDS.includes(l.kind))
    .reduce((a, l) => a + l.amount, 0);
  const extra = additions.reduce((a, l) => a + l.amount, 0);
  return [
    { ...row('salary', 'salary', gross - extra), month },
    ...additions.map((l, i) => row(`add${i}`, 'addition', l.amount, l.name)),
    ...month.lines.flatMap((l, i) =>
      l.kind === 'deduction'
        ? [row(`less${i}`, 'deduction', -l.amount, l.name)]
        : l.kind === 'late_deduction'
          ? [row(`late${i}`, 'late', -l.amount)]
          : [],
    ),
  ];
}

/** Every line since joining, with the balance after each and how it all adds up. */
export function buildHistory(input: StatementInput) {
  const byPayslip = new Map(input.months.map((m) => [m.payslipId, m]));
  const posted = input.ledger.flatMap((l): Row[] =>
    l.type === 'salary_earned'
      ? postedSalary(l, l.payslipId ? byPayslip.get(l.payslipId) : undefined)
      : [
          {
            id: l.id,
            date: l.date,
            kind: KIND_OF_TYPE[l.type],
            amount: l.amount,
            state: 'final',
            ...(l.name === undefined ? {} : { name: l.name }),
            note: l.note,
            mode: l.mode,
            ...(l.reverses === undefined ? {} : { reverses: l.reverses }),
          },
        ],
  );
  const live = input.months.filter(notFinalized).flatMap((m) => liveSalary(m, input.today));

  let balance = 0;
  const rows: HistoryRow[] = [...posted, ...live]
    .map((row, i) => ({ row, i }))
    .sort((a, b) => compareDates(a.row.date, b.row.date) || a.i - b.i)
    .map(({ row }) => ({ ...row, balance: (balance += row.amount) }));

  const summary = {
    earned: 0,
    additions: 0,
    expenses: 0,
    deductions: 0,
    paid: 0,
    advances: 0,
    other: 0,
  };
  const groupOf = (kind: HistoryKind): keyof typeof summary => {
    switch (kind) {
      case 'salary':
        return 'earned';
      case 'addition':
        return 'additions';
      case 'expense':
      case 'expense_paid':
      case 'charge':
        return 'expenses';
      case 'deduction':
      case 'late':
        return 'deductions';
      case 'payment':
        return 'paid';
      case 'advance':
        return 'advances';
      default:
        return 'other';
    }
  };
  for (const r of rows) {
    // An undone line counts with what it undid, so the two cancel out in their group.
    const kind = r.kind === 'undone' && r.reverses ? KIND_OF_TYPE[r.reverses] : r.kind;
    summary[groupOf(kind)] += r.amount;
  }
  return { total: totalNow(input), rows, summary };
}
