import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { effectiveOn } from '@fincrew/core';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { loadLeaveSetup } from '@/lib/leave-setup';
import { describeVersion } from '@/lib/leave-text';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { Avatar, quietButtonClass } from '../../../../components';
import { ArchiveButton, AssignForm, LeaveVersionForm, RenameForm } from '../leave-forms';

const card = 'rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]';
const row =
  'flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0';

/** One template: its rules by date, a dated change, and who is on it. */
export default async function LeaveTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const me = (await requireMe())!;
  if (!me.permissions.includes(SETTINGS_SECTIONS.leave)) redirect('/settings');
  const { id } = await params;
  const { saved } = await searchParams;

  const today = todayIST();
  const supabase = await createClient();
  const { templates, versionsByTemplate, staff } = await loadLeaveSetup(supabase, me.shopId, today);
  const tpl = templates.find((x) => x.id === id);
  if (!tpl) notFound();
  const versions = versionsByTemplate.get(id) ?? [];
  const current = effectiveOn(versions, today);
  const latest = versions[0];
  const onThis = staff.filter((s) => s.templateId === id);

  return (
    <>
      <Link
        href="/settings/leave"
        className={`${quietButtonClass} inline-flex w-fit items-center gap-1 border-0 px-2`}
      >
        <ChevronLeft size={20} aria-hidden="true" />
        {t('settings.leave.detail.back')}
      </Link>
      <h2 className="text-title-lg flex flex-wrap items-center gap-2">
        {tpl.name}
        {tpl.archived && (
          <span className="text-caption rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[var(--ink-muted)]">
            {t('settings.leave.archived')}
          </span>
        )}
      </h2>
      {saved && (
        <p
          role="status"
          className="text-body w-fit rounded-[var(--radius-md)] bg-[var(--status-present-soft)] px-4 py-3 text-[var(--status-present)]"
        >
          {t('settings.leave.detail.saved')}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-title-md px-1">{t('settings.leave.detail.versions')}</h3>
            {versions.length === 0 ? (
              <p className={`${card} text-body text-[var(--ink-muted)]`}>
                {t('settings.leave.noVersion')}
              </p>
            ) : (
              <ul className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
                {versions.map((v) => (
                  <li key={v.effectiveFrom} className={row}>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-label-sm flex flex-wrap items-center gap-2">
                        {t('settings.leave.since', { date: formatDate(v.effectiveFrom) })}
                        {v === current && (
                          <span className="text-caption rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[var(--accent-ink)]">
                            {t('settings.leave.detail.current')}
                          </span>
                        )}
                        {v.effectiveFrom > today && (
                          <span className="text-caption rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[var(--ink-muted)]">
                            {t('settings.leave.detail.upcoming')}
                          </span>
                        )}
                      </span>
                      <span className="text-caption text-[var(--ink-muted)]">
                        {describeVersion(v).join(' · ')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-title-md px-1">{t('settings.leave.detail.staff')}</h3>
            {onThis.length === 0 ? (
              <p className={`${card} text-body text-[var(--ink-muted)]`}>
                {t('settings.leave.detail.noStaff')}
              </p>
            ) : (
              <ul className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]">
                {onThis.map((s) => (
                  <li key={s.id} className={row}>
                    <span className="flex items-center gap-3">
                      <Avatar name={s.name} size={32} />
                      <Link
                        href={`/staff/${s.id}?tab=pay`}
                        className="text-label-sm text-[var(--accent-ink)] underline-offset-2 hover:underline"
                      >
                        {s.name}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${card} flex flex-col gap-4`}>
            <RenameForm templateId={id} name={tpl.name} />
            <div className="flex flex-col gap-1">
              <ArchiveButton templateId={id} archived={tpl.archived} />
              <p className="text-caption text-[var(--ink-muted)]">
                {t('settings.leave.detail.archiveHint')}
              </p>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          {me.permissions.includes('staff.edit') && !tpl.archived && staff.length > 0 && (
            <section className={card}>
              <h3 className="text-title-md">{t('settings.leave.detail.assign')}</h3>
              <p className="text-body mt-1 mb-4 text-[var(--ink-muted)]">
                {t('settings.leave.detail.assignHint')}
              </p>
              <AssignForm
                templateId={id}
                defaultDate={today}
                staff={staff.map((s) => ({ id: s.id, name: s.name, current: s.templateName }))}
              />
            </section>
          )}
          <section className={card}>
            <h3 className="text-title-md">{t('settings.leave.detail.change')}</h3>
            <p className="text-body mt-1 mb-4 text-[var(--ink-muted)]">
              {t('settings.leave.detail.changeHint')}
            </p>
            <LeaveVersionForm templateId={id} initial={current ?? latest} defaultDate={today} />
          </section>
        </div>
      </div>
    </>
  );
}
