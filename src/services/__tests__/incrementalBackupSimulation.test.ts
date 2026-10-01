/**
 * End-to-end runs of incremental backup/restore against an in-memory Google Drive,
 * checking after every step that each snapshot on Drive is still fully restorable.
 */
type NodeHash = { update(data: Uint8Array | string): { digest(): Uint8Array; digest(encoding: 'hex'): string } };
const mockSha = (): NodeHash =>
  jest.requireActual<{ createHash(algorithm: string): NodeHash }>('crypto').createHash('sha256');

type MockMeta = {
  id: string;
  name: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
  appProperties?: Record<string, string>;
};

/** Local phone files (and staging/cache) keyed by URI, with an mtime per write. */
const mockFs = new Map<string, { bytes: Uint8Array; mtime: number }>();
const mockDrive = {
  files: new Map<string, { meta: MockMeta; bytes: Uint8Array }>(),
  nextId: 1,
  clock: Date.parse('2026-10-01T00:00:00Z'),
  failUploadNumber: null as number | null,
  uploadCount: 0,
  corruptDownloads: 0,
};
const mockPhone = {
  catalog: 'catalog-v1',
  artworkCount: 0,
  photos: new Map<string, string>(),
};

const mockWrite = (uri: string, bytes: Uint8Array): void => {
  mockDrive.clock += 1;
  mockFs.set(uri, { bytes, mtime: mockDrive.clock });
};

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn(async (_algorithm: string, data: Uint8Array) => {
    const out = mockSha().update(data).digest();
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  }),
  randomUUID: () => `${Math.random().toString(16).slice(2, 10)}-0000-0000-0000-000000000000`,
}));

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(mockUri: string) {
      this.uri = mockUri;
    }
    create() {}
    write(bytes: Uint8Array) {
      mockWrite(this.uri, bytes);
    }
    async bytes() {
      return mockFs.get(this.uri)?.bytes ?? new Uint8Array(0);
    }
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async (uri: string) => {
    for (const key of [...mockFs.keys()]) if (key.startsWith(uri)) mockFs.delete(key);
  }),
  readAsStringAsync: jest.fn(async (uri: string) => {
    const entry = mockFs.get(uri);
    if (!entry) throw new Error('missing');
    return new TextDecoder().decode(entry.bytes);
  }),
  writeAsStringAsync: jest.fn(async (uri: string, text: string) => {
    mockWrite(uri, new TextEncoder().encode(text));
  }),
  getInfoAsync: jest.fn(async (uri: string) => {
    const entry = mockFs.get(uri);
    return entry
      ? { exists: true, isDirectory: false, size: entry.bytes.byteLength, modificationTime: entry.mtime }
      : { exists: false, isDirectory: false };
  }),
}));

jest.mock('@/services/debugLog', () => ({
  logDiagnostic: jest.fn(async () => undefined),
  diagnosticErrorFields: (error: unknown) => ({ message: String(error) }),
}));

jest.mock('@/services/backupArchive', () => ({
  BACKUP_DB_SCHEMA_HINT: 11,
  snapshotCatalog: jest.fn(async () => ({
    bytes: new TextEncoder().encode(mockPhone.catalog),
    artworkCount: mockPhone.artworkCount,
    dbSchemaVersion: 11,
  })),
  listBackupMediaFiles: jest.fn(async () =>
    [...mockPhone.photos.keys()].map((path) => ({ path, uri: `file:///docs/artcloset/${path}` })),
  ),
}));

