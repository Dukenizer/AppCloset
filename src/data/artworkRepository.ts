import type { SQLiteDatabase } from 'expo-sqlite';

import { completionDateFromParts } from '@/domain/completion';
import { SIZE_BUCKET_MAX_CM, cmFromEntry } from '@/domain/dimensions';
import type {
  Artwork,
  ArtworkDraft,
  ArtworkQuery,
  ArtworkStats,
  ArtworkStatus,
  MeasurementUnit,
  SizeBucket,
} from '@/domain/artwork';
import { EMPTY_ARTWORK_DRAFT, createArtworkHumanId } from '@/domain/artwork';
import { CATCH_ALL_COLLECTION_NAME } from '@/domain/theme';
import { ensureCatalogMaterial, ensureCatalogMedium } from '@/data/catalogRepository';
import {
  PROFILE_SETTING_KEYS,
  parseDisplayUnit,
  type DisplayUnit,
  type UserProfile,
} from '@/domain/profile';
import { priceToMinorUnits, toNullableNumber } from '@/domain/validation';

interface ArtworkRow {
  id: number;
  human_id: string;
  title: string;
  artist: string;
  completion_date: string | null;
  completion_year: number | null;
  completion_month: number | null;
  short_description: string;
  full_description: string;
  medium: string;
  material: string;
  width: number | null;
  height: number | null;
  depth: number | null;
  measurement_unit: MeasurementUnit;
  orientation: Artwork['orientation'];
  framed: number;
  status: ArtworkStatus;
  price_minor: number | null;
  currency: string;
  hide_price: number;
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
  completionMonth: row.completion_month,
  shortDescription: row.short_description,
  fullDescription: row.full_description,
  medium: row.medium,
  material: row.material,
  width: row.width,
  height: row.height,
  depth: row.depth,
  measurementUnit: row.measurement_unit,
  orientation: row.orientation,
  framed: row.framed === 1,
  status: row.status,
  priceMinor: row.price_minor,
  currency: row.currency,
  hidePrice: row.hide_price === 1,
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
      a.title LIKE ? OR a.artist LIKE ? OR a.short_description LIKE ? OR a.full_description LIKE ? OR
      a.medium LIKE ? OR a.material LIKE ? OR CAST(a.completion_year AS TEXT) LIKE ? OR
      EXISTS (SELECT 1 FROM artwork_tags at JOIN tags t ON t.id = at.tag_id WHERE at.artwork_id = a.id AND t.name LIKE ?) OR
      EXISTS (SELECT 1 FROM artwork_genres ag JOIN genres g ON g.id = ag.genre_id WHERE ag.artwork_id = a.id AND g.name LIKE ?) OR
      EXISTS (SELECT 1 FROM artwork_collections ac JOIN collections c ON c.id = ac.collection_id WHERE ac.artwork_id = a.id AND c.name LIKE ?)
    )`);
    parameters.push(...Array.from({ length: 10 }, () => like));
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
  if (query.collectionId) {
    where.push(
      'EXISTS (SELECT 1 FROM artwork_collections ac WHERE ac.artwork_id = a.id AND ac.collection_id = ?)',
    );
    parameters.push(query.collectionId);
  } else if (query.collection.trim()) {
    where.push(
      'EXISTS (SELECT 1 FROM artwork_collections ac JOIN collections c ON c.id = ac.collection_id WHERE ac.artwork_id = a.id AND c.name LIKE ?)',
    );
    parameters.push(`%${query.collection.trim()}%`);
  }
  if (query.sizeBucket) {
    where.push(sizeBucketSql(query.sizeBucket));
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

const collectionNamesForDraft = async (
  database: SQLiteDatabase,
  names: string[],
): Promise<string[]> => {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (unique.length > 0) return unique;
  const catchAll = await getCatchAllCollection(database);
  return [catchAll.name];
};

const longestEdgeSql = 'MAX(COALESCE(a.width, 0), COALESCE(a.height, 0))';

const sizeBucketSql = (bucket: SizeBucket): string => {
  if (bucket === 'unspecified') return '(a.width IS NULL AND a.height IS NULL)';
  if (bucket === 'small') {
    return `(${longestEdgeSql} > 0 AND ${longestEdgeSql} <= ${SIZE_BUCKET_MAX_CM.small})`;
  }
  if (bucket === 'medium') {
    return `(${longestEdgeSql} > ${SIZE_BUCKET_MAX_CM.small} AND ${longestEdgeSql} <= ${SIZE_BUCKET_MAX_CM.medium})`;
  }
  if (bucket === 'large') {
    return `(${longestEdgeSql} > ${SIZE_BUCKET_MAX_CM.medium} AND ${longestEdgeSql} <= ${SIZE_BUCKET_MAX_CM.large})`;
  }
  return `(${longestEdgeSql} > ${SIZE_BUCKET_MAX_CM.large})`;
};

const dimensionToCm = (value: string, unit: MeasurementUnit): number | null => {
  const parsed = toNullableNumber(value);
  if (parsed === null) return null;
  return cmFromEntry(parsed, unit);
};

const resolveHumanId = (draft: ArtworkDraft): string => {
  const trimmed = draft.humanId.trim();
  return trimmed || createArtworkHumanId();
};

const draftValues = (draft: ArtworkDraft): (string | number | null)[] => {
  const monthNumber = draft.completionMonth.trim() === '' ? null : Number(draft.completionMonth);
  return [
  resolveHumanId(draft),
  draft.title.trim(),
  draft.artist.trim(),
  completionDateFromParts(draft.completionYear, draft.completionMonth),
  toNullableNumber(draft.completionYear),
  monthNumber,
  draft.shortDescription.trim(),
  draft.fullDescription.trim(),
  draft.medium.trim(),
  draft.material.trim(),
  dimensionToCm(draft.width, draft.measurementUnit),
  dimensionToCm(draft.height, draft.measurementUnit),
  dimensionToCm(draft.depth, draft.measurementUnit),
  draft.measurementUnit,
  draft.orientation || null,
  draft.framed ? 1 : 0,
  draft.status,
  priceToMinorUnits(draft.price),
  draft.currency,
  draft.hidePrice ? 1 : 0,
  draft.location.trim(),
  draft.notes.trim(),
  ];
};

export async function createArtwork(
  database: SQLiteDatabase,
  draft: ArtworkDraft,
  image: ImageRecordInput | null,
): Promise<number> {
  let artworkId = 0;
  await database.withTransactionAsync(async () => {
    const result = await database.runAsync(
      `INSERT INTO artworks(
        human_id, title, artist, completion_date, completion_year, completion_month, short_description, full_description, medium, material,
        width, height, depth, measurement_unit, orientation, framed, status, price_minor, currency, hide_price, location, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...draftValues(draft),
    );
    artworkId = result.lastInsertRowId;
    await ensureCatalogMedium(database, draft.medium);
    await ensureCatalogMaterial(database, draft.material);
    await syncNames(database, artworkId, draft.tags, 'tag');
    await syncNames(database, artworkId, draft.genres, 'genre');
    await syncNames(database, artworkId, await collectionNamesForDraft(database, draft.collections), 'collection');
    if (image) await writePrimaryImage(database, artworkId, image);
  });
  return artworkId;
}

