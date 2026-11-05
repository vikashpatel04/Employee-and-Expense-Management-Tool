import { Linking, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { printToFileAsync } from 'expo-print';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { phoneKey } from '@fincrew/core';
import {
  statementFileName,
  statementPrintHtml,
  statementShareText,
  type StatementKind,
  type StatementView,
} from '@fincrew/data';
import { t } from './i18n';

const monthNames = () => t('months.long', { returnObjects: true }) as unknown as string[];

/** The statement as text, straight to their WhatsApp when their number is saved. */
export async function sendStatementText(v: StatementView, kind: StatementKind): Promise<boolean> {
  const text = statementShareText(v, kind, t, monthNames());
  const key = phoneKey(v.phone);
  try {
    if (key) await Linking.openURL(`https://wa.me/91${key}?text=${encodeURIComponent(text)}`);
    else await Share.share({ message: text });
    return true;
  } catch {
    return false;
  }
}

/** The statement as a PDF (`statementPrintHtml`, the website's page), through the share sheet. */
export async function shareStatementPdf(v: StatementView, kind: StatementKind): Promise<boolean> {
  try {
    const { uri } = await printToFileAsync({
      html: statementPrintHtml(v, kind, t, monthNames()),
      width: 595,
      height: 842,
    });
    if (!(await isAvailableAsync())) return false;
    await shareAsync(named(uri, statementFileName(v, kind, t)), {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: statementFileName(v, kind, t),
    });
    return true;
  } catch {
    return false;
  }
}

/** The printed file under a name people can read; the printed name if that can't be done. */
function named(uri: string, name: string) {
  try {
    const file = new File(Paths.cache, `${name.replace(/[\\/:*?"<>|]/g, ' ')}.pdf`);
    if (file.exists) file.delete();
    new File(uri).copy(file);
    return file.uri;
  } catch {
    return uri;
  }
}
