jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  getInfoAsync: jest.fn(async () => ({ exists: true, isDirectory: false, size: 2481113 })),
  readAsStringAsync: jest.fn(),
  uploadAsync: jest.fn(),
}));

jest.mock('@/services/drive/googleAuth', () => ({
  getValidAccessToken: jest.fn(async () => 'token'),
}));

jest.mock('@/services/debugLog', () => ({
  logDiagnostic: jest.fn(async () => undefined),
  diagnosticErrorFields: (error: unknown) => ({ message: String(error) }),
}));

jest.mock('@/services/backupArchive', () => ({ BACKUP_FILENAME: 'artcloset-backup.zip' }));

import * as FileSystem from 'expo-file-system/legacy';

import { getValidAccessToken } from '@/services/drive/googleAuth';
import { DRIVE_RETRY_DELAYS_MS, pickLatestBackup, uploadAppDataFile } from '@/services/drive/driveApi';

const SESSION = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc';
const BLOB = {
  localUri: 'file:///docs/artcloset/images/a.jpg',
  name: 'artcloset-blob-abc',
  mimeType: 'image/jpeg',
  appProperties: { acKind: 'blob', acSha: 'abc' },
};

type FetchCall = [string, RequestInit | undefined];

const jsonResponse = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
  ({
    ok: (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: { get: (name: string) => init.headers?.[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

describe('uploadAppDataFile', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    (getValidAccessToken as jest.Mock).mockResolvedValue('token');
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, isDirectory: false, size: 2481113 });
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((run: () => void) => {
      run();
      return 0;
    }) as unknown as typeof setTimeout);
    fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('uploadType=resumable') && init?.method === 'POST') {
        return jsonResponse(null, { headers: { location: SESSION } });
      }
      if (init?.method === 'DELETE') return jsonResponse(null, { status: 204 });
      throw new Error(`unexpected fetch ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('streams the file from disk via a resumable session and never reads it into memory', async () => {
    (FileSystem.uploadAsync as jest.Mock).mockResolvedValueOnce({
      status: 200,
      body: JSON.stringify({ id: 'new-blob', name: 'artcloset-blob-abc', size: '2481113' }),
      headers: {},
    });

    const result = await uploadAppDataFile(BLOB);

    expect(result.id).toBe('new-blob');
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
    expect(FileSystem.uploadAsync).toHaveBeenCalledWith(SESSION, BLOB.localUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    const session = (fetchMock.mock.calls as FetchCall[]).find(([, init]) => init?.method === 'POST')!;
    expect((session[1]!.headers as Record<string, string>)['X-Upload-Content-Length']).toBe('2481113');
    expect(JSON.parse(session[1]!.body as string)).toEqual({
      name: 'artcloset-blob-abc',
      parents: ['appDataFolder'],
      appProperties: { acKind: 'blob', acSha: 'abc' },
    });
  });

  it('never deletes anything after a successful upload', async () => {
    (FileSystem.uploadAsync as jest.Mock).mockResolvedValueOnce({
      status: 201,
      body: JSON.stringify({ id: 'new-blob', size: '2481113' }),
      headers: {},
    });

    await uploadAppDataFile(BLOB);

    expect((fetchMock.mock.calls as FetchCall[]).some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  it('retries a Drive server error and succeeds', async () => {
    (FileSystem.uploadAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 503, body: 'backend error', headers: {} })
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ id: 'new-blob', size: '2481113' }), headers: {} });

    await expect(uploadAppDataFile(BLOB)).resolves.toMatchObject({ id: 'new-blob' });
    expect(FileSystem.uploadAsync).toHaveBeenCalledTimes(2);
  });

  it(`gives up after ${DRIVE_RETRY_DELAYS_MS.length} retries of a persistent server error`, async () => {
    (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({ status: 503, body: 'backend error', headers: {} });

    await expect(uploadAppDataFile(BLOB)).rejects.toThrow(/Drive upload failed \(503\)/);
    expect(FileSystem.uploadAsync).toHaveBeenCalledTimes(DRIVE_RETRY_DELAYS_MS.length + 1);
  });

  it('treats Drive rate limiting as busy (retried), not as an expired session', async () => {
    const rateLimited = JSON.stringify({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } });
    (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({ status: 403, body: rateLimited, headers: {} });

    await expect(uploadAppDataFile(BLOB)).rejects.toThrow(/Google Drive is busy/);
    expect(FileSystem.uploadAsync).toHaveBeenCalledTimes(DRIVE_RETRY_DELAYS_MS.length + 1);
  });

  it('does not retry a real permission error', async () => {
    const denied = JSON.stringify({ error: { errors: [{ reason: 'insufficientPermissions' }] } });
    (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({ status: 403, body: denied, headers: {} });

    await expect(uploadAppDataFile(BLOB)).rejects.toThrow(/Google session expired/);
    expect(FileSystem.uploadAsync).toHaveBeenCalledTimes(1);
  });

  it('discards a wrongly sized object and retries the upload', async () => {
    (FileSystem.uploadAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ id: 'truncated', size: '1000' }), headers: {} })
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ id: 'good', size: '2481113' }), headers: {} });

    await expect(uploadAppDataFile(BLOB)).resolves.toMatchObject({ id: 'good' });
    const deletes = (fetchMock.mock.calls as FetchCall[]).filter(([, init]) => init?.method === 'DELETE');
    expect(deletes.map(([url]) => url)).toEqual(['https://www.googleapis.com/drive/v3/files/truncated']);
  });

  it('retries when the connection drops mid-upload, then reports it', async () => {
    (FileSystem.uploadAsync as jest.Mock).mockRejectedValue(new Error('socket closed'));

    await expect(uploadAppDataFile(BLOB)).rejects.toThrow(/Could not reach Google Drive/);
    expect(FileSystem.uploadAsync).toHaveBeenCalledTimes(DRIVE_RETRY_DELAYS_MS.length + 1);
  });
});

describe('pickLatestBackup', () => {
  const zip = { id: 'zip', name: 'artcloset-backup.zip', modifiedTime: '2026-09-29T10:00:00Z', size: '46838465' };
  const snapshot = {
    id: 'snap',
    name: 'artcloset-snapshot-x.json',
    modifiedTime: '2026-09-30T10:00:00Z',
    size: '2048',
    appProperties: { acKind: 'snapshot', acBytes: '47000000' },
  };

  it('returns nothing when Drive has no backups', () => {
    expect(pickLatestBackup([], [])).toBeNull();
  });

  it('prefers a newer snapshot and reports the full backup size', () => {
    expect(pickLatestBackup([zip], [snapshot])).toMatchObject({ id: 'snap', kind: 'snapshot', size: '47000000' });
  });

  it('restores a legacy zip made after the latest snapshot (older app on another phone)', () => {
    const newerZip = { ...zip, modifiedTime: '2026-10-01T10:00:00Z' };
    expect(pickLatestBackup([newerZip], [snapshot])).toMatchObject({ id: 'zip', kind: 'zip' });
  });
});