jest.mock('@/services/drive/driveApi', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const byNewest = (a: { meta: MockMeta }, b: { meta: MockMeta }) =>
    Date.parse(b.meta.modifiedTime) - Date.parse(a.meta.modifiedTime);
  return {
    listAppDataObjects: jest.fn(async (kind: string) =>
      [...mockDrive.files.values()]
        .filter((f) => f.meta.appProperties?.acKind === kind)
        .sort(byNewest)
        .map((f) => ({ ...f.meta })),
    ),
    listAppDataBackups: jest.fn(async () =>
      [...mockDrive.files.values()]
        .filter((f) => f.meta.name === 'artcloset-backup.zip')
        .sort(byNewest)
        .map((f) => ({ ...f.meta })),
    ),
    uploadAppDataFile: jest.fn(
      async (upload: { localUri: string; name: string; appProperties?: Record<string, string> }) => {
        mockDrive.uploadCount += 1;
        if (mockDrive.failUploadNumber === mockDrive.uploadCount) {
          throw new Error('Could not reach Google Drive during upload. Check connectivity and try again.');
        }
        const local = mockFs.get(upload.localUri);
        if (!local) throw new Error('Local backup file missing before Drive upload.');
        mockDrive.clock += 1000;
        const id = `f${mockDrive.nextId++}`;
        const meta: MockMeta = {
          id,
          name: upload.name,
          size: String(local.bytes.byteLength),
          createdTime: iso(mockDrive.clock),
          modifiedTime: iso(mockDrive.clock),
          ...(upload.appProperties ? { appProperties: { ...upload.appProperties } } : {}),
        };
        mockDrive.files.set(id, { meta, bytes: local.bytes });
        return { ...meta };
      },
    ),
    deleteAppDataFile: jest.fn(async (id: string) => mockDrive.files.delete(id) || true),
    downloadAppDataText: jest.fn(async (id: string) => {
      const file = mockDrive.files.get(id);
      if (!file) throw new Error('Drive download failed (404)');
      return new TextDecoder().decode(file.bytes);
    }),
    downloadBackupFromDrive: jest.fn(async (id: string, dest: string) => {
      const file = mockDrive.files.get(id);
      if (!file) throw new Error('Drive download failed (404)');
      let bytes = file.bytes;
      if (mockDrive.corruptDownloads > 0) {
        mockDrive.corruptDownloads -= 1;
        bytes = new Uint8Array(bytes);
        bytes[0] = (bytes[0] ?? 0) ^ 0xff;
      }
      mockWrite(dest, bytes);
    }),
  };
});

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  createIncrementalBackup,
  downloadSnapshotToStaging,
  KEEP_SNAPSHOTS,
  ORPHAN_GRACE_MS,
  parseSnapshotManifest,
} from '@/services/drive/incrementalBackup';

const database = {} as SQLiteDatabase;
const STAGING = 'file:///cache/staging/';
const { pickLatestBackup } = jest.requireActual<typeof import('@/services/drive/driveApi')>(
  '@/services/drive/driveApi',
);

const setPhoto = (path: string, content: string): void => {
  mockPhone.photos.set(path, content);
  mockWrite(`file:///docs/artcloset/${path}`, new TextEncoder().encode(content));
};
const removePhoto = (path: string): void => {
  mockPhone.photos.delete(path);
  mockFs.delete(`file:///docs/artcloset/${path}`);
};
const setCatalog = (version: string, artworks: number): void => {
  mockPhone.catalog = version;
  mockPhone.artworkCount = artworks;
};
const phoneState = () => ({ catalog: mockPhone.catalog, photos: Object.fromEntries(mockPhone.photos) });

const driveOf = (predicate: (meta: MockMeta) => boolean) =>
  [...mockDrive.files.values()].map((f) => f.meta).filter(predicate);
const snapshots = () =>
  driveOf((m) => m.appProperties?.acKind === 'snapshot').sort(
    (a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime),
  );
const blobs = () => driveOf((m) => m.appProperties?.acKind === 'blob');
const catalogs = () => driveOf((m) => m.appProperties?.acKind === 'catalog');
const zips = () => driveOf((m) => m.name === 'artcloset-backup.zip');

/** Restore a snapshot into staging and return what the phone would end up with. */
async function restore(snapshot: MockMeta) {
  for (const key of [...mockFs.keys()]) if (key.startsWith(STAGING)) mockFs.delete(key);
  await downloadSnapshotToStaging(snapshot, STAGING);
  const decode = (uri: string) => new TextDecoder().decode(mockFs.get(uri)!.bytes);
  const photos: Record<string, string> = {};
  for (const key of mockFs.keys()) {
    if (key.startsWith(STAGING) && key !== `${STAGING}artcloset.db`) photos[key.slice(STAGING.length)] = decode(key);
  }
  return { catalog: decode(`${STAGING}artcloset.db`), photos };
}

/** Every snapshot on Drive must reference a live catalog and live, correctly sized blobs. */
function expectAllSnapshotsRestorable(): void {
  for (const meta of snapshots()) {
    const manifest = parseSnapshotManifest(new TextDecoder().decode(mockDrive.files.get(meta.id)!.bytes));
    expect(mockDrive.files.has(manifest.catalog.fileId)).toBe(true);
    for (const file of manifest.files) {
      const found = blobs().some((b) => b.appProperties?.acSha === file.sha256 && Number(b.size) === file.size);
      expect({ path: file.path, found }).toEqual({ path: file.path, found: true });
    }
  }
}

const backup = () => createIncrementalBackup(database);
const advance = (ms: number) => {
  mockDrive.clock += ms;
};

beforeEach(() => {
  mockFs.clear();
  mockDrive.files.clear();
  mockDrive.nextId = 1;
  mockDrive.clock = Date.parse('2026-10-01T00:00:00Z');
  mockDrive.failUploadNumber = null;
  mockDrive.uploadCount = 0;
  mockDrive.corruptDownloads = 0;
  mockPhone.photos.clear();
  setCatalog('catalog-v1', 0);
  clockSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockDrive.clock);
});

