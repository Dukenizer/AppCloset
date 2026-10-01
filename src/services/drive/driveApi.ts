import * as FileSystem from 'expo-file-system/legacy';

import { BACKUP_FILENAME } from '@/services/backupArchive';
import { diagnosticErrorFields, logDiagnostic } from '@/services/debugLog';

import { getValidAccessToken } from './googleAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const BACKUP_NAME = BACKUP_FILENAME;
const FILE_FIELDS = 'id,name,modifiedTime,createdTime,size,md5Checksum,appProperties';

export interface DriveBackupMeta {
  id: string;
  name: string;
  modifiedTime?: string;
  createdTime?: string;
  size?: string;
  md5Checksum?: string;
  appProperties?: Record<string, string>;
}

/** Newest restorable backup: a legacy single zip or an incremental snapshot. */
export type LatestDriveBackup = DriveBackupMeta & { kind: 'zip' | 'snapshot' };

/** `appProperties.acKind` values that tag incremental backup objects in appDataFolder. */
export type DriveObjectKind = 'blob' | 'catalog' | 'snapshot';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Google account not connected or session expired. Connect again.');
  return { Authorization: `Bearer ${token}` };
}

/** Worth retrying: the request may succeed unchanged a moment later. */
class TransientDriveError extends Error {}

const RATE_LIMIT_REASON = /rateLimitExceeded|userRateLimitExceeded/;

const isRateLimited = (status: number, detail?: string): boolean =>
  status === 429 || (status === 403 && RATE_LIMIT_REASON.test(detail ?? ''));

function driveHttpError(action: string, status: number, detail?: string): Error {
  if (isRateLimited(status, detail)) {
    return new TransientDriveError('Google Drive is busy right now. Wait a minute and try again.');
  }
  if (status === 401 || status === 403) {
    return new Error('Google session expired or Drive access was denied. Disconnect and connect again.');
  }
  const extra = detail ? `: ${detail.slice(0, 120)}` : '';
  const message = `${action} failed (${status})${extra}`;
  return status >= 500 ? new TransientDriveError(message) : new Error(message);
}

/** Backoff before each retry of a transient failure; a first backup makes many requests. */
export const DRIVE_RETRY_DELAYS_MS = [1000, 4000, 10000];

