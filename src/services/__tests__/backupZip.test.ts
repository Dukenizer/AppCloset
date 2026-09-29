import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { crc32, createZipWriter, isSafeArchivePath, readZipStream } from '@/services/backupZip';

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const chunkReader = (bytes: Uint8Array, size: number): (() => Uint8Array) => {
  let at = 0;
  return () => {
    const chunk = bytes.subarray(at, at + size);
    at += chunk.length;
    return chunk;
  };
};

/** Pseudo-random bytes seeded with the local-header signature to mimic unlucky JPEG data. */
const imageLikeBytes = (length: number, seed: number): Uint8Array => {
  const out = new Uint8Array(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  for (let i = 100; i + 4 < length; i += 4096) out.set([0x50, 0x4b, 0x03, 0x04], i);
  return out;
};

const readAll = async (zip: Uint8Array, chunkSize: number): Promise<Record<string, Uint8Array>> => {
  const entries: Record<string, Uint8Array> = {};
  await readZipStream(chunkReader(zip, chunkSize), async (path, data) => {
    entries[path] = data;
  });
  return entries;
};

describe('backupZip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(strToU8('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips stored and deflated entries through the streaming reader', async () => {
    const image = imageLikeBytes(300_000, 7);
    const db = strToU8('SQLite format 3\u0000'.repeat(2000));
    const parts: Uint8Array[] = [];
    const writer = createZipWriter((chunk) => parts.push(chunk));
    writer.add('artcloset.db', db, true);
    writer.add('images/a.jpg', image, false);
    writer.add('manifest.json', strToU8('{"ok":true}'), true);
    const total = writer.finish();
    const zip = concat(parts);
    expect(total).toBe(zip.length);

    const entries = await readAll(zip, 64 * 1024);
    expect(Object.keys(entries)).toEqual(['artcloset.db', 'images/a.jpg', 'manifest.json']);
    expect(entries['images/a.jpg']).toEqual(image);
    expect(entries['artcloset.db']).toEqual(db);
    expect(strFromU8(entries['manifest.json']!)).toBe('{"ok":true}');
  });

  it('writes archives that standard unzip can read', () => {
    const image = imageLikeBytes(50_000, 3);
    const parts: Uint8Array[] = [];
    const writer = createZipWriter((chunk) => parts.push(chunk));
    writer.add('images/é.jpg', image, false);
    writer.add('manifest.json', strToU8('{}'), true);
    writer.finish();
    const unzipped = unzipSync(concat(parts));
    expect(unzipped['images/é.jpg']).toEqual(image);
    expect(strFromU8(unzipped['manifest.json']!)).toBe('{}');
  });

  it('reads backups made by the previous zipSync packer', async () => {
    const image = imageLikeBytes(120_000, 11);
    const legacy = zipSync(
      { 'artcloset.db': strToU8('db'.repeat(5000)), 'images/b.jpg': image, 'manifest.json': strToU8('{"v":1}') },
      { level: 6 },
    );
    const entries = await readAll(legacy, 1000);
    expect(entries['images/b.jpg']).toEqual(image);
    expect(strFromU8(entries['manifest.json']!)).toBe('{"v":1}');
  });

  it('rejects unsafe archive paths', () => {
    expect(isSafeArchivePath('images/a.jpg')).toBe(true);
    expect(isSafeArchivePath('../evil.db')).toBe(false);
    expect(isSafeArchivePath('images/../../evil')).toBe(false);
    expect(isSafeArchivePath('/etc/passwd')).toBe(false);
    expect(isSafeArchivePath('C:/x')).toBe(false);
    expect(isSafeArchivePath('images//a.jpg')).toBe(false);
  });
});
