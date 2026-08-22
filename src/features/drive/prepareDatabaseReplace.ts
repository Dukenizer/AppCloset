import type { SQLiteDatabase } from 'expo-sqlite';

import { getSqliteDatabaseUri } from '@/services/backupArchive';
import { logDiagnostic } from '@/services/debugLog';

/** Unmount SQLiteProvider so Drive restore can replace the file. Do not closeAsync first — that races in-flight statements. */
export async function prepareDatabaseReplace(
  database: SQLiteDatabase,
  suspendCatalog: () => Promise<void>,
): Promise<string | null> {
  const databaseUri = getSqliteDatabaseUri(database);
  let checkpointOk = false;
  try {
    await database.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
    checkpointOk = true;
  } catch (error) {
    await logDiagnostic('backup.prepareReplace.checkpoint', {
      ok: false,
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
  await logDiagnostic('backup.prepareReplace', {
    hasUri: Boolean(databaseUri),
    uriTail: databaseUri?.split('/').pop() ?? null,
    checkpointOk,
  });
  await suspendCatalog();
  await logDiagnostic('backup.prepareReplace.suspended', {});
  await new Promise<void>((resolve) => setTimeout(resolve, 800));
  return databaseUri;
}