async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const delay = DRIVE_RETRY_DELAYS_MS[attempt];
      if (!(error instanceof TransientDriveError) || delay === undefined) throw error;
      await logDiagnostic('drive.api.retry', { label, attempt: attempt + 1, delay, message: error.message });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function listAppDataFiles(query: string, logKey: string): Promise<DriveBackupMeta[]> {
  const headers = await authHeaders();
  const files: DriveBackupMeta[] = [];
  let pageToken: string | undefined;
  do {
    const url =
      `${DRIVE_API}/files?spaces=appDataFolder&q=${encodeURIComponent(query)}` +
      `&fields=${encodeURIComponent(`nextPageToken,files(${FILE_FIELDS})`)}` +
      `&orderBy=${encodeURIComponent('modifiedTime desc')}&pageSize=1000` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const data = await withRetry(logKey, async () => {
      let res: Response;
      try {
        res = await fetch(url, { headers });
      } catch (error) {
        await logDiagnostic(logKey, { ok: false, network: true, ...diagnosticErrorFields(error) });
        throw new TransientDriveError('Could not reach Google Drive. Check connectivity and try again.');
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        await logDiagnostic(logKey, { ok: false, status: res.status, detail: detail.slice(0, 160) });
        throw driveHttpError('Drive list', res.status, detail);
      }
      return (await res.json()) as { files?: DriveBackupMeta[]; nextPageToken?: string };
    });
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  await logDiagnostic(logKey, { ok: true, count: files.length });
  return files;
}

/** Legacy single-zip backups, newest first. */
export async function listAppDataBackups(): Promise<DriveBackupMeta[]> {
  return listAppDataFiles(`name = '${BACKUP_NAME}'`, 'drive.api.list');
}

/** Incremental backup objects of one kind, newest first. */
export async function listAppDataObjects(kind: DriveObjectKind): Promise<DriveBackupMeta[]> {
  return listAppDataFiles(
    `appProperties has { key='acKind' and value='${kind}' }`,
    `drive.api.list.${kind}`,
  );
}

export type AppDataUpload = {
  localUri: string;
  name: string;
  mimeType: string;
  appProperties?: Record<string, string>;
};

/**
 * Resumable session + native file streaming: the file is never loaded into JS or Java memory.
 * A new object whose Drive size differs from the local file is deleted before throwing.
 */
export async function uploadAppDataFile(upload: AppDataUpload): Promise<DriveBackupMeta> {
  return withRetry(`upload ${upload.name.slice(0, 24)}`, () => uploadAppDataFileOnce(upload));
}

async function uploadAppDataFileOnce(upload: AppDataUpload): Promise<DriveBackupMeta> {
  const headers = await authHeaders();
  const localInfo = await FileSystem.getInfoAsync(upload.localUri);
  if (!localInfo.exists || localInfo.isDirectory) {
    throw new Error('Local backup file missing before Drive upload.');
  }
  const localSize = typeof localInfo.size === 'number' ? localInfo.size : null;

  const networkFailure = async (stage: string, error: unknown): Promise<Error> => {
    await logDiagnostic('drive.api.upload', {
      ok: false,
      network: true,
      stage,
      localSize,
      ...diagnosticErrorFields(error),
    });
    return new TransientDriveError('Could not reach Google Drive during upload. Check connectivity and try again.');
  };

  let session: Response;
  try {
    session = await fetch(
      `${UPLOAD_API}/files?uploadType=resumable&fields=${encodeURIComponent(FILE_FIELDS)}`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': upload.mimeType,
          ...(localSize !== null ? { 'X-Upload-Content-Length': String(localSize) } : {}),
        },
        body: JSON.stringify({
          name: upload.name,
          parents: ['appDataFolder'],
          ...(upload.appProperties ? { appProperties: upload.appProperties } : {}),
        }),
      },
    );
  } catch (error) {
    throw await networkFailure('session', error);
  }
  if (!session.ok) {
    const text = await session.text().catch(() => '');
    await logDiagnostic('drive.api.upload', {
      ok: false,
      stage: 'session',
      status: session.status,
      localSize,
      detail: text.slice(0, 160),
    });
    throw driveHttpError('Drive upload', session.status, text);
  }
  const uploadLocation = session.headers.get('location');
  if (!uploadLocation) {
    throw new Error('Drive did not return an upload session. Previous Drive backup was kept.');
  }

  let uploadStatus: number;
  let uploadBody: string;
  try {
    const result = await FileSystem.uploadAsync(uploadLocation, upload.localUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': upload.mimeType },
    });
    uploadStatus = result.status;
    uploadBody = result.body;
  } catch (error) {
    throw await networkFailure('upload', error);
  }
  if (uploadStatus < 200 || uploadStatus >= 300) {
    await logDiagnostic('drive.api.upload', {
      ok: false,
      status: uploadStatus,
      localSize,
      detail: uploadBody.slice(0, 160),
    });
    throw driveHttpError('Drive upload', uploadStatus, uploadBody);
  }
  let uploaded: DriveBackupMeta;
  try {
    uploaded = JSON.parse(uploadBody) as DriveBackupMeta;
  } catch {
    throw new Error('Drive upload returned an unexpected response. Previous Drive backup was kept.');
  }
  if (!uploaded.id) {
    throw new Error('Drive upload did not return a file id. Previous Drive backup was kept.');
  }

  const remoteSize = uploaded.size ? Number(uploaded.size) : NaN;
  if (localSize !== null && Number.isFinite(remoteSize) && remoteSize !== localSize) {
    await deleteAppDataFile(uploaded.id);
    await logDiagnostic('drive.api.upload', {
      ok: false,
      reason: 'size_mismatch',
      localSize,
      remoteSize,
    });
    throw new TransientDriveError(
      `Drive upload size mismatch (local ${localSize} vs remote ${remoteSize}). Previous Drive backup was kept.`,
    );
  }
  return uploaded;
}

