import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase } from '../database';

function createDatabase(version: number): {
  database: SQLiteDatabase;
  execAsync: jest.Mock<Promise<void>, [string]>;
  withTransactionAsync: jest.Mock<Promise<void>, [operation: () => Promise<void>]>;
} {
  const execAsync = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
  const withTransactionAsync = jest
    .fn<Promise<void>, [operation: () => Promise<void>]>()
    .mockImplementation(async (operation) => operation());
  const database = {
    execAsync,
    getFirstAsync: jest.fn().mockResolvedValue({ user_version: version }),
    withTransactionAsync,
  } as unknown as SQLiteDatabase;
  return { database, execAsync, withTransactionAsync };
}

describe('migrateDatabase', () => {
  it('runs each migration atomically for a new database', async () => {
    const { database, execAsync, withTransactionAsync } = createDatabase(0);

    await migrateDatabase(database);

    expect(withTransactionAsync).toHaveBeenCalledTimes(7);
    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain('CREATE TABLE IF NOT EXISTS artworks');
    expect(executedSql).toContain('catalog_mediums');
    expect(executedSql).toContain('completion_month');
    expect(executedSql).toContain('short_description');
    expect(executedSql).toContain('archived_at');
    expect(executedSql).toContain('PRAGMA user_version = 7');
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

  it('upgrades an existing version 6 database to v7 with collection archive support', async () => {
    const { database, execAsync, withTransactionAsync } = createDatabase(6);

    await migrateDatabase(database);

    expect(withTransactionAsync).toHaveBeenCalledTimes(1);
    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain('ALTER TABLE collections ADD COLUMN archived_at TEXT');
    expect(executedSql).toContain('PRAGMA user_version = 7');
  });

  it('upgrades an existing version 5 database through v7', async () => {
    const { database, execAsync, withTransactionAsync } = createDatabase(5);

    await migrateDatabase(database);

    expect(withTransactionAsync).toHaveBeenCalledTimes(2);
    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain('short_description');
    expect(executedSql).toContain('archived_at');
    expect(executedSql).toContain('PRAGMA user_version = 7');
  });

  it('upgrades an existing version 4 database through v7', async () => {
    const { database, execAsync, withTransactionAsync } = createDatabase(4);

    await migrateDatabase(database);

    expect(withTransactionAsync).toHaveBeenCalledTimes(3);
    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain('catalog_mediums');
    expect(executedSql).toContain('short_description');
    expect(executedSql).toContain('archived_at');
    expect(executedSql).toContain('PRAGMA user_version = 7');
  });

  it('is idempotent when the database is already current', async () => {
    const { database, withTransactionAsync } = createDatabase(7);

    await migrateDatabase(database);

    expect(withTransactionAsync).not.toHaveBeenCalled();
  });

  it('refuses to open a database created by a newer app', async () => {
    const { database } = createDatabase(8);

    await expect(migrateDatabase(database)).rejects.toThrow(
      'This database was created by a newer version of ArtCloset.',
    );
  });
});
