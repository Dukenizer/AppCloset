import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { listArtworks } from '@/data/artworkRepository';

interface CatalogExport {
  format: 'artcloset.catalog';
  version: 1;
  exportedAt: string;
  note: string;
  artworks: Awaited<ReturnType<typeof listArtworks>>;
}

export async function exportCatalog(database: SQLiteDatabase): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Catalog export is available in the Android and iOS apps.');
  }
  const artworks = await listArtworks(database, {
    search: '',
    status: null,
    sort: 'recently-added',
    year: '',
    dateFrom: '',
    dateTo: '',
    artist: '',
    genre: '',
    tag: '',
    medium: '',
    material: '',
    collection: '',
    collectionId: null,
    orientation: null,
    sizeBucket: null,
  });
  const payload: CatalogExport = {
    format: 'artcloset.catalog',
    version: 1,
    exportedAt: new Date().toISOString(),
    note: 'This catalog export contains metadata and local image references, not image file contents.',
    artworks,
  };
  const file = new File(Paths.cache, `artcloset-catalog-${Date.now()}.json`);
  file.create({ overwrite: true, intermediates: true });
  file.write(JSON.stringify(payload, null, 2));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Native sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export ArtCloset catalog',
    UTI: 'public.json',
  });
  return file.uri;
}

export async function shareImage(uri: string, dialogTitle = 'Share artwork card'): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Artwork card sharing is available in the Android and iOS apps.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Native sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'image/jpeg',
    dialogTitle,
    UTI: 'public.jpeg',
  });
}

/**
 * Opens the system sheet so the user can save the image (Photos / Files / Drive).
 * Avoids expo-media-library, which needs a rebuilt native binary (ExpoMediaLibraryNext).
 */
export async function saveImageToLibrary(uri: string): Promise<void> {
  await shareImage(uri, 'Save calling card');
}
