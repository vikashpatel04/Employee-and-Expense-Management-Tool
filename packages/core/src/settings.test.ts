import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAY_RULES,
  DEFAULT_SHOP_RULES,
  resolveShopRules,
  validateShopRules,
  withOverride,
} from './settings';

describe('resolveShopRules', () => {
  it('nothing stored = all defaults', () => {
    expect(resolveShopRules()).toEqual(DEFAULT_SHOP_RULES);
  });

  it('a stored partial keeps the owner’s values and fills the rest', () => {
    const r = resolveShopRules({
      pay: { offDayWork: 'replace' },
      late: { mode: 'deduct', freeLateDays: 0 },
      attendanceCode: { cooldownMinutes: 5 },
      staffLogin: { allowBiometrics: false },
      smallExpenseLimit: 1_000,
    });
    expect(r.staffLogin).toMatchObject({ allowBiometrics: false, wrongPinsBeforeLock: 10 });
    expect(r.pay).toEqual({ ...DEFAULT_PAY_RULES, offDayWork: 'replace' });
    expect(r.late).toMatchObject({ mode: 'deduct', freeLateDays: 0, halfDayThresholdMinutes: 120 });
    expect(r.attendanceCode).toMatchObject({ cooldownMinutes: 5, minGapMinutes: 30 });
    expect(r.smallExpenseLimit).toBe(1_000);
  });
});

describe('withOverride', () => {
  it('a staff override replaces only the fields it sets', () => {
    expect(withOverride(DEFAULT_PAY_RULES, { unmarkedDay: 'paid' })).toEqual({
      ...DEFAULT_PAY_RULES,
      unmarkedDay: 'paid',
    });
    expect(withOverride(DEFAULT_PAY_RULES, undefined)).toEqual(DEFAULT_PAY_RULES);
  });
});

describe('validateShopRules', () => {
  it('accepts the defaults', () => {
    expect(validateShopRules(DEFAULT_SHOP_RULES)).toEqual([]);
  });

  it('reports out-of-range values', () => {
    const bad = resolveShopRules({
      pay: { dayRateBasis: { mode: 'fixed_days', days: 0 } },
      late: {
        freeLateDays: -1,
        halfDayThresholdMinutes: 0,
        charge: { mode: 'per_late_day', amount: -5 },
      },
      attendanceCode: {
        rotation: { mode: 'daily', atMinutes: 1440 },
        maxWrongCodes: 0,
        lockoutMinutes: -1,
      },
      staffLogin: {
        pinWaitMinutes: -1,
        wrongPinsBeforeWait: 6,
        wrongPinsBeforeLock: 5,
      },
      smallExpenseLimit: -1,
    });
    expect(validateShopRules(bad)).toEqual([
      'pay.dayRateBasis.days must be a whole number, 1 or more',
      'late.freeLateDays must be 0 or more',
      'late.halfDayThresholdMinutes must be 1 or more, or off',
      'late.charge.amount must be 0 or more',
      'attendanceCode.rotation.atMinutes must be 0–1439',
      'attendanceCode.lockoutMinutes must be 0 or more',
      'attendanceCode.maxWrongCodes must be 1 or more',
      'staffLogin.pinWaitMinutes must be 0 or more',
      'staffLogin.wrongPinsBeforeLock must be at least wrongPinsBeforeWait',
      'smallExpenseLimit must be 0 or more',
    ]);
  });

  it('allows the half-day threshold to be switched off', () => {
    expect(
      validateShopRules(resolveShopRules({ late: { halfDayThresholdMinutes: null } })),
    ).toEqual([]);
  });
});
