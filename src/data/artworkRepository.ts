import type { SQLiteDatabase } from 'expo-sqlite';

import type { Artwork, ArtworkDraft, ArtworkQuery, ArtworkStatus, MeasurementUnit } from '@/domain/artwork';
import { priceToMinorUnits, toNullableNumber } from '@/domain/validation';

interface ArtworkRow {
  id: number;
  human_id: string;
  title: string;
  artist: string;
  completion_date: string | null;
  completion_year: number | null;
  description: string;
  medium: string;
  material: string;
  width: number | null;
  height: number | null;
  depth: number | null;
  measurement_unit: MeasurementUnit;
  orientation: Artwork['orientation'];
  status: ArtworkStatus;
  price_minor: number | null;
  currency: string;
  location: string;
  notes: string;
  created_at: string;
  updated_at: string;
  primary_image_uri: string | null;
  tags: string | null;
  genres: string | null;
  collections: string | null;
}

const selectArtwork = `
SELECT
  a.*,
  (SELECT uri FROM artwork_images i WHERE i.artwork_id = a.id ORDER BY i.is_primary DESC, i.id LIMIT 1) AS primary_image_uri,
  (SELECT GROUP_CONCAT(name, '|||') FROM (
    SELECT t.name FROM tags t JOIN artwork_tags at ON at.tag_id = t.id WHERE at.artwork_id = a.id ORDER BY t.name
  )) AS tags,
  (SELECT GROUP_CONCAT(name, '|||') FROM (
    SELECT g.name FROM genres g JOIN artwork_genres ag ON ag.genre_id = g.id WHERE ag.artwork_id = a.id ORDER BY g.name
  )) AS genres,
  (SELECT GROUP_CONCAT(name, '|||') FROM (
    SELECT c.name FROM collections c JOIN artwork_collections ac ON ac.collection_id = c.id WHERE ac.artwork_id = a.id ORDER BY c.name
  )) AS collections
FROM artworks a`;

const splitNames = (value: string | null): string[] => (value ? value.split('|||') : []);

const mapArtwork = (row: ArtworkRow): Artwork => ({
  id: row.id,
  humanId: row.human_id,
  title: row.title,
  artist: row.artist,
  completionDate: row.completion_date,
  completionYear: row.completion_year,
  description: row.description,
  medium: row.medium,
  material: row.material,
  width: row.width,
  height: row.height,
  depth: row.depth,
  measurementUnit: row.measurement_unit,
  orientation: row.orientation,
  status: row.status,
  priceMinor: row.price_minor,
  currency: row.currency,
  location: row.location,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  primaryImageUri: row.primary_image_uri,
  tags: splitNames(row.tags),
  genres: splitNames(row.genres),
  collections: splitNames(row.collections),
});

const sortSql: Record<ArtworkQuery['sort'], string> = {
  newest: 'a.completion_date DESC, a.completion_year DESC, a.title COLLATE NOCASE',
  oldest: 'a.completion_date ASC, a.completion_year ASC, a.title COLLATE NOCASE',
  'recently-added': 'a.created_at DESC',
  'recently-updated': 'a.updated_at DESC',
  'title-asc': 'a.title COLLATE NOCASE ASC',
  'title-desc': 'a.title COLLATE NOCASE DESC',
  'artwork-id': 'a.human_id COLLATE NOCASE ASC',
  status: 'a.status ASC, a.title COLLATE NOCASE ASC',
};

