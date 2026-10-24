import {
  Check,
  Clock,
  Contrast,
  Moon,
  Sparkles,
  Umbrella,
  UmbrellaOff,
  X,
  type LucideIcon,
} from 'lucide-react';

/** Attendance status → icon and colour token (design system: one colour + icon + word). */
export const STATUS_ICON: Record<string, LucideIcon> = {
  present: Check,
  half_day: Contrast,
  absent: X,
  paid_leave: Umbrella,
  unpaid_leave: UmbrellaOff,
  weekly_off: Moon,
  holiday: Sparkles,
  late: Clock,
};

/** `--status-<token>` / `--status-<token>-soft`; none for unmarked (dashed outline). */
export const STATUS_TOKEN: Record<string, string> = {
  present: 'present',
  half_day: 'half-day',
  absent: 'absent',
  paid_leave: 'paid-leave',
  unpaid_leave: 'unpaid-leave',
  weekly_off: 'weekly-off',
  holiday: 'holiday',
  late: 'late',
};
