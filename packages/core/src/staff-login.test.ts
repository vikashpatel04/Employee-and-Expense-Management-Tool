import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAFF_LOGIN,
  evaluatePinAttempt,
  isValidPin,
  type PinState,
  type StaffLoginSettings,
} from './staff-login';

const MIN = 60_000;
const fresh: PinState = { failedAttempts: 0, waitUntil: null, locked: false };
const s = DEFAULT_STAFF_LOGIN;

/** Run wrong PINs one minute apart from t = 0, returning the last outcome and state. */
function wrongTimes(n: number, settings: StaffLoginSettings = s, start: PinState = fresh) {
  let state = start;
  let last = evaluatePinAttempt({ now: 0, correct: false, state, settings });
  for (let i = 0; i < n; i++) {
    last = evaluatePinAttempt({ now: i * MIN, correct: false, state, settings });
    state = last.state;
  }
  return last;
}

describe('defaults (PLAN §10)', () => {
  it('wait after 5 wrong PINs for 15 minutes, lock after 10, invites last 48 hours', () => {
    expect(DEFAULT_STAFF_LOGIN).toEqual({
      inviteHours: 48,
      wrongPinsBeforeWait: 5,
      pinWaitMinutes: 15,
      wrongPinsBeforeLock: 10,
    });
  });
});

describe('isValidPin', () => {
  it('is exactly 4 digits', () => {
    expect(isValidPin('0420')).toBe(true);
    for (const bad of ['123', '12345', '12a4', ' 1234', '']) expect(isValidPin(bad)).toBe(false);
  });
});

describe('evaluatePinAttempt', () => {
  it('a right PIN signs in and clears the count', () => {
    const r = evaluatePinAttempt({
      now: 0,
      correct: true,
      state: { failedAttempts: 3, waitUntil: null, locked: false },
      settings: s,
    });
    expect(r).toEqual({ ok: true, state: fresh });
  });

  it('wrong PINs count up', () => {
    const r = wrongTimes(3);
    expect(r).toEqual({
      ok: false,
      reason: 'wrong_pin',
      triesLeft: 2,
      state: { failedAttempts: 3, waitUntil: null, locked: false },
    });
  });

  it('the 5th wrong PIN starts a 15-minute wait from that try', () => {
    const r = wrongTimes(5);
    expect(r).toEqual({
      ok: false,
      reason: 'wait',
      retryAt: 4 * MIN + 15 * MIN,
      state: { failedAttempts: 5, waitUntil: 19 * MIN, locked: false },
    });
  });

  it('during the wait nothing is checked or counted, even the right PIN', () => {
    const waiting: PinState = { failedAttempts: 5, waitUntil: 19 * MIN, locked: false };
    const r = evaluatePinAttempt({ now: 10 * MIN, correct: true, state: waiting, settings: s });
    expect(r).toEqual({ ok: false, reason: 'wait', retryAt: 19 * MIN, state: waiting });
  });

  it('after the wait, the right PIN works', () => {
    const waiting: PinState = { failedAttempts: 5, waitUntil: 19 * MIN, locked: false };
    expect(
      evaluatePinAttempt({ now: 19 * MIN, correct: true, state: waiting, settings: s }),
    ).toEqual({
      ok: true,
      state: fresh,
    });
  });

  it('wrong PINs 6–9 count on; the 10th locks until the owner unlocks', () => {
    const afterWait: PinState = { failedAttempts: 5, waitUntil: 19 * MIN, locked: false };
    let state = afterWait;
    let r = evaluatePinAttempt({ now: 20 * MIN, correct: false, state, settings: s });
    expect(r).toMatchObject({ reason: 'wrong_pin', triesLeft: 4 });
    for (let i = 1; i <= 4; i++) {
      state = r.state;
      r = evaluatePinAttempt({ now: (20 + i) * MIN, correct: false, state, settings: s });
    }
    expect(r).toEqual({
      ok: false,
      reason: 'locked',
      state: { failedAttempts: 10, waitUntil: null, locked: true },
    });
    expect(
      evaluatePinAttempt({ now: 99 * MIN, correct: true, state: r.state, settings: s }),
    ).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('follows the shop settings', () => {
    const strict: StaffLoginSettings = {
      inviteHours: 24,
      wrongPinsBeforeWait: 3,
      pinWaitMinutes: 30,
      wrongPinsBeforeLock: 3,
    };
    expect(wrongTimes(3, strict)).toMatchObject({ reason: 'locked' });
    const lenient: StaffLoginSettings = { ...strict, wrongPinsBeforeLock: 6 };
    expect(wrongTimes(3, lenient)).toMatchObject({ reason: 'wait', retryAt: 2 * MIN + 30 * MIN });
    const afterWait: PinState = { failedAttempts: 5, waitUntil: null, locked: false };
    expect(
      evaluatePinAttempt({ now: 0, correct: false, state: afterWait, settings: lenient }),
    ).toMatchObject({ reason: 'locked' });
  });
});
