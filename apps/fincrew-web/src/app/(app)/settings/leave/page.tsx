import { PendingLink as Link } from '@/components/app/pending-link';
import { redirect } from 'next/navigation';
import { ChevronRight, Plus } from 'lucide-react';
import { FormDialog } from '@/components/app/form-dialog';
import { effectiveOn, monthOf, monthStart } from '@fincrew/core';
import { loadLeaveSetup } from '@fincrew/data';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { describeVersion } from '@/lib/leave-text';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { LeaveVersionForm } from './leave-forms';

const card = 'rounded-lg border bg-card p-4 shadow-xs';

/** Leave templates: what each one gives today and how many people are on it (PLAN §4.2). */
export default async function LeaveTemplatesPage() {
  const me = (await requireMe())!;
  if (!me.permissions.includes(SETTINGS_SECTIONS.leave)) redirect('/settings');

  const today = todayIST();
  const supabase = await createClient();
  const { templates, versionsByTemplate, staff } = await loadLeaveSetup(supabase, me.shopId, today);
  const { year, month } = monthOf(today);
  const sorted = [...templates].sort((a, b) => Number(a.archived) - Number(b.archived));

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">{t('settings.leave.subtitle')}</p>
          <FormDialog
            title={t('settings.leave.new')}
            description={t('settings.leave.newHint')}
            variant="default"
            wide
            trigger={
              <>
                <Plus aria-hidden="true" />
                {t('settings.leave.new')}
              </>
            }
          >
            <LeaveVersionForm defaultDate={monthStart(year, month)} />
          </FormDialog>
        </div>
        {sorted.length === 0 ? (
          <p className={`${card} text-body-lg text-[var(--ink-muted)]`}>
            {t('settings.leave.empty')}
          </p>
        ) : (
          <ul className="bg-card overflow-hidden rounded-lg border shadow-xs">
            {sorted.map((tpl) => {
              const versions = versionsByTemplate.get(tpl.id) ?? [];
              const current = effectiveOn(versions, today) ?? versions.at(-1);
              const count = staff.filter((s) => s.templateId === tpl.id).length;
              return (
                <li key={tpl.id} className="border-b border-[var(--line)] last:border-0">
                  <Link
                    href={`/settings/leave/${tpl.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-muted)]"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-label-sm flex items-center gap-2">
                        {tpl.name}
                        {tpl.archived && (
                          <span className="text-caption rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[var(--ink-muted)]">
                            {t('settings.leave.archived')}
                          </span>
                        )}
                      </span>
                      <span className="text-caption text-[var(--ink-muted)]">
                        {current
                          ? `${describeVersion(current).join(' · ')} · ${t('settings.leave.since', { date: formatDate(current.effectiveFrom) })}`
                          : t('settings.leave.noVersion')}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-caption text-[var(--ink-muted)]">
                        {t('settings.leave.staffCount', { count })}
                      </span>
                      <ChevronRight
                        size={20}
                        aria-hidden="true"
                        className="text-[var(--ink-muted)]"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
