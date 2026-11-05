import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createI18n } from '../../packages/i18n/src/index';
import { buildHistory, buildStatement, type StatementInput } from '../../packages/core/src/index';
import {
  historyByMonth,
  historyRowText,
  statementDocumentHtml,
  statementFileName,
  statementHeadline,
  statementPrintHtml,
  statementShareText,
} from '../../packages/data/src/statement-document';
import type { StatementView } from '../../packages/data/src/statement';

/**
 * The statement page and text, from the approved sample's figures (docs/features/statements.md).
 * Set STATEMENT_OUT to a folder to also write the pages, to look at them or print them.
 */
const i18n = createI18n('en');
const t = ((key: string, options?: Record<string, unknown>) =>
  i18n.t(key, options as never)) as unknown as Parameters<typeof statementDocumentHtml>[2];
const months = i18n.t('months.long', { returnObjects: true }) as unknown as string[];

const R = 100;
const input: StatementInput = {
  today: '2026-11-05',
  advance: 4000 * R,
  expenseOwed: 120 * R,
  expenseCharged: 0,
  months: [
    {
      year: 2026,
      month: 9,
      from: '2026-08-16',
      to: '2026-09-15',
      state: 'finalized',
      amount: 13366 * R,
      paid: 8000 * R,
      lines: [
        { kind: 'earned', amount: 14516 * R },
        { kind: 'late_deduction', amount: 100 * R },
        { kind: 'expense_payback', amount: 450 * R },
        { kind: 'advance_cut', amount: 1500 * R },
      ],
      payableDays: 30,
      employedDays: 31,
      payslipId: 'sep',
    },
    {
      year: 2026,
      month: 10,
      from: '2026-09-16',
      to: '2026-10-15',
      state: 'draft',
      amount: 15750 * R,
      paid: 0,
      lines: [
        { kind: 'earned', amount: 15000 * R },
        { kind: 'allowance', name: 'Festival bonus', amount: 1000 * R, oneOff: true },
        { kind: 'deduction', name: 'Uniform', amount: 250 * R, oneOff: true },
      ],
      payableDays: 30,
      employedDays: 30,
    },
    {
      year: 2026,
      month: 11,
      from: '2026-10-16',
      to: '2026-11-15',
      state: 'running',
      amount: 9677 * R,
      paid: 0,
      lines: [{ kind: 'earned', amount: 9677 * R }],
      payableDays: 20,
      employedDays: 31,
    },
  ],
  ledger: [
    {
      id: 'a',
      date: '2026-09-05',
      type: 'reimbursement',
      amount: 450 * R,
      note: 'Tea',
      undone: false,
    },
    {
      id: 'b',
      date: '2026-09-15',
      type: 'salary_earned',
      amount: 14516 * R,
      payslipId: 'sep',
      undone: false,
    },
    { id: 'c', date: '2026-09-15', type: 'late_deduction', amount: -100 * R, undone: false },
    {
      id: 'd',
      date: '2026-09-16',
      type: 'salary_payment',
      amount: -8000 * R,
      mode: 'upi',
      undone: false,
    },
    {
      id: 'e',
      date: '2026-09-25',
      type: 'advance',
      amount: -3000 * R,
      mode: 'cash',
      undone: false,
    },
    { id: 'f', date: '2026-10-20', type: 'advance', amount: -2500 * R, mode: 'upi', undone: false },
    {
      id: 'g',
      date: '2026-10-28',
      type: 'reimbursement',
      amount: 120 * R,
      note: 'Courier',
      undone: false,
    },
  ],
};

const view = (over: Partial<StatementInput> = {}, name = 'Priya Sundaram'): StatementView => {
  const data = { ...input, ...over };
  return {
    shopName: 'Sample Textiles',
    staffId: 's',
    name,
    phone: null,
    joiningDate: '2026-07-16',
    leavingDate: null,
    payDay: 16,
    today: data.today,
    statement: buildStatement(data),
    history: buildHistory(data),
  };
};

