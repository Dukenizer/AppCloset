import type { SQLiteDatabase } from 'expo-sqlite';

import {
  nextCertificateNumber,
  parseCertificateSnapshot,
  type CertificateRecord,
  type CertificateSnapshot,
} from '@/domain/certificate';

type CertificateRow = {
  id: number;
  certificate_number: string;
  artwork_id: number | null;
  issued_at: string;
  voided_at: string | null;
  snapshot: string;
};

const toRecord = (row: CertificateRow): CertificateRecord | null => {
  const snapshot = parseCertificateSnapshot(row.snapshot);
  if (!snapshot) return null;
  return {
    id: row.id,
    number: row.certificate_number,
    artworkId: row.artwork_id,
    issuedAt: row.issued_at,
    voidedAt: row.voided_at,
    snapshot,
  };
};

/** The certificate currently in force for an artwork, if one was issued and not reissued since. */
export async function getActiveCertificate(
  database: SQLiteDatabase,
  artworkId: number,
): Promise<CertificateRecord | null> {
  const row = await database.getFirstAsync<CertificateRow>(
    `SELECT id, certificate_number, artwork_id, issued_at, voided_at, snapshot
     FROM certificates
     WHERE artwork_id = ? AND voided_at IS NULL
     ORDER BY issued_at DESC, id DESC
     LIMIT 1`,
    artworkId,
  );
  return row ? toRecord(row) : null;
}

/**
 * Issues a new certificate for the artwork with the next number for the year. Any certificate
 * already in force for that artwork is marked void so only one number is ever valid at a time.
 */
export async function issueCertificate(
  database: SQLiteDatabase,
  artworkId: number,
  snapshot: CertificateSnapshot,
  now: Date = new Date(),
  floor = 0,
): Promise<CertificateRecord> {
  const issuedAt = now.toISOString();
  const year = now.getFullYear();
  for (let attempt = 0; ; attempt += 1) {
    let record: CertificateRecord | null = null;
    try {
      // Rolls back as a whole: a failed insert never leaves the previous certificate voided.
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `UPDATE certificates SET voided_at = ? WHERE artwork_id = ? AND voided_at IS NULL`,
          issuedAt,
          artworkId,
        );
        const existing = await database.getAllAsync<{ certificate_number: string }>(
          `SELECT certificate_number FROM certificates WHERE certificate_number LIKE ?`,
          `%-${year}-%`,
        );
        const number = nextCertificateNumber(
          existing.map((row) => row.certificate_number),
          year,
          floor,
        );
        const result = await database.runAsync(
          `INSERT INTO certificates (certificate_number, artwork_id, issued_at, snapshot) VALUES (?, ?, ?, ?)`,
          number,
          artworkId,
          issuedAt,
          JSON.stringify(snapshot),
        );
        record = { id: result.lastInsertRowId, number, artworkId, issuedAt, voidedAt: null, snapshot };
      });
    } catch (error) {
      // Another write took the number between reading and inserting; recompute and try again.
      if (attempt < 2 && error instanceof Error && /UNIQUE/i.test(error.message)) continue;
      throw error;
    }
    if (!record) throw new Error('Could not issue the certificate.');
    return record;
  }
}
