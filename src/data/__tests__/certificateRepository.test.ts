import type { SQLiteDatabase } from 'expo-sqlite';

import { getActiveCertificate, issueCertificate } from '@/data/certificateRepository';
import { CERTIFICATE_SNAPSHOT_VERSION, type CertificateSnapshot } from '@/domain/certificate';

type Row = {
  id: number;
  certificate_number: string;
  artwork_id: number | null;
  issued_at: string;
  voided_at: string | null;
  snapshot: string;
};

const snapshot = (title = 'River at Dusk'): CertificateSnapshot => ({
  version: CERTIFICATE_SNAPSHOT_VERSION,
  title,
  artist: 'Edwin Estingor',
  year: '2025',
  medium: 'Oil on Canvas',
  size: '60 × 80 cm',
  sizeUnit: 'cm',
  artworkId: 'AC-1',
  price: '',
  issuer: 'Edwin Estingor',
  contacts: [],
});

/** In-memory stand-in for the certificates table, enough for the repository's queries. */
function createDatabase(rows: Row[] = [], options: { failInsertOnce?: string } = {}) {
  let failInsert = options.failInsertOnce;
  const external: Row[] = [];
  const database = {
    rows,
    // Like SQLite: a throw inside the transaction rolls its own changes back.
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => {
      const before = rows.map((row) => ({ ...row }));
      try {
        await task();
      } catch (error) {
        rows.splice(0, rows.length, ...before, ...external.splice(0));
        throw error;
      }
    }),
    runAsync: jest.fn(async (sql: string, ...params: (string | number | null)[]) => {
      if (sql.startsWith('UPDATE certificates SET voided_at')) {
        const [voidedAt, artworkId] = params;
        for (const row of rows) {
          if (row.artwork_id === artworkId && row.voided_at === null) row.voided_at = voidedAt as string;
        }
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (sql.startsWith('INSERT INTO certificates')) {
        const [number, artworkId, issuedAt, json] = params;
        if (failInsert === number) {
          // Simulates another write grabbing this number between the read and the insert.
          failInsert = undefined;
          external.push({
            id: rows.length + 1,
            certificate_number: number as string,
            artwork_id: 99,
            issued_at: issuedAt as string,
            voided_at: null,
            snapshot: json as string,
          });
          throw new Error('UNIQUE constraint failed: certificates.certificate_number');
        }
        if (rows.some((row) => row.certificate_number === number)) throw new Error('UNIQUE constraint failed');
        const id = rows.length + 1;
        rows.push({
          id,
          certificate_number: number as string,
          artwork_id: artworkId as number,
          issued_at: issuedAt as string,
          voided_at: null,
          snapshot: json as string,
        });
        return { changes: 1, lastInsertRowId: id };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
    getAllAsync: jest.fn(async (_sql: string, pattern: string) => {
      const year = pattern.replace(/%/g, '');
      return rows.filter((row) => row.certificate_number.includes(year)).map((row) => ({
        certificate_number: row.certificate_number,
      }));
    }),
    getFirstAsync: jest.fn(async (_sql: string, artworkId: number) => {
      const active = rows
        .filter((row) => row.artwork_id === artworkId && row.voided_at === null)
        .sort((a, b) => b.issued_at.localeCompare(a.issued_at) || b.id - a.id);
      return active[0] ?? null;
    }),
  };
  return database as typeof database & SQLiteDatabase;
}

describe('certificateRepository', () => {
  const day = (iso: string): Date => new Date(iso);

  it('issues numbered certificates across artworks within a year', async () => {
    const database = createDatabase();

    const first = await issueCertificate(database, 1, snapshot(), day('2026-03-01T10:00:00Z'));
    const second = await issueCertificate(database, 2, snapshot('Harbor'), day('2026-03-02T10:00:00Z'));

    expect(first.number).toBe('COA-2026-0001');
    expect(second.number).toBe('COA-2026-0002');
    expect((await getActiveCertificate(database, 1))?.number).toBe('COA-2026-0001');
    expect((await getActiveCertificate(database, 2))?.snapshot.title).toBe('Harbor');
  });

  it('voids the old certificate on reissue and never reuses its number', async () => {
    const database = createDatabase();
    await issueCertificate(database, 1, snapshot(), day('2026-03-01T10:00:00Z'));

    const reissued = await issueCertificate(database, 1, snapshot('River (revised)'), day('2026-04-01T10:00:00Z'));

    expect(reissued.number).toBe('COA-2026-0002');
    expect(database.rows[0]!.voided_at).toBe('2026-04-01T10:00:00.000Z');
    const active = await getActiveCertificate(database, 1);
    expect(active?.number).toBe('COA-2026-0002');
    expect(active?.snapshot.title).toBe('River (revised)');
  });

  it('starts a new sequence each year', async () => {
    const database = createDatabase();
    await issueCertificate(database, 1, snapshot(), day('2026-12-30T10:00:00Z'));
    const next = await issueCertificate(database, 2, snapshot(), day('2027-01-05T10:00:00Z'));
    expect(next.number).toBe('COA-2027-0001');
  });

  it('never goes below the floor of numbers already handed out', async () => {
    const database = createDatabase();
    const record = await issueCertificate(database, 1, snapshot(), day('2026-05-01T10:00:00Z'), 5);
    expect(record.number).toBe('COA-2026-0006');
  });

  it('retries with a fresh number when another write takes it first', async () => {
    const database = createDatabase([], { failInsertOnce: 'COA-2026-0001' });

    const record = await issueCertificate(database, 1, snapshot(), day('2026-05-01T10:00:00Z'));

    expect(record.number).toBe('COA-2026-0002');
    expect((await getActiveCertificate(database, 1))?.number).toBe('COA-2026-0002');
  });

  it('keeps the previous certificate in force when issuing fails', async () => {
    const database = createDatabase();
    await issueCertificate(database, 1, snapshot(), day('2026-03-01T10:00:00Z'));
    database.getAllAsync.mockRejectedValueOnce(new Error('disk I/O error'));

    await expect(issueCertificate(database, 1, snapshot('New'), day('2026-04-01T10:00:00Z'))).rejects.toThrow(
      'disk I/O error',
    );

    const active = await getActiveCertificate(database, 1);
    expect(active?.number).toBe('COA-2026-0001');
    expect(database.rows).toHaveLength(1);
    expect(database.rows[0]!.voided_at).toBeNull();
  });

  it('returns nothing for an artwork without a certificate or with an unreadable one', async () => {
    const database = createDatabase([
      {
        id: 1,
        certificate_number: 'COA-2026-0001',
        artwork_id: 3,
        issued_at: '2026-01-01T00:00:00Z',
        voided_at: null,
        snapshot: 'not json',
      },
    ]);
    expect(await getActiveCertificate(database, 9)).toBeNull();
    expect(await getActiveCertificate(database, 3)).toBeNull();
  });
});
