import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { Platform } from 'react-native';

export const BACKUP_FORMAT = 'artcloset.backup';
export const BACKUP_VERSION = 1;
export const BACKUP_FILENAME = 'artcloset-backup.zip';
/** Match current app migrations; informational in manifest. */
export const BACKUP_DB_SCHEMA_HINT = 10;

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  artworkCount: number;
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

export function getSqliteDatabaseUri(): string {
  const dir = SQLite.defaultDatabaseDirectory;
  if (!dir) throw new Error('SQLite directory unavailable.');
  return `${dir.replace(/\/?$/, '/') }artcloset.db`;
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

  const dbUri = getSqliteDatabaseUri();
  const dbInfo = await FileSystem.getInfoAsync(dbUri);
  if (!dbInfo.exists) {
    throw new Error('Database file not found for backup.');
  }
  await addFile('artcloset.db', dbUri);

  const imagesRoot = `${doc}artcloset/images/`;
  for (const rel of await listFilesRecursive(imagesRoot, 'images')) {
    await addFile(rel, `${doc}artcloset/${rel}`);
  }

  const brandingRoot = `${doc}artcloset/branding/`;
  for (const rel of await listFilesRecursive(brandingRoot, 'branding')) {
    await addFile(rel, `${doc}artcloset/${rel}`);
  }

  const artworkCount = await countArtworks(database);
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    artworkCount,
    dbSchemaVersion: BACKUP_DB_SCHEMA_HINT,
    files: fileMeta,
  };
  zipEntries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(zipEntries, { level: 6 });
  const zipUri = `${cacheRoot}${BACKUP_FILENAME}`;
  await FileSystem.writeAsStringAsync(zipUri, uint8ToBase64(zipped), {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { uri: zipUri, manifest };
}

export async function validateAndExtractBackup(zipUri: string, stagingDir: string): Promise<BackupManifest> {
  const base64 = await FileSystem.readAsStringAsync(zipUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToUint8(base64);
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
    if (sha !== entry.sha256) throw new Error(`Checksum failed for ${entry.path}`);
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

  return manifest;
}

export async function applyStagedBackup(stagingDir: string): Promise<void> {
  const doc = requireDoc();
  const dbUri = getSqliteDatabaseUri();
  const rollbackUri = `${FileSystem.cacheDirectory}artcloset-db-rollback-${Date.now()}.db`;

  const stagedDb = `${stagingDir}artcloset.db`;
  const stagedDbInfo = await FileSystem.getInfoAsync(stagedDb);
  if (!stagedDbInfo.exists) throw new Error('Staged database missing.');

  const currentDb = await FileSystem.getInfoAsync(dbUri);
  if (currentDb.exists) {
    await FileSystem.copyAsync({ from: dbUri, to: rollbackUri });
  }

  try {
    await FileSystem.copyAsync({ from: stagedDb, to: dbUri });

    const artclosetRoot = `${doc}artcloset/`;
    const imagesDest = `${artclosetRoot}images/`;
    const brandingDest = `${artclosetRoot}branding/`;
    await FileSystem.makeDirectoryAsync(imagesDest, { intermediates: true });
    await FileSystem.makeDirectoryAsync(brandingDest, { intermediates: true });

    const stagedImages = `${stagingDir}images/`;
    const imgInfo = await FileSystem.getInfoAsync(stagedImages);
    if (imgInfo.exists) {
      try {
        await FileSystem.deleteAsync(imagesDest, { idempotent: true });
      } catch {
        // ignore
      }
      await FileSystem.makeDirectoryAsync(imagesDest, { intermediates: true });
      await FileSystem.copyAsync({ from: stagedImages, to: imagesDest });
    }

    const stagedBranding = `${stagingDir}branding/`;
    const brandInfo = await FileSystem.getInfoAsync(stagedBranding);
    if (brandInfo.exists) {
      try {
        await FileSystem.deleteAsync(brandingDest, { idempotent: true });
      } catch {
        // ignore
      }
      await FileSystem.makeDirectoryAsync(brandingDest, { intermediates: true });
      await FileSystem.copyAsync({ from: stagedBranding, to: brandingDest });
    }
  } catch (error) {
    const rollback = await FileSystem.getInfoAsync(rollbackUri);
    if (rollback.exists) {
      await FileSystem.copyAsync({ from: rollbackUri, to: dbUri });
    }
    throw error;
  }
}

export function getStagingDir(): string {
  return `${FileSystem.cacheDirectory}artcloset-restore-staging/`;
}
