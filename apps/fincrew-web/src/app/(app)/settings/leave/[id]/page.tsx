import { PendingLink as Link } from '@/components/app/pending-link';
import { notFound, redirect } from 'next/navigation';
import { CalendarClock, ChevronLeft, Pencil, Users } from 'lucide-react';
import { FormDialog } from '@/components/app/form-dialog';
import { effectiveOn } from '@fincrew/core';
import { loadLeaveSetup } from '@fincrew/data';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { describeVersion } from '@/lib/leave-text';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { Avatar } from '../../../../components';
import { ArchiveButton, AssignForm, LeaveVersionForm, RenameForm } from '../leave-forms';

const card = 'rounded-lg border bg-card p-4 shadow-xs';
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
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t('settings.leave.detail.back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {tpl.name}
          {tpl.archived && (
            <span className="text-caption rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[var(--ink-muted)]">
              {t('settings.leave.archived')}
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <FormDialog
            title={t('settings.leave.detail.rename')}
            trigger={
              <>
                <Pencil aria-hidden="true" />
                {t('settings.leave.detail.rename')}
              </>
            }
          >
            <RenameForm templateId={id} name={tpl.name} />
          </FormDialog>
          {me.permissions.includes('staff.edit') && !tpl.archived && staff.length > 0 && (
            <FormDialog
              title={t('settings.leave.detail.assign')}
              description={t('settings.leave.detail.assignHint')}
              trigger={
                <>
                  <Users aria-hidden="true" />
                  {t('settings.leave.detail.assign')}
                </>
              }
            >
              <AssignForm
                templateId={id}
                defaultDate={today}
                staff={staff.map((s) => ({ id: s.id, name: s.name, current: s.templateName }))}
              />
            </FormDialog>
          )}
          <FormDialog
            title={t('settings.leave.detail.change')}
            description={t('settings.leave.detail.changeHint')}
            variant="default"
            wide
            trigger={
              <>
                <CalendarClock aria-hidden="true" />
                {t('settings.leave.detail.change')}
              </>
            }
          >
            <LeaveVersionForm templateId={id} initial={current ?? latest} defaultDate={today} />
          </FormDialog>
        </div>
      </div>
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
              <ul className="bg-card overflow-hidden rounded-lg border shadow-xs">
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
              <ul className="bg-card overflow-hidden rounded-lg border shadow-xs">
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
            <div className="flex flex-col gap-1">
              <ArchiveButton templateId={id} archived={tpl.archived} />
              <p className="text-caption text-[var(--ink-muted)]">
                {t('settings.leave.detail.archiveHint')}
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
