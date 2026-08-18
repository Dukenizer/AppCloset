import type { SQLiteDatabase } from 'expo-sqlite';

import { getSqliteDatabaseUri } from '@/services/backupArchive';
import { logDiagnostic } from '@/services/debugLog';

/** Unmount SQLiteProvider so Drive restore can replace the file. Do not closeAsync first — that races in-flight statements. */
export async function prepareDatabaseReplace(
  database: SQLiteDatabase,
  suspendCatalog: () => Promise<void>,
): Promise<string | null> {
  const databaseUri = getSqliteDatabaseUri(database);
  try {
    await database.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // Unmount still releases the handle.
  }
  await logDiagnostic('backup.prepareReplace', { hasUri: Boolean(databaseUri) });
  await suspendCatalog();
  await new Promise<void>((resolve) => setTimeout(resolve, 800));
  return databaseUri;
}
