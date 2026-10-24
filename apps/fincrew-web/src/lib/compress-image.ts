/**
 * Shrink a bill photo in the browser before upload (PLAN §4.8: about 200 KB): scale the long
 * side down to 1600 px, then lower JPEG quality until it fits. Returns null when the browser
 * can't read the file (e.g. HEIC on some browsers).
 */
export async function compressImage(file: File, maxBytes = 200 * 1024): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
      if (blob && blob.size <= maxBytes) return blob;
    }
    scale *= 0.75;
  }
  return null;
}
