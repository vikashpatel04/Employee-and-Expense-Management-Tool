import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { effectiveOn, monthOf, monthStart } from '@fincrew/core';
import { loadLeaveSetup } from '@fincrew/data';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { describeVersion } from '@/lib/leave-text';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { LeaveVersionForm } from './leave-forms';

const card = 'rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]';

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
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="flex flex-col gap-3">
        <p className="text-body text-[var(--ink-muted)]">{t('settings.leave.subtitle')}</p>
        {sorted.length === 0 ? (
          <p className={`${card} text-body-lg text-[var(--ink-muted)]`}>
            {t('settings.leave.empty')}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
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
      <section className={card}>
        <h2 className="text-title-md">{t('settings.leave.new')}</h2>
        <p className="text-body mt-1 mb-4 text-[var(--ink-muted)]">{t('settings.leave.newHint')}</p>
        <LeaveVersionForm defaultDate={monthStart(year, month)} />
      </section>
    </div>
  );
}
