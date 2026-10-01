type NodeHash = { update(data: Uint8Array | string): { digest(): Uint8Array; digest(encoding: 'hex'): string } };
const mockCreateHash = (): NodeHash =>
  jest.requireActual<{ createHash(algorithm: string): NodeHash }>('crypto').createHash('sha256');

const mockFiles = new Map<string, Uint8Array>();

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn(async (_algorithm: string, data: Uint8Array) => {
    const out = mockCreateHash().update(data).digest();
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  }),
  randomUUID: () => '12345678-aaaa-bbbb-cccc-000000000000',
}));

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(mockUri: string) {
      this.uri = mockUri;
    }
    create() {}
    write(bytes: Uint8Array) {
      mockFiles.set(this.uri, bytes);
    }
    async bytes() {
      return mockFiles.get(this.uri) ?? new Uint8Array(0);
    }
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => {
    throw new Error('no cache');
  }),
  writeAsStringAsync: jest.fn(async () => undefined),
  getInfoAsync: jest.fn(async (uri: string) => ({
    exists: mockFiles.has(uri),
    isDirectory: false,
    size: mockFiles.get(uri)?.byteLength ?? 0,
    modificationTime: 1,
  })),
}));

jest.mock('@/services/debugLog', () => ({
  logDiagnostic: jest.fn(async () => undefined),
  diagnosticErrorFields: (error: unknown) => ({ message: String(error) }),
}));

jest.mock('@/services/backupArchive', () => ({
  BACKUP_DB_SCHEMA_HINT: 11,
  snapshotCatalog: jest.fn(async () => ({
    bytes: new TextEncoder().encode('SQLite format 3 catalog'),
    artworkCount: 2,
    dbSchemaVersion: 11,
  })),
  listBackupMediaFiles: jest.fn(async () => [
    { path: 'images/a.jpg', uri: 'file:///docs/artcloset/images/a.jpg' },
    { path: 'images/b.jpg', uri: 'file:///docs/artcloset/images/b.jpg' },
  ]),
}));

jest.mock('@/services/drive/driveApi', () => ({
  listAppDataObjects: jest.fn(),
  listAppDataBackups: jest.fn(async () => []),
  uploadAppDataFile: jest.fn(),
  deleteAppDataFile: jest.fn(async () => true),
  downloadAppDataText: jest.fn(),
  downloadBackupFromDrive: jest.fn(),
}));

import type { SQLiteDatabase } from 'expo-sqlite';

import * as driveApi from '@/services/drive/driveApi';
import {
  blobName,
  createIncrementalBackup,
  downloadSnapshotToStaging,
  indexBlobs,
  KEEP_SNAPSHOTS,
  ORPHAN_GRACE_MS,
  parseSnapshotManifest,
  planBlobUploads,
  planCleanup,
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  type SnapshotManifest,
} from '@/services/drive/incrementalBackup';

const sha = (text: string): string => mockCreateHash().update(text).digest('hex');
const SHA_A = sha('photo-a');
const SHA_B = sha('photo-b');
const NOW = Date.parse('2026-10-01T00:00:00Z');
const hoursAgo = (hours: number): string => new Date(NOW - hours * 3600_000).toISOString();

const blob = (hash: string, size: number, createdHoursAgo = 48) => ({
  id: `blob-${hash.slice(0, 6)}`,
  name: blobName(hash),
  size: String(size),
  createdTime: hoursAgo(createdHoursAgo),
  appProperties: { acKind: 'blob', acSha: hash },
});

const manifest = (id: string, shas: string[], catalogId = `cat-${id}`): SnapshotManifest => ({
  format: SNAPSHOT_FORMAT,
  version: SNAPSHOT_VERSION,
  snapshotId: id,
  exportedAt: NOW.toString(),
  artworkCount: shas.length,
  imageFileCount: shas.length,
  dbSchemaVersion: 11,
  catalog: { fileId: catalogId, sha256: sha('db'), size: 10 },
  files: shas.map((hash, i) => ({ path: `images/${i}.jpg`, sha256: hash, size: 7 })),
  totalBytes: 10 + shas.length * 7,
});

const snapshotMeta = (id: string, modifiedHoursAgo: number) => ({
  id: `snap-${id}`,
  name: `artcloset-snapshot-${id}.json`,
  modifiedTime: hoursAgo(modifiedHoursAgo),
  createdTime: hoursAgo(modifiedHoursAgo),
  appProperties: { acKind: 'snapshot', acSnapshot: id },
});

