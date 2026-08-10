import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 9;

const migrationV1 = `
CREATE TABLE IF NOT EXISTS artworks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  human_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  completion_date TEXT,
  completion_year INTEGER,
  description TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT '',
  width REAL,
  height REAL,
  depth REAL,
  measurement_unit TEXT NOT NULL DEFAULT 'cm' CHECK (measurement_unit IN ('cm', 'in')),
  orientation TEXT CHECK (orientation IN ('Portrait', 'Landscape', 'Square', 'Other')),
  status TEXT NOT NULL DEFAULT 'Available' CHECK (
    status IN ('Available', 'Sold', 'Reserved', 'On Exhibition', 'With Gallery', 'Loaned', 'Not for Sale', 'Archived')
  ),
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS artwork_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  uri TEXT NOT NULL UNIQUE,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  content_hash TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS artwork_tags (
  artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (artwork_id, tag_id)
);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS artwork_genres (
  artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (artwork_id, genre_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS artwork_collections (
  artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  PRIMARY KEY (artwork_id, collection_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backup_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('local', 'google_drive')),
  remote_id TEXT,
  file_uri TEXT,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'restored')),
  artwork_count INTEGER NOT NULL DEFAULT 0,
  checksum TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_artworks_title ON artworks(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_artworks_year ON artworks(completion_year);
CREATE INDEX IF NOT EXISTS idx_artworks_status ON artworks(status);
CREATE INDEX IF NOT EXISTS idx_artworks_location ON artworks(location COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_artworks_created ON artworks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artworks_updated ON artworks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_artworks_deleted ON artworks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_images_artwork ON artwork_images(artwork_id, is_primary DESC);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_genres_name ON genres(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_collections_name ON collections(name COLLATE NOCASE);

INSERT OR IGNORE INTO app_settings(key, value) VALUES ('onboarding_complete', 'false');
INSERT OR IGNORE INTO app_settings(key, value) VALUES ('default_currency', 'USD');
INSERT OR IGNORE INTO app_settings(key, value) VALUES ('schema_version', '1');
`;

const migrationV2 = `
INSERT OR IGNORE INTO app_settings(key, value) VALUES ('profile_role', '');
UPDATE app_settings SET value = '2', updated_at = CURRENT_TIMESTAMP WHERE key = 'schema_version';
`;

const migrationV3 = `
ALTER TABLE collections ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;
INSERT OR IGNORE INTO collections(name, description, is_system) VALUES ('Unsorted', 'Catch-all for works without a named collection.', 1);
INSERT OR IGNORE INTO app_settings(key, value) VALUES ('app_theme', 'gallery');
INSERT OR IGNORE INTO app_settings(key, value) VALUES ('display_unit', 'cm');
UPDATE app_settings SET value = '3', updated_at = CURRENT_TIMESTAMP WHERE key = 'schema_version';
`;

const migrationV4 = `
PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS artworks_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  human_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  completion_date TEXT,
  completion_year INTEGER,
  description TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT '',
  width REAL,
  height REAL,
  depth REAL,
  measurement_unit TEXT NOT NULL DEFAULT 'cm' CHECK (measurement_unit IN ('cm', 'in')),
  orientation TEXT CHECK (orientation IN ('Portrait', 'Landscape', 'Square', 'Other')),
  framed INTEGER NOT NULL DEFAULT 0 CHECK (framed IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'Available' CHECK (
    status IN ('Available', 'Loaned', 'Exhibited', 'Sold', 'Not for sale')
  ),
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  hide_price INTEGER NOT NULL DEFAULT 0 CHECK (hide_price IN (0, 1)),
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

INSERT INTO artworks_new (
  id, human_id, title, artist, completion_date, completion_year, description, medium, material,
  width, height, depth, measurement_unit, orientation, framed, status, price_minor, currency,
  hide_price, location, notes, created_at, updated_at, deleted_at
)
SELECT
  id, human_id, title, artist, completion_date, completion_year, description, medium, material,
  CASE WHEN measurement_unit = 'in' AND width IS NOT NULL THEN width * 2.54 ELSE width END,
  CASE WHEN measurement_unit = 'in' AND height IS NOT NULL THEN height * 2.54 ELSE height END,
  CASE WHEN measurement_unit = 'in' AND depth IS NOT NULL THEN depth * 2.54 ELSE depth END,
  measurement_unit, orientation, 0,
  CASE status
    WHEN 'On Exhibition' THEN 'Exhibited'
    WHEN 'With Gallery' THEN 'Exhibited'
    WHEN 'Not for Sale' THEN 'Not for sale'
    WHEN 'Reserved' THEN 'Available'
    WHEN 'Archived' THEN 'Not for sale'
    WHEN 'Loaned' THEN 'Loaned'
    WHEN 'Sold' THEN 'Sold'
    WHEN 'Available' THEN 'Available'
    ELSE 'Available'
  END,
  price_minor, currency, 0, location, notes, created_at, updated_at, deleted_at
FROM artworks;

DROP TABLE artworks;
ALTER TABLE artworks_new RENAME TO artworks;

CREATE INDEX IF NOT EXISTS idx_artworks_title ON artworks(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_artworks_year ON artworks(completion_year);
CREATE INDEX IF NOT EXISTS idx_artworks_status ON artworks(status);
CREATE INDEX IF NOT EXISTS idx_artworks_location ON artworks(location COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_artworks_created ON artworks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artworks_updated ON artworks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_artworks_deleted ON artworks(deleted_at);

INSERT OR IGNORE INTO app_settings(key, value) VALUES ('studio_name', '');
INSERT OR IGNORE INTO app_settings(key, value) VALUES ('artist_bio', '');
INSERT OR IGNORE INTO app_settings(key, value) VALUES ('profile_location', '');
UPDATE app_settings SET value = '4', updated_at = CURRENT_TIMESTAMP WHERE key = 'schema_version';

PRAGMA foreign_keys=ON;
`;