let clockSpy: jest.SpyInstance;
afterEach(() => {
  clockSpy.mockRestore();
});

describe('incremental backup simulation', () => {
  it('uploads each photo once, then only changes, and restores exactly', async () => {
    setPhoto('images/a.jpg', 'photo-a');
    setPhoto('images/b.jpg', 'photo-b');
    setPhoto('branding/logo.png', 'logo');
    setCatalog('catalog-v1', 2);

    expect((await backup()).uploadedFiles).toBe(3);
    expect((await backup()).uploadedFiles).toBe(0);

    setPhoto('images/c.jpg', 'photo-c');
    setCatalog('catalog-v2', 3);
    const third = await backup();
    expect(third.uploadedFiles).toBe(1);

    expect(await restore(snapshots()[0]!)).toEqual(phoneState());
    expect(blobs()).toHaveLength(4);
    expectAllSnapshotsRestorable();
  });

  it('dedupes identical photos stored under different names', async () => {
    setPhoto('images/a.jpg', 'same-bytes');
    setPhoto('images/a-copy.jpg', 'same-bytes');
    setCatalog('catalog-v1', 2);

    expect((await backup()).uploadedFiles).toBe(1);
    expect(await restore(snapshots()[0]!)).toEqual(phoneState());
  });

  it('keeps the previous backup intact when a backup is interrupted, then resumes', async () => {
    setPhoto('images/a.jpg', 'photo-a');
    setCatalog('catalog-v1', 1);
    await backup();
    const before = phoneState();

    setPhoto('images/b.jpg', 'photo-b');
    setPhoto('images/c.jpg', 'photo-c');
    setCatalog('catalog-v2', 3);
    mockDrive.uploadCount = 0;
    mockDrive.failUploadNumber = 2;
    await expect(backup()).rejects.toThrow(/Could not reach Google Drive/);

    expect(snapshots()).toHaveLength(1);
    expect(await restore(snapshots()[0]!)).toEqual(before);
    expectAllSnapshotsRestorable();

    mockDrive.failUploadNumber = null;
    const resumed = await backup();
    expect(resumed.uploadedFiles).toBe(1);
    expect(await restore(snapshots()[0]!)).toEqual(phoneState());
  });

  it('fails safely when the connection drops while saving the catalog or snapshot list', async () => {
    setPhoto('images/a.jpg', 'photo-a');
    setCatalog('catalog-v1', 1);
    await backup();
    const before = phoneState();

    for (const failAt of [1, 2]) {
      setCatalog(`catalog-fail-${failAt}`, 1);
      mockDrive.uploadCount = 0;
      mockDrive.failUploadNumber = failAt;
      await expect(backup()).rejects.toThrow();
      expect(snapshots()).toHaveLength(1);
      expect(await restore(snapshots()[0]!)).toEqual(before);
    }

    mockDrive.failUploadNumber = null;
    advance(ORPHAN_GRACE_MS + 1);
    setCatalog('catalog-v2', 1);
    await backup();
    expect(catalogs()).toHaveLength(2);
    expectAllSnapshotsRestorable();
  });

  it(`keeps the newest ${KEEP_SNAPSHOTS} backups, each fully restorable, across many runs`, async () => {
    const expected = new Map<string, ReturnType<typeof phoneState>>();
    for (let run = 1; run <= 8; run += 1) {
      setPhoto(`images/p${run}.jpg`, `photo-${run}`);
      if (run > 2) removePhoto(`images/p${run - 2}.jpg`);
      setCatalog(`catalog-v${run}`, mockPhone.photos.size);
      const { manifest } = await backup();
      expected.set(manifest.snapshotId, phoneState());
      advance(ORPHAN_GRACE_MS + 1);

      expect(snapshots().length).toBeLessThanOrEqual(KEEP_SNAPSHOTS);
      expectAllSnapshotsRestorable();
    }

    expect(snapshots()).toHaveLength(KEEP_SNAPSHOTS);
    expect(catalogs()).toHaveLength(KEEP_SNAPSHOTS);
    for (const meta of snapshots()) {
      expect(await restore(meta)).toEqual(expected.get(meta.appProperties!.acSnapshot!));
    }
    // Only photos used by the 3 kept backups remain: p5..p8.
    expect(blobs()).toHaveLength(4);
  });

  it('removes the legacy zip only once 3 newer backups exist', async () => {
    mockDrive.files.set('zip', {
      meta: {
        id: 'zip',
        name: 'artcloset-backup.zip',
        size: '100',
        createdTime: new Date(mockDrive.clock).toISOString(),
        modifiedTime: new Date(mockDrive.clock).toISOString(),
      },
      bytes: new Uint8Array(100),
    });
    setPhoto('images/a.jpg', 'photo-a');
    setCatalog('catalog-v1', 1);

    await backup();
    await backup();
    expect(zips()).toHaveLength(1);
    await backup();
    expect(zips()).toHaveLength(0);
    expectAllSnapshotsRestorable();
  });

  it('never deletes a zip made later by an older app on another phone, and restores it', async () => {
    setPhoto('images/a.jpg', 'photo-a');
    setCatalog('catalog-v1', 1);
    for (let i = 0; i < 3; i += 1) await backup();

    advance(60_000);
    const later = new Date(mockDrive.clock).toISOString();
    mockDrive.files.set('zip', {
      meta: { id: 'zip', name: 'artcloset-backup.zip', size: '100', createdTime: later, modifiedTime: later },
      bytes: new Uint8Array(100),
    });
    expect(pickLatestBackup(zips(), snapshots())?.kind).toBe('zip');

    await backup();
    expect(zips()).toHaveLength(1);
    expect(pickLatestBackup(zips(), snapshots())?.kind).toBe('snapshot');
  });

  it('keeps photos another phone is still uploading (grace period)', async () => {
    setPhoto('images/a.jpg', 'photo-a');
    setCatalog('catalog-v1', 1);
    await backup();

    // Another phone uploaded a blob but has not saved its snapshot list yet.
    mockDrive.clock += 1000;
    mockDrive.files.set('other-blob', {
      meta: {
        id: 'other-blob',
        name: `artcloset-blob-${'f'.repeat(64)}`,
        size: '5',
        createdTime: new Date(mockDrive.clock).toISOString(),
        modifiedTime: new Date(mockDrive.clock).toISOString(),
        appProperties: { acKind: 'blob', acSha: 'f'.repeat(64) },
      },
      bytes: new Uint8Array(5),
    });
    await backup();
    expect(mockDrive.files.has('other-blob')).toBe(true);

    advance(ORPHAN_GRACE_MS + 1);
    await backup();
    expect(mockDrive.files.has('other-blob')).toBe(false);
  });

  it('two phones on one account: each latest backup stays restorable', async () => {
    type Phone = { catalog: string; photos: Record<string, string> };
    const phoneA: Phone = { catalog: 'A-catalog', photos: { 'images/a.jpg': 'photo-a', 'images/shared.jpg': 'shared' } };
    const phoneB: Phone = { catalog: 'B-catalog', photos: { 'images/b.jpg': 'photo-b', 'images/shared.jpg': 'shared' } };
    const become = (phone: Phone) => {
      for (const path of [...mockPhone.photos.keys()]) removePhoto(path);
      for (const [path, content] of Object.entries(phone.photos)) setPhoto(path, content);
      setCatalog(phone.catalog, Object.keys(phone.photos).length);
    };

    for (let round = 0; round < 3; round += 1) {
      become(phoneA);
      await backup();
      become(phoneB);
      await backup();
      advance(ORPHAN_GRACE_MS + 1);
      expectAllSnapshotsRestorable();
    }
    const [newest, second] = snapshots();
    expect(await restore(newest!)).toEqual(phoneB);
    expect(await restore(second!)).toEqual(phoneA);
  });

  it('re-downloads a corrupted file once, and refuses a file that stays corrupted', async () => {
    setPhoto('images/a.jpg', 'photo-a');
    setCatalog('catalog-v1', 1);
    await backup();

    mockDrive.corruptDownloads = 1;
    expect(await restore(snapshots()[0]!)).toEqual(phoneState());

    mockDrive.corruptDownloads = 2;
    await expect(restore(snapshots()[0]!)).rejects.toThrow(/Checksum failed for catalog/);
  });

  it('refuses to restore when a photo is missing on Drive, without partial downloads', async () => {
    setPhoto('images/a.jpg', 'photo-a');
    setCatalog('catalog-v1', 1);
    await backup();
    mockDrive.files.delete(blobs()[0]!.id);

    await expect(restore(snapshots()[0]!)).rejects.toThrow(/missing 1 photo file/);
    expect(mockFs.has(`${STAGING}images/a.jpg`)).toBe(false);
  });

  it('re-hashes a photo whose content changed in place', async () => {
    setPhoto('images/a.jpg', 'photo-a');
    setCatalog('catalog-v1', 1);
    await backup();

    setPhoto('images/a.jpg', 'photo-A');
    const second = await backup();
    expect(second.uploadedFiles).toBe(1);
    expect(await restore(snapshots()[0]!)).toEqual(phoneState());
  });

  it('backs up and restores an empty catalog', async () => {
    setCatalog('empty-catalog', 0);
    const { manifest } = await backup();
    expect(manifest.files).toEqual([]);
    expect(await restore(snapshots()[0]!)).toEqual({ catalog: 'empty-catalog', photos: {} });
  });
});
