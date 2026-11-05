import { scanFromURLAsync } from 'expo-camera';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import jsQR from 'jsqr';

/**
 * Reads a QR from a still photo. expo-camera's live reader and Google's scanner both go through
 * ML Kit, and neither reported a code on the owner's phone (29/10 and 05/11/2026), so the photo
 * is also read by jsQR: plain JavaScript that needs no Play services and no ML Kit.
 */

/** Wide enough for a QR filling a third of the frame, small enough to read in about a second. */
const READ_WIDTH = 640;

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_VALUE = new Map([...BASE64].map((ch, i) => [ch, i]));

/** Base64 to bytes (Hermes has no Buffer). */
export function base64Bytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let held = 0;
  let at = 0;
  for (const ch of clean) {
    bits = (bits << 6) | (BASE64_VALUE.get(ch) ?? 0);
    held += 6;
    if (held >= 8) {
      held -= 8;
      bytes[at++] = (bits >> held) & 0xff;
      bits &= (1 << held) - 1;
    }
  }
  return bytes;
}

/** The content of the QR in a JPEG, or null when it holds none that can be read. */
export function readQrFromJpeg(jpeg: Uint8Array): string | null {
  const image = decode(jpeg, { useTArray: true, formatAsRGBA: true });
  const pixels = new Uint8ClampedArray(image.data.buffer);
  // The attendance QR is always dark on white (`Qr`, `QrSvg`).
  return jsQR(pixels, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data || null;
}

/** Reads the photo at `uri`, then removes it: one is taken every second or so. */
export async function readQrFromPhoto(uri: string): Promise<string | null> {
  try {
    try {
      // Quick where ML Kit works on this phone.
      const found = await scanFromURLAsync(uri, ['qr']);
      if (found[0]?.data) return found[0].data;
    } catch {
      // ML Kit isn't usable here: jsQR below still reads it.
    }
    const small = await manipulateAsync(uri, [{ resize: { width: READ_WIDTH } }], {
      compress: 0.9,
      format: SaveFormat.JPEG,
      base64: true,
    });
    const data = small.base64 ? readQrFromJpeg(base64Bytes(small.base64)) : null;
    removePhoto(small.uri);
    return data;
  } finally {
    removePhoto(uri);
  }
}

function removePhoto(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // Only a cache file: the phone clears it in time.
  }
}
