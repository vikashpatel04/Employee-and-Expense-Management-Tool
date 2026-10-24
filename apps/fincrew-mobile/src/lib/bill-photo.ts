import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { BillUpload } from '@fincrew/data';

/** Aim for about 200 KB, like the website (PLAN §4.8). */
const TARGET_BYTES = 200 * 1024;
const TRIES = [
  { width: 1600, compress: 0.7 },
  { width: 1280, compress: 0.6 },
  { width: 1024, compress: 0.5 },
  { width: 800, compress: 0.45 },
];

export type BillPhoto = BillUpload & { uri: string };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 → bytes (Hermes and the browser both run this; no extra library). */
function decode(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]!) << 18) |
      (B64.indexOf(clean[i + 1]!) << 12) |
      ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) |
      (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/** Shrink a picked photo to a JPEG of about 200 KB, smaller each try. */
async function shrink(uri: string, width: number): Promise<BillPhoto> {
  let last: BillPhoto | null = null;
  for (const step of TRIES) {
    const r = await manipulateAsync(
      uri,
      width > step.width ? [{ resize: { width: step.width } }] : [],
      {
        compress: step.compress,
        format: SaveFormat.JPEG,
        base64: true,
      },
    );
    const bytes = decode(r.base64 ?? '');
    last = {
      uri: r.uri,
      body: bytes.buffer as ArrayBuffer,
      size: bytes.byteLength,
      type: 'image/jpeg',
    };
    if (bytes.byteLength <= TARGET_BYTES) break;
  }
  return last!;
}

/**
 * Take a bill photo with the camera or pick one from the phone, then shrink it. Null when the
 * person cancels or refuses the permission.
 */
export async function pickBillPhoto(source: 'camera' | 'library'): Promise<BillPhoto | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const r =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = r.canceled ? null : r.assets[0];
  if (!asset) return null;
  return shrink(asset.uri, asset.width);
}
