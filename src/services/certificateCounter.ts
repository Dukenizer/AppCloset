import * as FileSystem from 'expo-file-system/legacy';

import { parseCertificateNumber } from '@/domain/certificate';

/**
 * Highest certificate sequence handed out per year on this device. Kept outside the catalog
 * database on purpose: Restore from Drive replaces the database (and images) but not this file, so an
 * older backup cannot roll the numbering back and reissue a number a buyer already holds.
 */
const COUNTER_FILE = 'artcloset-certificate-counter.json';

type Counter = Record<string, number>;

const counterUri = (): string | null =>
  FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${COUNTER_FILE}` : null;

const readCounter = async (): Promise<Counter> => {
  const uri = counterUri();
  if (!uri) return {};
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return {};
    const parsed: unknown = JSON.parse(await FileSystem.readAsStringAsync(uri));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const counter: Counter = {};
    for (const [year, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (/^\d{4}$/.test(year) && typeof value === 'number' && Number.isInteger(value) && value > 0) {
        counter[year] = value;
      }
    }
    return counter;
  } catch {
    return {};
  }
};

export async function readIssuedHighWater(year: number): Promise<number> {
  return (await readCounter())[String(year)] ?? 0;
}

/** Best-effort: a failed write only loses the restore guard, never the issued certificate. */
export async function recordIssuedNumber(number: string): Promise<void> {
  const parsed = parseCertificateNumber(number);
  const uri = counterUri();
  if (!parsed || !uri) return;
  try {
    const counter = await readCounter();
    const key = String(parsed.year);
    if ((counter[key] ?? 0) >= parsed.sequence) return;
    counter[key] = parsed.sequence;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(counter));
  } catch {
    // Ignore: numbering still follows the catalog database.
  }
}
