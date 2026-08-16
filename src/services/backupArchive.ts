import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { Platform } from 'react-native';

import { logDiagnostic } from '@/services/debugLog';

export const BACKUP_FORMAT = 'artcloset.backup';
export const BACKUP_VERSION = 1;
export const BACKUP_FILENAME = 'artcloset-backup.zip';
/** Match current app migrations; informational in manifest. */
export const BACKUP_DB_SCHEMA_HINT = 11;

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  artworkCount: number;
  /** Permanent image files packed under images/ (excludes branding). */
  imageFileCount?: number;
  dbSchemaVersion: number;
  files: { path: string; sha256: string; size: number }[];
}

function requireDoc(): string {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    throw new Error('Backup is available on Android and iOS only.');
  }
  return FileSystem.documentDirectory;
}

function uint8ToBase64(data: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return globalThis.btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** expo-file-system needs a file:// URI; expo-sqlite often returns a raw filesystem path. */
export function toReadableFileUri(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `file://${trimmed}`;
  return trimmed;
}

export function getSqliteDatabaseUri(database?: SQLite.SQLiteDatabase): string {
  if (database?.databasePath) {
    return toReadableFileUri(database.databasePath);
  }
  const dir = SQLite.defaultDatabaseDirectory as string | undefined;
  if (dir) {
    return toReadableFileUri(`${String(dir).replace(/\/?$/, '/') }artcloset.db`);
  }
  const doc = FileSystem.documentDirectory;
  if (doc) return `${doc.replace(/\/?$/, '/') }SQLite/artcloset.db`;
  throw new Error('SQLite directory unavailable.');
}

async function resolveExistingSqliteUri(database?: SQLite.SQLiteDatabase): Promise<string | null> {
  const doc = FileSystem.documentDirectory;
  const candidates = [
    database?.databasePath ? toReadableFileUri(database.databasePath) : '',
    getSqliteDatabaseUri(database),
    doc ? `${doc.replace(/\/?$/, '/') }SQLite/artcloset.db` : '',
  ].filter((uri, index, all) => uri.length > 0 && all.indexOf(uri) === index);

  for (const uri of candidates) {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && !info.isDirectory) return uri;
  }
  return null;
}

async function removeSqliteSidecars(dbUri: string): Promise<void> {
  for (const suffix of ['-wal', '-shm']) {
    try {
      await FileSystem.deleteAsync(`${dbUri}${suffix}`, { idempotent: true });
    } catch {
      // ignore
    }
  }
}

async function listFilesRecursive(rootUri: string, prefix: string): Promise<string[]> {
  const info = await FileSystem.getInfoAsync(rootUri);
  if (!info.exists) return [];
  const names = await FileSystem.readDirectoryAsync(rootUri);
  const out: string[] = [];
  for (const name of names) {
    const child = `${rootUri.replace(/\/?$/, '/')}${name}`;
    const childInfo = await FileSystem.getInfoAsync(child);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (childInfo.isDirectory) {
      out.push(...(await listFilesRecursive(child, rel)));
    } else {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Copy directory contents into an empty destination.
 * Avoids Expo copyAsync nesting (`images/` → `images/images/`) when `to` already exists.
 */
async function copyDirectoryContents(fromDir: string, toDir: string): Promise<void> {
  const from = fromDir.replace(/\/?$/, '/');
  const to = toDir.replace(/\/?$/, '/');
  const source = await FileSystem.getInfoAsync(from);
  if (!source.exists || !source.isDirectory) return;

  await FileSystem.makeDirectoryAsync(to, { intermediates: true });
  const names = await FileSystem.readDirectoryAsync(from);
  for (const name of names) {
    const childFrom = `${from}${name}`;
    const childTo = `${to}${name}`;
    const info = await FileSystem.getInfoAsync(childFrom);
    if (info.isDirectory) {
      await copyDirectoryContents(childFrom, childTo);
    } else {
      await FileSystem.copyAsync({ from: childFrom, to: childTo });
    }
  }
}

/** Fix nested restore folders from older builds (`images/images`, `branding/branding`). */
async function flattenMistakenNestedDir(parentDir: string, nestedName: string): Promise<void> {
  const parent = parentDir.replace(/\/?$/, '/');
  const nested = `${parent}${nestedName}/`;
  const nestedInfo = await FileSystem.getInfoAsync(nested);
  if (!nestedInfo.exists || !nestedInfo.isDirectory) return;

  const names = await FileSystem.readDirectoryAsync(nested);
  for (const name of names) {
    const from = `${nested}${name}`;
    const to = `${parent}${name}`;
    const existing = await FileSystem.getInfoAsync(to);
    if (existing.exists) {
      // Prefer the nested restore copy when both exist (nested is from the backup).
      try {
        await FileSystem.deleteAsync(to, { idempotent: true });
      } catch {
        continue;
      }
    }
    await FileSystem.moveAsync({ from, to });
  }
  try {
    await FileSystem.deleteAsync(nested, { idempotent: true });
  } catch {
    // ignore
  }
}

/** Collapse repeated `images/images` / `branding/branding` nests (up to 5 levels). */
async function flattenNestedDirDeep(parentDir: string, nestedName: string): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    const nested = `${parentDir.replace(/\/?$/, '/')}${nestedName}/`;
    const info = await FileSystem.getInfoAsync(nested);
    if (!info.exists || !info.isDirectory) return;
    await flattenMistakenNestedDir(parentDir, nestedName);
  }
}

/** Pack nested disk trees as flat `images/<file>` / `branding/<file>` entries. */
function normalizeArchiveMediaPath(rel: string): string {
  const parts = rel.split('/').filter(Boolean);
  if (parts.length < 2) return rel;
  const root = parts[0];
  if (root !== 'images' && root !== 'branding') return rel;
  const fileName = parts[parts.length - 1];
  if (!fileName) return rel;
  return `${root}/${fileName}`;
}

async function replaceDirectoryContents(fromDir: string, toDir: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(toDir, { idempotent: true });
  } catch {
    // ignore
  }
  const info = await FileSystem.getInfoAsync(fromDir);
  if (info.exists && info.isDirectory) {
    await copyDirectoryContents(fromDir, toDir);
  } else {
    await FileSystem.makeDirectoryAsync(toDir.replace(/\/?$/, '/'), { intermediates: true });
  }
}

