import * as FileSystem from 'expo-file-system/legacy';

import { BACKUP_FILENAME } from '@/services/backupArchive';
import { diagnosticErrorFields, logDiagnostic } from '@/services/debugLog';

import { getValidAccessToken } from './googleAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const BACKUP_NAME = BACKUP_FILENAME;

export interface DriveBackupMeta {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Google account not connected or session expired. Connect again.');
  return { Authorization: `Bearer ${token}` };
}

function driveHttpError(action: string, status: number, detail?: string): Error {
  if (status === 401 || status === 403) {
    return new Error('Google session expired or Drive access was denied. Disconnect and connect again.');
  }
  const extra = detail ? `: ${detail.slice(0, 120)}` : '';
  return new Error(`${action} failed (${status})${extra}`);
}

export async function listAppDataBackups(): Promise<DriveBackupMeta[]> {
  const headers = await authHeaders();
  const q = encodeURIComponent(`name = '${BACKUP_NAME}'`);
  const url = `${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime,size,md5Checksum)&orderBy=modifiedTime desc`;
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (error) {
    await logDiagnostic('drive.api.list', {
      ok: false,
      network: true,
      ...diagnosticErrorFields(error),
    });
    throw new Error('Could not reach Google Drive. Check connectivity and try again.');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    await logDiagnostic('drive.api.list', {
      ok: false,
      status: res.status,
      detail: detail.slice(0, 160),
    });
    throw driveHttpError('Drive list', res.status, detail);
  }
  const data = (await res.json()) as { files?: DriveBackupMeta[] };
  const files = data.files ?? [];
  await logDiagnostic('drive.api.list', {
    ok: true,
    status: res.status,
    count: files.length,
    sizes: files.map((file) => file.size ?? null),
    modifiedTimes: files.map((file) => file.modifiedTime ?? null),
  });
  return files;
}

/**
 * Industry-safe replace: upload the new backup first, verify it exists, then
 * delete older copies. Never delete the prior Drive backup before the new one lands.
 */
export async function uploadBackupToDrive(localUri: string): Promise<DriveBackupMeta> {
  const headers = await authHeaders();
  const existing = await listAppDataBackups();

  const localInfo = await FileSystem.getInfoAsync(localUri);
  if (!localInfo.exists || localInfo.isDirectory) {
    throw new Error('Local backup file missing before Drive upload.');
  }
  const localSize = 'size' in localInfo && typeof localInfo.size === 'number' ? localInfo.size : null;

  await logDiagnostic('drive.api.upload.start', {
    localSize,
    existingCount: existing.length,
  });

  const meta = {
    name: BACKUP_NAME,
    parents: ['appDataFolder'],
  };
  // Resumable session + native file streaming: the archive is never loaded into JS or Java memory.
  const sessionUrl = `${UPLOAD_API}/files?uploadType=resumable&fields=id,name,modifiedTime,size,md5Checksum`;
  const networkFailure = async (stage: string, error: unknown): Promise<Error> => {
    await logDiagnostic('drive.api.upload', {
      ok: false,
      network: true,
      stage,
      localSize,
      ...diagnosticErrorFields(error),
    });
    return new Error('Could not reach Google Drive during upload. Check connectivity and try again.');
  };

  let session: Response;
  try {
    session = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/zip',
        ...(localSize !== null ? { 'X-Upload-Content-Length': String(localSize) } : {}),
      },
      body: JSON.stringify(meta),
    });
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
    const result = await FileSystem.uploadAsync(uploadLocation, localUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': 'application/zip' },
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
  if (localSize !== null && Number.isFinite(remoteSize) && remoteSize > 0 && remoteSize !== localSize) {
    // Best effort cleanup of the bad new object, then keep old backups.
    try {
      await fetch(`${DRIVE_API}/files/${uploaded.id}`, { method: 'DELETE', headers });
    } catch {
      // ignore
    }
    await logDiagnostic('drive.api.upload', {
      ok: false,
      reason: 'size_mismatch',
      localSize,
      remoteSize,
    });
    throw new Error(
      `Drive upload size mismatch (local ${localSize} vs remote ${remoteSize}). Previous Drive backup was kept.`,
    );
  }

  let deletedOld = 0;
  for (const file of existing) {
    if (file.id === uploaded.id) continue;
    try {
      await fetch(`${DRIVE_API}/files/${file.id}`, { method: 'DELETE', headers });
      deletedOld += 1;
    } catch {
      // Non-fatal: duplicate old backups are preferable to deleting the new one.
    }
  }

  await logDiagnostic('drive.api.upload', {
    ok: true,
    localSize,
    remoteSize: uploaded.size ?? null,
    existingCount: existing.length,
    deletedOld,
    fileIdSuffix: uploaded.id.slice(-8),
  });
  return uploaded;
}

export async function downloadBackupFromDrive(
  fileId: string,
  destUri: string,
  expectedSize?: number | null,
): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Google account not connected or session expired. Connect again.');
  await logDiagnostic('drive.api.download.start', {
    fileIdSuffix: fileId.slice(-8),
    expectedSize: expectedSize ?? null,
  });
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
    throw new Error('Could not reach Google Drive during download. Check connectivity and try again.');
  }
  if (result.status !== 200) {
    await logDiagnostic('drive.api.download', { ok: false, status: result.status });
    throw new Error(`Drive download failed (${result.status})`);
  }
  const info = await FileSystem.getInfoAsync(destUri);
  const size = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : null;
  if (expectedSize && expectedSize > 0) {
    if (size !== null && size !== expectedSize) {
      await logDiagnostic('drive.api.download', {
        ok: false,
        status: result.status,
        expectedSize,
        actualSize: size,
      });
      throw new Error(
        `Drive download size mismatch (expected ${expectedSize} bytes, got ${size}). Try Restore again.`,
      );
    }
  }
  await logDiagnostic('drive.api.download', {
    ok: true,
    status: result.status,
    expectedSize: expectedSize ?? null,
    actualSize: size,
  });
}

export async function getLatestBackupMeta(): Promise<DriveBackupMeta | null> {
  const files = await listAppDataBackups();
  return files[0] ?? null;
}
