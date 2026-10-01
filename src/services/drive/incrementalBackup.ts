import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  BACKUP_DB_SCHEMA_HINT,
  listBackupMediaFiles,
  snapshotCatalog,
  type LocalMediaFile,
} from '@/services/backupArchive';
import { isSafeArchivePath } from '@/services/backupZip';
import { diagnosticErrorFields, logDiagnostic } from '@/services/debugLog';
import {
  deleteAppDataFile,
  downloadAppDataText,
  downloadBackupFromDrive,
  listAppDataBackups,
  listAppDataObjects,
  uploadAppDataFile,
  type DriveBackupMeta,
} from '@/services/drive/driveApi';

/**
 * Drive layout (all in appDataFolder):
 * - `artcloset-blob-<sha256>`: one object per unique photo/branding file, shared by every snapshot.
 * - `artcloset-catalog-<id>.db`: the SQLite catalog for one snapshot.
 * - `artcloset-snapshot-<id>.json`: the snapshot manifest, uploaded last. A backup exists only
 *   once its manifest does, so an interrupted run never replaces the previous backup.
 */
export const SNAPSHOT_FORMAT = 'artcloset.snapshot';
export const SNAPSHOT_VERSION = 1;
export const KEEP_SNAPSHOTS = 3;
/** Unreferenced objects younger than this may belong to a backup still running on another phone. */
export const ORPHAN_GRACE_MS = 6 * 60 * 60 * 1000;

export interface SnapshotFile {
  path: string;
  /** Hex SHA-256 of the raw file bytes. */
  sha256: string;
  size: number;
}

export interface SnapshotManifest {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  snapshotId: string;
  exportedAt: string;
  artworkCount: number;
  imageFileCount: number;
  dbSchemaVersion: number;
  catalog: { fileId: string; sha256: string; size: number };
  files: SnapshotFile[];
  totalBytes: number;
}

type HashedFile = SnapshotFile & { uri: string };

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const blobName = (sha256: string): string => `artcloset-blob-${sha256}`;

const blobSha = (blob: DriveBackupMeta): string | null => {
  const sha = blob.appProperties?.acSha ?? blob.name.replace(/^artcloset-blob-/, '');
  return /^[0-9a-f]{64}$/.test(sha) ? sha : null;
};

/** Drive blobs keyed by content hash; a blob only counts when its stored size matches. */
export function indexBlobs(blobs: DriveBackupMeta[]): Map<string, DriveBackupMeta[]> {
  const index = new Map<string, DriveBackupMeta[]>();
  for (const blob of blobs) {
    const sha = blobSha(blob);
    if (!sha) continue;
    index.set(sha, [...(index.get(sha) ?? []), blob]);
  }
  return index;
}

export function findBlob(
  index: Map<string, DriveBackupMeta[]>,
  file: SnapshotFile,
): DriveBackupMeta | null {
  return index.get(file.sha256)?.find((blob) => Number(blob.size) === file.size) ?? null;
}

/** Local files whose content is not on Drive yet, one per unique hash. */
export function planBlobUploads<T extends SnapshotFile>(
  files: T[],
  index: Map<string, DriveBackupMeta[]>,
): T[] {
  const queued = new Set<string>();
  const uploads: T[] = [];
  for (const file of files) {
    if (queued.has(file.sha256) || findBlob(index, file)) continue;
    queued.add(file.sha256);
    uploads.push(file);
  }
  return uploads;
}

const createdMs = (file: DriveBackupMeta): number | null => {
  const ms = Date.parse(file.createdTime ?? file.modifiedTime ?? '');
  return Number.isFinite(ms) ? ms : null;
};

const modifiedMs = (file: DriveBackupMeta): number => {
  const ms = Date.parse(file.modifiedTime ?? '');
  return Number.isFinite(ms) ? ms : 0;
};

export type CleanupPlan = {
  snapshots: DriveBackupMeta[];
  catalogs: DriveBackupMeta[];
  blobs: DriveBackupMeta[];
  zips: DriveBackupMeta[];
};

/**
 * Decide what a committed backup may delete. `retainedManifests` must hold the manifest of every
 * snapshot in the newest KEEP_SNAPSHOTS; callers skip cleanup entirely if any failed to load.
 */