async function openBackupCopyInMemory(fileUri: string): Promise<SQLite.SQLiteDatabase> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return SQLite.deserializeDatabaseAsync(base64ToUint8(base64));
}

async function assertStagedSchemaCompatible(stagingDir: string, manifest: BackupManifest): Promise<void> {
  if (manifest.dbSchemaVersion > BACKUP_DB_SCHEMA_HINT) {
    throw new Error(
      `This backup requires a newer ArtCloset (schema ${manifest.dbSchemaVersion}). Update the app and try again.`,
    );
  }

  const stagedDb = `${stagingDir.replace(/\/?$/, '/')}artcloset.db`;
  let staged: SQLite.SQLiteDatabase | null = null;
  try {
    staged = await openBackupCopyInMemory(stagedDb);
    const row = await staged.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const version = row?.user_version ?? 0;
    if (version > BACKUP_DB_SCHEMA_HINT) {
      throw new Error(
        `This backup requires a newer ArtCloset (schema ${version}). Update the app and try again.`,
      );
    }
  } finally {
    try {
      await staged?.closeAsync();
    } catch {
      // ignore
    }
  }
}

async function countArtworks(database: SQLite.SQLiteDatabase): Promise<number> {
  const row = await database.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM artworks WHERE deleted_at IS NULL`,
  );
  return row?.c ?? 0;
}

export async function createBackupArchive(
  database: SQLite.SQLiteDatabase,
): Promise<{ uri: string; manifest: BackupManifest }> {
  const doc = requireDoc();
  await database.execAsync('PRAGMA wal_checkpoint(FULL);');

  const cacheRoot = `${FileSystem.cacheDirectory}artcloset-backup-${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(cacheRoot, { intermediates: true });

  const zipEntries: Record<string, Uint8Array> = {};
  const fileMeta: BackupManifest['files'] = [];

  const addFile = async (archivePath: string, sourceUri: string): Promise<void> => {
    const info = await FileSystem.getInfoAsync(sourceUri);
    if (!info.exists || info.isDirectory) return;
    const base64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToUint8(base64);
    zipEntries[archivePath] = bytes;
    const sha = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
    fileMeta.push({ path: archivePath, sha256: sha, size: bytes.byteLength });
  };

  const serialized = await database.serializeAsync();
  if (!serialized.byteLength) {
    throw new Error('Could not snapshot the catalog database for backup.');
  }
  await logDiagnostic('backup.archive.serialize', { dbBytes: serialized.byteLength });
  zipEntries['artcloset.db'] = serialized;
  const dbBase64 = uint8ToBase64(serialized);
  const dbSha = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, dbBase64);
  fileMeta.push({ path: 'artcloset.db', sha256: dbSha, size: serialized.byteLength });

  const imagesRoot = `${doc}artcloset/images/`;
  for (const rel of await listFilesRecursive(imagesRoot, 'images')) {
    const archivePath = normalizeArchiveMediaPath(rel);
    if (zipEntries[archivePath]) continue;
    await addFile(archivePath, `${doc}artcloset/${rel}`);
  }

  const brandingRoot = `${doc}artcloset/branding/`;
  for (const rel of await listFilesRecursive(brandingRoot, 'branding')) {
    const archivePath = normalizeArchiveMediaPath(rel);
    if (zipEntries[archivePath]) continue;
    await addFile(archivePath, `${doc}artcloset/${rel}`);
  }

  const artworkCount = await countArtworks(database);
  const schemaRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const imageFileCount = Object.keys(zipEntries).filter((path) => path.startsWith('images/')).length;
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    artworkCount,
    imageFileCount,
    dbSchemaVersion: schemaRow?.user_version ?? BACKUP_DB_SCHEMA_HINT,
    files: fileMeta,
  };
  zipEntries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(zipEntries, { level: 6 });
  const zipUri = `${cacheRoot}${BACKUP_FILENAME}`;
  await FileSystem.writeAsStringAsync(zipUri, uint8ToBase64(zipped), {
    encoding: FileSystem.EncodingType.Base64,
  });
  await logDiagnostic('backup.archive.packed', {
    artworkCount,
    imageFileCount,
    zipBytes: zipped.byteLength,
    fileCount: fileMeta.length,
  });

  return { uri: zipUri, manifest };
}