describe('statement page', () => {
  it('shows the total, the months and how it adds up', () => {
    const v = view();
    const html = statementDocumentHtml(v, 'statement', t, months);
    const { total } = v.statement;
    expect(html).toContain('We owe Priya Sundaram');
    expect(html).toContain('September 2026');
    expect(html).toContain('Not finalized yet');
    expect(html).toContain('Still running');
    expect(html).toContain('20 of 31 days so far');
    expect(html).toContain('Festival bonus +₹1,000.00');
    expect(html).toContain('Uniform −₹250.00');
    expect(html).toContain('₹30,793.00');
    expect(total).toBe(v.history.rows.at(-1)?.balance);
  });

  it('every date is DD/MM/YYYY', () => {
    const html = statementDocumentHtml(view(), 'historical', t, months);
    expect(html).toContain('05/11/2026');
    expect(html).not.toMatch(/2026-\d\d-\d\d/);
  });

  it('nothing typed by a person can become markup', () => {
    const bad = '<img src=x onerror=alert(1)>';
    const v = view(
      {
        ledger: [
          ...input.ledger,
          {
            id: 'x',
            date: '2026-10-29',
            type: 'reimbursement',
            amount: 0,
            note: bad,
            undone: false,
          },
        ],
        expenseOwed: 120 * R,
      },
      `${bad} Priya`,
    );
    for (const kind of ['statement', 'historical'] as const) {
      const html = statementDocumentHtml(v, kind, t, months);
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    }
  });

  it('says so when they owe the shop', () => {
    const v = view({ months: [], ledger: [input.ledger[4]!], advance: 3000 * R, expenseOwed: 0 });
    expect(v.statement.total).toBe(-3000 * R);
    expect(statementHeadline(v, 'statement', t)).toBe('Priya Sundaram owes the shop');
    expect(statementHeadline(v, 'historical', t)).toBe('So far, Priya Sundaram owes the shop');
    expect(statementDocumentHtml(v, 'statement', t, months)).toContain('₹3,000.00');
  });

  it('prints as a whole A4 page', () => {
    expect(statementPrintHtml(view(), 'statement', t, months)).toContain('@page { size: A4');
  });
});

describe('historical rows', () => {
  const v = view();
  const titles = v.history.rows.map((r) => historyRowText(r, t, months, v.name).title);

  it('names each line', () => {
    expect(titles).toContain('Expense Priya paid');
    expect(titles).toContain('September salary');
    expect(titles).toContain('Festival bonus');
    expect(titles).toContain('Uniform');
    expect(titles).toContain('Salary paid');
    expect(titles).toContain('Advance given');
    expect(titles).toContain('November salary so far');
    expect(titles.every(Boolean)).toBe(true);
  });

  it('groups by calendar month', () => {
    expect(historyByMonth(v.history.rows, months).map((g) => g.title)).toEqual([
      'September 2026',
      'October 2026',
      'November 2026',
    ]);
  });
});

describe('share text', () => {
  it('is the sums, ending on the total', () => {
    const text = statementShareText(view(), 'statement', t, months);
    expect(text).toContain('Salary still to pay: ₹30,793.00');
    expect(text).toContain('October 2026 (Not finalized yet): ₹15,750.00');
    expect(text.trim().split('\n').at(-1)).toMatch(/^We owe Priya Sundaram: ₹/);
    expect(statementShareText(view(), 'historical', t, months)).toContain('So far, we owe');
  });

  it('names the file with the date', () => {
    expect(statementFileName(view(), 'historical', t)).toBe(
      'Historical statement Priya Sundaram 05-11-2026',
    );
  });
});

const out = process.env.STATEMENT_OUT;
if (out) {
  mkdirSync(out, { recursive: true });
  for (const kind of ['statement', 'historical'] as const)
    writeFileSync(join(out, `${kind}.html`), statementPrintHtml(view(), kind, t, months));
}
