import type { SQLiteDatabase } from 'expo-sqlite';

/** Close the live DB and unmount SQLiteProvider so Drive restore can replace the file. */
export async function prepareDatabaseReplace(
  database: SQLiteDatabase,
  suspendCatalog: () => Promise<void>,
): Promise<string | null> {
  const databaseUri = database.databasePath ? String(database.databasePath) : null;
  try {
    await database.closeAsync();
  } catch {
    // Provider unmount will also drop the handle.
  }
  await suspendCatalog();
  await new Promise<void>((resolve) => setTimeout(resolve, 350));
  return databaseUri;
}
