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
} from 'lucide-react';

/**
 * Expense category looks. The database stores plain keys (`icon`, `colour`); these map them to
 * Lucide icons and design-system colour tokens. The design system has no category palette yet
 * (docs/DESIGN.md gaps), so colours reuse the status tokens, which are tuned for both themes.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
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

export const CATEGORY_COLOURS: Record<string, { soft: string; fg: string }> = {
  teal: { soft: 'var(--accent-soft)', fg: 'var(--accent-ink)' },
  green: { soft: 'var(--status-present-soft)', fg: 'var(--status-present)' },
  olive: { soft: 'var(--status-half-day-soft)', fg: 'var(--status-half-day)' },
  blue: { soft: 'var(--status-paid-leave-soft)', fg: 'var(--status-paid-leave)' },
  violet: { soft: 'var(--status-unpaid-leave-soft)', fg: 'var(--status-unpaid-leave)' },
  plum: { soft: 'var(--status-holiday-soft)', fg: 'var(--status-holiday)' },
  amber: { soft: 'var(--status-late-soft)', fg: 'var(--status-late)' },
  red: { soft: 'var(--status-absent-soft)', fg: 'var(--status-absent)' },
  slate: { soft: 'var(--status-weekly-off-soft)', fg: 'var(--status-weekly-off)' },
};

export const categoryIcon = (key: string) => CATEGORY_ICONS[key] ?? Receipt;
export const categoryColour = (key: string) => CATEGORY_COLOURS[key] ?? CATEGORY_COLOURS.slate!;

/** "Add the usual ones" on an empty category list; names come from i18n by key. */
export const SUGGESTED_CATEGORIES = [
  { key: 'tea', icon: 'coffee', colour: 'amber' },
  { key: 'transport', icon: 'truck', colour: 'plum' },
  { key: 'power', icon: 'zap', colour: 'blue' },
  { key: 'rent', icon: 'home', colour: 'teal' },
  { key: 'packing', icon: 'package', colour: 'olive' },
  { key: 'repairs', icon: 'wrench', colour: 'slate' },
  { key: 'stationery', icon: 'pen', colour: 'violet' },
  { key: 'welfare', icon: 'users', colour: 'green' },
  { key: 'other', icon: 'grid', colour: 'slate' },
] as const;
