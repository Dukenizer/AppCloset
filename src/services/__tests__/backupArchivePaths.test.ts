import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  disableWalInSqliteImage,
  splitSqliteLocation,
  toFilesystemPath,
  toReadableFileUri,
  getSqliteDatabaseUri,
} from '@/services/backupArchive';

// Lightweight unit coverage for path helpers used by restore.
// Full zip restore is covered manually on device.

function sqliteHeader(writeVersion: number, readVersion: number): Uint8Array {
  const bytes = new Uint8Array(32);
  const magic = 'SQLite format 3\0';
  for (let i = 0; i < magic.length; i += 1) bytes[i] = magic.charCodeAt(i);
  bytes[18] = writeVersion;
  bytes[19] = readVersion;
  return bytes;
}

describe('backupArchive path helpers', () => {
  it('exports stable backup constants', () => {
    expect(BACKUP_FORMAT).toBe('artcloset.backup');
    expect(BACKUP_VERSION).toBe(1);
  });

  it('turns native sqlite paths into file:// URIs', () => {
    expect(toReadableFileUri('/data/user/0/com.dukenizer.artcloset/files/SQLite/artcloset.db')).toBe(
      'file:///data/user/0/com.dukenizer.artcloset/files/SQLite/artcloset.db',
    );
    expect(toReadableFileUri('file:///tmp/artcloset.db')).toBe('file:///tmp/artcloset.db');
  });

  it('strips file:// for expo-sqlite directory arguments', () => {
    expect(toFilesystemPath('file:///data/user/0/com.dukenizer.artcloset/cache')).toBe(
      '/data/user/0/com.dukenizer.artcloset/cache',
    );
    expect(toFilesystemPath('/data/user/0/com.dukenizer.artcloset/cache')).toBe(
      '/data/user/0/com.dukenizer.artcloset/cache',
    );
  });

  it('splits a sqlite file URI into directory + name', () => {
    expect(
      splitSqliteLocation(
        'file:///data/user/0/com.dukenizer.artcloset/cache/artcloset-restore-work-1.db',
      ),
    ).toEqual({
      directory: '/data/user/0/com.dukenizer.artcloset/cache',
      name: 'artcloset-restore-work-1.db',
    });
  });

  it('applies SQLite’s documented WAL deserialize workaround (header bytes 18–19 = 0x01)', () => {
    const wal = sqliteHeader(2, 2);
    const result = disableWalInSqliteImage(wal);
    expect(result.wasWal).toBe(true);
    expect(result.bytes[18]).toBe(0x01);
    expect(result.bytes[19]).toBe(0x01);
    expect(wal[18]).toBe(2);
  });

  it('leaves rollback-journal snapshots unchanged', () => {
    const rollback = sqliteHeader(1, 1);
    const result = disableWalInSqliteImage(rollback);
    expect(result.wasWal).toBe(false);
    expect(result.bytes[18]).toBe(1);
    expect(result.bytes[19]).toBe(1);
  });

  it('prefers the open database path for backup/restore', () => {
    expect(
      getSqliteDatabaseUri({
        databasePath: '/data/user/0/com.dukenizer.artcloset/files/SQLite/artcloset.db',
      } as never),
    ).toBe('file:///data/user/0/com.dukenizer.artcloset/files/SQLite/artcloset.db');
  });
});
