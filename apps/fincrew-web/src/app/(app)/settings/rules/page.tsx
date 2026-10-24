import { redirect } from 'next/navigation';
import { toShopRules } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { RulesForm } from './rules-form';

/** The shop's pay, late, attendance code and expense rules (docs/features/core-rules.md). */
export default async function RulesPage() {
  const me = (await requireMe())!;
  if (!me.permissions.includes(SETTINGS_SECTIONS.rules)) redirect('/settings');

  const supabase = await createClient();
  const { data: shop } = await supabase
    .from('shops')
    .select('settings')
    .eq('id', me.shopId)
    .single();

  return (
    <>
      <p className="text-body text-[var(--ink-muted)]">{t('settings.rules.subtitle')}</p>
      <RulesForm rules={toShopRules(shop?.settings)} />
    </>
  );
}
