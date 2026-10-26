'use client';

import { startTransition, useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { MAX_DOC_BYTES } from '@fincrew/data';
import { useDialogDone } from '@/components/app/form-dialog';
import { compressImage } from '@/lib/compress-image';
import { t } from '@/lib/i18n';
import { buttonClass, inputClass } from '../../../components';
import { addDocument, deleteDocument, type DocState } from './documents-actions';

/**
 * Add a document (design "Web · staff documents"): a name (common ones one tap away) and a photo
 * or PDF. Photos are shrunk in the browser (ID cards stay readable at ~600 KB); PDFs go as they
 * are, up to the bucket's 4 MB.
 */
export function AddDocumentForm({
  staffId,
  suggestions,
}: {
  staffId: string;
  suggestions: string[];
}) {
  const [state, dispatch, pending] = useActionState<DocState, FormData>(
    addDocument.bind(null, staffId),
    {},
  );
  useDialogDone(state);
  const [name, setName] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPrepError(null);
    const data = new FormData(e.currentTarget);
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) return setPrepError(t('staffDocs.errors.file'));
    if (file.type.startsWith('image/')) {
      setPreparing(true);
      const small = await compressImage(file, 600 * 1024);
      setPreparing(false);
      if (!small) return setPrepError(t('staffDocs.errors.photo'));
      data.set('file', new File([small], 'document.jpg', { type: 'image/jpeg' }));
    } else if (file.type !== 'application/pdf' || file.size > MAX_DOC_BYTES) {
      return setPrepError(t('staffDocs.errors.file'));
    }
    startTransition(() => dispatch(data));
  };

  const busy = pending || preparing;
  const error = prepError ?? state.error;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="text-label-sm block">
        {t('staffDocs.name')}
        <input
          name="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>
      <div className="flex flex-wrap gap-1.5" aria-label={t('staffDocs.suggestionsLabel')}>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setName(s)}
            className="bg-muted hover:bg-accent rounded-full px-2.5 py-1 text-xs font-semibold"
          >
            {s}
          </button>
        ))}
      </div>
      <label className="border-input text-muted-foreground hover:bg-muted/50 flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-[1.5px] border-dashed p-5 text-center text-sm">
        <Upload className="size-5" aria-hidden="true" />
        <span>{fileName ?? t('staffDocs.choose')}</span>
        <span className="text-xs">{t('staffDocs.fileHint')}</span>
        <input
          name="file"
          type="file"
          required
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>
      {error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} aria-busy={busy} className={buttonClass}>
        {busy ? t('staffDocs.uploading') : t('staffDocs.upload')}
      </button>
    </form>
  );
}

/** Two taps: "Delete", then "Yes, delete". */
export function DeleteDocumentButton({
  staffId,
  documentId,
  name,
}: {
  staffId: string;
  documentId: string;
  name: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      aria-label={asking ? undefined : t('staffDocs.deleteLabel', { name })}
      onClick={() =>
        asking
          ? start(async () => {
              const r = await deleteDocument(staffId, documentId);
              if (r.error) toast.error(r.error);
              else {
                toast.success(r.done ?? '');
                router.refresh();
              }
              setAsking(false);
            })
          : setAsking(true)
      }
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors hover:bg-muted ${
        asking ? 'text-[var(--danger)]' : 'text-muted-foreground'
      }`}
    >
      <Trash2 className="size-3.5" aria-hidden="true" />
      {asking ? t('staffDocs.deleteConfirm') : t('staffDocs.delete')}
    </button>
  );
}
