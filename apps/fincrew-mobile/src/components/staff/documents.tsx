import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { Camera, FileText, ImageIcon, Plus, Trash2 } from 'lucide-react-native';
import {
  addStaffDocument,
  deleteStaffDocument,
  fileSize,
  loadStaffDocuments,
  MAX_DOC_BYTES,
  type DocUpload,
  type DocWriteResult,
  type StaffDocument,
} from '@fincrew/data';
import { formatDisplayDate } from '@fincrew/core';
import { Field, FormMessage } from '@/components/form';
import { Sheet } from '@/components/sheet';
import { Button, Card, IconButton, Text } from '@/components/ui';
import { pickPhoto } from '@/lib/bill-photo';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

/** Photos of documents are kept readable: about 600 KB (bills are 200 KB). */
const DOC_PHOTO_BYTES = 600 * 1024;

function message(r: Exclude<DocWriteResult, { ok: true }>) {
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

/** A PDF from the phone, as bytes for the upload. */
async function pickPdf(): Promise<(DocUpload & { name: string }) | null> {
  const r = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });
  const asset = r.canceled ? null : r.assets[0];
  if (!asset) return null;
  const bytes = await (await fetch(asset.uri)).arrayBuffer();
  return { body: bytes, size: bytes.byteLength, type: 'application/pdf', name: asset.name };
}

/**
 * Staff detail · Documents (same as the website's tab; docs/features/staff-documents.md): the
 * person's documents (photo preview or PDF icon, name, kind · size · date), tap to open; with
 * staff.edit "Add document" (camera, photo, PDF + a name) and delete (asks first).
 */
export function DocumentsSection({ staffId, name }: { staffId: string; name: string }) {
  const { c } = useTheme();
  const { me, can } = useSession();
  const [docs, setDocs] = useState<StaffDocument[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<(DocUpload & { label: string }) | null>(null);
  const [docName, setDocName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StaffDocument | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const canEdit = can('staff.edit');
  const suggestions = t('staffDocs.suggestions', { returnObjects: true }) as unknown as string[];

  const load = useCallback(() => loadStaffDocuments(supabase, staffId).then(setDocs), [staffId]);
  useEffect(() => {
    void load();
  }, [load]);

  const choose = async (how: 'camera' | 'library' | 'pdf') => {
    setError(null);
    try {
      if (how === 'pdf') {
        const pdf = await pickPdf();
        if (!pdf) return;
        if (pdf.size > MAX_DOC_BYTES) return setError(t('staffDocs.errors.file'));
        setFile({ ...pdf, label: pdf.name });
      } else {
        const photo = await pickPhoto(how, DOC_PHOTO_BYTES);
        if (photo) setFile({ ...photo, label: t('staffDocs.photo') });
      }
    } catch {
      setError(t('staffDocs.errors.photo'));
    }
  };

  const save = async () => {
    if (!me || !file) return;
    setBusy(true);
    setError(null);
    const r = await addStaffDocument(supabase, {
      ...me,
      staffId,
      name: docName,
      file,
      newId: randomUUID,
    });
    setBusy(false);
    if (!r.ok) return setError(message(r));
    setAdding(false);
    setDone(t('staffDocs.added'));
    await load();
  };

  const remove = async () => {
    if (!me || !removing) return;
    setBusy(true);
    const r = await deleteStaffDocument(supabase, { ...me, documentId: removing.id });
    setBusy(false);
    setRemoving(null);
    setDone(r.ok ? t('staffDocs.deleted') : message(r));
    await load();
  };

  const open = () => {
    setFile(null);
    setDocName('');
    setError(null);
    setDone(null);
    setAdding(true);
  };

  if (!docs) return null;

  return (
    <View style={{ gap: space['space-3'] }}>
      <Text muted>{t('staffDocs.hint')}</Text>
      {canEdit && <Button label={t('staffDocs.add')} icon={Plus} block onPress={open} />}
      {done && <FormMessage ok text={done} />}
      {docs.length === 0 ? (
        <Text muted>{t('staffDocs.empty')}</Text>
      ) : (
        <Card>
          {docs.map((d, i) => {
            const isImage = d.mimeType.startsWith('image/');
            return (
              <View
                key={d.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space['space-3'],
                  padding: space['space-3'],
                  borderBottomWidth: i < docs.length - 1 ? 1 : 0,
                  borderBottomColor: c.line,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('staffDocs.openLabel', { name: d.name })}
                  onPress={() => d.url && void Linking.openURL(d.url)}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space['space-3'],
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: radius['radius-sm'],
                      overflow: 'hidden',
                      backgroundColor: c['surface-muted'],
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isImage && d.url ? (
                      <Image source={{ uri: d.url }} style={{ width: 48, height: 48 }} />
                    ) : (
                      <FileText size={22} color={c['ink-muted']} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="label-sm" numberOfLines={1}>
                      {d.name}
                    </Text>
                    <Text variant="caption" muted>
                      {`${isImage ? t('staffDocs.photo') : t('staffDocs.pdf')} · ${fileSize(d.sizeBytes)} · ${formatDisplayDate(d.createdAt.slice(0, 10))}`}
                    </Text>
                  </View>
                </Pressable>
                {canEdit && (
                  <IconButton
                    label={t('staffDocs.deleteLabel', { name: d.name })}
                    onPress={() => setRemoving(d)}
                    icon={<Trash2 size={20} color={c['ink-muted']} />}
                  />
                )}
              </View>
            );
          })}
        </Card>
      )}

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={t('staffDocs.addTitle')}
        subtitle={name}
      >
        <Field label={t('staffDocs.name')} value={docName} onChange={setDocName} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {suggestions.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              onPress={() => setDocName(s)}
              style={{
                paddingHorizontal: space['space-3'],
                minHeight: 36,
                justifyContent: 'center',
                borderRadius: radius['radius-pill'],
                backgroundColor: c['surface-muted'],
              }}
            >
              <Text variant="caption">{s}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: space['space-2'], marginTop: space['space-2'] }}>
          {(
            [
              ['camera', Camera, t('staffDocs.takePhoto')],
              ['library', ImageIcon, t('staffDocs.choosePhoto')],
              ['pdf', FileText, t('staffDocs.choosePdf')],
            ] as const
          ).map(([how, Icon, label]) => (
            <View key={how} style={{ flex: 1 }}>
              <Button
                label={label}
                icon={Icon}
                variant="secondary"
                block
                onPress={() => void choose(how)}
              />
            </View>
          ))}
        </View>
        {file && <Text muted>{`${file.label} · ${fileSize(file.size)}`}</Text>}
        {error && <FormMessage ok={false} text={error} />}
        <View style={{ marginTop: space['space-3'] }}>
          <Button
            label={busy ? t('staffDocs.uploading') : t('staffDocs.upload')}
            busy={busy}
            disabled={!file || !docName.trim()}
            block
            onPress={() => void save()}
          />
        </View>
      </Sheet>

      <Sheet
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t('staffDocs.deleteLabel', { name: removing?.name ?? '' })}
      >
        <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('mobile.today.sheet.cancel')}
              variant="secondary"
              block
              onPress={() => setRemoving(null)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('staffDocs.deleteConfirm')}
              icon={Trash2}
              busy={busy}
              block
              onPress={() => void remove()}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
