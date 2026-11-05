import { describe, expect, it } from 'vitest';
import type { PayslipLine } from './salary';
import {
  buildHistory,
  buildStatement,
  openItems,
  type StatementInput,
  type StatementLedgerLine,
  type StatementMonth,
} from './statement';

const R = 100;
let nextId = 0;
const line = (
  date: string,
  type: StatementLedgerLine['type'],
  amount: number,
  more: Partial<StatementLedgerLine> = {},
): StatementLedgerLine => ({ id: `l${++nextId}`, date, type, amount, undone: false, ...more });

const month = (over: Partial<StatementMonth> & { month: number }): StatementMonth => ({
  year: 2026,
  from: '2026-09-16',
  to: '2026-10-15',
  state: 'draft',
  amount: 0,
  paid: 0,
  lines: [],
  payableDays: 30,
  employedDays: 30,
  ...over,
});

const sepLines: PayslipLine[] = [
  { kind: 'earned', amount: 14516 * R },
  { kind: 'late_deduction', amount: 100 * R },
  { kind: 'expense_payback', amount: 450 * R },
  { kind: 'advance_cut', amount: 1500 * R },
];
const octLines: PayslipLine[] = [
  { kind: 'earned', amount: 15000 * R },
  { kind: 'allowance', name: 'Festival bonus', amount: 1000 * R, oneOff: true },
  { kind: 'deduction', name: 'Uniform', amount: 250 * R, oneOff: true },
];
const novLines: PayslipLine[] = [{ kind: 'earned', amount: 9677 * R }];

/** The approved sample (docs/DESIGN.md): every figure in it comes back from here. */
const sample: StatementInput = {
  today: '2026-11-05',
  advance: 4000 * R,
  expenseOwed: 120 * R,
  expenseCharged: 0,
  months: [
    month({
      month: 8,
      from: '2026-07-16',
      to: '2026-08-15',
      state: 'finalized',
      amount: 13000 * R,
      paid: 13000 * R,
      lines: [
        { kind: 'earned', amount: 15000 * R },
        { kind: 'advance_cut', amount: 2000 * R },
      ],
      payslipId: 'aug',
    }),
    month({
      month: 9,
      from: '2026-08-16',
      to: '2026-09-15',
      state: 'finalized',
      amount: 13366 * R,
      paid: 8000 * R,
      lines: sepLines,
      payslipId: 'sep',
    }),
    month({ month: 10, state: 'draft', amount: 15750 * R, lines: octLines }),
    month({
      month: 11,
      from: '2026-10-16',
      to: '2026-11-15',
      state: 'running',
      amount: 9677 * R,
      lines: novLines,
      payableDays: 20,
      employedDays: 31,
    }),
  ],
  ledger: [
    line('2026-07-28', 'advance', -2000 * R),
    line('2026-08-15', 'salary_earned', 15000 * R, { payslipId: 'aug' }),
    line('2026-08-16', 'salary_payment', -13000 * R),
    line('2026-08-30', 'advance', -1500 * R),
    line('2026-09-05', 'reimbursement', 450 * R, { note: 'Tea and snacks' }),
    line('2026-09-15', 'salary_earned', 14516 * R, { payslipId: 'sep' }),
    line('2026-09-15', 'late_deduction', -100 * R),
    line('2026-09-16', 'salary_payment', -8000 * R),
    line('2026-09-25', 'advance', -3000 * R),
    line('2026-10-20', 'advance', -1000 * R),
    line('2026-10-28', 'reimbursement', 120 * R, { note: 'Courier' }),
  ],
};

describe('openItems', () => {
  const items = [
    { date: '2026-07-28', amount: 2000 },
    { date: '2026-08-30', amount: 1500 },
    { date: '2026-09-25', amount: 3000 },
    { date: '2026-10-20', amount: 1000 },
  ];

  it('oldest is recovered first, so what is open is the newest', () => {
    expect(openItems(items, 4000).map((i) => [i.date, i.left])).toEqual([
      ['2026-09-25', 3000],
      ['2026-10-20', 1000],
    ]);
  });

  it('shows what is left of a part-recovered item', () => {
    expect(openItems(items, 2500).map((i) => [i.date, i.left])).toEqual([
      ['2026-09-25', 1500],
      ['2026-10-20', 1000],
    ]);
  });

  it('nothing open, nothing listed', () => {
    expect(openItems(items, 0)).toEqual([]);
  });
});

