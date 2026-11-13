import { describe, expect, it } from 'vitest';
import { daysLeft, leftToPay, salaryStage } from '../../packages/data/src/salary-people';
import type { SalaryPerson } from '../../packages/data/src/salary-run';

/** Salary by person (owner 13/11/2026): what each salary needs, from its state. */
const salary = (over: Partial<SalaryPerson>): SalaryPerson => ({
  id: 'p',
  staffId: 's',
  name: 'Sample',
  phone: null,
  revision: 1,
  period: { from: '2026-10-16', to: '2026-11-15', payDate: '2026-11-16' },
  lines: [],
  summary: {
    present: 0,
    absent: 0,
    halfDay: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    paidWeeklyOff: 0,
    unpaidWeeklyOff: 0,
    paidHoliday: 0,
    unpaidHoliday: 0,
    unmarked: 0,
    sandwiched: 0,
    extraWorkingDays: 0,
    payableUnits: 0,
    payableDays: 0,
    employedDays: 31,
  },
  warnings: [],
  leave: null,
  earned: 0,
  overtime: 0,
  allowances: 0,
  gross: 0,
  deductions: 0,
  cut: 0,
  payback: 0,
  expenseCut: 0,
  net: 1_000_000,
  paidAmount: 0,
  state: 'draft',
  entries: [],
  running: false,
  newCycleFrom: null,
  ...over,
});

describe('what a salary needs', () => {
  it('running until its period is over, then finalize', () => {
    expect(salaryStage(salary({ running: true }))).toBe('running');
    expect(salaryStage(salary({ running: false }))).toBe('finalize');
  });

  it('finalized and not fully paid is to pay; fully paid is done', () => {
    expect(salaryStage(salary({ state: 'finalized', paidAmount: 400_000 }))).toBe('pay');
    expect(salaryStage(salary({ state: 'paid', paidAmount: 1_000_000 }))).toBe('done');
  });

  it('still to pay takes off what was paid, early or not, never below zero', () => {
    expect(leftToPay(salary({ paidAmount: 400_000 }))).toBe(600_000);
    expect(leftToPay(salary({ paidAmount: 1_200_000 }))).toBe(0);
  });

  it('days left count to the last day of the period', () => {
    expect(daysLeft(salary({}), '2026-11-13')).toBe(2);
    expect(daysLeft(salary({}), '2026-11-15')).toBe(0);
    expect(daysLeft(salary({}), '2026-11-20')).toBe(0);
  });
});
