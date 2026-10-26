import type { Supabase } from './client';

/** What the `staff-docs` bucket takes (migration 20261026000002). */
export const MAX_DOC_BYTES = 4 * 1024 * 1024;
export const DOC_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export type StaffDocument = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** When it was added (timestamp). */
  createdAt: string;
  /** A short-lived link to open or show it (null if it can't be read). */
  url: string | null;
};

/** A file to upload: a browser File/Blob (the website) or the phone's bytes (the app). */
export type DocUpload = {
  body: Parameters<ReturnType<Supabase['storage']['from']>['upload']>[1];
  size: number;
  type: string;
};

/**
 * A person's documents, newest first, each with a link that works for `seconds` (Storage RLS
 * decides who may read: the person themself or staff.view).
 */
export async function loadStaffDocuments(
  supabase: Supabase,
  staffId: string,
  seconds = 600,
): Promise<StaffDocument[]> {
  const { data } = await supabase
    .from('staff_documents')
    .select('id, name, file_path, mime_type, size_bytes, created_at')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: links } = await supabase.storage.from('staff-docs').createSignedUrls(
    rows.map((r) => r.file_path),
    seconds,
  );
  const url = new Map((links ?? []).map((l) => [l.path, l.signedUrl]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    url: url.get(r.file_path) ?? null,
  }));
}

export type DocWriteResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'no_permission' | 'name' | 'file' }
  | { ok: false; reason: 'failed'; message: string };

/**
 * Add a document (needs staff.edit): the file goes to Storage at
 * `<shop>/<staff>/<id>.<ext>` first, then the row; if the row is refused the file is removed.
 */
export async function addStaffDocument(
  supabase: Supabase,
  input: {
    shopId: string;
    permissions: readonly string[];
    staffId: string;
    name: string;
    file: DocUpload;
    /** Id for the new document (the file is named after it). */
    newId: () => string;
  },
): Promise<DocWriteResult> {
  if (!input.permissions.includes('staff.edit')) return { ok: false, reason: 'no_permission' };
  const name = input.name.trim();
  if (!name || name.length > 80) return { ok: false, reason: 'name' };
  const ext = DOC_TYPES[input.file.type];
  if (!ext || input.file.size <= 0 || input.file.size > MAX_DOC_BYTES)
    return { ok: false, reason: 'file' };

  const id = input.newId();
  const path = `${input.shopId}/${input.staffId}/${id}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('staff-docs')
    .upload(path, input.file.body, { contentType: input.file.type, upsert: false });
  if (upErr) return { ok: false, reason: 'failed', message: upErr.message };
  const { error } = await supabase.from('staff_documents').insert({
    id,
    shop_id: input.shopId,
    staff_id: input.staffId,
    name,
    file_path: path,
    mime_type: input.file.type,
    size_bytes: input.file.size,
  });
  if (error) {
    await supabase.storage.from('staff-docs').remove([path]);
    return { ok: false, reason: 'failed', message: error.message };
  }
  return { ok: true, id };
}

/** Remove a document and its file (needs staff.edit). */
export async function deleteStaffDocument(
  supabase: Supabase,
  input: { permissions: readonly string[]; documentId: string },
): Promise<DocWriteResult> {
  if (!input.permissions.includes('staff.edit')) return { ok: false, reason: 'no_permission' };
  const { data, error } = await supabase
    .from('staff_documents')
    .delete()
    .eq('id', input.documentId)
    .select('file_path');
  if (error) return { ok: false, reason: 'failed', message: error.message };
  const path = data?.[0]?.file_path;
  if (!path) return { ok: false, reason: 'no_permission' };
  await supabase.storage.from('staff-docs').remove([path]);
  return { ok: true, id: input.documentId };
}

/** "1.2 MB", "412 KB". */
export function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
