import type { SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

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
import {
  buildProgress,
  estimateBackupDuration,
  type DriveProgressState,
} from '@/services/drive/driveBackupProgress';
import { getValidAccessToken } from '@/services/drive/googleAuth';
import { getImageStorageUsage, repairStoredImageUris } from '@/services/imageStorage';

export type DriveProgressReporter = (state: DriveProgressState) => void;

const report = (
  onProgress: DriveProgressReporter | undefined,
  state: DriveProgressState,
): void => {
  onProgress?.(state);
};

/** Rough payload size before packing (images + database headroom). */
export function estimateLocalBackupBytes(): number {
  const images = getImageStorageUsage();
  // SQLite + manifest overhead; keep a floor so tiny catalogs still get a label.
  return Math.max(images + 256 * 1024, 512 * 1024);
}

export async function runDriveBackup(
  database: SQLiteDatabase,
  onProgress?: DriveProgressReporter,
): Promise<{
  manifest: BackupManifest;
  remote: DriveBackupMeta;
}> {
  report(onProgress, buildProgress('backup', 'checking_connection'));
  const token = await getValidAccessToken();
  if (!token) {
    throw new Error('Google account not connected or session expired. Connect again.');
  }

  report(onProgress, buildProgress('backup', 'estimating'));
  const bytes = estimateLocalBackupBytes();
  const estimate = estimateBackupDuration(bytes);
  report(
    onProgress,
    buildProgress('backup', 'estimating', {
      estimateLabel: estimate.label,
      overnightRecommended: estimate.overnightRecommended,
    }),
  );

  report(
    onProgress,
    buildProgress('backup', 'preparing', {
      estimateLabel: estimate.label,
      overnightRecommended: estimate.overnightRecommended,
    }),
  );
  const { uri, manifest } = await createBackupArchive(database);
  try {
    report(
      onProgress,
      buildProgress('backup', 'uploading', {
        estimateLabel: estimate.label,
        overnightRecommended: estimate.overnightRecommended,
      }),
    );
    const remote = await uploadBackupToDrive(uri);
    report(
      onProgress,
      buildProgress('backup', 'finishing', {
        estimateLabel: estimate.label,
        overnightRecommended: estimate.overnightRecommended,
      }),
    );
    report(
      onProgress,
      buildProgress('backup', 'done', {
        estimateLabel: estimate.label,
        overnightRecommended: false,
        message: `Backup finished · ${manifest.artworkCount} artworks.`,
      }),
    );
    return { manifest, remote };
  } finally {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // ignore
    }
  }
}

export async function runDriveRestore(
  database?: SQLiteDatabase,
  onProgress?: DriveProgressReporter,
): Promise<BackupManifest> {
  report(onProgress, buildProgress('restore', 'checking_connection'));
  const latest = await getLatestBackupMeta();
  if (!latest) throw new Error('No Drive backup found for this Google account.');

  const zipUri = `${FileSystem.cacheDirectory}artcloset-restore-download.zip`;
  const staging = getStagingDir();
  try {
    await FileSystem.deleteAsync(staging, { idempotent: true });
  } catch {
    // ignore
  }

  const sizeHint = latest.size ? Number(latest.size) : null;
  const estimate =
    sizeHint && Number.isFinite(sizeHint) && sizeHint > 0
      ? estimateBackupDuration(sizeHint)
      : null;

  report(
    onProgress,
    buildProgress('restore', 'downloading', {
      estimateLabel: estimate?.label ?? null,
      overnightRecommended: estimate?.overnightRecommended ?? false,
    }),
  );
  await downloadBackupFromDrive(latest.id, zipUri);

  report(onProgress, buildProgress('restore', 'validating'));
  const manifest = await validateAndExtractBackup(zipUri, staging);

  report(onProgress, buildProgress('restore', 'applying'));
  await applyStagedBackup(staging, database);

  report(onProgress, buildProgress('restore', 'finishing'));
  if (database) {
    await repairStoredImageUris(database);
  }

  report(
    onProgress,
    buildProgress('restore', 'done', {
      message: `Restore finished · ${manifest.artworkCount} artworks.`,
    }),
  );
  return manifest;
}
