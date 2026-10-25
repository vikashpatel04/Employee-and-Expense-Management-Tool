import { PendingLink as Link } from '@/components/app/pending-link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { FormDialog } from '@/components/app/form-dialog';
import { monthOf, weekday } from '@fincrew/core';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { SETTINGS_SECTIONS } from '@/lib/settings-access';
import { createClient } from '@/lib/supabase/server';
import { quietButtonClass } from '../../../components';
import { HolidayForm, RemoveHolidayButton } from './holiday-forms';

const card = 'rounded-lg border bg-card p-4 shadow-xs';

/** Shop holidays by year: everyone gets them, each paid or not (PLAN §4.3). */
export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const me = (await requireMe())!;
  if (!me.permissions.includes(SETTINGS_SECTIONS.holidays)) redirect('/settings');

  const today = todayIST();
  const asked = Number((await searchParams).year);
  const year =
    Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : monthOf(today).year;

  const supabase = await createClient();
  const { data } = await supabase
    .from('holidays')
    .select('id, date, name, paid')
    .eq('shop_id', me.shopId)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date');
  const holidays = data ?? [];
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const yearLink = `${quietButtonClass} inline-flex items-center justify-center px-2`;

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">{t('settings.holidays.subtitle')}</p>
          <FormDialog
            title={t('settings.holidays.add')}
            description={t('settings.holidays.addHint')}
            variant="default"
            trigger={
              <>
                <Plus aria-hidden="true" />
                {t('settings.holidays.add')}
              </>
            }
          >
            <HolidayForm defaultDate={year === monthOf(today).year ? today : `${year}-01-01`} />
          </FormDialog>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/settings/holidays?year=${year - 1}`}
            aria-label={t('settings.holidays.prevYear')}
            className={yearLink}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <h2 className="text-title-md min-w-28 text-center">
            {t('settings.holidays.year', { year })}
          </h2>
          <Link
            href={`/settings/holidays?year=${year + 1}`}
            aria-label={t('settings.holidays.nextYear')}
            className={yearLink}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
          {holidays.length > 0 && (
            <span className="text-caption text-[var(--ink-muted)]">
              {t('settings.holidays.count', { count: holidays.length })}
            </span>
          )}
        </div>
        {holidays.length === 0 ? (
          <p className={`${card} text-body-lg text-[var(--ink-muted)]`}>
            {t('settings.holidays.empty', { year })}
          </p>
        ) : (
          <ul className="bg-card overflow-hidden rounded-lg border shadow-xs">
            {holidays.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-label-sm">{h.name}</span>
                  <span className="text-caption text-[var(--ink-muted)]">
                    {days[weekday(h.date)]} {formatDate(h.date)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span
                    className={`text-caption rounded-full px-2 py-0.5 ${
                      h.paid
                        ? 'bg-[var(--status-holiday-soft)] text-[var(--status-holiday)]'
                        : 'bg-[var(--surface-muted)] text-[var(--ink-muted)]'
                    }`}
                  >
                    {h.paid ? t('settings.holidays.paid') : t('settings.holidays.unpaid')}
                  </span>
                  <RemoveHolidayButton id={h.id} name={h.name} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