describe('buildStatement', () => {
  it('ends on the sample figures', () => {
    const s = buildStatement(sample);
    expect(s.total).toBe(26913 * R);
    expect(s.salaryLeft).toBe(30793 * R);
    expect(s.advance).toBe(4000 * R);
    expect(s.expenseOwed).toBe(120 * R);
    expect(s.other).toBe(0);
  });

  it('lists months with money left, and every month not finalized', () => {
    const s = buildStatement(sample);
    expect(s.months.map((m) => [m.month, m.state, m.left])).toEqual([
      [9, 'finalized', 5366 * R],
      [10, 'draft', 15750 * R],
      [11, 'running', 9677 * R],
    ]);
  });

  it('lists the advances and expenses still open', () => {
    const s = buildStatement(sample);
    expect(s.advances.map((a) => [a.date, a.left])).toEqual([
      ['2026-09-25', 3000 * R],
      ['2026-10-20', 1000 * R],
    ]);
    expect(s.owed.map((e) => [e.note, e.left])).toEqual([['Courier', 120 * R]]);
    expect(s.charged).toEqual([]);
  });

  it('leaves out an advance that was undone', () => {
    const undone = line('2026-10-21', 'advance', -500 * R, { undone: true });
    const back = line('2026-10-22', 'reversal', 500 * R, {
      reversesId: undone.id,
      reverses: 'advance',
    });
    const s = buildStatement({ ...sample, ledger: [...sample.ledger, undone, back] });
    expect(s.total).toBe(26913 * R);
    expect(s.advances.some((a) => a.id === undone.id)).toBe(false);
  });

  it('expenses charged to them come off', () => {
    const s = buildStatement({
      ...sample,
      expenseCharged: 80 * R,
      ledger: [...sample.ledger, line('2026-11-01', 'staff_charge', -80 * R, { note: 'Breakage' })],
    });
    expect(s.total).toBe(26833 * R);
    expect(s.charged.map((c) => c.left)).toEqual([80 * R]);
    expect(s.other).toBe(0);
  });

  it('shows anything else on the ledger, so the sum always adds up', () => {
    const s = buildStatement({
      ...sample,
      ledger: [line('2026-07-16', 'opening_balance', 1000 * R), ...sample.ledger],
    });
    expect(s.total).toBe(27913 * R);
    expect(s.other).toBe(1000 * R);
    expect(s.salaryLeft - s.advance + s.expenseOwed - s.expenseCharged + s.other).toBe(s.total);
  });

  it('can end with them owing the shop', () => {
    const s = buildStatement({
      today: '2026-11-05',
      advance: 500 * R,
      expenseOwed: 0,
      expenseCharged: 0,
      months: [],
      ledger: [line('2026-11-01', 'advance', -500 * R)],
    });
    expect(s.total).toBe(-500 * R);
    expect(s.salaryLeft).toBe(0);
  });
});

describe('buildHistory', () => {
  it('ends on the same total as the statement', () => {
    const h = buildHistory(sample);
    expect(h.rows.at(-1)?.balance).toBe(26913 * R);
    expect(h.total).toBe(buildStatement(sample).total);
  });

  it('adds up to the sample summary', () => {
    expect(buildHistory(sample).summary).toEqual({
      earned: 54193 * R,
      additions: 1000 * R,
      expenses: 570 * R,
      deductions: -350 * R,
      paid: -21000 * R,
      advances: -7500 * R,
      other: 0,
    });
  });

  it('keeps dates in order, with each month not finalized at the end of its days', () => {
    const rows = buildHistory(sample).rows;
    const dates = rows.map((r) => r.date);
    expect(dates).toEqual([...dates].sort());
    expect(rows.find((r) => r.name === 'Festival bonus')).toMatchObject({
      date: '2026-10-15',
      kind: 'addition',
      state: 'draft',
      amount: 1000 * R,
    });
    expect(rows.at(-1)).toMatchObject({ date: '2026-11-05', kind: 'salary', state: 'running' });
  });

  it('splits a bonus out of a finalized salary line', () => {
    const input: StatementInput = {
      today: '2026-11-05',
      advance: 0,
      expenseOwed: 0,
      expenseCharged: 0,
      months: [
        month({
          month: 10,
          state: 'finalized',
          amount: 15750 * R,
          lines: octLines,
          payslipId: 'oct',
        }),
      ],
      ledger: [
        line('2026-10-15', 'salary_earned', 16000 * R, { payslipId: 'oct' }),
        line('2026-10-15', 'deduction', -250 * R, { name: 'Uniform' }),
      ],
    };
    const h = buildHistory(input);
    expect(h.rows.map((r) => [r.kind, r.name, r.amount, r.balance])).toEqual([
      ['salary', undefined, 15000 * R, 15000 * R],
      ['addition', 'Festival bonus', 1000 * R, 16000 * R],
      ['deduction', 'Uniform', -250 * R, 15750 * R],
    ]);
    expect(h.summary.additions).toBe(1000 * R);
  });

  it('counts an undone line with what it undid, and the balance stays right', () => {
    const paid = line('2026-11-01', 'salary_payment', -1000 * R, { undone: true });
    const back = line('2026-11-02', 'reversal', 1000 * R, {
      reversesId: paid.id,
      reverses: 'salary_payment',
    });
    const h = buildHistory({ ...sample, ledger: [...sample.ledger, paid, back] });
    expect(h.total).toBe(26913 * R);
    expect(h.summary.paid).toBe(-21000 * R);
  });

  it('opening balance and corrections are shown as other', () => {
    const h = buildHistory({
      ...sample,
      ledger: [line('2026-07-16', 'opening_balance', 1000 * R), ...sample.ledger],
    });
    expect(h.summary.other).toBe(1000 * R);
    expect(h.rows[0]).toMatchObject({ kind: 'opening', amount: 1000 * R, balance: 1000 * R });
  });
});
