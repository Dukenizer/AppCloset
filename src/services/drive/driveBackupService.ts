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
import { activateBackupRestoreLogging, logDiagnostic } from '@/services/debugLog';
import { getValidAccessToken } from '@/services/drive/googleAuth';
import { getImageStorageUsage } from '@/services/imageStorage';

export type DriveProgressReporter = (state: DriveProgressState) => void;

export type DriveRestoreHooks = {
  /**
   * Called after validation, before on-disk apply.
   * Must release the live SQLite connection.
   * Return the open database file URI so apply writes to the same path.
   */
  onBeforeApply?: () => Promise<string | null | undefined>;
};

const report = (
  onProgress: DriveProgressReporter | undefined,
  state: DriveProgressState,
): void => {
  onProgress?.(state);
  void logDiagnostic('drive.progress', {
    kind: state.kind,
    step: state.step,
    message: state.message,
    error: state.error,
  });
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
  await activateBackupRestoreLogging('backup');
  report(onProgress, buildProgress('backup', 'checking_connection'));
  const token = await getValidAccessToken();
  await logDiagnostic('drive.backup.token', { hasToken: Boolean(token) });
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
  await logDiagnostic('drive.backup.archive', {
    artworkCount: manifest.artworkCount,
    imageFileCount: manifest.imageFileCount ?? null,
    dbSchemaVersion: manifest.dbSchemaVersion,
    fileCount: manifest.files.length,
  });
  try {
    report(
      onProgress,
      buildProgress('backup', 'uploading', {
        estimateLabel: estimate.label,
        overnightRecommended: estimate.overnightRecommended,
      }),
    );
    const remote = await uploadBackupToDrive(uri);
    await logDiagnostic('drive.backup.uploaded', {
      id: remote.id,
      size: remote.size ?? null,
      modifiedTime: remote.modifiedTime ?? null,
    });
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
  } catch (error) {
    await logDiagnostic('drive.backup.failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  } finally {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // ignore
    }
  }
}

export async function runDriveRestore(
  onProgress?: DriveProgressReporter,
  hooks?: DriveRestoreHooks,
): Promise<BackupManifest & { verifiedArtworkCount: number }> {
  try {
    await activateBackupRestoreLogging('restore');
    return await runDriveRestoreBody(onProgress, hooks);
  } catch (error) {
    await logDiagnostic('drive.restore.failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}

async function runDriveRestoreBody(
  onProgress: DriveProgressReporter | undefined,
  hooks: DriveRestoreHooks | undefined,
): Promise<BackupManifest & { verifiedArtworkCount: number }> {
  report(onProgress, buildProgress('restore', 'checking_connection'));
  const latest = await getLatestBackupMeta();
  await logDiagnostic('drive.restore.latest', {
    found: Boolean(latest),
    id: latest?.id ?? null,
    size: latest?.size ?? null,
    modifiedTime: latest?.modifiedTime ?? null,
  });
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
  await downloadBackupFromDrive(latest.id, zipUri, sizeHint);

  report(onProgress, buildProgress('restore', 'validating'));
  const manifest = await validateAndExtractBackup(zipUri, staging);
  await logDiagnostic('drive.restore.validated', {
    artworkCount: manifest.artworkCount,
    imageFileCount: manifest.imageFileCount ?? null,
    dbSchemaVersion: manifest.dbSchemaVersion,
    fileCount: manifest.files.length,
  });

  report(onProgress, buildProgress('restore', 'applying'));
  const databaseUri = (await hooks?.onBeforeApply?.()) ?? null;
  await logDiagnostic('drive.restore.beforeApply', {
    hasDatabaseUri: Boolean(databaseUri),
  });
  const { artworkCount: verifiedArtworkCount, imageFileCount } = await applyStagedBackup(staging, {
    databaseUri,
    expectedArtworkCount: manifest.artworkCount,
  });
  await logDiagnostic('drive.restore.applied', {
    verifiedArtworkCount,
    imageFileCount,
    expectedArtworkCount: manifest.artworkCount,
  });

  if (verifiedArtworkCount !== manifest.artworkCount) {
    throw new Error(
      `Restore verification failed: expected ${manifest.artworkCount} artworks, verified ${verifiedArtworkCount}.`,
    );
  }
  if (
    typeof manifest.imageFileCount === 'number' &&
    manifest.imageFileCount > 0 &&
    imageFileCount < manifest.imageFileCount
  ) {
    throw new Error(
      `Restore verification failed: expected ${manifest.imageFileCount} image files, found ${imageFileCount}.`,
    );
  }

  try {
    await FileSystem.deleteAsync(staging, { idempotent: true });
  } catch {
    // ignore
  }
  try {
    await FileSystem.deleteAsync(zipUri, { idempotent: true });
  } catch {
    // ignore
  }

  report(
    onProgress,
    buildProgress('restore', 'done', {
      message: `Restore finished · ${verifiedArtworkCount} artworks · ${imageFileCount} images.`,
    }),
  );
  return { ...manifest, verifiedArtworkCount };
}