async function writeArtworkUpdate(database: SQLiteDatabase, id: number, draft: ArtworkDraft): Promise<void> {
  await database.runAsync(
    `UPDATE artworks SET
      human_id = ?, title = ?, artist = ?, completion_date = ?, completion_year = ?, completion_month = ?, short_description = ?, full_description = ?,
      medium = ?, material = ?, width = ?, height = ?, depth = ?, measurement_unit = ?, orientation = ?,
      framed = ?, status = ?, price_minor = ?, currency = ?, hide_price = ?, location = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    ...draftValues(draft),
    id,
  );
  await ensureCatalogMedium(database, draft.medium);
  await ensureCatalogMaterial(database, draft.material);
  await syncNames(database, id, draft.tags, 'tag');
  await syncNames(database, id, draft.genres, 'genre');
  // Keep memberships on archived collections so restore brings the artwork back into them.
  const preservedArchived = await archivedCollectionNamesForArtwork(database, id);
  const collectionNames = await collectionNamesForDraft(database, [
    ...draft.collections,
    ...preservedArchived,
  ]);
  await syncNames(database, id, collectionNames, 'collection');
}

interface ImageRecordInput {
  uri: string;
  width: number | null;
  height: number | null;
  fileSize: number | null;
}

async function writePrimaryImage(
  database: SQLiteDatabase,
  artworkId: number,
  image: ImageRecordInput,
): Promise<void> {
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
}

export async function updateArtwork(database: SQLiteDatabase, id: number, draft: ArtworkDraft): Promise<void> {
  await database.withTransactionAsync(() => writeArtworkUpdate(database, id, draft));
}

export async function updateArtworkWithImage(
  database: SQLiteDatabase,
  id: number,
  draft: ArtworkDraft,
  image: ImageRecordInput,
  previousImageUri: string | null,
): Promise<void> {
  await database.withTransactionAsync(async () => {
    await writeArtworkUpdate(database, id, draft);
    await writePrimaryImage(database, id, image);
    if (previousImageUri) {
      await database.runAsync('DELETE FROM artwork_images WHERE artwork_id = ? AND uri = ?', id, previousImageUri);
    }
  });
}

export async function archiveArtwork(database: SQLiteDatabase, id: number): Promise<void> {
  await database.runAsync(
    "UPDATE artworks SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    id,
  );
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

export interface CollectionRecord {
  id: number;
  name: string;
  isSystem: boolean;
}

export async function getCatchAllCollection(database: SQLiteDatabase): Promise<CollectionRecord> {
  const row = await database.getFirstAsync<{ id: number; name: string; is_system: number }>(
    'SELECT id, name, is_system FROM collections WHERE is_system = 1 ORDER BY id LIMIT 1',
  );
  if (row) return { id: row.id, name: row.name, isSystem: row.is_system === 1 };
  await database.runAsync(
    'INSERT OR IGNORE INTO collections(name, description, is_system) VALUES (?, ?, 1)',
    CATCH_ALL_COLLECTION_NAME,
    'Catch-all for works without a named collection.',
  );
  const created = await database.getFirstAsync<{ id: number; name: string; is_system: number }>(
    'SELECT id, name, is_system FROM collections WHERE is_system = 1 ORDER BY id LIMIT 1',
  );
  if (!created) throw new Error('Unable to initialize the catch-all collection.');
  return { id: created.id, name: created.name, isSystem: true };
}

export async function listCollections(database: SQLiteDatabase): Promise<CollectionRecord[]> {
  return database.getAllAsync<{ id: number; name: string; is_system: number }>(
    `SELECT id, name, is_system FROM collections
     WHERE archived_at IS NULL
     ORDER BY is_system DESC, name COLLATE NOCASE ASC`,
  ).then((rows) => rows.map((row) => ({ id: row.id, name: row.name, isSystem: row.is_system === 1 })));
}

export async function listArchivedCollections(
  database: SQLiteDatabase,
): Promise<{ id: number; name: string; archivedAt: string }[]> {
  const rows = await database.getAllAsync<{ id: number; name: string; archived_at: string }>(
    `SELECT id, name, archived_at FROM collections
     WHERE archived_at IS NOT NULL AND is_system = 0
     ORDER BY archived_at DESC, name COLLATE NOCASE ASC`,
  );
  return rows.map((row) => ({ id: row.id, name: row.name, archivedAt: row.archived_at }));
}

export async function createCollection(database: SQLiteDatabase, name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Collection name is required.');
  const existing = await database.getFirstAsync<{ id: number; archived_at: string | null }>(
    'SELECT id, archived_at FROM collections WHERE name = ? COLLATE NOCASE',
    trimmed,
  );
  if (existing) {
    if (existing.archived_at) {
      throw new Error('A collection with this name is archived. Restore it from Settings, or choose another name.');
    }
    return existing.id;
  }
  await database.runAsync('INSERT INTO collections(name) VALUES (?)', trimmed);
  const row = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM collections WHERE name = ? COLLATE NOCASE',
    trimmed,
  );
  if (!row) throw new Error('Unable to create collection.');
  return row.id;
}

export async function renameCollection(database: SQLiteDatabase, id: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Collection name is required.');
  const target = await database.getFirstAsync<{ is_system: number; archived_at: string | null }>(
    'SELECT is_system, archived_at FROM collections WHERE id = ?',
    id,
  );
  if (!target) throw new Error('Collection not found.');
  if (target.is_system === 1) throw new Error('The Unsorted collection cannot be renamed.');
  if (target.archived_at) throw new Error('Restore this collection before renaming it.');

  const clash = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM collections WHERE name = ? COLLATE NOCASE AND id != ?',
    trimmed,
    id,
  );
  if (clash) throw new Error('Another collection already uses that name.');

  await database.runAsync(
    'UPDATE collections SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    trimmed,
    id,
  );
}

/** Soft-archives a collection. Artworks stay; memberships are kept for restore. */
export async function archiveCollection(database: SQLiteDatabase, id: number): Promise<void> {
  const target = await database.getFirstAsync<{ is_system: number; archived_at: string | null }>(
    'SELECT is_system, archived_at FROM collections WHERE id = ?',
    id,
  );
  if (!target) throw new Error('Collection not found.');
  if (target.is_system === 1) throw new Error('The Unsorted collection cannot be archived.');
  if (target.archived_at) return;

  await database.runAsync(
    'UPDATE collections SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    id,
  );
}

export async function restoreCollection(database: SQLiteDatabase, id: number): Promise<void> {
  const target = await database.getFirstAsync<{ is_system: number }>(
    'SELECT is_system FROM collections WHERE id = ?',
    id,
  );
  if (!target) throw new Error('Collection not found.');
  if (target.is_system === 1) throw new Error('The Unsorted collection cannot be archived.');

  await database.runAsync(
    'UPDATE collections SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    id,
  );
}

/** @deprecated Prefer archiveCollection — kept for destructive cleanup if ever needed. */
export async function deleteCollection(database: SQLiteDatabase, id: number): Promise<void> {
  const target = await database.getFirstAsync<{ is_system: number }>(
    'SELECT is_system FROM collections WHERE id = ?',
    id,
  );
  if (!target) throw new Error('Collection not found.');
  if (target.is_system === 1) throw new Error('The catch-all collection cannot be deleted.');

  const catchAll = await getCatchAllCollection(database);
  await database.withTransactionAsync(async () => {
    const orphaned = await database.getAllAsync<{ artwork_id: number }>(
      `SELECT ac.artwork_id FROM artwork_collections ac
       WHERE ac.collection_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM artwork_collections ac2
         WHERE ac2.artwork_id = ac.artwork_id AND ac2.collection_id != ?
       )`,
      id,
      id,
    );
    for (const row of orphaned) {
      await database.runAsync(
        'INSERT OR IGNORE INTO artwork_collections(artwork_id, collection_id) VALUES (?, ?)',
        row.artwork_id,
        catchAll.id,
      );
    }
    await database.runAsync('DELETE FROM artwork_collections WHERE collection_id = ?', id);
    await database.runAsync('DELETE FROM collections WHERE id = ?', id);
  });
}

async function archivedCollectionNamesForArtwork(
  database: SQLiteDatabase,
  artworkId: number,
): Promise<string[]> {
  const rows = await database.getAllAsync<{ name: string }>(
    `SELECT c.name FROM collections c
     JOIN artwork_collections ac ON ac.collection_id = c.id
     WHERE ac.artwork_id = ? AND c.archived_at IS NOT NULL`,
    artworkId,
  );
  return rows.map((row) => row.name);
}

/** Adds artwork↔collection membership — never deletes other memberships or artwork rows. */
export async function addArtworksToCollection(
  database: SQLiteDatabase,
  collectionId: number,
  artworkIds: number[],
): Promise<void> {
  const uniqueIds = [...new Set(artworkIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (uniqueIds.length === 0) return;

  const collection = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM collections WHERE id = ?',
    collectionId,
  );
  if (!collection) throw new Error('Collection not found.');

  await database.withTransactionAsync(async () => {
    for (const artworkId of uniqueIds) {
      await database.runAsync(
        'INSERT OR IGNORE INTO artwork_collections(artwork_id, collection_id) VALUES (?, ?)',
        artworkId,
        collectionId,
      );
    }
  });
}

/** Removes artwork↔collection membership only — never deletes the artwork row. */
export async function removeArtworksFromCollection(
  database: SQLiteDatabase,
  collectionId: number,
  artworkIds: number[],
): Promise<void> {
  const uniqueIds = [...new Set(artworkIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (uniqueIds.length === 0) return;

  const collection = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM collections WHERE id = ?',
    collectionId,
  );
  if (!collection) throw new Error('Collection not found.');

  const catchAll = await getCatchAllCollection(database);
  await database.withTransactionAsync(async () => {
    for (const artworkId of uniqueIds) {
      await database.runAsync(
        'DELETE FROM artwork_collections WHERE artwork_id = ? AND collection_id = ?',
        artworkId,
        collectionId,
      );
      const remaining = await database.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM artwork_collections WHERE artwork_id = ?',
        artworkId,
      );
      if ((remaining?.count ?? 0) === 0) {
        await database.runAsync(
          'INSERT OR IGNORE INTO artwork_collections(artwork_id, collection_id) VALUES (?, ?)',
          artworkId,
          catchAll.id,
        );
      }
    }
  });
}

export async function getArtworkStats(
  database: SQLiteDatabase,
  collectionId?: number | null,
): Promise<ArtworkStats> {
  const parameters: number[] = [];
  const collectionJoin = collectionId
    ? 'JOIN artwork_collections ac ON ac.artwork_id = a.id AND ac.collection_id = ?'
    : '';
  if (collectionId) parameters.push(collectionId);

  const row = await database.getFirstAsync<ArtworkStats>(
    `SELECT
      COUNT(DISTINCT a.id) AS total,
      COUNT(DISTINCT CASE WHEN a.status = 'Available' THEN a.id END) AS available,
      COUNT(DISTINCT CASE WHEN a.status = 'Sold' THEN a.id END) AS sold,
      COUNT(DISTINCT CASE WHEN a.status = 'Exhibited' THEN a.id END) AS exhibiting
    FROM artworks a
    ${collectionJoin}
    WHERE a.deleted_at IS NULL`,
    ...parameters,
  );
  return row ?? { total: 0, available: 0, sold: 0, exhibiting: 0 };
}

export async function createArtworkBatch(
  database: SQLiteDatabase,
  items: { title: string; image: ImageRecordInput }[],
  defaultCurrency: string,
): Promise<number[]> {
  const ids: number[] = [];
  await database.withTransactionAsync(async () => {
    const catchAllName = (await getCatchAllCollection(database)).name;
    for (const item of items) {
      const title = item.title.trim() || `Untitled ${ids.length + 1}`;
      const draft: ArtworkDraft = {
        ...EMPTY_ARTWORK_DRAFT,
        humanId: createArtworkHumanId(),
        title,
        currency: defaultCurrency,
      };
      const result = await database.runAsync(
        `INSERT INTO artworks(
          human_id, title, artist, completion_date, completion_year, completion_month, short_description, full_description, medium, material,
          width, height, depth, measurement_unit, orientation, framed, status, price_minor, currency, hide_price, location, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ...draftValues(draft),
      );
      const artworkId = result.lastInsertRowId;
      await syncNames(database, artworkId, [], 'tag');
      await syncNames(database, artworkId, [], 'genre');
      await syncNames(database, artworkId, [catchAllName], 'collection');
      await writePrimaryImage(database, artworkId, item.image);
      ids.push(artworkId);
    }
  });
  return ids;
}

