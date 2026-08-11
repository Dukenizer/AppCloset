import type { SQLiteDatabase } from 'expo-sqlite';

import { getArtwork, getSetting, setSetting } from '@/data/artworkRepository';
import type { Artwork } from '@/domain/artwork';
import { imageExists } from '@/services/imageStorage';

export const FEATURED_ARTWORK_SETTING = 'featured_artwork_id';

export async function getFeaturedArtworkId(database: SQLiteDatabase): Promise<number | null> {
  const raw = await getSetting(database, FEATURED_ARTWORK_SETTING);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function setFeaturedArtworkId(database: SQLiteDatabase, artworkId: number): Promise<void> {
  await setSetting(database, FEATURED_ARTWORK_SETTING, String(artworkId));
}

export async function clearFeaturedArtworkId(database: SQLiteDatabase): Promise<void> {
  await setSetting(database, FEATURED_ARTWORK_SETTING, '');
}

/** Prefer the pinned featured artwork; clear the pin if it is missing or has no image. */
export async function resolveFeaturedArtwork(
  database: SQLiteDatabase,
  fallbackCandidates: Artwork[],
): Promise<{ artwork: Artwork | null; pinned: boolean }> {
  const pinnedId = await getFeaturedArtworkId(database);
  if (pinnedId !== null) {
    const pinned = await getArtwork(database, pinnedId);
    if (pinned?.primaryImageUri && imageExists(pinned.primaryImageUri)) {
      return { artwork: pinned, pinned: true };
    }
    await clearFeaturedArtworkId(database);
  }

  const fallback = fallbackCandidates.find(
    (item) => item.primaryImageUri && imageExists(item.primaryImageUri),
  );
  return { artwork: fallback ?? null, pinned: false };
}
