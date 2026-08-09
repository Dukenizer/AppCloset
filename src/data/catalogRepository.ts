import type { SQLiteDatabase } from 'expo-sqlite';

import { SEED_GENRES, SEED_MATERIALS, SEED_MEDIUMS } from '@/domain/catalog';

export async function listCatalogMediums(database: SQLiteDatabase): Promise<string[]> {
  const rows = await database.getAllAsync<{ name: string }>(
    'SELECT name FROM catalog_mediums ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map((row) => row.name);
}

export async function listCatalogMaterials(database: SQLiteDatabase): Promise<string[]> {
  const rows = await database.getAllAsync<{ name: string }>(
    'SELECT name FROM catalog_materials ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map((row) => row.name);
}

export async function listCatalogGenres(database: SQLiteDatabase): Promise<string[]> {
  const rows = await database.getAllAsync<{ name: string }>(
    'SELECT name FROM genres ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map((row) => row.name);
}

export async function ensureCatalogMedium(database: SQLiteDatabase, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await database.runAsync('INSERT OR IGNORE INTO catalog_mediums(name) VALUES (?)', trimmed);
}

export async function ensureCatalogMaterial(database: SQLiteDatabase, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await database.runAsync('INSERT OR IGNORE INTO catalog_materials(name) VALUES (?)', trimmed);
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
