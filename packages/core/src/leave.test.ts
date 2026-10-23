import { describe, expect, it } from 'vitest';
import {
  canUsePaidLeave,
  rollLeaveMonth,
  rollLeaveMonths,
  templateVersionOn,
  validateTemplateVersion,
  type LeaveTemplateVersion,
} from './leave';

const base: LeaveTemplateVersion = {
  effectiveFrom: '2026-01-01',
  weeklyOffs: [{ weekday: 0, paid: true }],
  paidLeavesPerMonth: 2,
  carryOver: { mode: 'lapse' },
  sandwichRule: false,
};
const v = (carryOver: LeaveTemplateVersion['carryOver']): LeaveTemplateVersion => ({
  ...base,
  carryOver,
});

describe('rollLeaveMonth', () => {
  it('lapse (default): unused leave is gone at month end', () => {
    const m = rollLeaveMonth({
      year: 2026,
      month: 1,
      opening: 0,
      used: 1,
      version: v({ mode: 'lapse' }),
    });
    expect(m).toMatchObject({
      opening: 0,
      earned: 2,
      used: 1,
      available: 2,
      carried: 0,
      lapsed: 1,
      paidOut: 0,
    });
  });

  it('carry without a cap banks everything', () => {
    const m = rollLeaveMonth({
      year: 2026,
      month: 1,
      opening: 7,
      used: 0,
      version: v({ mode: 'carry' }),
    });
    expect(m).toMatchObject({ available: 9, carried: 9, lapsed: 0 });
  });

  it('carry with a cap banks up to the cap and lapses the rest', () => {
    const m = rollLeaveMonth({
      year: 2026,
      month: 1,
      opening: 5,
      used: 0,
      version: v({ mode: 'carry', cap: 6 }),
    });
    expect(m).toMatchObject({ available: 7, carried: 6, lapsed: 1 });
  });

  it('carry within the year lapses at the end of the reset month', () => {
    const keep = rollLeaveMonth({
      year: 2026,
      month: 2,
      opening: 3,
      used: 1,
      version: v({ mode: 'carry_within_year', resetMonth: 3 }),
    });
    expect(keep).toMatchObject({ carried: 4, lapsed: 0 });
    const reset = rollLeaveMonth({
      year: 2026,
      month: 3,
      opening: 4,
      used: 0,
      version: v({ mode: 'carry_within_year', resetMonth: 3 }),
    });
    expect(reset).toMatchObject({ available: 6, carried: 0, lapsed: 6, paidOut: 0 });
  });

  it('payout pays unused leave at the end of the reset month instead of lapsing it', () => {
    const reset = rollLeaveMonth({
      year: 2026,
      month: 3,
      opening: 4,
      used: 1,
      version: v({ mode: 'payout', resetMonth: 3 }),
    });
    expect(reset).toMatchObject({ available: 6, carried: 0, lapsed: 0, paidOut: 5 });
    const before = rollLeaveMonth({
      year: 2026,
      month: 2,
      opening: 2,
      used: 0,
      version: v({ mode: 'payout', resetMonth: 3 }),
    });
    expect(before).toMatchObject({ carried: 4, paidOut: 0 });
  });

  it('a template with no paid leaves earns nothing', () => {
    const m = rollLeaveMonth({
      year: 2026,
      month: 1,
      opening: 0,
      used: 0,
      version: { ...base, paidLeavesPerMonth: 0 },
    });
    expect(m).toMatchObject({ earned: 0, available: 0, carried: 0 });
  });

  it('refuses more paid leave than available', () => {
    expect(() =>
      rollLeaveMonth({ year: 2026, month: 1, opening: 0, used: 3, version: v({ mode: 'lapse' }) }),
    ).toThrow(/more paid leave/);
  });
});

describe('rollLeaveMonths', () => {
  it('chains months, each opening with the previous carry', () => {
    const months = rollLeaveMonths(0, [
      { year: 2026, month: 1, used: 0, version: v({ mode: 'carry', cap: 3 }) },
      { year: 2026, month: 2, used: 1, version: v({ mode: 'carry', cap: 3 }) },
      { year: 2026, month: 3, used: 0, version: v({ mode: 'carry', cap: 3 }) },
    ]);
    expect(months.map((m) => [m.opening, m.available, m.carried])).toEqual([
      [0, 2, 2],
      [2, 4, 3],
      [3, 5, 3],
    ]);
  });

  it('switching to a lapsing version drops the bank at the end of that month', () => {
    const months = rollLeaveMonths(0, [
      { year: 2026, month: 1, used: 0, version: v({ mode: 'carry' }) },
      { year: 2026, month: 2, used: 0, version: v({ mode: 'lapse' }) },
    ]);
    expect(months[1]).toMatchObject({ opening: 2, available: 4, carried: 0, lapsed: 4 });
  });
});

describe('canUsePaidLeave', () => {
  it('allows paid leave only while balance remains', () => {
    expect(canUsePaidLeave({ available: 2, usedSoFar: 1 })).toBe(true);
    expect(canUsePaidLeave({ available: 2, usedSoFar: 2 })).toBe(false);
  });
});

describe('templateVersionOn', () => {
  const versions = {
    std: [
      { ...base, effectiveFrom: '2026-01-01', paidLeavesPerMonth: 1 },
      { ...base, effectiveFrom: '2026-06-01', paidLeavesPerMonth: 2 },
    ],
    tue: [{ ...base, effectiveFrom: '2026-01-01', weeklyOffs: [{ weekday: 2, paid: true }] }],
  };
  const assignments = [
    { effectiveFrom: '2026-01-01', templateId: 'std' },
    { effectiveFrom: '2026-08-01', templateId: 'tue' },
  ];

  it('follows the staff assignment, then the template version, on that date', () => {
    expect(templateVersionOn(assignments, versions, '2026-03-10')?.paidLeavesPerMonth).toBe(1);
    expect(templateVersionOn(assignments, versions, '2026-07-10')?.paidLeavesPerMonth).toBe(2);
    expect(templateVersionOn(assignments, versions, '2026-08-01')?.weeklyOffs).toEqual([
      { weekday: 2, paid: true },
    ]);
    expect(templateVersionOn(assignments, versions, '2025-12-31')).toBeUndefined();
  });
});

describe('validateTemplateVersion', () => {
  it('accepts a valid template', () => {
    expect(validateTemplateVersion(base)).toEqual([]);
  });

  it('reports every problem', () => {
    expect(
      validateTemplateVersion({
        ...base,
        weeklyOffs: [
          { weekday: 0, paid: true },
          { weekday: 0, paid: false },
          { weekday: 7, paid: true },
        ],
        paidLeavesPerMonth: -1,
        carryOver: { mode: 'carry_within_year', resetMonth: 13 },
      }),
    ).toEqual([
      'weeklyOffs: weekday 0 appears more than once',
      'weeklyOffs: weekday must be 0 (Sunday) to 6 (Saturday), got 7',
      'paidLeavesPerMonth must be a whole number of days, 0 or more',
      'carryOver.resetMonth must be 1–12',
    ]);
  });
});
