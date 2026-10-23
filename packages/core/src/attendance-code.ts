/**
 * Self attendance by the shop's 6-digit attendance code (docs/PLAN.md §4.5).
 * Pure rules only: hashing, storing and device binding happen in the edge function.
 * Instants are epoch milliseconds.
 */

export type CodeRotation = { mode: 'daily'; atMinutes: number } | { mode: 'manual' };

export interface CodeSettings {
  rotation: CodeRotation;
  /** Minimum time between check-in and check-out. */
  minGapMinutes: number;
  /** After any accepted check, ignore further ones for this long (double taps). */
  cooldownMinutes: number;
  checkOutRequired: boolean;
  /** Wrong codes that trigger a wait… */
  maxWrongCodes: number;
  /** …when they happen within this many minutes… */
  wrongCodeWindowMinutes: number;
  /** …and how long the wait is, from the last of them. */
  lockoutMinutes: number;
}

export const DEFAULT_CODE_SETTINGS: CodeSettings = {
  rotation: { mode: 'daily', atMinutes: 0 },
  minGapMinutes: 30,
  cooldownMinutes: 2,
  checkOutRequired: true,
  maxWrongCodes: 5,
  wrongCodeWindowMinutes: 10,
  lockoutMinutes: 10,
};

const MIN = 60_000;
const DAY = 1440 * MIN;
const IST_OFFSET = 330 * MIN;

/** Any QR generator works: the content must be exactly the 6-digit code. */
export function parseScannedCode(content: string): string | null {
  const trimmed = content.trim();
  return /^\d{6}$/.test(trimmed) ? trimmed : null;
}

export interface CheckAttempt {
  at: number;
  result: 'accepted' | 'wrong_code' | 'locked' | 'cooldown' | 'too_soon' | 'already_checked_out';
}

export type CheckResult =
  | { ok: true; kind: 'in' | 'out' }
  | { ok: false; reason: 'locked' | 'cooldown' | 'too_soon'; retryAt: number }
  | { ok: false; reason: 'wrong_code' | 'already_checked_out' };

/** When the wrong-code lockout ends (0 if not locked). */
function lockedUntil(attempts: readonly CheckAttempt[], settings: CodeSettings): number {
  const { maxWrongCodes, wrongCodeWindowMinutes, lockoutMinutes } = settings;
  const wrong = attempts
    .filter((a) => a.result === 'wrong_code')
    .map((a) => a.at)
    .sort((a, b) => a - b);
  let until = 0;
  for (let i = maxWrongCodes - 1; i < wrong.length; i++) {
    if (wrong[i]! - wrong[i - maxWrongCodes + 1]! <= wrongCodeWindowMinutes * MIN) {
      until = Math.max(until, wrong[i]! + lockoutMinutes * MIN);
    }
  }
  return until;
}

/**
 * Decide a staff member's check-in / check-out attempt. `attempts` are their recent attempts
 * (at least the last 10 minutes); `today` holds today's accepted check-in and check-out.
 */
export function evaluateCheck(input: {
  now: number;
  codeMatches: boolean;
  attempts: readonly CheckAttempt[];
  today: { checkIn?: number; checkOut?: number };
  settings: CodeSettings;
}): CheckResult {
  const { now, settings, today } = input;

  const until = lockedUntil(input.attempts, settings);
  if (now < until) return { ok: false, reason: 'locked', retryAt: until };

  if (!input.codeMatches) return { ok: false, reason: 'wrong_code' };

  const lastAccepted = Math.max(
    ...input.attempts.filter((a) => a.result === 'accepted').map((a) => a.at),
    -Infinity,
  );
  const cooldownEnds = lastAccepted + settings.cooldownMinutes * MIN;
  if (now < cooldownEnds) return { ok: false, reason: 'cooldown', retryAt: cooldownEnds };

  if (today.checkIn === undefined) return { ok: true, kind: 'in' };
  if (today.checkOut !== undefined) return { ok: false, reason: 'already_checked_out' };

  const gapEnds = today.checkIn + settings.minGapMinutes * MIN;
  if (now < gapEnds) return { ok: false, reason: 'too_soon', retryAt: gapEnds };
  return { ok: true, kind: 'out' };
}

/** When the code next changes on its own (null for manual rotation). */
export function nextCodeChange(now: number, rotation: CodeRotation): number | null {
  if (rotation.mode === 'manual') return null;
  const istMidnight = Math.floor((now + IST_OFFSET) / DAY) * DAY - IST_OFFSET;
  const today = istMidnight + rotation.atMinutes * MIN;
  return today > now ? today : today + DAY;
}

/** A day that has a check-in but no check-out, when check-out is required. */
export function isMissingCheckOut(
  day: { checkIn?: number; checkOut?: number },
  settings: CodeSettings,
): boolean {
  return settings.checkOutRequired && day.checkIn !== undefined && day.checkOut === undefined;
}
