import type { SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

import { applyStagedBackup, getStagingDir, validateAndExtractBackup } from '@/services/backupArchive';
import {
  downloadBackupFromDrive,
  getLatestBackupMeta,
  type DriveBackupMeta,
} from '@/services/drive/driveApi';
import {
  buildProgress,
  estimateBackupDuration,
  type DriveProgressState,
} from '@/services/drive/driveBackupProgress';
import {
  createIncrementalBackup,
  downloadSnapshotToStaging,
  type SnapshotManifest,
} from '@/services/drive/incrementalBackup';
import { activateBackupRestoreLogging, diagnosticErrorFields, logDiagnostic } from '@/services/debugLog';
import { getValidAccessToken } from '@/services/drive/googleAuth';

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

export type RestoreSummary = {
  artworkCount: number;
  imageFileCount: number | null;
  dbSchemaVersion: number;
  exportedAt: string;
  verifiedArtworkCount: number;
};

const photoCount = (count: number): string => `${count} new photo${count === 1 ? '' : 's'}`;

export async function runDriveBackup(
  database: SQLiteDatabase,
  onProgress?: DriveProgressReporter,
): Promise<{
  manifest: SnapshotManifest;
  remote: DriveBackupMeta;
}> {
  await activateBackupRestoreLogging('backup');
  report(onProgress, buildProgress('backup', 'checking_connection'));
  const token = await getValidAccessToken();
  await logDiagnostic('drive.backup.token', { hasToken: Boolean(token) });
  if (!token) {
    throw new Error('Google account not connected or session expired. Connect again.');
  }

  report(
    onProgress,
    buildProgress('backup', 'preparing', { message: 'Checking which photos are new…' }),
  );
  let estimate: ReturnType<typeof estimateBackupDuration> | null = null;
  try {
    const result = await createIncrementalBackup(database, {
      onPlanned: ({ uploadCount, uploadBytes }) => {
        estimate = uploadCount > 0 ? estimateBackupDuration(uploadBytes) : null;
        report(
          onProgress,
          buildProgress('backup', 'uploading', {
            estimateLabel: estimate?.label ?? null,
            overnightRecommended: estimate?.overnightRecommended ?? false,
            message:
              uploadCount > 0
                ? `Uploading ${photoCount(uploadCount)}…`
                : 'No new photos. Saving your catalog…',
          }),
        );
      },
      onUploaded: (done, total) => {
        if (done >= total) return;
        report(
          onProgress,
          buildProgress('backup', 'uploading', {
            estimateLabel: estimate?.label ?? null,
            overnightRecommended: estimate?.overnightRecommended ?? false,
            message: `Uploading photo ${done + 1} of ${total}…`,
          }),
        );
      },
      onCommitting: () => {
        report(onProgress, buildProgress('backup', 'finishing', { message: 'Saving catalog to Google Drive…' }));
      },
    });
    const { manifest, remote, uploadedFiles } = result;
    const uploadedNote = uploadedFiles > 0 ? `${photoCount(uploadedFiles)} uploaded` : 'no new photos';
    report(
      onProgress,
      buildProgress('backup', 'done', {
        message: `Backup finished · ${manifest.artworkCount} artworks · ${uploadedNote}.`,
      }),
    );
    await logDiagnostic('drive.backup.done', {
      artworkCount: manifest.artworkCount,
      imageFileCount: manifest.imageFileCount,
      uploadedFiles,
      uploadedBytes: result.uploadedBytes,
      totalBytes: manifest.totalBytes,
    });
    return { manifest, remote };
  } catch (error) {
    await logDiagnostic('drive.backup.failed', diagnosticErrorFields(error));
    throw error;
  }
}

export async function runDriveRestore(
  onProgress?: DriveProgressReporter,
  hooks?: DriveRestoreHooks,
): Promise<RestoreSummary> {
  try {
    await activateBackupRestoreLogging('restore');
    return await runDriveRestoreBody(onProgress, hooks);
  } catch (error) {
    await logDiagnostic('drive.restore.failed', diagnosticErrorFields(error));
    throw error;
  }
}

async function runDriveRestoreBody(
  onProgress: DriveProgressReporter | undefined,
  hooks: DriveRestoreHooks | undefined,
): Promise<RestoreSummary> {
  report(onProgress, buildProgress('restore', 'checking_connection'));
  const latest = await getLatestBackupMeta();
  await logDiagnostic('drive.restore.latest', {
    found: Boolean(latest),
    kind: latest?.kind ?? null,
    id: latest?.id ?? null,
    size: latest?.size ?? null,
    modifiedTime: latest?.modifiedTime ?? null,
  });
  if (!latest) throw new Error('No Drive backup found for this Google account.');

  const staging = getStagingDir();
  const zipUri = `${FileSystem.cacheDirectory}artcloset-restore-download.zip`;
  await FileSystem.deleteAsync(staging, { idempotent: true }).catch(() => undefined);
  try {
    const staged =
      latest.kind === 'snapshot'
        ? await stageSnapshot(latest, staging, onProgress)
        : await stageLegacyZip(latest, zipUri, staging, onProgress);
    return await applyAndVerify(staged, staging, onProgress, hooks);
  } finally {
    await FileSystem.deleteAsync(staging, { idempotent: true }).catch(() => undefined);
    await FileSystem.deleteAsync(zipUri, { idempotent: true }).catch(() => undefined);
  }
}

type StagedBackup = {
  artworkCount: number;
  imageFileCount: number | null;
  dbSchemaVersion: number;
  exportedAt: string;
};

async function stageSnapshot(
  snapshot: DriveBackupMeta,
  staging: string,
  onProgress: DriveProgressReporter | undefined,
): Promise<StagedBackup> {
  const sizeHint = Number(snapshot.appProperties?.acBytes);
  const estimate = Number.isFinite(sizeHint) && sizeHint > 0 ? estimateBackupDuration(sizeHint) : null;
  const downloading = (message?: string): void =>
    report(
      onProgress,
      buildProgress('restore', 'downloading', {
        estimateLabel: estimate?.label ?? null,
        overnightRecommended: estimate?.overnightRecommended ?? false,
        ...(message ? { message } : {}),
      }),
    );
  downloading();
  const manifest = await downloadSnapshotToStaging(snapshot, staging, (done, total) => {
    if (done < total) downloading(`Downloading photo ${done + 1} of ${total}…`);
  });
  await logDiagnostic('drive.restore.validated', {
    kind: 'snapshot',
    artworkCount: manifest.artworkCount,
    imageFileCount: manifest.imageFileCount,
    dbSchemaVersion: manifest.dbSchemaVersion,
    fileCount: manifest.files.length,
  });
  return {
    artworkCount: manifest.artworkCount,
    imageFileCount: manifest.imageFileCount,
    dbSchemaVersion: manifest.dbSchemaVersion,
    exportedAt: manifest.exportedAt,
  };
}

async function stageLegacyZip(
  latest: DriveBackupMeta,
  zipUri: string,
  staging: string,
  onProgress: DriveProgressReporter | undefined,
): Promise<StagedBackup> {
  const sizeHint = latest.size ? Number(latest.size) : null;
  const estimate =
    sizeHint && Number.isFinite(sizeHint) && sizeHint > 0 ? estimateBackupDuration(sizeHint) : null;
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
    kind: 'zip',
    artworkCount: manifest.artworkCount,
    imageFileCount: manifest.imageFileCount ?? null,
    dbSchemaVersion: manifest.dbSchemaVersion,
    fileCount: manifest.files.length,
  });
  return {
    artworkCount: manifest.artworkCount,
    imageFileCount: manifest.imageFileCount ?? null,
    dbSchemaVersion: manifest.dbSchemaVersion,
    exportedAt: manifest.exportedAt,
  };
}

