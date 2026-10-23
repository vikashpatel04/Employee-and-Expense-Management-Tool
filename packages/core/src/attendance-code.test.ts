import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CODE_SETTINGS,
  evaluateCheck,
  isMissingCheckOut,
  nextCodeChange,
  parseScannedCode,
  type CheckAttempt,
} from './attendance-code';

const MIN = 60_000;
const t0 = Date.parse('2026-10-23T04:00:00Z'); // 9:30 AM IST

describe('parseScannedCode', () => {
  it('accepts a QR whose content is exactly 6 digits (any generator)', () => {
    expect(parseScannedCode('482915')).toBe('482915');
    expect(parseScannedCode('  482915\n')).toBe('482915');
  });

  it('rejects anything else', () => {
    for (const bad of ['48291', '4829150', 'abc123', 'https://x.test/482915', '']) {
      expect(parseScannedCode(bad)).toBeNull();
    }
  });
});

const check = (opts: Partial<Parameters<typeof evaluateCheck>[0]> = {}) =>
  evaluateCheck({
    now: t0,
    codeMatches: true,
    attempts: [],
    today: {},
    settings: DEFAULT_CODE_SETTINGS,
    ...opts,
  });

describe('evaluateCheck', () => {
  it('first correct code of the day checks in', () => {
    expect(check()).toEqual({ ok: true, kind: 'in' });
  });

  it('a wrong code is refused', () => {
    expect(check({ codeMatches: false })).toEqual({ ok: false, reason: 'wrong_code' });
  });

  it('5 wrong codes in 10 minutes lock for 10 minutes from the 5th', () => {
    const wrong = (minsAgo: number): CheckAttempt => ({
      at: t0 - minsAgo * MIN,
      result: 'wrong_code',
    });
    const attempts = [wrong(9), wrong(7), wrong(5), wrong(3), wrong(1)];
    expect(check({ attempts })).toEqual({ ok: false, reason: 'locked', retryAt: t0 + 9 * MIN });
    // even the right code waits
    expect(check({ attempts, now: t0 + 8 * MIN }).ok).toBe(false);
    expect(check({ attempts, now: t0 + 9 * MIN })).toEqual({ ok: true, kind: 'in' });
  });

  it('5 wrong codes spread over more than 10 minutes do not lock', () => {
    const attempts: CheckAttempt[] = [12, 9, 6, 3, 1].map((m) => ({
      at: t0 - m * MIN,
      result: 'wrong_code',
    }));
    expect(check({ attempts })).toEqual({ ok: true, kind: 'in' });
  });

  it('cooldown after an accepted check prevents double taps', () => {
    const attempts: CheckAttempt[] = [{ at: t0 - 1 * MIN, result: 'accepted' }];
    expect(check({ attempts, today: { checkIn: t0 - 1 * MIN } })).toEqual({
      ok: false,
      reason: 'cooldown',
      retryAt: t0 + 1 * MIN,
    });
  });

  it('check-out needs the minimum gap after check-in', () => {
    const today = { checkIn: t0 - 20 * MIN };
    expect(check({ today })).toEqual({ ok: false, reason: 'too_soon', retryAt: t0 + 10 * MIN });
    expect(check({ today, now: t0 + 10 * MIN })).toEqual({ ok: true, kind: 'out' });
  });

  it('after check-out, further checks are refused', () => {
    expect(check({ today: { checkIn: t0 - 600 * MIN, checkOut: t0 - 60 * MIN } })).toEqual({
      ok: false,
      reason: 'already_checked_out',
    });
  });

  it('settings change the gaps', () => {
    const settings = { ...DEFAULT_CODE_SETTINGS, minGapMinutes: 0, cooldownMinutes: 0 };
    expect(check({ settings, today: { checkIn: t0 - 1 * MIN } })).toEqual({
      ok: true,
      kind: 'out',
    });
  });
});

describe('nextCodeChange', () => {
  it('daily at a chosen IST time: the next occurrence after now', () => {
    // now 9:30 IST; change at 00:00 IST → next midnight IST = 18:30 UTC same day
    expect(nextCodeChange(t0, { mode: 'daily', atMinutes: 0 })).toBe(
      Date.parse('2026-10-23T18:30:00Z'),
    );
    // change at 10:00 IST, still ahead today
    expect(nextCodeChange(t0, { mode: 'daily', atMinutes: 600 })).toBe(
      Date.parse('2026-10-23T04:30:00Z'),
    );
    // exactly at the change time → the next day's
    expect(
      nextCodeChange(Date.parse('2026-10-23T04:30:00Z'), { mode: 'daily', atMinutes: 600 }),
    ).toBe(Date.parse('2026-10-24T04:30:00Z'));
  });

  it('manual mode never changes on its own', () => {
    expect(nextCodeChange(t0, { mode: 'manual' })).toBeNull();
  });
});

describe('isMissingCheckOut', () => {
  it('flags a check-in without check-out only when check-out is required', () => {
    expect(isMissingCheckOut({ checkIn: t0 }, DEFAULT_CODE_SETTINGS)).toBe(true);
    expect(
      isMissingCheckOut({ checkIn: t0, checkOut: t0 + 600 * MIN }, DEFAULT_CODE_SETTINGS),
    ).toBe(false);
    expect(
      isMissingCheckOut({ checkIn: t0 }, { ...DEFAULT_CODE_SETTINGS, checkOutRequired: false }),
    ).toBe(false);
  });
});

describe('lockout settings', () => {
  it('uses the shop’s wrong-code count, window and wait', () => {
    const settings = {
      ...DEFAULT_CODE_SETTINGS,
      maxWrongCodes: 3,
      wrongCodeWindowMinutes: 5,
      lockoutMinutes: 15,
    };
    const attempts: CheckAttempt[] = [4, 2, 1].map((m) => ({
      at: t0 - m * MIN,
      result: 'wrong_code',
    }));
    expect(check({ attempts, settings })).toEqual({
      ok: false,
      reason: 'locked',
      retryAt: t0 + 14 * MIN,
    });
    expect(check({ attempts })).toEqual({ ok: true, kind: 'in' }); // defaults: 5 needed
  });
});
