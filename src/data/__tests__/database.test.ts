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

    expect(withTransactionAsync).toHaveBeenCalledTimes(2);
    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).toContain('CREATE TABLE IF NOT EXISTS artworks');
    expect(executedSql).toContain('CREATE TABLE IF NOT EXISTS artwork_images');
    expect(executedSql).toContain('CREATE TABLE IF NOT EXISTS backup_records');
    expect(executedSql).toContain('PRAGMA user_version = 1');
    expect(executedSql).toContain("'profile_role'");
    expect(executedSql).toContain('PRAGMA user_version = 2');
  });

  it('upgrades an existing version 1 database without recreating tables', async () => {
    const { database, execAsync, withTransactionAsync } = createDatabase(1);

    await migrateDatabase(database);

    expect(withTransactionAsync).toHaveBeenCalledTimes(1);
    const executedSql = execAsync.mock.calls.map(([sql]) => sql).join('\n');
    expect(executedSql).not.toContain('CREATE TABLE IF NOT EXISTS artworks');
    expect(executedSql).toContain("'profile_role'");
    expect(executedSql).toContain('PRAGMA user_version = 2');
  });

  it('is idempotent when the database is already current', async () => {
    const { database, withTransactionAsync } = createDatabase(2);

    await migrateDatabase(database);

    expect(withTransactionAsync).not.toHaveBeenCalled();
  });

  it('refuses to open a database created by a newer app', async () => {
    const { database } = createDatabase(3);

    await expect(migrateDatabase(database)).rejects.toThrow(
      'This database was created by a newer version of ArtCloset.',
    );
  });
});
