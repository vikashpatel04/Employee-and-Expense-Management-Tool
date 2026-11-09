import {
  addDays,
  employedPart,
  formatDisplayDate,
  formatINR,
  monthEnd,
  monthStart,
  type BusinessDate,
} from '@fincrew/core';
import type { loadPayslipView } from './salary-run';

export type PayslipView = NonNullable<Awaited<ReturnType<typeof loadPayslipView>>>;

/** The app's translate function (packages/i18n), passed in so this stays free of i18n setup. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Lines that take money away (shown with a minus). */
export const PAYSLIP_MINUS_LINES = ['deduction', 'late_deduction', 'advance_cut', 'expense_cut'];

/**
 * The days a payslip covers: its pay period (older payslips have no dates: the calendar month),
 * cut to the joining and leaving dates, and the date it is paid: the day after the period ends.
 */
export function payslipPeriod(slip: PayslipView): {
  from: BusinessDate;
  to: BusinessDate;
  payDate: BusinessDate;
} {
  const to = slip.periodTo ?? monthEnd(slip.year, slip.month);
  return {
    ...employedPart(
      { from: slip.periodFrom ?? monthStart(slip.year, slip.month), to },
      slip.joiningDate,
      slip.leavingDate,
    ),
    payDate: addDays(to, 1),
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

/**
 * A date of the month as words, for pay days ("the 8th" → "8th"). English picks the suffix by the
 * number; each language keeps its own words under `salary.payNow.dayOfMonth`.
 */
export function dayOfMonthText(day: number, t: Translate): string {
  const tens = day % 100;
  const key =
    tens >= 11 && tens <= 13
      ? 'other'
      : day % 10 === 1
        ? 'one'
        : day % 10 === 2
          ? 'two'
          : day % 10 === 3
            ? 'few'
            : 'other';
  return t(`salary.payNow.dayOfMonth.${key}`, { day });
}
