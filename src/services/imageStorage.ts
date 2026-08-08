import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const imageDirectory = new Directory(Paths.document, 'artcloset', 'images');

export interface StoredImage {
  uri: string;
  width: number;
  height: number;
  fileSize: number | null;
}

const ensureImageDirectory = (): void => {
  imageDirectory.create({ idempotent: true, intermediates: true });
};

export async function storeArtworkImage(sourceUri: string): Promise<StoredImage> {
  ensureImageDirectory();
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
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export function deleteStoredImage(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists && file.parentDirectory.uri === imageDirectory.uri) file.delete();
  } catch {
    // Missing and inaccessible files are already effectively removed.
  }
}

export function getImageStorageUsage(): number {
  ensureImageDirectory();
  return imageDirectory.list().reduce((total, entry) => total + (entry instanceof File ? (entry.size ?? 0) : 0), 0);
}