export async function listArtworks(database: SQLiteDatabase, query: ArtworkQuery): Promise<Artwork[]> {
  const where = ['a.deleted_at IS NULL'];
  const parameters: (string | number)[] = [];
  const search = query.search.trim();

  if (search) {
    const like = `%${search}%`;
    where.push(`(
      a.title LIKE ? OR a.artist LIKE ? OR a.human_id LIKE ? OR a.description LIKE ? OR
      a.medium LIKE ? OR a.material LIKE ? OR a.location LIKE ? OR CAST(a.completion_year AS TEXT) LIKE ? OR
      EXISTS (SELECT 1 FROM artwork_tags at JOIN tags t ON t.id = at.tag_id WHERE at.artwork_id = a.id AND t.name LIKE ?) OR
      EXISTS (SELECT 1 FROM artwork_genres ag JOIN genres g ON g.id = ag.genre_id WHERE ag.artwork_id = a.id AND g.name LIKE ?) OR
      EXISTS (SELECT 1 FROM artwork_collections ac JOIN collections c ON c.id = ac.collection_id WHERE ac.artwork_id = a.id AND c.name LIKE ?)
    )`);
    parameters.push(...Array.from({ length: 11 }, () => like));
  }
  if (query.status) {
    where.push('a.status = ?');
    parameters.push(query.status);
  }
  if (query.year.trim()) {
    where.push('a.completion_year = ?');
    parameters.push(Number(query.year));
  }
  if (query.dateFrom.trim()) {
    where.push('a.completion_date >= ?');
    parameters.push(query.dateFrom.trim());
  }
  if (query.dateTo.trim()) {
    where.push('a.completion_date <= ?');
    parameters.push(query.dateTo.trim());
  }
  for (const [column, value] of [
    ['a.artist', query.artist],
    ['a.medium', query.medium],
    ['a.material', query.material],
    ['a.location', query.location],
  ] as const) {
    if (value.trim()) {
      where.push(`${column} LIKE ?`);
      parameters.push(`%${value.trim()}%`);
    }
  }
  if (query.orientation) {
    where.push('a.orientation = ?');
    parameters.push(query.orientation);
  }
  if (query.tag.trim()) {
    where.push(
      'EXISTS (SELECT 1 FROM artwork_tags at JOIN tags t ON t.id = at.tag_id WHERE at.artwork_id = a.id AND t.name LIKE ?)',
    );
    parameters.push(`%${query.tag.trim()}%`);
  }
  if (query.genre.trim()) {
    where.push(
      'EXISTS (SELECT 1 FROM artwork_genres ag JOIN genres g ON g.id = ag.genre_id WHERE ag.artwork_id = a.id AND g.name LIKE ?)',
    );
    parameters.push(`%${query.genre.trim()}%`);
  }
  if (query.collection.trim()) {
    where.push(
      'EXISTS (SELECT 1 FROM artwork_collections ac JOIN collections c ON c.id = ac.collection_id WHERE ac.artwork_id = a.id AND c.name LIKE ?)',
    );
    parameters.push(`%${query.collection.trim()}%`);
  }
  if (query.minDimension.trim()) {
    where.push('MAX(COALESCE(a.width, 0), COALESCE(a.height, 0), COALESCE(a.depth, 0)) >= ?');
    parameters.push(Number(query.minDimension));
  }
  if (query.maxDimension.trim()) {
    where.push('MAX(COALESCE(a.width, 0), COALESCE(a.height, 0), COALESCE(a.depth, 0)) <= ?');
    parameters.push(Number(query.maxDimension));
  }

  const rows = await database.getAllAsync<ArtworkRow>(
    `${selectArtwork} WHERE ${where.join(' AND ')} ORDER BY ${sortSql[query.sort]}`,
    ...parameters,
  );
  return rows.map(mapArtwork);
}

export async function getArtwork(database: SQLiteDatabase, id: number): Promise<Artwork | null> {
  const row = await database.getFirstAsync<ArtworkRow>(
    `${selectArtwork} WHERE a.id = ? AND a.deleted_at IS NULL`,
    id,
  );
  return row ? mapArtwork(row) : null;
}

async function syncNames(
  database: SQLiteDatabase,
  artworkId: number,
  names: string[],
  kind: 'tag' | 'genre' | 'collection',
): Promise<void> {
  const definitions = {
    tag: { entity: 'tags', join: 'artwork_tags', foreignKey: 'tag_id' },
    genre: { entity: 'genres', join: 'artwork_genres', foreignKey: 'genre_id' },
    collection: { entity: 'collections', join: 'artwork_collections', foreignKey: 'collection_id' },
  } as const;
  const definition = definitions[kind];
  await database.runAsync(`DELETE FROM ${definition.join} WHERE artwork_id = ?`, artworkId);

  const uniqueNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  for (const name of uniqueNames) {
    await database.runAsync(`INSERT OR IGNORE INTO ${definition.entity}(name) VALUES (?)`, name);
    const entity = await database.getFirstAsync<{ id: number }>(
      `SELECT id FROM ${definition.entity} WHERE name = ? COLLATE NOCASE`,
      name,
    );
    if (entity) {
      await database.runAsync(
        `INSERT OR IGNORE INTO ${definition.join}(artwork_id, ${definition.foreignKey}) VALUES (?, ?)`,
        artworkId,
        entity.id,
      );
    }
  }
}

