import * as FileSystem from 'expo-file-system/legacy';

import { BACKUP_FILENAME } from '@/services/backupArchive';

import { getValidAccessToken } from './googleAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const BACKUP_NAME = BACKUP_FILENAME;

export interface DriveBackupMeta {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Google account not connected or session expired. Connect again.');
  return { Authorization: `Bearer ${token}` };
}

export async function listAppDataBackups(): Promise<DriveBackupMeta[]> {
  const headers = await authHeaders();
  const q = encodeURIComponent(`name = '${BACKUP_NAME}'`);
  const url = `${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
  const data = (await res.json()) as { files?: DriveBackupMeta[] };
  return data.files ?? [];
}

export async function uploadBackupToDrive(localUri: string): Promise<DriveBackupMeta> {
  const headers = await authHeaders();
  const existing = await listAppDataBackups();
  for (const file of existing) {
    await fetch(`${DRIVE_API}/files/${file.id}`, { method: 'DELETE', headers });
  }

  const meta = {
    name: BACKUP_NAME,
    parents: ['appDataFolder'],
  };
  const boundary = `artcloset_${Date.now()}`;
  const fileBase64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // Multipart upload with base64 is awkward; use resumable/media with binary via FileSystem uploadAsync
  const uploadUrl = `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,modifiedTime,size`;
  const multipart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/zip\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${fileBase64}\r\n` +
    `--${boundary}--`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipart,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as DriveBackupMeta;
}

export async function downloadBackupFromDrive(fileId: string, destUri: string): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Google account not connected or session expired. Connect again.');
  const result = await FileSystem.downloadAsync(
    `${DRIVE_API}/files/${fileId}?alt=media`,
    destUri,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (result.status !== 200) {
    throw new Error(`Drive download failed (${result.status})`);
  }
}

export async function getLatestBackupMeta(): Promise<DriveBackupMeta | null> {
  const files = await listAppDataBackups();
  return files[0] ?? null;
}
