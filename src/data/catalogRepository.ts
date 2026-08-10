import type { SQLiteDatabase } from 'expo-sqlite';

import { SEED_GENRES, SEED_MATERIALS, SEED_MEDIUMS } from '@/domain/catalog';

export type CatalogKind = 'medium' | 'material' | 'genre';

export interface CatalogItem {
  id: number;
  name: string;
  archivedAt: string | null;
  usageCount: number;
  isProtected: boolean;
}

const definitions = {
  medium: { table: 'catalog_mediums', artworkColumn: 'medium' },
  material: { table: 'catalog_materials', artworkColumn: 'material' },
  genre: { table: 'genres', artworkColumn: null },
} as const;

const definitionFor = (kind: CatalogKind) => definitions[kind];

export async function listCatalogMediums(database: SQLiteDatabase): Promise<string[]> {
  const rows = await database.getAllAsync<{ name: string }>(
    'SELECT name FROM catalog_mediums WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map((row) => row.name);
}

export async function listCatalogMaterials(database: SQLiteDatabase): Promise<string[]> {
  const rows = await database.getAllAsync<{ name: string }>(
    'SELECT name FROM catalog_materials WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map((row) => row.name);
}

export async function listCatalogGenres(database: SQLiteDatabase): Promise<string[]> {
  const rows = await database.getAllAsync<{ name: string }>(
    'SELECT name FROM genres WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map((row) => row.name);
}

async function ensureCatalogValue(
  database: SQLiteDatabase,
  kind: CatalogKind,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const { table } = definitionFor(kind);
  await database.runAsync(`INSERT OR IGNORE INTO ${table}(name) VALUES (?)`, trimmed);
  await database.runAsync(
    `UPDATE ${table} SET archived_at = NULL WHERE name = ? COLLATE NOCASE`,
    trimmed,
  );
}

export async function ensureCatalogMedium(database: SQLiteDatabase, name: string): Promise<void> {
  await ensureCatalogValue(database, 'medium', name);
}

export async function ensureCatalogMaterial(database: SQLiteDatabase, name: string): Promise<void> {
  await ensureCatalogValue(database, 'material', name);
}

export async function ensureCatalogGenre(database: SQLiteDatabase, name: string): Promise<void> {
  await ensureCatalogValue(database, 'genre', name);
}

export async function listCatalogItems(
  database: SQLiteDatabase,
  kind: CatalogKind,
): Promise<CatalogItem[]> {
  const { table, artworkColumn } = definitionFor(kind);
  const usageSql =
    artworkColumn === null
      ? `(SELECT COUNT(*) FROM artwork_genres ag
          JOIN artworks a ON a.id = ag.artwork_id
          WHERE ag.genre_id = catalog.id AND a.deleted_at IS NULL)`
      : `(SELECT COUNT(*) FROM artworks a
          WHERE a.${artworkColumn} = catalog.name COLLATE NOCASE
            AND a.deleted_at IS NULL)`;
  const rows = await database.getAllAsync<{
    id: number;
    name: string;
    archived_at: string | null;
    usage_count: number;
  }>(
    `SELECT id, name, archived_at, ${usageSql} AS usage_count
     FROM ${table} catalog
     ORDER BY archived_at IS NOT NULL ASC, name COLLATE NOCASE ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    archivedAt: row.archived_at,
    usageCount: row.usage_count,
    isProtected: row.name.toLowerCase() === 'other',
  }));
}

export async function createCatalogItem(
  database: SQLiteDatabase,
  kind: CatalogKind,
  name: string,
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required.');
  const { table } = definitionFor(kind);
  const existing = await database.getFirstAsync<{ id: number }>(
    `SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE`,
    trimmed,
  );
  if (existing) {
    await database.runAsync(`UPDATE ${table} SET archived_at = NULL WHERE id = ?`, existing.id);
    return existing.id;
  }
  const result = await database.runAsync(`INSERT INTO ${table}(name) VALUES (?)`, trimmed);
  return result.lastInsertRowId;
}

export async function renameCatalogItem(
  database: SQLiteDatabase,
  kind: CatalogKind,
  id: number,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required.');
  const { table, artworkColumn } = definitionFor(kind);
  await database.withTransactionAsync(async () => {
    const current = await database.getFirstAsync<{ name: string }>(
      `SELECT name FROM ${table} WHERE id = ?`,
      id,
    );
    if (!current) throw new Error('Catalog item not found.');
    if (current.name.toLowerCase() === 'other') throw new Error('The default “Other” option cannot be renamed.');
    const duplicate = await database.getFirstAsync<{ id: number }>(
      `SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE AND id <> ?`,
      trimmed,
      id,
    );
    if (duplicate) throw new Error('That name already exists.');
    if (artworkColumn !== null) {
      await database.runAsync(
        `UPDATE artworks SET ${artworkColumn} = ?, updated_at = CURRENT_TIMESTAMP
         WHERE ${artworkColumn} = ? COLLATE NOCASE`,
        trimmed,
        current.name,
      );
    }
    await database.runAsync(`UPDATE ${table} SET name = ? WHERE id = ?`, trimmed, id);
  });
}

export async function archiveCatalogItem(
  database: SQLiteDatabase,
  kind: CatalogKind,
  id: number,
): Promise<void> {
  const { table } = definitionFor(kind);
  const item = await database.getFirstAsync<{ name: string }>(`SELECT name FROM ${table} WHERE id = ?`, id);
  if (!item) throw new Error('Catalog item not found.');
  if (item.name.toLowerCase() === 'other') throw new Error('The default “Other” option cannot be archived.');
  await database.runAsync(
    `UPDATE ${table} SET archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP) WHERE id = ?`,
    id,
  );
}

export async function restoreCatalogItem(
  database: SQLiteDatabase,
  kind: CatalogKind,
  id: number,
): Promise<void> {
  const { table } = definitionFor(kind);
  await database.runAsync(`UPDATE ${table} SET archived_at = NULL WHERE id = ?`, id);
}

export async function deleteUnusedCatalogItem(
  database: SQLiteDatabase,
  kind: CatalogKind,
  id: number,
): Promise<void> {
  const item = (await listCatalogItems(database, kind)).find((entry) => entry.id === id);
  if (!item) throw new Error('Catalog item not found.');
  if (item.isProtected) throw new Error('The default “Other” option cannot be deleted.');
  if (item.usageCount > 0) throw new Error('This item is still used by artwork and cannot be deleted.');
  const { table } = definitionFor(kind);
  await database.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
}

export async function seedCatalogLookups(database: SQLiteDatabase): Promise<void> {
  for (const name of SEED_MEDIUMS) {
    await database.runAsync('INSERT OR IGNORE INTO catalog_mediums(name) VALUES (?)', name);
  }
  for (const name of SEED_MATERIALS) {
    await database.runAsync('INSERT OR IGNORE INTO catalog_materials(name) VALUES (?)', name);
  }
  for (const name of SEED_GENRES) {
    await database.runAsync('INSERT OR IGNORE INTO genres(name) VALUES (?)', name);
  }
}
