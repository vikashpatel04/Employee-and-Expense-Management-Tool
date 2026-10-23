import { describe, expect, it } from 'vitest';
import {
  defaultChargedTo,
  expenseLedgerLines,
  expenseTotals,
  validateExpense,
  type Expense,
} from './expenses';

const base: Expense = {
  date: '2026-10-23',
  amount: 45_000,
  categoryId: 'tea',
  paymentMode: 'cash',
  paidBy: { kind: 'shop_cash' },
  chargedTo: { kind: 'shop' },
  reimburse: false,
};

describe('defaultChargedTo', () => {
  it('amounts below the small-expense limit default to Not tracked', () => {
    expect(defaultChargedTo(900, 1_000)).toBe('not_tracked');
    expect(defaultChargedTo(1_000, 1_000)).toBe('shop');
    expect(defaultChargedTo(900, undefined)).toBe('shop');
  });
});

describe('expenseLedgerLines', () => {
  it('a shop expense paid from shop cash touches no staff ledger', () => {
    expect(expenseLedgerLines(base)).toEqual([]);
  });

  it('charged to a staff member adds a staff charge (they owe the shop)', () => {
    expect(expenseLedgerLines({ ...base, chargedTo: { kind: 'staff', staffId: 's1' } })).toEqual([
      { staffId: 's1', draft: { date: '2026-10-23', type: 'staff_charge', amount: -45_000 } },
    ]);
  });

  it('paid by staff from their pocket and marked reimburse adds a reimbursement (shop owes them)', () => {
    expect(
      expenseLedgerLines({ ...base, paidBy: { kind: 'staff', staffId: 's2' }, reimburse: true }),
    ).toEqual([
      { staffId: 's2', draft: { date: '2026-10-23', type: 'reimbursement', amount: 45_000 } },
    ]);
  });

  it('paid by staff without reimburse adds nothing', () => {
    expect(expenseLedgerLines({ ...base, paidBy: { kind: 'staff', staffId: 's2' } })).toEqual([]);
  });

  it('both can apply to the same expense', () => {
    const lines = expenseLedgerLines({
      ...base,
      paidBy: { kind: 'staff', staffId: 's2' },
      reimburse: true,
      chargedTo: { kind: 'staff', staffId: 's1' },
    });
    expect(lines.map((l) => [l.staffId, l.draft.type])).toEqual([
      ['s1', 'staff_charge'],
      ['s2', 'reimbursement'],
    ]);
  });
});

describe('validateExpense', () => {
  it('reports what is wrong', () => {
    expect(validateExpense(base)).toEqual([]);
    expect(
      validateExpense({
        ...base,
        amount: 0,
        chargedTo: { kind: 'staff' },
        reimburse: true,
      }),
    ).toEqual([
      'amount must be more than zero',
      'chargedTo staff needs a staff member',
      'reimburse is only for expenses a staff member paid',
    ]);
  });
});

describe('expenseTotals', () => {
  it('counts only shop-charged expenses, by category', () => {
    const totals = expenseTotals([
      base,
      { ...base, amount: 20_000 },
      { ...base, categoryId: 'transport', amount: 150_000 },
      { ...base, amount: 500, chargedTo: { kind: 'not_tracked' } },
      { ...base, amount: 99_900, chargedTo: { kind: 'staff', staffId: 's1' } },
    ]);
    expect(totals).toEqual({
      total: 215_000,
      byCategory: { tea: 65_000, transport: 150_000 },
      notTracked: 500,
      chargedToStaff: 99_900,
    });
  });
});
