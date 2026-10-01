import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';
import { Image } from 'react-native';

/** A portfolio image prints at most ~6.6in tall, so 1600px keeps ~240dpi. */
export const PRINT_IMAGE_MAX_EDGE = 1600;
export const PRINT_IMAGE_QUALITY = 0.82;
/** Start the print cache over past this many files so it cannot grow without bound. */
const MAX_CACHED_PRINT_IMAGES = 300;

const printCacheDir = (): string => `${FileSystem.cacheDirectory}artcloset-print-images/`;

/** Resize so the long edge is at most `maxEdge`; null when the image is already small enough. */
export function printResizeAction(width: number, height: number, maxEdge = PRINT_IMAGE_MAX_EDGE): Action | null {
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { resize: { width: maxEdge } } : { resize: { height: maxEdge } };
}

/** Stable short key for a source file version (FNV-1a). */
export function printCacheKey(uri: string, size: number, modificationTime: number): string {
  let hash = 0x811c9dc5;
  for (const char of `${uri}|${size}|${modificationTime}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const imageSize = (uri: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });

async function ensurePrintCacheDir(): Promise<void> {
  const dir = printCacheDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (info.exists) {
    const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
    if (names.length < MAX_CACHED_PRINT_IMAGES) return;
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

/**
 * Print-sized JPEG copy of a stored photo, reused until the source file changes.
 * Falls back to the original file if it cannot be measured or resized.
 */
export async function preparePrintImage(uri: string): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) return uri;
    const cached = `${printCacheDir()}${printCacheKey(uri, info.size, info.modificationTime)}.jpg`;
    if ((await FileSystem.getInfoAsync(cached)).exists) return cached;

    const { width, height } = await imageSize(uri);
    const resize = printResizeAction(width, height);
    if (!resize) return uri;

    const result = await manipulateAsync(uri, [resize], {
      compress: PRINT_IMAGE_QUALITY,
      format: SaveFormat.JPEG,
    });
    await ensurePrintCacheDir();
    await FileSystem.moveAsync({ from: result.uri, to: cached });
    return cached;
  } catch {
    return uri;
  }
}
