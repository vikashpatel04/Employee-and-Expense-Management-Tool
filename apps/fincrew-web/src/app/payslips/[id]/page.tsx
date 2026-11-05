import { PendingLink as Link } from '@/components/app/pending-link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { loadPayslipView } from '@fincrew/data';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { quietButtonClass } from '../../components';
import { PayslipDocument } from './payslip-document';
import { PrintButton } from './print-button';

/**
 * One payslip as a printable page (outside the app shell). "Print or save as PDF" uses the
 * browser's print dialog. People see their own finalized payslips; `salary.view` sees all (RLS).
 */
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  if (!me) redirect('/');
  const { id } = await params;

  const supabase = await createClient();
  const slip = await loadPayslipView(supabase, id);
  if (!slip) notFound();
  const months = t('months.long', { returnObjects: true }) as unknown as string[];

  return (
    <main className="mx-auto flex max-w-[210mm] flex-col gap-4 px-4 py-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/salary?month=${slip.year}-${String(slip.month).padStart(2, '0')}`}
          className={`${quietButtonClass} inline-flex items-center gap-1 border-0 px-2`}
        >
          <ChevronLeft size={20} aria-hidden="true" />
          {t('payslip.back')}
        </Link>
        <PrintButton
          label={t('payslip.print')}
          fileName={`${t('payslip.title')} ${slip.name} ${months[slip.month - 1]} ${slip.year}`}
        />
      </div>
      <PayslipDocument slip={slip} today={todayIST()} />
    </main>
  );
}