export async function getUserProfile(database: SQLiteDatabase): Promise<UserProfile> {
  const read = async (key: string, fallback: string): Promise<string> =>
    (await getSetting(database, key)) ?? fallback;

  return {
    studioName: await read(PROFILE_SETTING_KEYS.studioName, ''),
    artistName: await read(PROFILE_SETTING_KEYS.artistName, ''),
    artistBio: await read(PROFILE_SETTING_KEYS.artistBio, ''),
    location: await read(PROFILE_SETTING_KEYS.profileLocation, ''),
    displayUnit: parseDisplayUnit(await read(PROFILE_SETTING_KEYS.displayUnit, 'cm')),
    defaultCurrency: await read(PROFILE_SETTING_KEYS.defaultCurrency, 'USD'),
  };
}

export async function saveUserProfile(database: SQLiteDatabase, profile: UserProfile): Promise<void> {
  await setSetting(database, PROFILE_SETTING_KEYS.studioName, profile.studioName.trim());
  await setSetting(database, PROFILE_SETTING_KEYS.artistName, profile.artistName.trim());
  await setSetting(database, PROFILE_SETTING_KEYS.artistBio, profile.artistBio.trim());
  await setSetting(database, PROFILE_SETTING_KEYS.profileLocation, profile.location.trim());
  await setSetting(database, PROFILE_SETTING_KEYS.displayUnit, profile.displayUnit);
  await setSetting(database, PROFILE_SETTING_KEYS.defaultCurrency, profile.defaultCurrency.trim().toUpperCase());
}

export async function getDisplayUnit(database: SQLiteDatabase): Promise<DisplayUnit> {
  return parseDisplayUnit(await getSetting(database, PROFILE_SETTING_KEYS.displayUnit));
}