async function applyAndVerify(
  staged: StagedBackup,
  staging: string,
  onProgress: DriveProgressReporter | undefined,
  hooks: DriveRestoreHooks | undefined,
): Promise<RestoreSummary> {
  report(onProgress, buildProgress('restore', 'applying'));
  const databaseUri = (await hooks?.onBeforeApply?.()) ?? null;
  await logDiagnostic('drive.restore.beforeApply', {
    hasDatabaseUri: Boolean(databaseUri),
  });
  const { artworkCount: verifiedArtworkCount, imageFileCount } = await applyStagedBackup(staging, {
    databaseUri,
    expectedArtworkCount: staged.artworkCount,
  });
  await logDiagnostic('drive.restore.applied', {
    verifiedArtworkCount,
    imageFileCount,
    expectedArtworkCount: staged.artworkCount,
  });

  if (verifiedArtworkCount !== staged.artworkCount) {
    await logDiagnostic('drive.restore.verify', {
      ok: false,
      reason: 'artwork_count',
      expected: staged.artworkCount,
      actual: verifiedArtworkCount,
    });
    throw new Error(
      `Restore verification failed: expected ${staged.artworkCount} artworks, verified ${verifiedArtworkCount}.`,
    );
  }
  if (
    typeof staged.imageFileCount === 'number' &&
    staged.imageFileCount > 0 &&
    imageFileCount < staged.imageFileCount
  ) {
    await logDiagnostic('drive.restore.verify', {
      ok: false,
      reason: 'image_count',
      expected: staged.imageFileCount,
      actual: imageFileCount,
    });
    throw new Error(
      `Restore verification failed: expected ${staged.imageFileCount} image files, found ${imageFileCount}.`,
    );
  }

  report(
    onProgress,
    buildProgress('restore', 'done', {
      message: `Restore finished · ${verifiedArtworkCount} artworks · ${imageFileCount} images.`,
    }),
  );
  await logDiagnostic('drive.restore.done', {
    verifiedArtworkCount,
    imageFileCount,
    artworkCount: staged.artworkCount,
  });
  return { ...staged, verifiedArtworkCount };
}

