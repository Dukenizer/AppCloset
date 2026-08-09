import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

export interface StoredImage {
  uri: string;
  width: number;
  height: number;
  fileSize: number | null;
}

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
 * Immediately copy a freshly picked/cropped image out of ImageManipulator/cache
 * into a stable pending file. Crop cache files can disappear before the user taps Save.
 */
export async function stagePendingArtworkImage(sourceUri: string): Promise<string> {
  await ensureDir(pendingDirUri());
  const destinationUri = `${pendingDirUri()}${randomUUID()}.jpg`;

  // Fast path: legacy copy (works for many picker URIs).
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destinationUri });
    const copied = await FileSystem.getInfoAsync(destinationUri);
    if (copied.exists) return destinationUri;
  } catch {
    // Fall through — Expo Go often cannot copy ImageManipulator cache files.
  }

  // Reliable path: re-encode to base64, then write into documents.
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
 * Resize/compress a staged (or other local) image into permanent vault storage.
 * Uses legacy FileSystem + manipulateAsync base64 — avoids File.copy on cache URIs.
 */
export async function storeArtworkImage(sourceUri: string): Promise<StoredImage> {
  await ensureDir(imagesDirUri());
  const destinationUri = `${imagesDirUri()}${randomUUID()}.jpg`;

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
      uri: destinationUri,
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
        throw new Error('Could not save the artwork image after cropping. Try choosing the photo again, then save.');
      }
      throw error;
    }
    throw new Error('Could not save the artwork image after cropping.');
  }
}

export function imageExists(uri: string | null): boolean {
  if (!uri) return false;
  if (Platform.OS === 'web') return true;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export function deleteStoredImage(uri: string): void {
  if (Platform.OS === 'web') return;
  try {
    const imageDirectory = new Directory(Paths.document, 'artcloset', 'images');
    const file = new File(uri);
    if (file.exists && file.parentDirectory.uri === imageDirectory.uri) file.delete();
  } catch {
    // Missing and inaccessible files are already effectively removed.
  }
}

export function getImageStorageUsage(): number {
  if (Platform.OS === 'web') return 0;
  const imageDirectory = new Directory(Paths.document, 'artcloset', 'images');
  imageDirectory.create({ idempotent: true, intermediates: true });
  return imageDirectory.list().reduce((total, entry) => total + (entry instanceof File ? (entry.size ?? 0) : 0), 0);
}
