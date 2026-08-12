import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

export interface StoredImage {
  /** Portable relative ref preferred, e.g. artcloset/images/{uuid}.jpg */
  uri: string;
  width: number;
  height: number;
  fileSize: number | null;
}

/** Portable DB form, e.g. artcloset/images/{uuid}.jpg */
export type StoredImageRef = string;

const imagesDirUri = (): string => {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    throw new Error('Permanent artwork image storage is available in the Android and iOS apps.');
  }
  return `${FileSystem.documentDirectory}artcloset/images/`;
};

const pendingDirUri = (): string => {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    throw new Error('Permanent artwork image storage is available in the Android and iOS apps.');
  }
  return `${FileSystem.documentDirectory}artcloset/pending/`;
};

const brandingDirUri = (): string => {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    throw new Error('Studio logo storage is available in the Android and iOS apps.');
  }
  return `${FileSystem.documentDirectory}artcloset/branding/`;
};

const ensureDir = async (dirUri: string): Promise<void> => {
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }
};

const writeJpegBase64 = async (destinationUri: string, base64: string): Promise<void> => {
  await FileSystem.writeAsStringAsync(destinationUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
};

/**
 * Normalize any absolute/legacy URI to a portable relative ref under artcloset/.
 * Keeps unknown strings unchanged.
 */
export function toStoredImageRef(uriOrRef: string): StoredImageRef {
  const normalized = uriOrRef.replace(/\\/g, '/');
  const match = normalized.match(/artcloset\/(?:images|pending|branding)\/[^/?#]+/i);
  if (match) return match[0];
  if (normalized.startsWith('artcloset/')) return normalized;
  return uriOrRef;
}

function fileNameOf(uriOrRef: string): string | null {
  const cleaned = uriOrRef.replace(/\\/g, '/').split('?')[0] ?? uriOrRef;
  const parts = cleaned.split('/');
  const name = parts[parts.length - 1];
  return name && name.includes('.') ? name : null;
}

async function pathExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory;
  } catch {
    return false;
  }
}

/**
 * Resolve a DB-stored image ref/URI to a readable absolute file URI for the current install.
 * Remaps stale absolute paths from a previous install when the filename is known.
 */
export function resolveStoredImageUri(uriOrRef: string | null): string | null {
  if (!uriOrRef) return null;
  if (Platform.OS === 'web') return uriOrRef;
  const doc = FileSystem.documentDirectory;
  if (!doc) return uriOrRef;

  const relative = toStoredImageRef(uriOrRef);
  if (relative.startsWith('artcloset/')) {
    return `${doc}${relative}`;
  }

  const name = fileNameOf(uriOrRef);
  if (!name) return uriOrRef;
  if (uriOrRef.includes('/branding/') || name.startsWith('studio-logo')) {
    return `${doc}artcloset/branding/${name}`;
  }
  if (uriOrRef.includes('/pending/')) {
    return `${doc}artcloset/pending/${name}`;
  }
  return `${doc}artcloset/images/${name}`;
}

/** Sync existence check used by list UI. Prefer resolved path under current documents. */
export function imageExists(uri: string | null): boolean {
  if (!uri) return false;
  if (Platform.OS === 'web') return true;
  const resolved = resolveStoredImageUri(uri);
  if (!resolved) return false;
  try {
    return new File(resolved).exists;
  } catch {
    try {
      return new File(uri).exists;
    } catch {
      return false;
    }
  }
}

/**
 * Immediately copy a freshly picked/cropped image out of ImageManipulator/cache
 * into a stable pending file. Crop cache files can disappear before the user taps Save.
 */
export async function stagePendingArtworkImage(sourceUri: string): Promise<string> {
  await ensureDir(pendingDirUri());
  const destinationUri = `${pendingDirUri()}${randomUUID()}.jpg`;

  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destinationUri });
    const copied = await FileSystem.getInfoAsync(destinationUri);
    if (copied.exists) return destinationUri;
  } catch {
    // Fall through — Expo Go often cannot copy ImageManipulator cache files.
  }

  const processed = await manipulateAsync(sourceUri, [], {
    compress: 1,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!processed.base64) {
    throw new Error('Could not keep the cropped photo. Try choosing it again.');
  }
  await writeJpegBase64(destinationUri, processed.base64);
  const saved = await FileSystem.getInfoAsync(destinationUri);
  if (!saved.exists) {
    throw new Error('Could not keep the cropped photo. Try choosing it again.');
  }
  return destinationUri;
}

/**
 * Resize/compress into permanent vault storage.
 * Returns a portable relative ref for the DB (not an absolute file:// URI).
 */