describe('planBlobUploads', () => {
  it('uploads only photos Drive does not already have, once per unique content', () => {
    const local = [
      { path: 'images/a.jpg', sha256: SHA_A, size: 7 },
      { path: 'images/b.jpg', sha256: SHA_B, size: 7 },
      { path: 'images/b-copy.jpg', sha256: SHA_B, size: 7 },
    ];
    expect(planBlobUploads(local, indexBlobs([blob(SHA_A, 7)])).map((f) => f.path)).toEqual(['images/b.jpg']);
  });

  it('re-uploads when the Drive copy has the wrong size', () => {
    const local = [{ path: 'images/a.jpg', sha256: SHA_A, size: 7 }];
    expect(planBlobUploads(local, indexBlobs([blob(SHA_A, 3)]))).toHaveLength(1);
  });
});

describe('planCleanup', () => {
  const base = { catalogs: [], blobs: [], zips: [], now: NOW };

  it('keeps the legacy zip until enough newer snapshots exist', () => {
    const zip = { id: 'zip', name: 'artcloset-backup.zip', modifiedTime: hoursAgo(100) };
    const two = planCleanup({
      ...base,
      zips: [zip],
      snapshots: [snapshotMeta('s2', 1), snapshotMeta('s1', 2)],
      retainedManifests: [manifest('s2', []), manifest('s1', [])],
    });
    expect(two.zips).toEqual([]);

    const three = planCleanup({
      ...base,
      zips: [zip],
      snapshots: [snapshotMeta('s3', 1), snapshotMeta('s2', 2), snapshotMeta('s1', 3)],
      retainedManifests: [manifest('s3', []), manifest('s2', []), manifest('s1', [])],
    });
    expect(three.zips).toEqual([zip]);
  });

  it('never deletes a zip made after the oldest kept snapshot', () => {
    const newerZip = { id: 'zip', name: 'artcloset-backup.zip', modifiedTime: hoursAgo(2) };
    const plan = planCleanup({
      ...base,
      zips: [newerZip],
      snapshots: [snapshotMeta('s3', 1), snapshotMeta('s2', 3), snapshotMeta('s1', 4)],
      retainedManifests: [manifest('s3', []), manifest('s2', []), manifest('s1', [])],
    });
    expect(plan.zips).toEqual([]);
  });

  it(`keeps the newest ${KEEP_SNAPSHOTS} snapshots and deletes older ones with their catalogs`, () => {
    const snapshots = [snapshotMeta('s4', 1), snapshotMeta('s3', 2), snapshotMeta('s2', 3), snapshotMeta('s1', 4)];
    const catalogs = ['s4', 's3', 's2', 's1'].map((id) => ({
      id: `cat-${id}`,
      name: `artcloset-catalog-${id}.db`,
      createdTime: hoursAgo(1),
      appProperties: { acKind: 'catalog', acSnapshot: id },
    }));
    const plan = planCleanup({
      ...base,
      snapshots,
      catalogs,
      retainedManifests: [manifest('s4', []), manifest('s3', []), manifest('s2', [])],
    });
    expect(plan.snapshots.map((s) => s.id)).toEqual(['snap-s1']);
    expect(plan.catalogs.map((c) => c.id)).toEqual(['cat-s1']);
  });

  it('deletes only photos no kept snapshot uses, and only after the grace period', () => {
    const SHA_C = sha('photo-c');
    const plan = planCleanup({
      ...base,
      snapshots: [snapshotMeta('s1', 1)],
      blobs: [blob(SHA_A, 7), blob(SHA_B, 7), blob(SHA_C, 7, ORPHAN_GRACE_MS / 3600_000 / 2)],
      retainedManifests: [manifest('s1', [SHA_A])],
    });
    expect(plan.blobs.map((b) => b.appProperties?.acSha)).toEqual([SHA_B]);
  });
});

describe('parseSnapshotManifest', () => {
  it('accepts a valid manifest', () => {
    expect(parseSnapshotManifest(JSON.stringify(manifest('s1', [SHA_A]))).snapshotId).toBe('s1');
  });

  it('rejects unsafe or unexpected file paths', () => {
    for (const path of ['../evil.jpg', 'images/../../evil', 'artcloset.db', '/abs.jpg', 'images/a/b.jpg']) {
      const bad = manifest('s1', [SHA_A]);
      bad.files[0]!.path = path;
      expect(() => parseSnapshotManifest(JSON.stringify(bad))).toThrow(/invalid file path/);
    }
  });

  it('rejects other formats and damaged JSON', () => {
    expect(() => parseSnapshotManifest(JSON.stringify({ ...manifest('s1', []), version: 2 }))).toThrow(
      /Unsupported backup format/,
    );
    expect(() => parseSnapshotManifest('{"format":')).toThrow(/damaged/);
  });
});

