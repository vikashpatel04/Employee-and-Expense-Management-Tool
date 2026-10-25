import { PendingLink as Link } from '@/components/app/pending-link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Clock } from 'lucide-react';
import { formatTimeOfDay, minutesOfDayIST } from '@fincrew/core';
import { loadAttendanceCode } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { QrSvg } from '@/lib/qr';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { quietButtonClass } from '../components';

/**
 * Full-screen QR for the counter display (design: "Attendance code · QR"): just the QR, the
 * digits and when it changes. Needs attendance.code.
 */
export default async function QrPage() {
  const me = await requireMe();
  if (!me || !me.permissions.includes('attendance.code')) redirect('/');
  const code = await loadAttendanceCode(await createClient(), me.shopId);
  if (!code) redirect('/code');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[var(--canvas)] p-6 text-center">
      <Link
        href="/code"
        className={`${quietButtonClass} inline-flex items-center gap-1 self-start print:hidden`}
      >
        <ChevronLeft size={18} aria-hidden="true" />
        {t('code.back')}
      </Link>
      <h1 className="text-title-xl">{t('code.scanTitle')}</h1>
      <p className="text-body text-[var(--ink-muted)]">{me.shopName}</p>
      <QrSvg text={code.code} size={360} label={t('code.qrLabel', { code: code.code })} />
      <span
        aria-label={code.code.split('').join(' ')}
        className="font-[family-name:var(--font-num)] text-[48px] leading-[56px] font-bold tracking-[0.08em] tabular-nums"
      >
        {code.code.slice(0, 3)} {code.code.slice(3)}
      </span>
      <span className="text-caption flex items-center gap-1.5 text-[var(--ink-muted)]">
        <Clock size={16} aria-hidden="true" />
        {code.nextChange
          ? t('code.changesAtShort', {
              time: formatTimeOfDay(minutesOfDayIST(new Date(code.nextChange))),
            })
          : t('code.manual')}
      </span>
    </main>
  );
}
