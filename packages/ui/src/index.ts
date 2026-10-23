/**
 * FinCrew / Staffora design tokens and helpers, shared by the website (CSS variables in
 * `@fincrew/ui/tokens.css`) and the Expo apps (resolved `themes`). Source of truth: the FinCrew
 * Design System in Claude Design (docs/DESIGN.md). Components arrive per app as screens are built.
 */
import type { AttendanceStatus } from '@fincrew/core';
import type { ColorName } from './tokens.generated';

export * from './tokens.generated';

export const brand = {
  fincrew: { name: 'FinCrew' },
  staffora: { name: 'Staffora' },
} as const;

/** What a status pill, calendar cell or chip shows: one colour + one icon + a word, everywhere. */
export type StatusKey = AttendanceStatus | 'late' | 'unmarked';

const STATUS_TOKEN: Record<StatusKey, string> = {
  present: 'status-present',
  half_day: 'status-half-day',
  absent: 'status-absent',
  paid_leave: 'status-paid-leave',
  unpaid_leave: 'status-unpaid-leave',
  weekly_off: 'status-weekly-off',
  holiday: 'status-holiday',
  late: 'status-late',
  unmarked: 'status-unmarked',
};

/** Icon names from the design system's icon set. */
export const STATUS_ICON: Record<StatusKey, string> = {
  present: 'check',
  half_day: 'half',
  absent: 'x',
  paid_leave: 'umbrella',
  unpaid_leave: 'umbrella-off',
  weekly_off: 'moon',
  holiday: 'sparkle',
  late: 'clock',
  unmarked: 'unmarked',
};

/** Foreground (icon + label) and soft fill tokens for a status. Unmarked has no fill (dashed). */
export function statusTokens(status: StatusKey): {
  fg: ColorName;
  bg: ColorName | null;
  icon: string;
} {
  const fg = STATUS_TOKEN[status] as ColorName;
  const bg = status === 'unmarked' ? null : (`${STATUS_TOKEN[status]}-soft` as ColorName);
  return { fg, bg, icon: STATUS_ICON[status] };
}

/** Money colour by meaning: owed (due), paid (settled), advance (on account), deduction. */
export type MoneyState = 'owed' | 'paid' | 'advance' | 'deduction';
export const moneyToken = (state: MoneyState): ColorName => `money-${state}` as ColorName;
