import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, Maximize2 } from 'lucide-react';
import { formatTimeOfDay, minutesOfDayIST } from '@fincrew/core';
import { loadAttendanceCode, loadCheckIns, minutesUntil } from '@fincrew/data';
import { formatDate, todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { QrSvg } from '@/lib/qr';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Avatar, PageHeader, quietButtonClass } from '../../components';
import { CodeActions, PrintButton } from './code-card';

const time = (iso: string) => formatTimeOfDay(minutesOfDayIST(new Date(iso)));
const card = 'rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--elevation-1)]';

/** "in 13 h 45 min" for the next code change. */
function untilText(iso: string) {
  const left = minutesUntil(iso);
  return left >= 60
    ? t('code.hours', { h: Math.floor(left / 60), m: left % 60 })
    : t('code.minutes', { m: left });
}

/**
 * Attendance code (design: "Web · attendance code", PLAN §4.5): today's code to copy or show as
 * a QR, a new code on demand, and today's check-ins by code. Needs attendance.code.
 */
export default async function CodePage() {
  const me = (await requireMe())!;
  if (!me.permissions.includes('attendance.code')) redirect('/');
  const supabase = await createClient();
  const today = todayIST();
  const [code, checkIns] = await Promise.all([
    loadAttendanceCode(supabase, me.shopId),
    loadCheckIns(supabase, me.shopId, today),
  ]);
  if (!code) return <p className="text-body text-[var(--danger)]">{t('code.failed')}</p>;
  const digits = `${code.code.slice(0, 3)} ${code.code.slice(3)}`;
  const reasons = t('code.results', { returnObjects: true }) as unknown as Record<string, string>;

  return (
    <>
      <PageHeader
        title={t('code.title')}
        subtitle={t('code.subtitle', { shop: me.shopName, date: formatDate(today) })}
        actions={
          me.permissions.includes('settings.attendance') && (
            <Link href="/settings/rules" className={quietButtonClass + ' inline-flex items-center'}>
              {t('code.settings')}
            </Link>
          )
        }
      />

      <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
        <section className={`${card} flex flex-col items-center gap-3 px-6 py-7 text-center`}>
          <span className="text-label-sm text-[var(--ink-muted)]">{t('code.today')}</span>
          <span
            aria-label={code.code.split('').join(' ')}
            className="font-[family-name:var(--font-num)] text-[56px] leading-[64px] font-bold tracking-[0.08em] tabular-nums"
          >
            {digits}
          </span>
          <span className="text-caption flex items-center gap-1.5 text-[var(--ink-muted)]">
            <Clock size={16} aria-hidden="true" />
            {code.nextChange
              ? t('code.changesAt', {
                  time: time(code.nextChange),
                  left: untilText(code.nextChange),
                })
              : t('code.manual')}
          </span>
          <CodeActions
            code={code.code}
            labels={{
              copy: t('code.copy'),
              copied: t('code.copied'),
              newCode: t('code.newCode'),
              newConfirm: t('code.newConfirm'),
              newYes: t('code.newYes'),
              cancel: t('code.cancel'),
            }}
          />
          <p className="text-caption max-w-sm text-[var(--ink-muted)]">{t('code.hint')}</p>
        </section>

        <section className={`${card} flex flex-col items-center gap-3 px-6 py-7`}>
          <QrSvg text={code.code} size={220} label={t('code.qrLabel', { code: code.code })} />
          <div className="flex flex-wrap justify-center gap-2 print:hidden">
            <Link href="/qr" className={`${quietButtonClass} inline-flex items-center gap-2`}>
              <Maximize2 size={18} aria-hidden="true" />
              {t('code.fullScreen')}
            </Link>
            <PrintButton label={t('code.print')} />
          </div>
        </section>
      </div>

      <section
        aria-labelledby="checkins-h"
        className={`${card} flex flex-col gap-3 p-5 print:hidden`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="checkins-h" className="text-title-md">
            {t('code.checkedIn', { count: checkIns.rows.length, total: checkIns.working })}
          </h2>
          <Link href="/code" className="text-label-sm text-[var(--accent-ink)] underline">
            {t('code.refresh')}
          </Link>
        </div>
        {checkIns.rows.length === 0 ? (
          <p className="text-body text-[var(--ink-muted)]">{t('code.none')}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse tabular-nums">
              <thead>
                <tr className="text-caption text-left text-[var(--ink-muted)]">
                  {(['staff', 'in', 'out', 'how', 'late'] as const).map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-semibold">
                      {t(`code.columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checkIns.rows.map((r) => (
                  <tr key={r.staffId} className="border-t border-[var(--line)]">
                    <td className="px-3 py-2.5">
                      <span className="text-label-sm flex items-center gap-2.5">
                        <Avatar name={r.name} size={32} />
                        {r.name}
                      </span>
                    </td>
                    <td className="text-money-sm px-3 py-2.5">
                      {r.checkIn ? time(r.checkIn) : '—'}
                    </td>
                    <td className="text-money-sm px-3 py-2.5 text-[var(--ink-muted)]">
                      {r.checkOut ? time(r.checkOut) : '—'}
                    </td>
                    <td className="text-body px-3 py-2.5 text-[var(--ink-muted)]">
                      {r.method ? t(`code.how.${r.method}`) : '—'}
                    </td>
                    <td className="text-label-sm px-3 py-2.5 text-[var(--status-late)]">
                      {r.lateMinutes ? t('code.lateMin', { minutes: r.lateMinutes }) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {checkIns.refused.length > 0 && (
          <p className="text-caption text-[var(--ink-muted)]">
            {t('code.refused', {
              count: checkIns.refused.length,
              list: checkIns.refused
                .slice(-5)
                .map((x) =>
                  t('code.refusedItem', {
                    name: x.name,
                    reason: reasons[x.result] ?? x.result,
                    time: time(x.at),
                  }),
                )
                .join('; '),
            })}
          </p>
        )}
      </section>
    </>
  );
}