const draftValues = (draft: ArtworkDraft): (string | number | null)[] => [
  draft.humanId.trim(),
  draft.title.trim(),
  draft.artist.trim(),
  draft.completionDate.trim() || null,
  toNullableNumber(draft.completionYear),
  draft.description.trim(),
  draft.medium.trim(),
  draft.material.trim(),
  toNullableNumber(draft.width),
  toNullableNumber(draft.height),
  toNullableNumber(draft.depth),
  draft.measurementUnit,
  draft.orientation || null,
  draft.status,
  priceToMinorUnits(draft.price),
  draft.currency,
  draft.location.trim(),
  draft.notes.trim(),
];

export async function createArtwork(database: SQLiteDatabase, draft: ArtworkDraft): Promise<number> {
  let artworkId = 0;
  await database.withTransactionAsync(async () => {
    const result = await database.runAsync(
      `INSERT INTO artworks(
        human_id, title, artist, completion_date, completion_year, description, medium, material,
        width, height, depth, measurement_unit, orientation, status, price_minor, currency, location, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...draftValues(draft),
    );
    artworkId = result.lastInsertRowId;
    await syncNames(database, artworkId, draft.tags, 'tag');
    await syncNames(database, artworkId, draft.genres, 'genre');
    await syncNames(database, artworkId, draft.collections, 'collection');
  });
  return artworkId;
}

export async function updateArtwork(database: SQLiteDatabase, id: number, draft: ArtworkDraft): Promise<void> {
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `UPDATE artworks SET
        human_id = ?, title = ?, artist = ?, completion_date = ?, completion_year = ?, description = ?,
        medium = ?, material = ?, width = ?, height = ?, depth = ?, measurement_unit = ?, orientation = ?,
        status = ?, price_minor = ?, currency = ?, location = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      ...draftValues(draft),
      id,
    );
    await syncNames(database, id, draft.tags, 'tag');
    await syncNames(database, id, draft.genres, 'genre');
    await syncNames(database, id, draft.collections, 'collection');
  });
}

export async function attachImage(
  database: SQLiteDatabase,
  artworkId: number,
  image: { uri: string; width: number | null; height: number | null; fileSize: number | null },
): Promise<void> {
  await database.withTransactionAsync(async () => {
    await database.runAsync('UPDATE artwork_images SET is_primary = 0 WHERE artwork_id = ?', artworkId);
    await database.runAsync(
      `INSERT INTO artwork_images(artwork_id, uri, width, height, file_size, is_primary)
       VALUES (?, ?, ?, ?, ?, 1)`,
      artworkId,
      image.uri,
      image.width,
      image.height,
      image.fileSize,
    );
  });
}

export async function detachImage(database: SQLiteDatabase, artworkId: number, uri: string): Promise<void> {
  await database.runAsync('DELETE FROM artwork_images WHERE artwork_id = ? AND uri = ?', artworkId, uri);
}

export async function archiveArtwork(database: SQLiteDatabase, id: number): Promise<void> {
  await database.runAsync(
    "UPDATE artworks SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    id,
  );
}

export async function discardFailedArtwork(database: SQLiteDatabase, id: number): Promise<void> {
  await database.runAsync('DELETE FROM artworks WHERE id = ?', id);
}

export async function listTrashedArtworks(
  database: SQLiteDatabase,
): Promise<{ id: number; title: string; deletedAt: string }[]> {
  const rows = await database.getAllAsync<{ id: number; title: string; deleted_at: string }>(
    'SELECT id, title, deleted_at FROM artworks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC',
  );
  return rows.map((row) => ({ id: row.id, title: row.title, deletedAt: row.deleted_at }));
}

export async function restoreArtwork(database: SQLiteDatabase, id: number): Promise<void> {
  await database.runAsync(
    'UPDATE artworks SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    id,
  );
}

export async function getSetting(database: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(database: SQLiteDatabase, key: string, value: string): Promise<void> {
  await database.runAsync(
    `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    key,
    value,
  );
}
