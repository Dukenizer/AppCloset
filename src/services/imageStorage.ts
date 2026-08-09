import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

export interface StoredImage {
  uri: string;
  width: number;
  height: number;
  fileSize: number | null;
}

const getImageDirectory = (): Directory => {
  if (Platform.OS === 'web') {
    throw new Error('Permanent artwork image storage is available in the Android and iOS apps.');
  }
  return new Directory(Paths.document, 'artcloset', 'images');
};

const ensureImageDirectory = (): Directory => {
  const imageDirectory = getImageDirectory();
  imageDirectory.create({ idempotent: true, intermediates: true });
  return imageDirectory;
};

export async function storeArtworkImage(sourceUri: string): Promise<StoredImage> {
  const imageDirectory = ensureImageDirectory();
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: 2400 });
  const rendered = await context.renderAsync();
  const processed = await rendered.saveAsync({ compress: 0.86, format: SaveFormat.JPEG });
  const destination = new File(imageDirectory, `${randomUUID()}.jpg`);

  try {
    new File(processed.uri).copy(destination);
    return {
      uri: destination.uri,
      width: processed.width,
      height: processed.height,
      fileSize: destination.size,
    };
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  } finally {
    const temporary = new File(processed.uri);
    if (temporary.exists) temporary.delete();
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
    const imageDirectory = getImageDirectory();
    const file = new File(uri);
    if (file.exists && file.parentDirectory.uri === imageDirectory.uri) file.delete();
  } catch {
    // Missing and inaccessible files are already effectively removed.
  }
}

export function getImageStorageUsage(): number {
  if (Platform.OS === 'web') return 0;
  const imageDirectory = ensureImageDirectory();
  return imageDirectory.list().reduce((total, entry) => total + (entry instanceof File ? (entry.size ?? 0) : 0), 0);
}