export function planCleanup(input: {
  snapshots: DriveBackupMeta[];
  catalogs: DriveBackupMeta[];
  blobs: DriveBackupMeta[];
  zips: DriveBackupMeta[];
  retainedManifests: SnapshotManifest[];
  now: number;
}): CleanupPlan {
  const ordered = [...input.snapshots].sort((a, b) => modifiedMs(b) - modifiedMs(a));
  const retained = ordered.slice(0, KEEP_SNAPSHOTS);
  const pruned = ordered.slice(KEEP_SNAPSHOTS);
  const prunedIds = new Set(pruned.map((s) => s.appProperties?.acSnapshot).filter(Boolean));
  const isOldOrphan = (file: DriveBackupMeta): boolean => {
    const created = createdMs(file);
    return created !== null && input.now - created > ORPHAN_GRACE_MS;
  };

  const keptCatalogs = new Set(input.retainedManifests.map((m) => m.catalog.fileId));
  const catalogs = input.catalogs.filter(
    (c) => !keptCatalogs.has(c.id) && (prunedIds.has(c.appProperties?.acSnapshot) || isOldOrphan(c)),
  );

  const keptShas = new Set(input.retainedManifests.flatMap((m) => m.files.map((f) => f.sha256)));
  const blobs = input.blobs.filter((b) => {
    const sha = blobSha(b);
    return sha !== null && !keptShas.has(sha) && isOldOrphan(b);
  });

  // The legacy zip is the fallback until KEEP_SNAPSHOTS newer snapshots exist.
  const oldestRetained = retained[retained.length - 1];
  const zips =
    retained.length >= KEEP_SNAPSHOTS && oldestRetained
      ? input.zips.filter((z) => modifiedMs(z) < modifiedMs(oldestRetained))
      : [];

  return { snapshots: pruned, catalogs, blobs, zips };
}

export function parseSnapshotManifest(text: string): SnapshotManifest {
  let parsed: SnapshotManifest;
  try {
    parsed = JSON.parse(text) as SnapshotManifest;
  } catch {
    throw new Error('Drive backup list is damaged. Your current catalog was kept.');
  }
  if (parsed?.format !== SNAPSHOT_FORMAT || parsed.version !== SNAPSHOT_VERSION) {
    throw new Error('Unsupported backup format. Update ArtCloset and try again.');
  }
  const validSha = (value: unknown): boolean => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  const validSize = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value) && value >= 0;
  if (!parsed.catalog?.fileId || !validSha(parsed.catalog.sha256) || !validSize(parsed.catalog.size)) {
    throw new Error('Drive backup list is damaged. Your current catalog was kept.');
  }
  if (!Array.isArray(parsed.files)) {
    throw new Error('Drive backup list is damaged. Your current catalog was kept.');
  }
  for (const file of parsed.files) {
    const safe =
      typeof file?.path === 'string' &&
      isSafeArchivePath(file.path) &&
      /^(images|branding)\/[^/]+$/.test(file.path);
    if (!safe || !validSha(file.sha256) || !validSize(file.size)) {
      throw new Error('Backup contains an invalid file path.');
    }
  }
  return parsed;
}

const HASH_CACHE_NAME = 'artcloset-backup-hashes.json';

/** Photos never change in place, so path + size + mtime is a safe key for skipping a re-hash. */
async function hashMediaFiles(media: LocalMediaFile[]): Promise<HashedFile[]> {
  const cacheUri = `${FileSystem.cacheDirectory}${HASH_CACHE_NAME}`;
  let cache: Record<string, string> = {};
  try {
    cache = JSON.parse(await FileSystem.readAsStringAsync(cacheUri)) as Record<string, string>;
  } catch {
    cache = {};
  }
  const nextCache: Record<string, string> = {};
  const out: HashedFile[] = [];
  let hashed = 0;
  for (const file of media) {
    const info = await FileSystem.getInfoAsync(file.uri);
    if (!info.exists || info.isDirectory) continue;
    const key = `${file.path}|${info.size}|${info.modificationTime}`;
    let sha = cache[key];
    if (!sha) {
      sha = await sha256Hex(await new File(file.uri).bytes());
      hashed += 1;
    }
    nextCache[key] = sha;
    out.push({ path: file.path, uri: file.uri, sha256: sha, size: info.size });
  }
  await FileSystem.writeAsStringAsync(cacheUri, JSON.stringify(nextCache)).catch(() => undefined);
  await logDiagnostic('backup.incremental.hashed', { files: out.length, hashed });
  return out;
}

const mimeForPath = (path: string): string => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
};

