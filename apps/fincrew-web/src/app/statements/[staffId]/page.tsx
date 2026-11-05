import { PendingLink as Link } from '@/components/app/pending-link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, MessageCircle } from 'lucide-react';
import { phoneKey } from '@fincrew/core';
import {
  loadStatement,
  statementDocumentHtml,
  statementFileName,
  statementShareText,
  type StatementKind,
} from '@fincrew/data';
import { todayIST } from '@/lib/format';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { quietButtonClass } from '../../components';
import { PrintButton } from '../../payslips/[id]/print-button';

/** Print rules for this document only: a clean A4 page with its colours kept. */
const PRINT_CSS = `
@page { size: A4; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  .statement-sheet { border: 0; border-radius: 0; box-shadow: none; }
  .statement-sheet, .statement-sheet * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;

/**
 * What the shop owes one person, as a page to print or send (outside the app shell, like a
 * payslip): the Statement of what's open today, or `?view=historical`, everything since joining.
 * Both end on the same total. The person themself, or salary.view (design "Web · statement",
 * "Web · statement, historical"; docs/features/statements.md).
 */
export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const me = await requireMe();
  if (!me) redirect('/');
  const { staffId } = await params;
  const { view } = await searchParams;
  if (me.personId !== staffId && !me.permissions.includes('salary.view')) redirect('/');
  const kind: StatementKind = view === 'historical' ? 'historical' : 'statement';

  const supabase = await createClient();
  const data = await loadStatement(supabase, me.shopId, staffId, todayIST());
  if (!data) notFound();
  const months = t('months.long', { returnObjects: true }) as unknown as string[];
  const key = phoneKey(data.phone);
  const text = encodeURIComponent(statementShareText(data, kind, t, months));
  const whatsapp = key ? `https://wa.me/91${key}?text=${text}` : `https://wa.me/?text=${text}`;
  const tab = (active: boolean) =>
    `inline-flex h-8 items-center rounded-md px-3 text-sm font-semibold ${
      active
        ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--elevation-1)]'
        : 'text-[var(--ink-muted)]'
    }`;

  return (
    <main className="mx-auto flex max-w-[210mm] flex-col gap-4 px-4 py-6 print:max-w-none print:p-0">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/staff/${staffId}`}
          className={`${quietButtonClass} inline-flex items-center gap-1 border-0 px-2`}
        >
          <ChevronLeft size={20} aria-hidden="true" />
          {t('statement.back')}
        </Link>
        <div className="inline-flex gap-0.5 rounded-lg bg-[var(--surface-muted)] p-[3px]">
          <Link href={`/statements/${staffId}`} className={tab(kind === 'statement')}>
            {t('statement.title')}
          </Link>
          <Link
            href={`/statements/${staffId}?view=historical`}
            className={tab(kind === 'historical')}
          >
            {t('statement.historical')}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className={`${quietButtonClass} min-h-12 gap-2`}
          >
            <MessageCircle size={20} aria-hidden="true" />
            {t('statement.whatsapp')}
          </a>
          <PrintButton label={t('statement.print')} fileName={statementFileName(data, kind, t)} />
        </div>
      </div>
      {/* Built by @fincrew/data, which escapes everything people typed. */}
      <article
        className="statement-sheet overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]"
        dangerouslySetInnerHTML={{ __html: statementDocumentHtml(data, kind, t, months) }}
      />
    </main>
  );
}
