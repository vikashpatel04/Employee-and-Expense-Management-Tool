import { redirect } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { FormDialog } from '@/components/app/form-dialog';
import { Panel } from '@/components/app/layout';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { ClearForm } from './clear-form';

/** Settings → Data (owner only): clear all data after testing (docs/features/clear-data.md). */
export default async function DataPage() {
  const me = (await requireMe())!;
  if (!me.isOwner) redirect('/settings');
  return (
    <Panel title={t('settings.data.title')} description={t('settings.data.hint')}>
      <ul className="text-muted-foreground list-disc pl-5 text-sm">
        <li>{t('settings.data.removes')}</li>
        <li>{t('settings.data.keeps')}</li>
      </ul>
      <div>
        <FormDialog
          title={t('settings.data.confirmTitle')}
          variant="destructive"
          trigger={
            <>
              <Trash2 aria-hidden="true" />
              {t('settings.data.clear')}
            </>
          }
        >
          <ClearForm shopName={me.shopName} />
        </FormDialog>
      </div>
    </Panel>
  );
}
