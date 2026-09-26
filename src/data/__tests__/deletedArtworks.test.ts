import type { SQLiteDatabase } from 'expo-sqlite';

import { permanentlyDeleteArtworks } from '@/data/deletedArtworks';
import { deleteStoredImage } from '@/services/imageStorage';
import { clearFeaturedArtworkId, getFeaturedArtworkId } from '@/data/featuredArtwork';

jest.mock('@/services/imageStorage', () => ({
  deleteStoredImage: jest.fn(),
  resolveStoredImageUri: jest.fn((uri: string | null) => uri),
}));

jest.mock('@/data/featuredArtwork', () => ({
  getFeaturedArtworkId: jest.fn(async () => null),
  clearFeaturedArtworkId: jest.fn(async () => undefined),
}));

interface ArtworkRow {
  id: number;
  deleted_at: string | null;
}

function createDatabase(artworks: ArtworkRow[], images: Array<{ artwork_id: number; uri: string }>) {
  const run = jest.fn(async (sql: string, ...params: number[]) => {
    if (sql.startsWith('DELETE FROM artworks')) {
      for (const id of params) {
        const index = artworks.findIndex((row) => row.id === id && row.deleted_at !== null);
        if (index >= 0) artworks.splice(index, 1);
      }
    }
    return { changes: 0, lastInsertRowId: 0 };
  });
  const database = {
    getAllAsync: jest.fn(async (sql: string, ...params: number[]) => {
      if (sql.startsWith('SELECT id FROM artworks')) {
        return artworks
          .filter((row) => row.deleted_at !== null && (params.length === 0 || params.includes(row.id)))
          .map((row) => ({ id: row.id }));
      }
      if (sql.startsWith('SELECT uri FROM artwork_images')) {
        return images.filter((image) => params.includes(image.artwork_id)).map((image) => ({ uri: image.uri }));
      }
      return [];
    }),
    runAsync: run,
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => task()),
  };
  return { database: database as unknown as SQLiteDatabase, artworks, run };
}

describe('permanentlyDeleteArtworks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('only removes artworks that are already in Deleted items', async () => {
    const { database, artworks } = createDatabase(
      [
        { id: 1, deleted_at: '2026-09-25 10:00:00' },
        { id: 2, deleted_at: null },
      ],
      [
        { artwork_id: 1, uri: 'images/one.jpg' },
        { artwork_id: 2, uri: 'images/two.jpg' },
      ],
    );

    const removed = await permanentlyDeleteArtworks(database, [1, 2]);

    expect(removed).toBe(1);
    expect(artworks.map((row) => row.id)).toEqual([2]);
    expect(deleteStoredImage).toHaveBeenCalledTimes(1);
    expect(deleteStoredImage).toHaveBeenCalledWith('images/one.jpg');
  });

  it('empties all deleted artworks and their photos when no ids are given', async () => {
    const { database, artworks, run } = createDatabase(
      [
        { id: 1, deleted_at: '2026-09-25 10:00:00' },
        { id: 3, deleted_at: '2026-09-24 10:00:00' },
        { id: 4, deleted_at: null },
      ],
      [
        { artwork_id: 1, uri: 'images/one.jpg' },
        { artwork_id: 3, uri: 'images/three.jpg' },
      ],
    );

    const removed = await permanentlyDeleteArtworks(database);

    expect(removed).toBe(2);
    expect(artworks.map((row) => row.id)).toEqual([4]);
    expect(deleteStoredImage).toHaveBeenCalledTimes(2);
    const linkTables = run.mock.calls.map(([sql]) => sql as string).filter((sql) => /DELETE FROM artwork_/.test(sql));
    expect(linkTables).toHaveLength(4);
  });

  it('clears the featured pin when the featured artwork is deleted forever', async () => {
    (getFeaturedArtworkId as jest.Mock).mockResolvedValueOnce(1);
    const { database } = createDatabase([{ id: 1, deleted_at: '2026-09-25 10:00:00' }], []);

    await permanentlyDeleteArtworks(database, [1]);

    expect(clearFeaturedArtworkId).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is nothing to delete', async () => {
    const { database, run } = createDatabase([{ id: 2, deleted_at: null }], []);

    expect(await permanentlyDeleteArtworks(database)).toBe(0);
    expect(await permanentlyDeleteArtworks(database, [])).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
});
