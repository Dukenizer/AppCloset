import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase } from '../database';

function createDatabase(version: number): {
  database: SQLiteDatabase;
  execAsync: jest.Mock<Promise<void>, [string]>;
  getAllAsync: jest.Mock<Promise<Array<{ name: string }>>, [string]>;
  withTransactionAsync: jest.Mock<Promise<void>, [operation: () => Promise<void>]>;
} {
  const execAsync = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
  const getAllAsync = jest
    .fn<Promise<Array<{ name: string }>>, [string]>()
    .mockResolvedValue([]);
  const withTransactionAsync = jest
    .fn<Promise<void>, [operation: () => Promise<void>]>()
    .mockImplementation(async (operation) => operation());
  const database = {
    execAsync,
    getAllAsync,
    getFirstAsync: jest.fn().mockResolvedValue({ user_version: version }),
    withTransactionAsync,
  } as unknown as SQLiteDatabase;
  return { database, execAsync, getAllAsync, withTransactionAsync };
}

describe('migrateDatabase', () => {
  it('runs each migration without nested withTransactionAsync locks', async () => {
    const { database, execAsync, withTransactionAsync } = createDatabase(0);

    await migrateDatabase(database);

    expect(withTransactionAsync).not.toHaveBeenCalled();
    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain('PRAGMA busy_timeout = 5000');
    expect(executedSql).toContain('CREATE TABLE IF NOT EXISTS artworks');
    expect(executedSql).toContain('catalog_mediums');
    expect(executedSql).toContain('completion_month');
    expect(executedSql).toContain('short_description');
    expect(executedSql).toContain('ALTER TABLE collections ADD COLUMN archived_at TEXT');
    expect(executedSql).toContain('ALTER TABLE genres ADD COLUMN archived_at TEXT');
    expect(executedSql).toContain("status IN ('Available', 'Loaned', 'Exhibited', 'Sold', 'Not for sale', 'Other')");
    expect(executedSql).toContain('PRAGMA user_version = 9');
  });

  it('models artwork↔collection as many-to-many with a composite join key', async () => {
    const { database, execAsync } = createDatabase(0);

    await migrateDatabase(database);

    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain('CREATE TABLE IF NOT EXISTS artwork_collections');
    expect(executedSql).toContain('PRIMARY KEY (artwork_id, collection_id)');
    expect(executedSql).toContain('REFERENCES artworks(id) ON DELETE CASCADE');
    expect(executedSql).toContain('REFERENCES collections(id) ON DELETE CASCADE');
  });

  it('upgrades an existing version 7 database to v8 with catalog archive support', async () => {
    const { database, execAsync, getAllAsync } = createDatabase(7);

    await migrateDatabase(database);

    expect(getAllAsync).toHaveBeenCalledWith('PRAGMA table_info(catalog_mediums)');
    expect(getAllAsync).toHaveBeenCalledWith('PRAGMA table_info(catalog_materials)');
    expect(getAllAsync).toHaveBeenCalledWith('PRAGMA table_info(genres)');
    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain('ALTER TABLE catalog_mediums ADD COLUMN archived_at TEXT');
    expect(executedSql).toContain('ALTER TABLE catalog_materials ADD COLUMN archived_at TEXT');
    expect(executedSql).toContain('ALTER TABLE genres ADD COLUMN archived_at TEXT');
    expect(executedSql).toContain('PRAGMA user_version = 9');
  });

  it('skips adding archived_at when the column already exists', async () => {
    const { database, execAsync, getAllAsync } = createDatabase(7);
    getAllAsync.mockResolvedValue([{ name: 'id' }, { name: 'name' }, { name: 'archived_at' }]);

    await migrateDatabase(database);

    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).not.toContain('ALTER TABLE catalog_mediums ADD COLUMN archived_at TEXT');
    expect(executedSql).toContain('PRAGMA user_version = 9');
  });

  it('upgrades an existing version 6 database through v9', async () => {
    const { database, execAsync } = createDatabase(6);

    await migrateDatabase(database);

    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain('ALTER TABLE collections ADD COLUMN archived_at TEXT');
    expect(executedSql).toContain('ALTER TABLE genres ADD COLUMN archived_at TEXT');
    expect(executedSql).toContain('PRAGMA user_version = 9');
  });

  it('upgrades an existing version 5 database through v9', async () => {
    const { database, execAsync } = createDatabase(5);

    await migrateDatabase(database);

    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain('short_description');
    expect(executedSql).toContain('archived_at');
    expect(executedSql).toContain('PRAGMA user_version = 9');
  });

  it('upgrades an existing version 4 database through v9', async () => {
    const { database, execAsync } = createDatabase(4);

    await migrateDatabase(database);

    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain('catalog_mediums');
    expect(executedSql).toContain('short_description');
    expect(executedSql).toContain('archived_at');
    expect(executedSql).toContain('PRAGMA user_version = 9');
  });

  it('upgrades an existing version 8 database to allow Other status', async () => {
    const { database, execAsync } = createDatabase(8);

    await migrateDatabase(database);

    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain("status IN ('Available', 'Loaned', 'Exhibited', 'Sold', 'Not for sale', 'Other')");
    expect(executedSql).toContain('PRAGMA user_version = 9');
  });

  it('is idempotent when the database is already current', async () => {
    const { database, execAsync } = createDatabase(9);

    await migrateDatabase(database);

    const versionBumps = execAsync.mock.calls.filter(([sql]) => sql.includes('PRAGMA user_version ='));
    expect(versionBumps).toHaveLength(0);
  });

  it('refuses to open a database created by a newer app', async () => {
    const { database } = createDatabase(10);

    await expect(migrateDatabase(database)).rejects.toThrow(
      'This database was created by a newer version of ArtCloset.',
    );
  });
});