export async function validateAndExtractBackup(zipUri: string, stagingDir: string): Promise<BackupManifest> {
  const base64 = await FileSystem.readAsStringAsync(zipUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToUint8(base64);
  await logDiagnostic('backup.validate.zip', { zipBytes: bytes.byteLength });
  const unzipped = unzipSync(bytes);
  const manifestBytes = unzipped['manifest.json'];
  if (!manifestBytes) throw new Error('Backup missing manifest.json');
  const manifest = JSON.parse(strFromU8(manifestBytes)) as BackupManifest;
  if (manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION) {
    throw new Error('Unsupported backup format.');
  }

  await FileSystem.makeDirectoryAsync(stagingDir, { intermediates: true });

  for (const entry of manifest.files) {
    const data = unzipped[entry.path];
    if (!data) throw new Error(`Backup missing file ${entry.path}`);
    const b64 = uint8ToBase64(data);
    const sha = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, b64);
    if (sha !== entry.sha256) {
      await logDiagnostic('backup.validate.checksum', { path: entry.path, expectedSize: entry.size });
      throw new Error(`Checksum failed for ${entry.path}`);
    }
    const dest = `${stagingDir}${entry.path}`;
    const parent = dest.slice(0, dest.lastIndexOf('/') + 1);
    await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
    await FileSystem.writeAsStringAsync(dest, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  await FileSystem.writeAsStringAsync(`${stagingDir}manifest.json`, JSON.stringify(manifest), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await assertStagedSchemaCompatible(stagingDir, manifest);

  return manifest;
}

/**
 * Replace on-disk catalog DB + media from a validated staging directory.
 * Caller must suspend / close the live SQLite connection before calling.
 * Pass `databaseUri` captured from the open connection before suspend so the
 * restored file lands on the same path SQLiteProvider will reopen.
 *
 * Industry gates before success: integrity_check, artwork count == manifest,
 * primary image files present, archive filters cleared for full-vault Home.
 */
export async function applyStagedBackup(
  stagingDir: string,
  options?: { databaseUri?: string | null; expectedArtworkCount?: number },
): Promise<{ artworkCount: number; imageFileCount: number }> {
  const doc = requireDoc();
  const preferredUri = options?.databaseUri ? toReadableFileUri(options.databaseUri) : null;
  const existingDb =
    (preferredUri && (await FileSystem.getInfoAsync(preferredUri)).exists ? preferredUri : null) ??
    (await resolveExistingSqliteUri());
  const dbUri = existingDb ?? preferredUri ?? getSqliteDatabaseUri();
  await logDiagnostic('backup.apply.start', {
    hasPreferredUri: Boolean(preferredUri),
    hasExistingDb: Boolean(existingDb),
    expectedArtworkCount: options?.expectedArtworkCount ?? null,
  });
  const stamp = Date.now();
  const rollbackUri = `${FileSystem.cacheDirectory}artcloset-db-rollback-${stamp}.db`;
  const imagesDest = `${doc}artcloset/images`;
  const brandingDest = `${doc}artcloset/branding`;
  const imagesPrevious = `${doc}artcloset/images.previous-${stamp}`;
  const brandingPrevious = `${doc}artcloset/branding.previous-${stamp}`;
  const dbNewUri = `${dbUri}.restoring-${stamp}`;

  const stagedDb = `${stagingDir}artcloset.db`;
  const stagedDbInfo = await FileSystem.getInfoAsync(stagedDb);
  if (!stagedDbInfo.exists) throw new Error('Staged database missing.');

  let hadDbSnapshot = false;
  let movedImages = false;
  let movedBranding = false;
  let dbSwapped = false;

  if (existingDb) {
    await FileSystem.copyAsync({ from: existingDb, to: rollbackUri });
    hadDbSnapshot = true;
  }

  const rollbackAll = async (): Promise<void> => {
    if (dbSwapped && hadDbSnapshot) {
      try {
        await FileSystem.copyAsync({ from: rollbackUri, to: dbUri });
        await removeSqliteSidecars(dbUri);
      } catch {
        // ignore
      }
    }
    if (movedImages) {
      try {
        await FileSystem.deleteAsync(imagesDest, { idempotent: true });
        await FileSystem.moveAsync({ from: imagesPrevious, to: imagesDest });
      } catch {
        // ignore
      }
    }
    if (movedBranding) {
      try {
        await FileSystem.deleteAsync(brandingDest, { idempotent: true });
        await FileSystem.moveAsync({ from: brandingPrevious, to: brandingDest });
      } catch {
        // ignore
      }
    }
  };

  try {
    // Verify and patch the staged DB in memory — never open live artcloset.db here.
    let mem: SQLite.SQLiteDatabase | null = null;
    let patchedDbUri = '';
    let primaryImageUris: string[] = [];
    let artworkCount = 0;
    try {
      mem = await openBackupCopyInMemory(stagedDb);
      const prepared = await prepareRestoredDatabase(mem, options?.expectedArtworkCount);
      artworkCount = prepared.artworkCount;
      primaryImageUris = prepared.primaryImageUris;
      const patched = await mem.serializeAsync();
      if (!patched.byteLength) throw new Error('Could not write the restored catalog.');
      patchedDbUri = `${FileSystem.cacheDirectory}artcloset-restore-ready-${stamp}.db`;
      await FileSystem.writeAsStringAsync(patchedDbUri, uint8ToBase64(patched), {
        encoding: FileSystem.EncodingType.Base64,
      });
    } finally {
      try {
        await mem?.closeAsync();
      } catch {
        // ignore
      }
    }

    const stagedImages = `${stagingDir}images/`;
    const stagedBranding = `${stagingDir}branding/`;

    // Side-by-side media cutover: keep previous dirs until verification succeeds.
    await FileSystem.deleteAsync(`${imagesDest}.restoring`, { idempotent: true });
    await FileSystem.deleteAsync(`${brandingDest}.restoring`, { idempotent: true });
    await replaceDirectoryContents(stagedImages, `${imagesDest}.restoring`);
    await replaceDirectoryContents(stagedBranding, `${brandingDest}.restoring`);
    await flattenNestedDirDeep(`${imagesDest}.restoring/`, 'images');
    await flattenNestedDirDeep(`${brandingDest}.restoring/`, 'branding');

    const liveImages = await FileSystem.getInfoAsync(imagesDest);
    if (liveImages.exists) {
      await FileSystem.moveAsync({ from: imagesDest, to: imagesPrevious });
      movedImages = true;
    }
    await FileSystem.moveAsync({ from: `${imagesDest}.restoring`, to: imagesDest });

    const liveBranding = await FileSystem.getInfoAsync(brandingDest);
    if (liveBranding.exists) {
      await FileSystem.moveAsync({ from: brandingDest, to: brandingPrevious });
      movedBranding = true;
    }
    await FileSystem.moveAsync({ from: `${brandingDest}.restoring`, to: brandingDest });

    // DB cutover: patched snapshot only (settings already cleared). Do not reopen live artcloset.db.
    await FileSystem.copyAsync({ from: patchedDbUri, to: dbNewUri });
    await FileSystem.copyAsync({ from: dbNewUri, to: dbUri });
    await FileSystem.deleteAsync(dbNewUri, { idempotent: true });
    await removeSqliteSidecars(dbUri);
    dbSwapped = true;

    const verified = await assertRestoredImageFiles(primaryImageUris);

    try {
      await FileSystem.deleteAsync(patchedDbUri, { idempotent: true });
    } catch {
      // ignore
    }

    // Success — discard previous media and DB rollback.
    try {
      await FileSystem.deleteAsync(imagesPrevious, { idempotent: true });
    } catch {
      // ignore
    }
    try {
      await FileSystem.deleteAsync(brandingPrevious, { idempotent: true });
    } catch {
      // ignore
    }
    try {
      await FileSystem.deleteAsync(rollbackUri, { idempotent: true });
    } catch {
      // ignore
    }

    return { artworkCount, imageFileCount: verified.imageFileCount };
  } catch (error) {
    await logDiagnostic('backup.apply.failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    await rollbackAll();
    try {
      await FileSystem.deleteAsync(dbNewUri, { idempotent: true });
    } catch {
      // ignore
    }
    try {
      await FileSystem.deleteAsync(`${imagesDest}.restoring`, { idempotent: true });
    } catch {
      // ignore
    }
    try {
      await FileSystem.deleteAsync(`${brandingDest}.restoring`, { idempotent: true });
    } catch {
      // ignore
    }
    throw error;
  }
}

async function prepareRestoredDatabase(
  db: SQLite.SQLiteDatabase,
  expectedArtworkCount?: number,
): Promise<{ artworkCount: number; primaryImageUris: string[] }> {
  const integrity = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  if (!integrity || integrity.integrity_check !== 'ok') {
    throw new Error('Restored database failed integrity check. Your previous catalog was kept.');
  }

  const artworkCount = await countArtworks(db);
  if (typeof expectedArtworkCount === 'number' && artworkCount !== expectedArtworkCount) {
    throw new Error(
      `Restore verification failed: backup lists ${expectedArtworkCount} artworks but ${artworkCount} were applied. Your previous catalog was kept.`,
    );
  }

  const cleanQuery = JSON.stringify({
    status: null,
    sort: 'recently-updated',
    year: '',
    collectionId: null,
    dateFrom: '',
    dateTo: '',
    artist: '',
    genre: '',
    tag: '',
    medium: '',
    material: '',
    collection: '',
    orientation: null,
    sizeBucket: null,
  });
  await db.runAsync(
    `INSERT INTO app_settings(key, value, updated_at) VALUES ('archive_query_v1', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    cleanQuery,
  );
  await db.runAsync(
    `INSERT INTO app_settings(key, value, updated_at) VALUES ('onboarding_complete', 'true', CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
  );

  const primaryImages = await db.getAllAsync<{ uri: string }>(
    `SELECT i.uri AS uri
     FROM artwork_images i
     INNER JOIN artworks a ON a.id = i.artwork_id
     WHERE a.deleted_at IS NULL AND i.is_primary = 1`,
  );
  return { artworkCount, primaryImageUris: primaryImages.map((row) => row.uri) };
}

async function assertRestoredImageFiles(
  primaryImageUris: string[],
): Promise<{ imageFileCount: number }> {
  const doc = requireDoc();
  let missing = 0;
  for (const uri of primaryImageUris) {
    const relative = uri.startsWith('artcloset/')
      ? uri
      : `artcloset/images/${uri.split('/').pop() ?? ''}`;
    const absolute = `${doc}${relative}`;
    const info = await FileSystem.getInfoAsync(absolute);
    if (!info.exists || info.isDirectory) missing += 1;
  }
  if (missing > 0) {
    throw new Error(
      `Restore verification failed: ${missing} artwork image file(s) missing on disk. Your previous catalog was kept.`,
    );
  }

  const imageNames = await FileSystem.readDirectoryAsync(`${doc}artcloset/images/`).catch(() => []);
  const imageFileCount = imageNames.filter((name) => !name.startsWith('.')).length;
  return { imageFileCount };
}

export function getStagingDir(): string {
  return `${FileSystem.cacheDirectory}artcloset-restore-staging/`;
}

/** Fix nested `images/images` / `branding/branding` left by older restore builds. */
export async function repairNestedBackupFolders(): Promise<void> {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) return;
  const doc = FileSystem.documentDirectory;
  await flattenNestedDirDeep(`${doc}artcloset/images/`, 'images');
  await flattenNestedDirDeep(`${doc}artcloset/branding/`, 'branding');
}
