import { describe, expect, it } from 'vitest';
import {
  applyLatePolicy,
  DEFAULT_LATE_POLICY,
  dayLateness,
  lateDeduction,
  resolveLatePolicy,
  type LatePolicy,
  type Shift,
} from './late';
import { rat, ratToRupeePaise } from './rational';

// 9:30 AM – 8:30 PM, 10 min grace: 660 shift minutes
const shift: Shift = { start: 9 * 60 + 30, end: 20 * 60 + 30, graceMinutes: 10 };
const deduct: LatePolicy = { ...DEFAULT_LATE_POLICY, mode: 'deduct' };

describe('dayLateness', () => {
  it('within grace is on time', () => {
    expect(dayLateness({ checkIn: shift.start + 10 }, shift, deduct)).toEqual({
      lateMinutes: 0,
      earlyMinutes: 0,
    });
  });

  it('beyond grace counts from shift start, not from the end of grace', () => {
    expect(dayLateness({ checkIn: shift.start + 11 }, shift, deduct)).toEqual({
      lateMinutes: 11,
      earlyMinutes: 0,
    });
  });

  it('early leaving counts only when enabled', () => {
    const rec = { checkIn: shift.start, checkOut: shift.end - 45 };
    expect(dayLateness(rec, shift, deduct).earlyMinutes).toBe(0);
    expect(dayLateness(rec, shift, { ...deduct, earlyLeaving: true }).earlyMinutes).toBe(45);
    expect(
      dayLateness({ checkIn: shift.start, checkOut: shift.end - 5 }, shift, {
        ...deduct,
        earlyLeaving: true,
      }).earlyMinutes,
    ).toBe(0);
  });

  it('no check-in means nothing to measure', () => {
    expect(dayLateness({}, shift, deduct)).toEqual({ lateMinutes: 0, earlyMinutes: 0 });
  });
});

const lateDays = (minutes: number[]) =>
  minutes.map((m, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    lateMinutes: m,
    earlyMinutes: 0,
  }));

describe('applyLatePolicy', () => {
  it('notice only: lateness is recorded, nothing is charged', () => {
    const out = applyLatePolicy(lateDays([15, 30, 200]), DEFAULT_LATE_POLICY);
    expect(out.map((o) => o.outcome)).toEqual(['noticed', 'noticed', 'noticed']);
    expect(out.every((o) => o.chargedMinutes === 0)).toBe(true);
  });

  it('deduct: the first N late days are free, later ones are charged their minutes', () => {
    const out = applyLatePolicy(lateDays([15, 0, 20, 12, 25, 40]), deduct);
    expect(out.map((o) => [o.outcome, o.chargedMinutes])).toEqual([
      ['free', 0],
      ['on_time', 0],
      ['free', 0],
      ['free', 0],
      ['charged', 25],
      ['charged', 40],
    ]);
  });

  it('more than the threshold late turns the day into a half day instead', () => {
    const out = applyLatePolicy(lateDays([121, 120, 15, 15, 15]), deduct);
    expect(out.map((o) => o.outcome)).toEqual(['half_day', 'free', 'free', 'free', 'charged']);
  });

  it('orders by date regardless of input order', () => {
    const days = lateDays([11, 12, 13, 14]).reverse();
    const out = applyLatePolicy(days, { ...deduct, freeLateDays: 3 });
    expect(out.find((o) => o.date === '2026-10-04')?.outcome).toBe('charged');
  });

  it('early leaving joins the same count and threshold', () => {
    const days = [
      { date: '2026-10-01', lateMinutes: 0, earlyMinutes: 30 },
      { date: '2026-10-02', lateMinutes: 15, earlyMinutes: 20 },
      { date: '2026-10-03', lateMinutes: 0, earlyMinutes: 130 },
    ];
    const out = applyLatePolicy(days, { ...deduct, freeLateDays: 1, earlyLeaving: true });
    expect(out.map((o) => [o.outcome, o.chargedMinutes])).toEqual([
      ['free', 0],
      ['charged', 35],
      ['half_day', 0],
    ]);
  });

  it('zero free days charges from the first late day', () => {
    const out = applyLatePolicy(lateDays([15]), { ...deduct, freeLateDays: 0 });
    expect(out[0]).toMatchObject({ outcome: 'charged', chargedMinutes: 15 });
  });
});

describe('lateDeduction', () => {
  it('charges minutes × (day rate ÷ shift minutes)', () => {
    // ₹30,000 a month, 31 days, 660-minute shift, 25 minutes late
    const dayRate = rat(3_000_000, 31);
    const r = lateDeduction(25, dayRate, 660);
    // 3,000,000 × 25 / (31 × 660) = 3665.68… paise → ₹37
    expect(ratToRupeePaise(r)).toBe(3700);
  });

  it('rejects a shift with no length', () => {
    expect(() => lateDeduction(10, rat(100_000), 0)).toThrow();
  });
});

describe('resolveLatePolicy', () => {
  it('a staff override replaces only the fields it sets', () => {
    expect(resolveLatePolicy(deduct, { freeLateDays: 5 })).toEqual({ ...deduct, freeLateDays: 5 });
    expect(resolveLatePolicy(deduct, undefined)).toEqual(deduct);
  });
});
