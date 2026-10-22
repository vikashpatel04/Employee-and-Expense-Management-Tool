/**
 * Permission keys (docs/PLAN.md §3). Must match the `permissions` seed in
 * supabase/migrations — a test in supabase/tests checks they stay in sync.
 * The owner implicitly holds every permission.
 */
export const PERMISSIONS = [
  'staff.view',
  'staff.edit',
  'staff.pay.view',
  'staff.pay.edit',
  'attendance.mark',
  'attendance.edit_past',
  'attendance.code',
  'requests.decide',
  'advances.give',
  'salary.view',
  'salary.run',
  'salary.undo_payment',
  'expenses.add',
  'expenses.view_all',
  'expenses.edit',
  'expenses.categories',
  'reports.view',
  'reports.export',
  'settings.leave_templates',
  'settings.attendance',
  'settings.roles',
  'settings.shop',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSIONS as readonly string[]).includes(value);
}
