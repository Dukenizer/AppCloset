import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 2;

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

export async function migrateDatabase(database: SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion > DATABASE_VERSION) {
    throw new Error('This database was created by a newer version of ArtCloset.');
  }
  if (currentVersion < 1) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(migrationV1);
      await database.execAsync('PRAGMA user_version = 1');
    });
  }
  if (currentVersion < 2) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(migrationV2);
      await database.execAsync('PRAGMA user_version = 2');
    });
  }
}
