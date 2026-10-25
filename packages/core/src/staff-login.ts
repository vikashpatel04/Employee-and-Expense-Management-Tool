/**
 * Staff sign-in to Staffora: the phone number FinCrew has for the person is the user id, and a
 * 4-digit PIN they choose the first time is the password (docs/DECISIONS.md, 2026-10-25).
 * Pure rules only: hashing, sessions and the phone binding happen in the database and the
 * `staff-auth` edge function. Instants are epoch milliseconds.
 */

export interface StaffLoginSettings {
  /** Wrong PINs in a row before a wait… */
  wrongPinsBeforeWait: number;
  /** …of this many minutes (from the last wrong PIN). */
  pinWaitMinutes: number;
  /** Wrong PINs in a row that lock the login until the owner unlocks it. */
  wrongPinsBeforeLock: number;
  /** Staff may turn on fingerprint / face unlock in Staffora instead of typing the PIN. */
  allowBiometrics: boolean;
}

export const DEFAULT_STAFF_LOGIN: StaffLoginSettings = {
  wrongPinsBeforeWait: 5,
  pinWaitMinutes: 15,
  wrongPinsBeforeLock: 10,
  allowBiometrics: true,
};

/**
 * A phone number as Staffora matches it: the 10 digits of an Indian mobile number, however it was
 * typed (spaces, dashes, brackets, a leading 0, +91 / 91 / 0091). Null when that doesn't leave
 * exactly 10 digits. The database has the same rule (`private.phone_key`), tested to match.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  return /^\d{10}$/.test(d) ? d : null;
}

export const PIN_LENGTH = 4;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/** What the server keeps per login between attempts. */
export interface PinState {
  /** Wrong PINs since the last right one (or the owner's unlock). */
  failedAttempts: number;
  waitUntil: number | null;
  locked: boolean;
}

export type PinOutcome =
  | { ok: true; state: PinState }
  | { ok: false; reason: 'wrong_pin'; triesLeft: number; state: PinState }
  | { ok: false; reason: 'wait'; retryAt: number; state: PinState }
  | { ok: false; reason: 'locked'; state: PinState };

/**
 * One PIN attempt. Locked logins and running waits refuse without checking (or counting) the
 * PIN. A right PIN clears the count. Each wrong one counts; the count reaching
 * `wrongPinsBeforeLock` locks, and every `wrongPinsBeforeWait`-th one before that starts a wait.
 */
export function evaluatePinAttempt(input: {
  now: number;
  correct: boolean;
  state: PinState;
  settings: StaffLoginSettings;
}): PinOutcome {
  const { now, correct, state, settings } = input;
  if (state.locked) return { ok: false, reason: 'locked', state };
  if (state.waitUntil !== null && now < state.waitUntil)
    return { ok: false, reason: 'wait', retryAt: state.waitUntil, state };

  if (correct) return { ok: true, state: { failedAttempts: 0, waitUntil: null, locked: false } };

  const failed = state.failedAttempts + 1;
  if (failed >= settings.wrongPinsBeforeLock)
    return {
      ok: false,
      reason: 'locked',
      state: { failedAttempts: failed, waitUntil: null, locked: true },
    };
  if (failed % settings.wrongPinsBeforeWait === 0) {
    const until = now + settings.pinWaitMinutes * 60_000;
    return {
      ok: false,
      reason: 'wait',
      retryAt: until,
      state: { failedAttempts: failed, waitUntil: until, locked: false },
    };
  }
  return {
    ok: false,
    reason: 'wrong_pin',
    triesLeft: settings.wrongPinsBeforeWait - (failed % settings.wrongPinsBeforeWait),
    state: { failedAttempts: failed, waitUntil: null, locked: false },
  };
}
