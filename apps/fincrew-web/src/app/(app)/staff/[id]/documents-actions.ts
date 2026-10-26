'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { addStaffDocument, deleteStaffDocument, type DocWriteResult } from '@fincrew/data';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export type DocState = { error?: string; done?: string };

function message(r: Exclude<DocWriteResult, { ok: true }>): string {
  switch (r.reason) {
    case 'no_permission':
      return t('settings.errors.noPermission');
    case 'name':
      return t('staffDocs.errors.name');
    case 'file':
      return t('staffDocs.errors.file');
    case 'failed':
      return t('staffDocs.errors.failed', { reason: r.message });
  }
}

/** Add a document (shared `addStaffDocument`; photos arrive already shrunk by the browser). */
export async function addDocument(
  staffId: string,
  _prev: DocState,
  form: FormData,
): Promise<DocState> {
  const me = await requireMe();
  if (!me) return { error: t('settings.errors.noPermission') };
  const file = form.get('file');
  if (!(file instanceof Blob) || file.size === 0) return { error: t('staffDocs.errors.file') };
  const r = await addStaffDocument(await createClient(), {
    ...me,
    staffId,
    name: String(form.get('name') ?? ''),
    file: { body: file, size: file.size, type: file.type },
    newId: randomUUID,
  });
  if (!r.ok) return { error: message(r) };
  revalidatePath(`/staff/${staffId}`);
  return { done: t('staffDocs.added') };
}

/** Remove a document and its file. */
export async function deleteDocument(staffId: string, documentId: string): Promise<DocState> {
  const me = await requireMe();
  if (!me) return { error: t('settings.errors.noPermission') };
  const r = await deleteStaffDocument(await createClient(), { ...me, documentId });
  if (!r.ok) return { error: message(r) };
  revalidatePath(`/staff/${staffId}`);
  return { done: t('staffDocs.deleted') };
}
