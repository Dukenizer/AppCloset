import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  applyStagedBackup,
  createBackupArchive,
  getStagingDir,
  validateAndExtractBackup,
  type BackupManifest,
} from '@/services/backupArchive';
import {
  downloadBackupFromDrive,
  getLatestBackupMeta,
  uploadBackupToDrive,
  type DriveBackupMeta,
} from '@/services/drive/driveApi';

export async function runDriveBackup(database: SQLiteDatabase): Promise<{
  manifest: BackupManifest;
  remote: DriveBackupMeta;
}> {
  const { uri, manifest } = await createBackupArchive(database);
  try {
    const remote = await uploadBackupToDrive(uri);
    return { manifest, remote };
  } finally {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // ignore
    }
  }
}

export async function runDriveRestore(): Promise<BackupManifest> {
  const latest = await getLatestBackupMeta();
  if (!latest) throw new Error('No Drive backup found for this Google account.');

  const zipUri = `${FileSystem.cacheDirectory}artcloset-restore-download.zip`;
  const staging = getStagingDir();
  try {
    await FileSystem.deleteAsync(staging, { idempotent: true });
  } catch {
    // ignore
  }

  await downloadBackupFromDrive(latest.id, zipUri);
  const manifest = await validateAndExtractBackup(zipUri, staging);
  await applyStagedBackup(staging);
  return manifest;
}