describe('downloadSnapshotToStaging', () => {
  const staging = 'file:///cache/staging/';
  const catalogBytes = new TextEncoder().encode('SQLite catalog');
  const photo = new TextEncoder().encode('photo-a');
  const snapshot: SnapshotManifest = {
    ...manifest('s1', []),
    catalog: { fileId: 'cat-s1', sha256: mockCreateHash().update(catalogBytes).digest('hex'), size: catalogBytes.byteLength },
    files: [{ path: 'images/a.jpg', sha256: SHA_A, size: photo.byteLength }],
  };
  let served: Record<string, Uint8Array>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.clear();
    served = { 'cat-s1': catalogBytes, [blob(SHA_A, 7).id]: photo };
    (driveApi.downloadAppDataText as jest.Mock).mockResolvedValue(JSON.stringify(snapshot));
    (driveApi.listAppDataObjects as jest.Mock).mockResolvedValue([blob(SHA_A, 7)]);
    (driveApi.downloadBackupFromDrive as jest.Mock).mockImplementation(async (id: string, dest: string) => {
      mockFiles.set(dest, served[id]!);
    });
  });

  it('stages the catalog and photos in the same layout as a zip restore', async () => {
    const result = await downloadSnapshotToStaging(snapshotMeta('s1', 1), staging);

    expect(result.snapshotId).toBe('s1');
    expect(mockFiles.get(`${staging}artcloset.db`)).toEqual(catalogBytes);
    expect(mockFiles.get(`${staging}images/a.jpg`)).toEqual(photo);
  });

  it('rejects a photo whose content does not match the backup', async () => {
    served[blob(SHA_A, 7).id] = new TextEncoder().encode('photo-X');

    await expect(downloadSnapshotToStaging(snapshotMeta('s1', 1), staging)).rejects.toThrow(
      /Checksum failed for images\/a.jpg/,
    );
  });

  it('stops before downloading photos when one is missing on Drive', async () => {
    (driveApi.listAppDataObjects as jest.Mock).mockResolvedValue([]);

    await expect(downloadSnapshotToStaging(snapshotMeta('s1', 1), staging)).rejects.toThrow(
      /missing 1 photo file/,
    );
    expect(mockFiles.has(`${staging}images/a.jpg`)).toBe(false);
  });
});

describe('createIncrementalBackup', () => {
  const database = {} as SQLiteDatabase;
  const uploads = driveApi.uploadAppDataFile as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.clear();
    mockFiles.set('file:///docs/artcloset/images/a.jpg', new TextEncoder().encode('photo-a'));
    mockFiles.set('file:///docs/artcloset/images/b.jpg', new TextEncoder().encode('photo-b'));
    (driveApi.listAppDataObjects as jest.Mock).mockImplementation(async (kind: string) =>
      kind === 'blob' ? [blob(SHA_A, 7)] : [],
    );
    uploads.mockImplementation(async (upload: { name: string; localUri: string }) => ({
      id: `id-${upload.name}`,
      name: upload.name,
      size: String(mockFiles.get(upload.localUri)?.byteLength ?? 0),
    }));
  });

  it('uploads new photos, then the catalog, and the snapshot manifest last', async () => {
    const result = await createIncrementalBackup(database);

    const names = uploads.mock.calls.map(([upload]) => upload.name as string);
    expect(names).toEqual([
      blobName(SHA_B),
      expect.stringMatching(/^artcloset-catalog-.+\.db$/),
      expect.stringMatching(/^artcloset-snapshot-.+\.json$/),
    ]);
    expect(result.uploadedFiles).toBe(1);
    expect(result.manifest.files.map((f) => f.sha256)).toEqual([SHA_A, SHA_B]);
    expect(result.manifest.catalog.fileId).toMatch(/^id-artcloset-catalog-/);
    expect(result.manifest.artworkCount).toBe(2);
  });

  it('never writes a snapshot manifest when a photo upload fails', async () => {
    uploads.mockRejectedValueOnce(new Error('Could not reach Google Drive during upload.'));

    await expect(createIncrementalBackup(database)).rejects.toThrow(/Could not reach Google Drive/);
    const names = uploads.mock.calls.map(([upload]) => upload.name as string);
    expect(names.some((name) => name.startsWith('artcloset-snapshot-'))).toBe(false);
    expect(driveApi.deleteAppDataFile).not.toHaveBeenCalled();
  });

  it('uploads no photos when nothing changed', async () => {
    (driveApi.listAppDataObjects as jest.Mock).mockImplementation(async (kind: string) =>
      kind === 'blob' ? [blob(SHA_A, 7), blob(SHA_B, 7)] : [],
    );

    const result = await createIncrementalBackup(database);

    expect(result.uploadedFiles).toBe(0);
    expect(uploads).toHaveBeenCalledTimes(2);
  });
});
