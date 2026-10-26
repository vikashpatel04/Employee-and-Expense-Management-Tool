import { ExternalLink, FileText, Plus } from 'lucide-react';
import { fileSize, loadStaffDocuments } from '@fincrew/data';
import { FormDialog } from '@/components/app/form-dialog';
import { PanelEmpty } from '@/components/app/layout';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { AddDocumentForm, DeleteDocumentButton } from './documents-forms';

/**
 * Staff detail · Documents (design "Web · staff documents"; docs/features/staff-documents.md):
 * a grid of cards (photo preview or PDF icon, name, kind · size · date, Open / Delete) and
 * "Add document" in a dialog. Read with staff.view or by the person themself; add / delete with
 * staff.edit.
 */
export async function DocumentsTab({
  staffId,
  name,
  canEdit,
}: {
  staffId: string;
  name: string;
  canEdit: boolean;
}) {
  const docs = await loadStaffDocuments(await createClient(), staffId);
  const suggestions = t('staffDocs.suggestions', { returnObjects: true }) as unknown as string[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{t('staffDocs.hint')}</p>
        {canEdit && (
          <FormDialog
            title={t('staffDocs.addTitle')}
            description={name}
            variant="default"
            trigger={
              <>
                <Plus aria-hidden="true" />
                {t('staffDocs.add')}
              </>
            }
          >
            <AddDocumentForm staffId={staffId} suggestions={suggestions} />
          </FormDialog>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="bg-card rounded-lg border shadow-xs">
          <PanelEmpty>{t('staffDocs.empty')}</PanelEmpty>
        </div>
      ) : (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]">
          {docs.map((d) => {
            const isImage = d.mimeType.startsWith('image/');
            return (
              <li
                key={d.id}
                className="bg-card flex flex-col overflow-hidden rounded-lg border shadow-xs"
              >
                <a
                  href={d.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-muted grid h-36 place-items-center overflow-hidden"
                  aria-label={t('staffDocs.openLabel', { name: d.name })}
                >
                  {isImage && d.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed Storage link
                    <img src={d.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <FileText className="text-muted-foreground size-9" aria-hidden="true" />
                  )}
                </a>
                <div className="flex flex-col gap-0.5 px-3 pt-3">
                  <span className="truncate text-sm font-semibold">{d.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {isImage ? t('staffDocs.photo') : t('staffDocs.pdf')} · {fileSize(d.sizeBytes)}{' '}
                    · {formatDate(d.createdAt.slice(0, 10))}
                  </span>
                </div>
                <div className="flex items-center gap-1 p-2">
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium"
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      {t('staffDocs.open')}
                    </a>
                  )}
                  {canEdit && (
                    <DeleteDocumentButton staffId={staffId} documentId={d.id} name={d.name} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
