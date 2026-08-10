import type { SQLiteDatabase } from 'expo-sqlite';

import {
  archiveCatalogItem,
  createCatalogItem,
  deleteUnusedCatalogItem,
  ensureCatalogGenre,
  ensureCatalogMedium,
  listCatalogGenres,
  listCatalogItems,
  listCatalogMediums,
  renameCatalogItem,
  restoreCatalogItem,
} from '../catalogRepository';

type Row = Record<string, unknown>;

function createMemoryDatabase(): SQLiteDatabase {
  const mediums = new Map<number, { id: number; name: string; archived_at: string | null }>();
  const materials = new Map<number, { id: number; name: string; archived_at: string | null }>();
  const genres = new Map<number, { id: number; name: string; archived_at: string | null }>();
  const artworks: Array<{
    id: number;
    medium: string;
    material: string;
    deleted_at: string | null;
  }> = [];
  const artworkGenres: Array<{ artwork_id: number; genre_id: number }> = [];
  let nextId = 1;

  const getTable = (sql: string) => {
    if (sql.includes('catalog_mediums')) return mediums;
    if (sql.includes('catalog_materials')) return materials;
    return genres;
  };

  const database = {
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes('WHERE archived_at IS NULL')) {
        const table = getTable(sql);
        return [...table.values()]
          .filter((row) => row.archived_at === null)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((row) => ({ name: row.name }));
      }
      if (sql.includes('usage_count')) {
        const table = getTable(sql);
        const kind = sql.includes('catalog_mediums')
          ? 'medium'
          : sql.includes('catalog_materials')
            ? 'material'
            : 'genre';
        return [...table.values()]
          .map((row) => {
            const usage_count =
              kind === 'genre'
                ? artworkGenres.filter((link) => {
                    const artwork = artworks.find((entry) => entry.id === link.artwork_id);
                    return link.genre_id === row.id && artwork?.deleted_at === null;
                  }).length
                : artworks.filter(
                    (artwork) =>
                      artwork.deleted_at === null &&
                      artwork[kind].toLowerCase() === row.name.toLowerCase(),
                  ).length;
            return {
              id: row.id,
              name: row.name,
              archived_at: row.archived_at,
              usage_count,
            };
          })
          .sort((a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)));
      }
      return [];
    }),
    getFirstAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      const table = getTable(sql);
      if (sql.includes('WHERE id = ?')) {
        return table.get(Number(params[0])) ?? null;
      }
      if (sql.includes('COLLATE NOCASE AND id <> ?')) {
        const name = String(params[0]).toLowerCase();
        const id = Number(params[1]);
        return (
          [...table.values()].find(
            (row) => row.name.toLowerCase() === name && row.id !== id,
          ) ?? null
        );
      }
      if (sql.includes('COLLATE NOCASE')) {
        const name = String(params[0]).toLowerCase();
        return [...table.values()].find((row) => row.name.toLowerCase() === name) ?? null;
      }
      return null;
    }),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      const table = getTable(sql);
      if (sql.startsWith('INSERT OR IGNORE') || sql.startsWith('INSERT INTO')) {
        const name = String(params[0]);
        const existing = [...table.values()].find(
          (row) => row.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing) return { lastInsertRowId: existing.id, changes: 0 };
        const id = nextId++;
        table.set(id, { id, name, archived_at: null });
        return { lastInsertRowId: id, changes: 1 };
      }
      if (sql.includes('SET archived_at = NULL WHERE name = ?')) {
        const name = String(params[0]).toLowerCase();
        for (const row of table.values()) {
          if (row.name.toLowerCase() === name) row.archived_at = null;
        }
        return { lastInsertRowId: 0, changes: 1 };
      }
      if (sql.includes('SET archived_at = NULL WHERE id = ?')) {
        const row = table.get(Number(params[0]));
        if (row) row.archived_at = null;
        return { lastInsertRowId: 0, changes: 1 };
      }
      if (sql.includes('SET archived_at = COALESCE')) {
        const row = table.get(Number(params[0]));
        if (row && !row.archived_at) row.archived_at = '2026-01-01T00:00:00.000Z';
        return { lastInsertRowId: 0, changes: 1 };
      }
      if (sql.includes('UPDATE artworks SET')) {
        const nextName = String(params[0]);
        const previous = String(params[1]).toLowerCase();
        const column = sql.includes('SET medium =') ? 'medium' : 'material';
        for (const artwork of artworks) {
          if (artwork[column].toLowerCase() === previous) artwork[column] = nextName;
        }
        return { lastInsertRowId: 0, changes: 1 };
      }
      if (sql.includes('SET name = ? WHERE id = ?')) {
        const row = table.get(Number(params[1]));
        if (row) row.name = String(params[0]);
        return { lastInsertRowId: 0, changes: 1 };
      }
      if (sql.startsWith('DELETE FROM')) {
        table.delete(Number(params[0]));
        return { lastInsertRowId: 0, changes: 1 };
      }
      return { lastInsertRowId: 0, changes: 0 };
    }),
    withTransactionAsync: jest.fn(async (operation: () => Promise<void>) => operation()),
    // Test helpers
    __seedArtwork(medium: string, material = '', deleted = false): number {
      const id = nextId++;
      artworks.push({
        id,
        medium,
        material,
        deleted_at: deleted ? '2026-01-01T00:00:00.000Z' : null,
      });
      return id;
    },
    __linkGenre(artworkId: number, genreId: number): void {
      artworkGenres.push({ artwork_id: artworkId, genre_id: genreId });
    },
  };

  return database as unknown as SQLiteDatabase & Row;
}

