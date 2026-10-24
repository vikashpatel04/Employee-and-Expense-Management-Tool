import {
  Coffee,
  Fuel,
  House,
  LayoutGrid,
  Megaphone,
  Package,
  PenLine,
  Phone,
  Receipt,
  Shirt,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import type { ColorName } from '@fincrew/ui';
import { t } from './i18n';

/** "October 2026" from the i18n month names (no locale date formatting). */
export function monthLabel(year: number, month: number) {
  const names = t('months.long', { returnObjects: true }) as unknown as string[];
  return `${names[month - 1]} ${year}`;
}

export function shiftMonth(year: number, month: number, by: number) {
  const i = year * 12 + (month - 1) + by;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

/** `YYYY-MM` for routes and comparisons. */
export const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

export function parseYm(value: string | undefined) {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

/**
 * Expense category looks, the same keys as the website (`icon`, `colour` stored on the
 * category) mapped to Lucide icons and design-system colour tokens.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  receipt: Receipt,
  coffee: Coffee,
  truck: Truck,
  zap: Zap,
  home: House,
  package: Package,
  wrench: Wrench,
  pen: PenLine,
  users: Users,
  phone: Phone,
  bag: ShoppingBag,
  fuel: Fuel,
  shirt: Shirt,
  megaphone: Megaphone,
  sparkles: Sparkles,
  grid: LayoutGrid,
};

const CATEGORY_COLOURS: Record<string, { soft: ColorName; fg: ColorName }> = {
  teal: { soft: 'accent-soft', fg: 'accent-ink' },
  green: { soft: 'status-present-soft', fg: 'status-present' },
  olive: { soft: 'status-half-day-soft', fg: 'status-half-day' },
  blue: { soft: 'status-paid-leave-soft', fg: 'status-paid-leave' },
  violet: { soft: 'status-unpaid-leave-soft', fg: 'status-unpaid-leave' },
  plum: { soft: 'status-holiday-soft', fg: 'status-holiday' },
  amber: { soft: 'status-late-soft', fg: 'status-late' },
  red: { soft: 'status-absent-soft', fg: 'status-absent' },
  slate: { soft: 'status-weekly-off-soft', fg: 'status-weekly-off' },
};

export const categoryIcon = (key: string) => CATEGORY_ICONS[key] ?? Receipt;
export const categoryColour = (key: string) => CATEGORY_COLOURS[key] ?? CATEGORY_COLOURS.slate!;
