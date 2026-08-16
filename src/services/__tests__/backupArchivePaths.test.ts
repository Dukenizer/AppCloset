import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  toReadableFileUri,
  getSqliteDatabaseUri,
} from '@/services/backupArchive';

// Lightweight unit coverage for path helpers used by restore.
// Full zip restore is covered manually on device.

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

  it('prefers the open database path for backup/restore', () => {
    expect(
      getSqliteDatabaseUri({
        databasePath: '/data/user/0/com.dukenizer.artcloset/files/SQLite/artcloset.db',
      } as never),
    ).toBe('file:///data/user/0/com.dukenizer.artcloset/files/SQLite/artcloset.db');
  });
});