export async function storeArtworkImage(sourceUri: string): Promise<StoredImage> {
  await ensureDir(imagesDirUri());
  const fileName = `${randomUUID()}.jpg`;
  const destinationUri = `${imagesDirUri()}${fileName}`;
  const storedRef = `artcloset/images/${fileName}`;

  try {
    const processed = await manipulateAsync(
      sourceUri,
      [{ resize: { width: 2400 } }],
      { compress: 0.86, format: SaveFormat.JPEG, base64: true },
    );

    if (!processed.base64) {
      throw new Error('Could not process the artwork image after cropping.');
    }

    await writeJpegBase64(destinationUri, processed.base64);
    const info = await FileSystem.getInfoAsync(destinationUri);
    if (!info.exists) {
      throw new Error('Could not save the artwork image to this device.');
    }

    if (sourceUri.includes('/artcloset/pending/')) {
      try {
        await FileSystem.deleteAsync(sourceUri, { idempotent: true });
      } catch {
        // Best-effort cleanup of the staged file.
      }
    }

    return {
      uri: storedRef,
      width: processed.width,
      height: processed.height,
      fileSize: !info.isDirectory ? (info.size ?? null) : null,
    };
  } catch (error) {
    try {
      await FileSystem.deleteAsync(destinationUri, { idempotent: true });
    } catch {
      // Best-effort cleanup.
    }
    if (error instanceof Error) {
      if (/NoSuchFileException|FileSystemFile\.copy|isn't (readable|moveable)/i.test(error.message)) {
        throw new Error(
          'Could not save the artwork image after cropping. Try choosing the photo again, then save.',
        );
      }
      throw error;
    }
    throw new Error('Could not save the artwork image after cropping.');
  }
}

/** Persist studio mark for calling card. Returns relative ref. */
export async function storeStudioLogo(sourceUri: string): Promise<string> {
  await ensureDir(brandingDirUri());
  const destinationUri = `${brandingDirUri()}studio-logo.jpg`;
  const processed = await manipulateAsync(sourceUri, [{ resize: { width: 800 } }], {
    compress: 0.9,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!processed.base64) {
    throw new Error('Could not process the studio logo.');
  }
  await writeJpegBase64(destinationUri, processed.base64);
  const info = await FileSystem.getInfoAsync(destinationUri);
  if (!info.exists) {
    throw new Error('Could not save the studio logo on this device.');
  }
  return 'artcloset/branding/studio-logo.jpg';
}

export async function clearStudioLogo(uri: string | null): Promise<void> {
  if (!uri || Platform.OS === 'web') return;
  const resolved = resolveStoredImageUri(uri) ?? uri;
  try {
    await FileSystem.deleteAsync(resolved, { idempotent: true });
  } catch {
    // Best-effort cleanup.
  }
}

export function deleteStoredImage(uri: string): void {
  if (Platform.OS === 'web') return;
  try {
    const resolved = resolveStoredImageUri(uri) ?? uri;
    const imageDirectory = new Directory(Paths.document, 'artcloset', 'images');
    const file = new File(resolved);
    if (file.exists && file.parentDirectory.uri === imageDirectory.uri) file.delete();
  } catch {
    // Missing and inaccessible files are already effectively removed.
  }
}

export function getImageStorageUsage(): number {
  if (Platform.OS === 'web') return 0;
  const imageDirectory = new Directory(Paths.document, 'artcloset', 'images');
  imageDirectory.create({ idempotent: true, intermediates: true });
  return imageDirectory
    .list()
    .reduce((total, entry) => total + (entry instanceof File ? (entry.size ?? 0) : 0), 0);
}

/**
 * Rewrite absolute legacy URIs to portable relative refs when the file exists under the
 * current install's artcloset folder. Safe on every launch / after Drive restore.
 */
export async function repairStoredImageUris(database: SQLiteDatabase): Promise<number> {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) return 0;
  let repaired = 0;

  const imageRows = await database.getAllAsync<{ id: number; uri: string }>(
    'SELECT id, uri FROM artwork_images',
  );
  for (const row of imageRows) {
    const resolved = resolveStoredImageUri(row.uri);
    if (!resolved) continue;
    const exists = await pathExists(resolved);
    if (!exists) continue;
    const nextRef = toStoredImageRef(resolved);
    if (nextRef.startsWith('artcloset/') && nextRef !== row.uri) {
      await database.runAsync('UPDATE artwork_images SET uri = ? WHERE id = ?', nextRef, row.id);
      repaired += 1;
    }
  }

  const logo = await database.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'studio_logo_uri'`,
  );
  if (logo?.value) {
    const resolved = resolveStoredImageUri(logo.value);
    if (resolved && (await pathExists(resolved))) {
      const nextRef = toStoredImageRef(resolved);
      if (nextRef.startsWith('artcloset/') && nextRef !== logo.value) {
        await database.runAsync(
          `UPDATE app_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'studio_logo_uri'`,
          nextRef,
        );
        repaired += 1;
      }
    }
  }

  return repaired;
}
