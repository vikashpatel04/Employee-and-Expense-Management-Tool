import type { LeaveTemplateVersion } from '@fincrew/core';
import { t } from './i18n';

/** A template version in plain words, one phrase per rule ("Sun off (paid)", "2 paid leaves a month", …). */
export function describeVersion(v: Omit<LeaveTemplateVersion, 'effectiveFrom'>): string[] {
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const months = t('months.long', { returnObjects: true }) as unknown as string[];
  const s = 'settings.leave.summary';
  const offs = [...v.weeklyOffs].sort((a, b) => a.weekday - b.weekday);
  const parts = [
    offs.length === 0
      ? t(`${s}.noOffs`)
      : offs
          .map((o) => t(o.paid ? `${s}.offPaid` : `${s}.offUnpaid`, { day: days[o.weekday] }))
          .join(', '),
    v.paidLeavesPerMonth === 0
      ? t(`${s}.noLeaves`)
      : t(`${s}.leaves`, { count: v.paidLeavesPerMonth }),
  ];
  if (v.paidLeavesPerMonth > 0) {
    const c = v.carryOver;
    parts.push(
      c.mode === 'lapse'
        ? t(`${s}.carry.lapse`)
        : c.mode === 'carry'
          ? c.cap === undefined
            ? t(`${s}.carry.carry`)
            : t(`${s}.carry.carryCap`, { cap: c.cap })
          : t(`${s}.carry.${c.mode}`, { month: months[c.resetMonth - 1] }),
    );
    if (v.accrual.mode === 'prorated') parts.push(t(`${s}.prorated`));
  }
  if (v.sandwich.enabled) parts.push(t(`${s}.sandwich`));
  return parts;
}
