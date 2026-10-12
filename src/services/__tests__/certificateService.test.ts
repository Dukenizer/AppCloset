import type { SQLiteDatabase } from 'expo-sqlite';

import { issueCertificate } from '@/data/certificateRepository';
import { CERTIFICATE_SNAPSHOT_VERSION, type CertificateSnapshot } from '@/domain/certificate';
import { readIssuedHighWater, recordIssuedNumber } from '@/services/certificateCounter';
import {
  certificateScreenMode,
  issueArtworkCertificate,
  isUserCancellation,
} from '@/services/certificateService';

const mockFiles = new Map<string, string>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockFiles.has(uri) })),
  readAsStringAsync: jest.fn(async (uri: string) => {
    const value = mockFiles.get(uri);
    if (value === undefined) throw new Error('missing');
    return value;
  }),
  writeAsStringAsync: jest.fn(async (uri: string, value: string) => {
    mockFiles.set(uri, value);
  }),
}));

jest.mock('@/data/certificateRepository', () => ({
  issueCertificate: jest.fn(),
}));

const COUNTER = 'file:///docs/artcloset-certificate-counter.json';

const snapshot: CertificateSnapshot = {
  version: CERTIFICATE_SNAPSHOT_VERSION,
  title: 'River at Dusk',
  artist: 'Edwin Estingor',
  year: '2025',
  medium: 'Oil',
  size: '',
  sizeUnit: 'cm',
  artworkId: 'AC-1',
  price: '',
  issuer: 'Edwin Estingor',
  contacts: [],
};

const database = {} as SQLiteDatabase;

beforeEach(() => {
  mockFiles.clear();
  jest.clearAllMocks();
});

describe('certificate counter', () => {
  it('remembers the highest number per year and never moves backwards', async () => {
    await recordIssuedNumber('COA-2026-0005');
    await recordIssuedNumber('COA-2026-0003');
    await recordIssuedNumber('COA-2027-0001');

    expect(await readIssuedHighWater(2026)).toBe(5);
    expect(await readIssuedHighWater(2027)).toBe(1);
    expect(await readIssuedHighWater(2028)).toBe(0);
  });

  it('treats a missing or corrupt file as no history', async () => {
    expect(await readIssuedHighWater(2026)).toBe(0);
    mockFiles.set(COUNTER, '{not json');
    expect(await readIssuedHighWater(2026)).toBe(0);
    mockFiles.set(COUNTER, JSON.stringify({ '2026': 'seven', abc: 3, '2025': 4 }));
    expect(await readIssuedHighWater(2026)).toBe(0);
    expect(await readIssuedHighWater(2025)).toBe(4);
  });
});

describe('issueArtworkCertificate', () => {
  it('continues numbering past certificates issued before an older backup was restored', async () => {
    // This phone issued up to 0007; the restored catalog only knows up to 0003.
    mockFiles.set(COUNTER, JSON.stringify({ '2026': 7 }));
    (issueCertificate as jest.Mock).mockImplementation(
      async (_db, artworkId: number, snap: CertificateSnapshot, now: Date, floor: number) => ({
        id: 1,
        number: `COA-2026-${String(Math.max(floor, 3) + 1).padStart(4, '0')}`,
        artworkId,
        issuedAt: now.toISOString(),
        voidedAt: null,
        snapshot: snap,
      }),
    );

    const record = await issueArtworkCertificate(database, 4, snapshot, new Date('2026-06-01T10:00:00Z'));

    expect(issueCertificate).toHaveBeenCalledWith(database, 4, snapshot, expect.any(Date), 7);
    expect(record.number).toBe('COA-2026-0008');
    expect(await readIssuedHighWater(2026)).toBe(8);
  });

  it('records nothing when issuing fails', async () => {
    (issueCertificate as jest.Mock).mockRejectedValue(new Error('disk full'));
    await expect(issueArtworkCertificate(database, 4, snapshot)).rejects.toThrow('disk full');
    expect(mockFiles.has(COUNTER)).toBe(false);
  });
});

describe('certificateScreenMode', () => {
  it('keeps issued certificates reprintable after Premium ends', () => {
    expect(certificateScreenMode(true, false)).toBe('issue');
    expect(certificateScreenMode(true, true)).toBe('issued');
    expect(certificateScreenMode(false, true)).toBe('reprint-only');
    expect(certificateScreenMode(false, false)).toBe('locked');
  });
});

describe('isUserCancellation', () => {
  it('ignores print and share cancellations only', () => {
    expect(isUserCancellation(new Error('Printing did not complete'))).toBe(true);
    expect(isUserCancellation(new Error('Print job cancelled'))).toBe(true);
    expect(isUserCancellation(new Error('Out of memory'))).toBe(false);
    expect(isUserCancellation('cancel')).toBe(false);
  });
});
