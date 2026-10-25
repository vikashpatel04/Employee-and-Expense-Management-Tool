import { redirect } from 'next/navigation';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { PageHeader } from '../../../components';
import { AddStaffForm } from './add-staff-form';

export default async function NewStaffPage() {
  const me = (await requireMe())!;
  if (!me.permissions.includes('staff.edit')) redirect('/staff');

  return (
    <>
      <PageHeader title={t('staff.newTitle')} subtitle={t('staff.newSubtitle')} />
      <div className="rounded-lg border bg-card p-6 shadow-xs">
        <AddStaffForm
          today={todayIST()}
          labels={{
            name: t('staff.fields.name'),
            phone: t('staff.fields.phone'),
            joiningDate: t('staff.fields.joiningDate'),
            save: t('staff.save'),
            saving: t('staff.saving'),
            cancel: t('staff.cancel'),
          }}
        />
      </div>
    </>
  );
}