export type IncrementalBackupHooks = {
  onPlanned?: (plan: { uploadCount: number; uploadBytes: number; fileCount: number }) => void;
  onUploaded?: (done: number, total: number) => void;
  onCommitting?: () => void;
};

export type IncrementalBackupResult = {
  manifest: SnapshotManifest;
  remote: DriveBackupMeta;
  uploadedFiles: number;
  uploadedBytes: number;
};

export async function createIncrementalBackup(
  database: SQLiteDatabase,
  hooks: IncrementalBackupHooks = {},
): Promise<IncrementalBackupResult> {
  const catalog = await snapshotCatalog(database);
  const snapshotId = `${Date.now().toString(36)}-${Crypto.randomUUID().slice(0, 8)}`;
  const workDir = `${FileSystem.cacheDirectory}artcloset-backup-${snapshotId}/`;
  await FileSystem.makeDirectoryAsync(workDir, { intermediates: true });
  try {
    const catalogUri = `${workDir}artcloset.db`;
    const catalogFile = new File(catalogUri);
    catalogFile.create({ overwrite: true });
    catalogFile.write(catalog.bytes);
    const catalogSha = await sha256Hex(catalog.bytes);

    const files = await hashMediaFiles(await listBackupMediaFiles());
    const uploads = planBlobUploads(files, indexBlobs(await listAppDataObjects('blob')));
    const uploadBytes = uploads.reduce((sum, file) => sum + file.size, 0);
    hooks.onPlanned?.({ uploadCount: uploads.length, uploadBytes, fileCount: files.length });
    await logDiagnostic('backup.incremental.plan', {
      fileCount: files.length,
      uploadCount: uploads.length,
      uploadBytes,
    });

    for (const [i, file] of uploads.entries()) {
      await uploadAppDataFile({
        localUri: file.uri,
        name: blobName(file.sha256),
        mimeType: mimeForPath(file.path),
        appProperties: { acKind: 'blob', acSha: file.sha256 },
      });
      hooks.onUploaded?.(i + 1, uploads.length);
    }

    hooks.onCommitting?.();
    const catalogMeta = await uploadAppDataFile({
      localUri: catalogUri,
      name: `artcloset-catalog-${snapshotId}.db`,
      mimeType: 'application/x-sqlite3',
      appProperties: { acKind: 'catalog', acSnapshot: snapshotId },
    });

    const snapshotFiles = files.map(({ path, sha256, size }) => ({ path, sha256, size }));
    const manifest: SnapshotManifest = {
      format: SNAPSHOT_FORMAT,
      version: SNAPSHOT_VERSION,
      snapshotId,
      exportedAt: new Date().toISOString(),
      artworkCount: catalog.artworkCount,
      imageFileCount: snapshotFiles.filter((f) => f.path.startsWith('images/')).length,
      dbSchemaVersion: catalog.dbSchemaVersion,
      catalog: { fileId: catalogMeta.id, sha256: catalogSha, size: catalog.bytes.byteLength },
      files: snapshotFiles,
      totalBytes: catalog.bytes.byteLength + snapshotFiles.reduce((sum, f) => sum + f.size, 0),
    };
    const manifestUri = `${workDir}snapshot.json`;
    await FileSystem.writeAsStringAsync(manifestUri, JSON.stringify(manifest));
    const remote = await uploadAppDataFile({
      localUri: manifestUri,
      name: `artcloset-snapshot-${snapshotId}.json`,
      mimeType: 'application/json',
      appProperties: {
        acKind: 'snapshot',
        acSnapshot: snapshotId,
        acArtworks: String(manifest.artworkCount),
        acBytes: String(manifest.totalBytes),
      },
    });
    await logDiagnostic('backup.incremental.committed', {
      snapshotId,
      artworkCount: manifest.artworkCount,
      fileCount: snapshotFiles.length,
      totalBytes: manifest.totalBytes,
    });

    await cleanupAfterCommit(manifest);
    return { manifest, remote, uploadedFiles: uploads.length, uploadedBytes: uploadBytes };
  } finally {
    await FileSystem.deleteAsync(workDir, { idempotent: true }).catch(() => undefined);
  }
}

