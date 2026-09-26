import type { SQLiteDatabase } from 'expo-sqlite';

import { clearFeaturedArtworkId, getFeaturedArtworkId } from '@/data/featuredArtwork';
import { deleteStoredImage, resolveStoredImageUri } from '@/services/imageStorage';

export interface DeletedArtwork {
  id: number;
  title: string;
  deletedAt: string;
  thumbnailUri: string | null;
}

export async function listDeletedArtworks(database: SQLiteDatabase): Promise<DeletedArtwork[]> {
  const rows = await database.getAllAsync<{ id: number; title: string; deleted_at: string; uri: string | null }>(
    `SELECT a.id, a.title, a.deleted_at,
       (SELECT i.uri FROM artwork_images i WHERE i.artwork_id = a.id ORDER BY i.is_primary DESC, i.id LIMIT 1) AS uri
     FROM artworks a
     WHERE a.deleted_at IS NOT NULL
     ORDER BY a.deleted_at DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    deletedAt: row.deleted_at,
    thumbnailUri: resolveStoredImageUri(row.uri),
  }));
}

export async function countDeletedArtworks(database: SQLiteDatabase): Promise<number> {
  const row = await database.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM artworks WHERE deleted_at IS NOT NULL',
  );
  return row?.c ?? 0;
}

/**
 * Permanently removes deleted artworks (rows, links, and image files). Only artworks already in
 * Deleted items are affected. Pass no ids to empty Deleted items entirely. Returns the count removed.
 */
export async function permanentlyDeleteArtworks(database: SQLiteDatabase, ids?: number[]): Promise<number> {
  if (ids && ids.length === 0) return 0;
  const idFilter = ids ? ` AND id IN (${ids.map(() => '?').join(', ')})` : '';
  const targets = await database.getAllAsync<{ id: number }>(
    `SELECT id FROM artworks WHERE deleted_at IS NOT NULL${idFilter}`,
    ...(ids ?? []),
  );
  const targetIds = targets.map((row) => row.id);
  if (targetIds.length === 0) return 0;

  const placeholders = targetIds.map(() => '?').join(', ');
  const images = await database.getAllAsync<{ uri: string }>(
    `SELECT uri FROM artwork_images WHERE artwork_id IN (${placeholders})`,
    ...targetIds,
  );

  await database.withTransactionAsync(async () => {
    for (const table of ['artwork_images', 'artwork_tags', 'artwork_genres', 'artwork_collections']) {
      await database.runAsync(`DELETE FROM ${table} WHERE artwork_id IN (${placeholders})`, ...targetIds);
    }
    await database.runAsync(
      `DELETE FROM artworks WHERE deleted_at IS NOT NULL AND id IN (${placeholders})`,
      ...targetIds,
    );
  });

  const featuredId = await getFeaturedArtworkId(database);
  if (featuredId !== null && targetIds.includes(featuredId)) {
    await clearFeaturedArtworkId(database);
  }

  for (const image of images) {
    deleteStoredImage(image.uri);
  }
  return targetIds.length;
}