const migrationV5 = `
CREATE TABLE IF NOT EXISTS catalog_mediums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS catalog_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE artworks ADD COLUMN completion_month INTEGER CHECK (
  completion_month IS NULL OR (completion_month >= 1 AND completion_month <= 12)
);

INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Oil on canvas');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Acrylic on canvas');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Watercolor');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Gouache');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Ink');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Charcoal');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Pastel');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Mixed media');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Photography');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Digital');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Print');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Sculpture');
INSERT OR IGNORE INTO catalog_mediums(name) VALUES ('Other');

INSERT OR IGNORE INTO catalog_materials(name) VALUES ('Canvas');
INSERT OR IGNORE INTO catalog_materials(name) VALUES ('Paper');
INSERT OR IGNORE INTO catalog_materials(name) VALUES ('Board');
INSERT OR IGNORE INTO catalog_materials(name) VALUES ('Wood');
INSERT OR IGNORE INTO catalog_materials(name) VALUES ('Metal');
INSERT OR IGNORE INTO catalog_materials(name) VALUES ('Glass');
INSERT OR IGNORE INTO catalog_materials(name) VALUES ('Fabric');
INSERT OR IGNORE INTO catalog_materials(name) VALUES ('Ceramic');
INSERT OR IGNORE INTO catalog_materials(name) VALUES ('Stone');
INSERT OR IGNORE INTO catalog_materials(name) VALUES ('Other');

INSERT OR IGNORE INTO genres(name) VALUES ('Abstract');
INSERT OR IGNORE INTO genres(name) VALUES ('Figurative');
INSERT OR IGNORE INTO genres(name) VALUES ('Landscape');
INSERT OR IGNORE INTO genres(name) VALUES ('Portrait');
INSERT OR IGNORE INTO genres(name) VALUES ('Still life');
INSERT OR IGNORE INTO genres(name) VALUES ('Conceptual');
INSERT OR IGNORE INTO genres(name) VALUES ('Street art');
INSERT OR IGNORE INTO genres(name) VALUES ('Other');

INSERT OR IGNORE INTO app_settings(key, value) VALUES ('artist_name', '');
UPDATE app_settings SET value = '5', updated_at = CURRENT_TIMESTAMP WHERE key = 'schema_version';
`;

const migrationV6 = `
ALTER TABLE artworks ADD COLUMN short_description TEXT NOT NULL DEFAULT '';
ALTER TABLE artworks ADD COLUMN full_description TEXT NOT NULL DEFAULT '';
UPDATE artworks SET
  full_description = description,
  short_description = CASE
    WHEN length(trim(description)) = 0 THEN ''
    WHEN length(description) <= 280 THEN description
    ELSE substr(description, 1, 280)
  END;
UPDATE app_settings SET value = '6', updated_at = CURRENT_TIMESTAMP WHERE key = 'schema_version';
`;

const migrationV7 = `
ALTER TABLE collections ADD COLUMN archived_at TEXT;
UPDATE app_settings SET value = '7', updated_at = CURRENT_TIMESTAMP WHERE key = 'schema_version';
`;

