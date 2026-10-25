import {
  formatDisplayDate,
  formatINR,
  maxDate,
  minDate,
  monthEnd,
  monthStart,
  type BusinessDate,
} from '@fincrew/core';
import type { loadPayslipView } from './salary-run';

export type PayslipView = NonNullable<Awaited<ReturnType<typeof loadPayslipView>>>;

/** The app's translate function (packages/i18n), passed in so this stays free of i18n setup. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Lines that take money away (shown with a minus). */
export const PAYSLIP_MINUS_LINES = ['deduction', 'late_deduction', 'advance_cut'];

/** The days a payslip covers: the month, cut to the joining and leaving dates. */
export function payslipPeriod(slip: PayslipView): { from: BusinessDate; to: BusinessDate } {
  const end = monthEnd(slip.year, slip.month);
  return {
    from: maxDate(monthStart(slip.year, slip.month), slip.joiningDate),
    to: slip.leavingDate ? minDate(end, slip.leavingDate) : end,
  };
}

/**
 * A payslip as plain text to share (WhatsApp, SMS, …) from Staffora or FinCrew: shop, name,
 * month, period and payable days, each line, net pay, paid so far and still to pay. Same labels
 * as the payslip pages.
 */
export function payslipShareText(slip: PayslipView, t: Translate, monthName: string): string {
  const { from, to } = payslipPeriod(slip);
  const lines = slip.lines.map((l) => {
    const label = t(`salary.lines.${l.kind}`, {
      name: l.name ?? '',
      days: slip.summary.payableDays,
    });
    const minus = PAYSLIP_MINUS_LINES.includes(l.kind) ? '−' : '';
    return `${label}: ${minus}${formatINR(l.amount)}`;
  });
  return [
    `${slip.shopName} · ${t('payslip.title')}`,
    `${slip.name} · ${monthName}`,
    `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`,
    t('salary.days.payable', {
      payable: slip.summary.payableDays,
      employed: slip.summary.employedDays,
    }),
    '',
    ...lines,
    '',
    `${t('payslip.net')}: ${formatINR(slip.net)}`,
    ...(slip.status === 'finalized'
      ? [
          `${t('payslip.paid')}: ${formatINR(slip.paid)}`,
          `${t('payslip.due')}: ${formatINR(Math.max(0, slip.net - slip.paid))}`,
        ]
      : [t('payslip.draft')]),
  ].join('\n');
}
