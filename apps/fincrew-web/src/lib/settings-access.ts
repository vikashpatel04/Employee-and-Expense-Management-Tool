/**
 * Settings sections and the permission each needs. Holidays sit with leave templates (same
 * permission, as in the RLS policies); shop rules live in `shops.settings`, which RLS lets
 * `settings.shop` update. Roles need `settings.roles`.
 */
export const SETTINGS_SECTIONS = {
  holidays: 'settings.leave_templates',
  leave: 'settings.leave_templates',
  rules: 'settings.shop',
  roles: 'settings.roles',
} as const;

export type SettingsSection = keyof typeof SETTINGS_SECTIONS;

/** The sections this person may open, in sidebar order. */
export function settingsSections(permissions: readonly string[]): SettingsSection[] {
  return (Object.keys(SETTINGS_SECTIONS) as SettingsSection[]).filter((s) =>
    permissions.includes(SETTINGS_SECTIONS[s]),
  );
}