async function tableHasColumn(
  database: SQLiteDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

async function ensureNullableTextColumn(
  database: SQLiteDatabase,
  table: string,
  column: string,
): Promise<void> {
  if (await tableHasColumn(database, table, column)) return;
  await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
}

async function applyMigration(
  database: SQLiteDatabase,
  sql: string,
  nextVersion: number,
): Promise<void> {
  // Do not wrap execAsync in withTransactionAsync — nested write locks cause
  // "database is locked" on Android during multi-statement migrations.
  await database.execAsync(sql);
  await database.execAsync(`PRAGMA user_version = ${nextVersion}`);
}

async function applyMigrationV8(database: SQLiteDatabase): Promise<void> {
  await ensureNullableTextColumn(database, 'catalog_mediums', 'archived_at');
  await ensureNullableTextColumn(database, 'catalog_materials', 'archived_at');
  await ensureNullableTextColumn(database, 'genres', 'archived_at');
  await database.execAsync(`
UPDATE app_settings SET value = '8', updated_at = CURRENT_TIMESTAMP WHERE key = 'schema_version';
PRAGMA user_version = 8;
`);
}

/** Rebuild artworks so status CHECK allows Other. */
const migrationV9 = `
PRAGMA foreign_keys=OFF;

CREATE TABLE artworks_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  human_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  completion_date TEXT,
  completion_year INTEGER,
  completion_month INTEGER CHECK (
    completion_month IS NULL OR (completion_month >= 1 AND completion_month <= 12)
  ),
  description TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  full_description TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT '',
  width REAL,
  height REAL,
  depth REAL,
  measurement_unit TEXT NOT NULL DEFAULT 'cm' CHECK (measurement_unit IN ('cm', 'in')),
  orientation TEXT CHECK (orientation IN ('Portrait', 'Landscape', 'Square', 'Other')),
  framed INTEGER NOT NULL DEFAULT 0 CHECK (framed IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'Available' CHECK (
    status IN ('Available', 'Loaned', 'Exhibited', 'Sold', 'Not for sale', 'Other')
  ),
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  hide_price INTEGER NOT NULL DEFAULT 0 CHECK (hide_price IN (0, 1)),
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

INSERT INTO artworks_new (
  id, human_id, title, artist, completion_date, completion_year, completion_month,
  description, short_description, full_description, medium, material,
  width, height, depth, measurement_unit, orientation, framed, status,
  price_minor, currency, hide_price, location, notes, created_at, updated_at, deleted_at
)
SELECT
  id, human_id, title, artist, completion_date, completion_year, completion_month,
  description, short_description, full_description, medium, material,
  width, height, depth, measurement_unit, orientation, framed, status,
  price_minor, currency, hide_price, location, notes, created_at, updated_at, deleted_at
FROM artworks;

DROP TABLE artworks;
ALTER TABLE artworks_new RENAME TO artworks;

CREATE INDEX IF NOT EXISTS idx_artworks_title ON artworks(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_artworks_year ON artworks(completion_year);
CREATE INDEX IF NOT EXISTS idx_artworks_status ON artworks(status);
CREATE INDEX IF NOT EXISTS idx_artworks_location ON artworks(location COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_artworks_created ON artworks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artworks_updated ON artworks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_artworks_deleted ON artworks(deleted_at);

UPDATE app_settings SET value = '9', updated_at = CURRENT_TIMESTAMP WHERE key = 'schema_version';

PRAGMA foreign_keys=ON;
`;

export async function migrateDatabase(database: SQLiteDatabase): Promise<void> {
  await database.execAsync(`
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
`);
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion > DATABASE_VERSION) {
    throw new Error('This database was created by a newer version of ArtCloset.');
  }
  if (currentVersion < 1) await applyMigration(database, migrationV1, 1);
  if (currentVersion < 2) await applyMigration(database, migrationV2, 2);
  if (currentVersion < 3) await applyMigration(database, migrationV3, 3);
  if (currentVersion < 4) await applyMigration(database, migrationV4, 4);
  if (currentVersion < 5) await applyMigration(database, migrationV5, 5);
  if (currentVersion < 6) await applyMigration(database, migrationV6, 6);
  if (currentVersion < 7) await applyMigration(database, migrationV7, 7);
  if (currentVersion < 8) await applyMigrationV8(database);
  if (currentVersion < 9) await applyMigration(database, migrationV9, 9);
}
