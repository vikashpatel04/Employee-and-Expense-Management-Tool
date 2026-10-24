import { formatTimeOfDay, minutesOfDayIST } from '@fincrew/core';
import { t } from './i18n';
import type { CheckReply } from './my-day';

/** A refused check-in → what to tell the person (with the time they can try again). */
export function checkError(r: Exclude<CheckReply, { ok: true }>): string {
  const at =
    r.retryAt && !Number.isNaN(Date.parse(r.retryAt))
      ? formatTimeOfDay(minutesOfDayIST(new Date(r.retryAt)))
      : '';
  const known = [
    'wrong_code',
    'locked',
    'cooldown',
    'too_soon',
    'already_checked_out',
    'self_off',
    'wrong_device',
    'not_staff',
  ];
  return known.includes(r.reason)
    ? t(`staffora.errors.${r.reason}`, { time: at })
    : t('staffora.errors.failed', { reason: r.retryAt ?? r.reason });
}