describe('catalogRepository', () => {
  it('lists only active catalog values and restores archived names on ensure', async () => {
    const database = createMemoryDatabase();
    const mediumId = await createCatalogItem(database, 'medium', 'Oil');
    await archiveCatalogItem(database, 'medium', mediumId);

    expect(await listCatalogMediums(database)).toEqual([]);

    await ensureCatalogMedium(database, 'Oil');
    expect(await listCatalogMediums(database)).toEqual(['Oil']);
  });

  it('renames a medium and updates active artwork assignments', async () => {
    const database = createMemoryDatabase() as SQLiteDatabase & {
      __seedArtwork: (medium: string, material?: string, deleted?: boolean) => number;
    };
    const id = await createCatalogItem(database, 'medium', 'Oil');
    database.__seedArtwork('Oil');
    database.__seedArtwork('Oil', '', true);

    await renameCatalogItem(database, 'medium', id, 'Oil on panel');

    const items = await listCatalogItems(database, 'medium');
    expect(items[0]?.name).toBe('Oil on panel');
    expect(items[0]?.usageCount).toBe(1);
  });

  it('archives without deleting genre assignments and blocks protected Other', async () => {
    const database = createMemoryDatabase() as SQLiteDatabase & {
      __seedArtwork: (medium: string, material?: string, deleted?: boolean) => number;
      __linkGenre: (artworkId: number, genreId: number) => void;
    };
    const otherId = await createCatalogItem(database, 'genre', 'Other');
    await expect(archiveCatalogItem(database, 'genre', otherId)).rejects.toThrow(/Other/);

    const genreId = await createCatalogItem(database, 'genre', 'Portrait');
    const artworkId = database.__seedArtwork('');
    database.__linkGenre(artworkId, genreId);
    await archiveCatalogItem(database, 'genre', genreId);

    expect(await listCatalogGenres(database)).toEqual(['Other']);
    const items = await listCatalogItems(database, 'genre');
    const portrait = items.find((item) => item.name === 'Portrait');
    expect(portrait?.archivedAt).toBeTruthy();
    expect(portrait?.usageCount).toBe(1);

    await restoreCatalogItem(database, 'genre', genreId);
    expect(await listCatalogGenres(database)).toEqual(['Other', 'Portrait']);
  });

  it('only permanently deletes unused catalog items', async () => {
    const database = createMemoryDatabase() as SQLiteDatabase & {
      __seedArtwork: (medium: string, material?: string, deleted?: boolean) => number;
    };
    const unusedId = await createCatalogItem(database, 'material', 'Linen');
    const usedId = await createCatalogItem(database, 'material', 'Canvas');
    database.__seedArtwork('', 'Canvas');

    await deleteUnusedCatalogItem(database, 'material', unusedId);
    await expect(deleteUnusedCatalogItem(database, 'material', usedId)).rejects.toThrow(/still used/);

    await ensureCatalogGenre(database, 'Custom');
    expect(await listCatalogGenres(database)).toContain('Custom');
  });
});