/** Best effort; returns false instead of throwing so cleanup never fails a finished backup. */
export async function deleteAppDataFile(fileId: string): Promise<boolean> {
  try {
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export async function downloadBackupFromDrive(
  fileId: string,
  destUri: string,
  expectedSize?: number | null,
): Promise<void> {
  return withRetry(`download ${fileId.slice(-8)}`, () => downloadOnce(fileId, destUri, expectedSize));
}

async function downloadOnce(fileId: string, destUri: string, expectedSize?: number | null): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Google account not connected or session expired. Connect again.');
  let result: FileSystem.FileSystemDownloadResult;
  try {
    result = await FileSystem.downloadAsync(
      `${DRIVE_API}/files/${fileId}?alt=media`,
      destUri,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (error) {
    await logDiagnostic('drive.api.download', {
      ok: false,
      network: true,
      ...diagnosticErrorFields(error),
    });
    throw new TransientDriveError('Could not reach Google Drive during download. Check connectivity and try again.');
  }
  if (result.status !== 200) {
    await logDiagnostic('drive.api.download', {
      ok: false,
      status: result.status,
      fileIdSuffix: fileId.slice(-8),
    });
    throw driveHttpError('Drive download', result.status);
  }
  const info = await FileSystem.getInfoAsync(destUri);
  const size = info.exists && typeof info.size === 'number' ? info.size : null;
  if (expectedSize && expectedSize > 0 && size !== null && size !== expectedSize) {
    await logDiagnostic('drive.api.download', {
      ok: false,
      status: result.status,
      expectedSize,
      actualSize: size,
    });
    throw new TransientDriveError(
      `Drive download size mismatch (expected ${expectedSize} bytes, got ${size}). Try Restore again.`,
    );
  }
}

export async function downloadAppDataText(fileId: string): Promise<string> {
  return withRetry(`downloadText ${fileId.slice(-8)}`, async () => {
    const headers = await authHeaders();
    let res: Response;
    try {
      res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers });
    } catch (error) {
      await logDiagnostic('drive.api.downloadText', { ok: false, network: true, ...diagnosticErrorFields(error) });
      throw new TransientDriveError('Could not reach Google Drive during download. Check connectivity and try again.');
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw driveHttpError('Drive download', res.status, detail);
    }
    return res.text();
  });
}

const modifiedMs = (file: DriveBackupMeta): number => {
  const ms = file.modifiedTime ? Date.parse(file.modifiedTime) : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

/** Newest of the latest legacy zip and the latest snapshot; ties go to the snapshot. */
export function pickLatestBackup(
  zips: DriveBackupMeta[],
  snapshots: DriveBackupMeta[],
): LatestDriveBackup | null {
  const zip = [...zips].sort((a, b) => modifiedMs(b) - modifiedMs(a))[0];
  const snapshot = [...snapshots].sort((a, b) => modifiedMs(b) - modifiedMs(a))[0];
  if (snapshot && (!zip || modifiedMs(snapshot) >= modifiedMs(zip))) {
    const bytes = snapshot.appProperties?.acBytes;
    return { ...snapshot, ...(bytes ? { size: bytes } : {}), kind: 'snapshot' };
  }
  return zip ? { ...zip, kind: 'zip' } : null;
}

export async function getLatestBackupMeta(): Promise<LatestDriveBackup | null> {
  const [zips, snapshots] = await Promise.all([listAppDataBackups(), listAppDataObjects('snapshot')]);
  return pickLatestBackup(zips, snapshots);
}
