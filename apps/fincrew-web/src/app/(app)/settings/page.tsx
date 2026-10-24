import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/session';
import { settingsSections } from '@/lib/settings-access';

/** /settings opens the first section this person may change. */
export default async function SettingsPage() {
  const me = (await requireMe())!;
  const [first] = settingsSections(me.permissions);
  redirect(first ? `/settings/${first}` : '/');
}
