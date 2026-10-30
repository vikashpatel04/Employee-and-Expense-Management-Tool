import { describe, expect, it } from 'vitest';
import {
  advanceLine,
  moneyNow,
  checkAdvance,
  ledgerBalance,
  outstandingAdvance,
  payslipLedgerLines,
  rerunAdjustments,
  reversalOf,
  runningBalances,
  salaryPaymentLine,
  type LedgerLine,
} from './ledger';

const L = (
  id: string,
  date: string,
  type: LedgerLine['type'],
  amount: number,
  extra: Partial<LedgerLine> = {},
): LedgerLine => ({
  id,
  date,
  type,
  amount,
  ...extra,
});

describe('balance', () => {
  it('is the sum of lines; positive means the shop owes the staff member', () => {
    const lines = [
      L('1', '2026-10-01', 'opening_balance', 50_000),
      L('2', '2026-10-05', 'advance', -500_000),
      L('3', '2026-10-31', 'salary_earned', 3_000_000),
    ];
    expect(ledgerBalance(lines)).toBe(2_550_000);
  });

  it('running balance follows date order, then entry order', () => {
    const lines = [
      L('b', '2026-10-31', 'salary_earned', 3_000_000),
      L('a', '2026-10-05', 'advance', -500_000),
      L('c', '2026-10-31', 'salary_payment', -2_500_000),
    ];
    expect(runningBalances(lines).map((x) => [x.id, x.balance])).toEqual([
      ['a', -500_000],
      ['b', 2_500_000],
      ['c', 0],
    ]);
  });
});

describe('reversals (lines are never edited or deleted)', () => {
  const payment = L('p1', '2026-10-31', 'salary_payment', -2_500_000);

  it('undo payment writes a reversal of the opposite amount', () => {
    expect(reversalOf(payment, [payment], '2026-11-01')).toEqual({
      date: '2026-11-01',
      type: 'reversal',
      amount: 2_500_000,
      reversesId: 'p1',
    });
  });

  it('a line can be reversed only once', () => {
    const rev = L('r1', '2026-11-01', 'reversal', 2_500_000, { reversesId: 'p1' });
    expect(() => reversalOf(payment, [payment, rev], '2026-11-02')).toThrow(/already reversed/);
  });

  it('a reversal itself cannot be reversed', () => {
    const rev = L('r1', '2026-11-01', 'reversal', 2_500_000, { reversesId: 'p1' });
    expect(() => reversalOf(rev, [payment, rev], '2026-11-02')).toThrow(/adjustment/);
  });
});

describe('payslip → ledger lines', () => {
  it('posts gross as earned and each deduction as its own line; the advance cut is not a ledger line', () => {
    const drafts = payslipLedgerLines(
      {
        gross: 3_100_000,
        lines: [
          { kind: 'earned', amount: 3_000_000 },
          { kind: 'allowance', name: 'Food', amount: 100_000 },
          { kind: 'deduction', name: 'PF', amount: 180_000 },
          { kind: 'late_deduction', amount: 4_400 },
          { kind: 'advance_cut', amount: 500_000 },
        ],
      },
      '2026-10-31',
    );
    expect(drafts).toEqual([
      { date: '2026-10-31', type: 'salary_earned', amount: 3_100_000 },
      { date: '2026-10-31', type: 'deduction', amount: -180_000, name: 'PF' },
      { date: '2026-10-31', type: 'late_deduction', amount: -4_400 },
    ]);
  });

  it('advance given, salary with an advance cut, then payment leaves exactly the uncut advance owed', () => {
    const advance = advanceLine(1_000_000, '2026-10-05');
    const salary = payslipLedgerLines(
      { gross: 3_000_000, lines: [{ kind: 'earned', amount: 3_000_000 }] },
      '2026-10-31',
    );
    // net pay = 30,000 − 4,000 cut
    const pay = salaryPaymentLine(2_600_000, '2026-10-31');
    expect(ledgerBalance([advance, ...salary, pay])).toBe(-600_000);
  });
});

