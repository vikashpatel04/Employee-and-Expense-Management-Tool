import { formatTimeOfDay, minutesOfDayIST } from '@fincrew/core';
import { t } from './i18n';

export type PinRefusal = { ok: false; reason: string; retryAt?: string; triesLeft?: number };

/**
 * What to say when a PIN is refused, on the PIN screen and in Change PIN (same server rules:
 * wrong PIN with tries left, a wait, locked, another phone, left, no sign-in). `banner` marks
 * the ones that stop the person (shown above the pad), not a retry.
 */
export function pinRefusal(r: PinRefusal): { text: string; banner: boolean } {
  const p = 'staffora.pin';
  switch (r.reason) {
    case 'wrong_pin':
      return { text: t(`${p}.wrong`, { count: r.triesLeft ?? 0 }), banner: false };
    case 'wait':
      return {
        text: t(`${p}.wait`, {
          time: r.retryAt ? formatTimeOfDay(minutesOfDayIST(new Date(r.retryAt))) : '',
        }),
        banner: true,
      };
    case 'locked':
      return { text: t(`${p}.locked`), banner: true };
    case 'wrong_device':
      return { text: t(`${p}.wrongDevice`), banner: true };
    case 'left':
      return { text: t(`${p}.left`), banner: true };
    case 'no_login':
      return { text: t(`${p}.noLogin`), banner: true };
    default:
      return { text: t(`${p}.failed`), banner: false };
  }
}
