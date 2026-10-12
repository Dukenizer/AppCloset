import type { SQLiteDatabase } from 'expo-sqlite';

import { issueCertificate } from '@/data/certificateRepository';
import type { CertificateRecord, CertificateSnapshot } from '@/domain/certificate';
import { readIssuedHighWater, recordIssuedNumber } from '@/services/certificateCounter';

/** Issues the next certificate, never reusing a number this device already handed out. */
export async function issueArtworkCertificate(
  database: SQLiteDatabase,
  artworkId: number,
  snapshot: CertificateSnapshot,
  now: Date = new Date(),
): Promise<CertificateRecord> {
  const floor = await readIssuedHighWater(now.getFullYear());
  const record = await issueCertificate(database, artworkId, snapshot, now, floor);
  await recordIssuedNumber(record.number);
  return record;
}

export type CertificateScreenMode =
  /** Premium, nothing issued yet: preview a draft or issue. */
  | 'issue'
  /** Premium with a certificate in force: share, print, or reissue. */
  | 'issued'
  /** Premium lapsed but a certificate exists: it stays reprintable; only new numbers need Premium. */
  | 'reprint-only'
  /** Free with nothing issued: upsell. */
  | 'locked';

export const certificateScreenMode = (canIssue: boolean, hasActive: boolean): CertificateScreenMode => {
  if (hasActive) return canIssue ? 'issued' : 'reprint-only';
  return canIssue ? 'issue' : 'locked';
};

/** Print / share cancellations are user choices, not failures. */
export const isUserCancellation = (error: unknown): boolean =>
  error instanceof Error && /cancel|did not complete|dismiss/i.test(error.message);