describe('re-running a finalized month', () => {
  it('writes adjustment lines for the differences only', () => {
    const before = [
      { date: '2026-10-31', type: 'salary_earned' as const, amount: 3_000_000 },
      { date: '2026-10-31', type: 'late_deduction' as const, amount: -4_400 },
    ];
    const after = [
      { date: '2026-10-31', type: 'salary_earned' as const, amount: 2_903_200 },
      { date: '2026-10-31', type: 'deduction' as const, amount: -180_000, name: 'PF' },
    ];
    expect(rerunAdjustments(before, after, '2026-11-03')).toEqual([
      { date: '2026-11-03', type: 'adjustment', amount: -96_800, adjusts: 'salary_earned' },
      { date: '2026-11-03', type: 'adjustment', amount: 4_400, adjusts: 'late_deduction' },
      {
        date: '2026-11-03',
        type: 'adjustment',
        amount: -180_000,
        adjusts: 'deduction',
        name: 'PF',
      },
    ]);
  });

  it('writes nothing when nothing changed', () => {
    const same = [{ date: '2026-10-31', type: 'salary_earned' as const, amount: 3_000_000 }];
    expect(rerunAdjustments(same, same, '2026-11-03')).toEqual([]);
  });
});

describe('advances', () => {
  it('outstanding = given − cut − repaid, never below zero', () => {
    expect(
      outstandingAdvance({ given: [1_000_000, 500_000], cut: [400_000], repaid: [100_000] }),
    ).toBe(1_000_000);
    expect(outstandingAdvance({ given: [100_000], cut: [200_000] })).toBe(0);
  });

  it('flags crossing the per-person limit (needs confirmation)', () => {
    expect(checkAdvance({ outstanding: 800_000, amount: 300_000, limit: 1_000_000 })).toEqual({
      newOutstanding: 1_100_000,
      crossesLimit: true,
    });
    expect(
      checkAdvance({ outstanding: 700_000, amount: 300_000, limit: 1_000_000 }).crossesLimit,
    ).toBe(false);
    expect(checkAdvance({ outstanding: 0, amount: 5_000_000 }).crossesLimit).toBe(false);
  });

  it('rejects zero or negative amounts', () => {
    expect(() => advanceLine(0, '2026-10-01')).toThrow();
    expect(() => checkAdvance({ outstanding: 0, amount: -1 })).toThrow();
  });
});

describe('moneyNow (Staffora Money, owner 30/10/2026)', () => {
  it('salary so far, less the advance, plus expenses to get back, less expenses charged', () => {
    // Ledger: advance 3,000 given, 500 reimbursement, 200 charged → balance −2,700.
    const m = moneyNow({
      balance: -270000,
      advance: 300000,
      expenseOwed: 50000,
      expenseCharged: 20000,
      unfinalized: [1500000],
    });
    expect(m).toEqual({
      total: 1230000,
      salarySoFar: 1500000,
      finalizedDue: 0,
      advance: 300000,
      expenseOwed: 50000,
      expenseCharged: 20000,
    });
  });

  it('finalized salary not paid yet is what the ledger holds beyond advances and expenses', () => {
    // October finalized: 15,000 net before advance; 3,000 advance outstanding; nothing paid.
    const m = moneyNow({
      balance: 1200000,
      advance: 300000,
      expenseOwed: 0,
      expenseCharged: 0,
      unfinalized: [100000],
    });
    expect(m.finalizedDue).toBe(1500000);
    expect(m.total).toBe(1300000);
  });

  it('paid in full with nothing running shows 0', () => {
    expect(
      moneyNow({ balance: 0, advance: 0, expenseOwed: 0, expenseCharged: 0, unfinalized: [] })
        .total,
    ).toBe(0);
  });

  it('several months not finalized add up', () => {
    const m = moneyNow({
      balance: 0,
      advance: 0,
      expenseOwed: 0,
      expenseCharged: 0,
      unfinalized: [1000000, 200000],
    });
    expect(m.salarySoFar).toBe(1200000);
    expect(m.total).toBe(1200000);
  });
});