/** Runs after the new snapshot is committed; failures are logged and never fail the backup. */
async function cleanupAfterCommit(committed: SnapshotManifest): Promise<void> {
  try {
    const [snapshots, catalogs, blobs, zips] = await Promise.all([
      listAppDataObjects('snapshot'),
      listAppDataObjects('catalog'),
      listAppDataObjects('blob'),
      listAppDataBackups(),
    ]);
    const retained = [...snapshots].sort((a, b) => modifiedMs(b) - modifiedMs(a)).slice(0, KEEP_SNAPSHOTS);
    const retainedManifests: SnapshotManifest[] = [];
    for (const snapshot of retained) {
      if (snapshot.appProperties?.acSnapshot === committed.snapshotId) {
        retainedManifests.push(committed);
      } else {
        retainedManifests.push(parseSnapshotManifest(await downloadAppDataText(snapshot.id)));
      }
    }
    if (!retainedManifests.some((m) => m.snapshotId === committed.snapshotId)) {
      // Drive listing has not caught up with the new snapshot yet; clean up next time.
      await logDiagnostic('backup.incremental.cleanup', { skipped: 'listing_lag' });
      return;
    }
    const plan = planCleanup({ snapshots, catalogs, blobs, zips, retainedManifests, now: Date.now() });
    let deleted = 0;
    // Manifests first: a snapshot without its manifest is invisible, never half-restorable.
    for (const file of [...plan.snapshots, ...plan.catalogs, ...plan.blobs, ...plan.zips]) {
      if (await deleteAppDataFile(file.id)) deleted += 1;
    }
    await logDiagnostic('backup.incremental.cleanup', {
      snapshots: plan.snapshots.length,
      catalogs: plan.catalogs.length,
      blobs: plan.blobs.length,
      zips: plan.zips.length,
      deleted,
    });
  } catch (error) {
    await logDiagnostic('backup.incremental.cleanup', { ok: false, ...diagnosticErrorFields(error) });
  }
}

/** Download, then verify size and hash; one fresh download covers a corrupted transfer. */
async function downloadVerified(
  fileId: string,
  uri: string,
  expected: SnapshotFile | SnapshotManifest['catalog'],
): Promise<void> {
  const label = 'path' in expected ? expected.path : 'catalog';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await downloadBackupFromDrive(fileId, uri, expected.size);
    const bytes = await new File(uri).bytes();
    if (bytes.byteLength === expected.size && (await sha256Hex(bytes)) === expected.sha256) return;
    await logDiagnostic('backup.validate.checksum', { path: label, expectedSize: expected.size, attempt });
  }
  throw new Error(`Checksum failed for ${label}. Your current catalog was kept.`);
}

/** Download and verify a snapshot into the same staging layout a legacy zip extracts to. */
export async function downloadSnapshotToStaging(
  snapshot: DriveBackupMeta,
  stagingDir: string,
  onDownloaded?: (done: number, total: number) => void,
): Promise<SnapshotManifest> {
  const manifest = parseSnapshotManifest(await downloadAppDataText(snapshot.id));
  if (manifest.dbSchemaVersion > BACKUP_DB_SCHEMA_HINT) {
    throw new Error(
      `This backup requires a newer ArtCloset (schema ${manifest.dbSchemaVersion}). Update the app and try again.`,
    );
  }
  await FileSystem.makeDirectoryAsync(stagingDir, { intermediates: true });

  const catalogUri = `${stagingDir}artcloset.db`;
  await downloadVerified(manifest.catalog.fileId, catalogUri, manifest.catalog);

  const index = indexBlobs(await listAppDataObjects('blob'));
  const missing = manifest.files.filter((file) => !findBlob(index, file));
  if (missing.length > 0) {
    await logDiagnostic('backup.validate.missingBlobs', { missing: missing.length });
    throw new Error(
      `Backup is missing ${missing.length} photo file(s) on Google Drive. Your current catalog was kept.`,
    );
  }

  for (const [i, file] of manifest.files.entries()) {
    const blob = findBlob(index, file)!;
    const dest = `${stagingDir}${file.path}`;
    await FileSystem.makeDirectoryAsync(dest.slice(0, dest.lastIndexOf('/') + 1), { intermediates: true });
    await downloadVerified(blob.id, dest, file);
    onDownloaded?.(i + 1, manifest.files.length);
  }

  await logDiagnostic('backup.validate.snapshot', {
    snapshotId: manifest.snapshotId,
    fileCount: manifest.files.length,
    artworkCount: manifest.artworkCount,
    dbSchemaVersion: manifest.dbSchemaVersion,
  });
  return manifest;
}
