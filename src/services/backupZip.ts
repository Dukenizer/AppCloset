import { deflateSync, strToU8, Unzip, UnzipInflate } from 'fflate';

/**
 * Streaming ZIP helpers so backups never hold the whole archive in memory.
 * The writer puts exact sizes + CRC in every local header (no data descriptors), which lets the
 * streaming reader find each entry's end by length instead of scanning for signatures inside
 * image bytes. Output stays readable by `unzipSync` and ordinary ZIP tools.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const dosDateTime = (date: Date): { time: number; day: number } => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  day: (Math.max(date.getFullYear() - 1980, 0) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

const UTF8_FLAG = 0x0800;
const MAX_ZIP32 = 0xffffffff;

export interface ZipWriter {
  /** Adds one entry. `compress` should be false for already-compressed data such as JPEGs. */
  add(path: string, data: Uint8Array, compress: boolean): void;
  /** Writes the central directory. Returns total archive bytes. */
  finish(): number;
}

export function createZipWriter(write: (chunk: Uint8Array) => void, now = new Date()): ZipWriter {
  const { time, day } = dosDateTime(now);
  const central: Uint8Array[] = [];
  let offset = 0;
  let count = 0;

  return {
    add(path, data, compress) {
      const name = strToU8(path);
      const deflated = compress ? deflateSync(data, { level: 6 }) : null;
      const useDeflate = deflated !== null && deflated.length < data.length;
      const body = useDeflate ? deflated : data;
      const method = useDeflate ? 8 : 0;
      const crc = crc32(data);
      if (offset + body.length + 30 + name.length > MAX_ZIP32) {
        throw new Error('Backup is larger than 4 GB, which this backup format does not support.');
      }

      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, UTF8_FLAG, true);
      lv.setUint16(8, method, true);
      lv.setUint16(10, time, true);
      lv.setUint16(12, day, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, body.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      local.set(name, 30);

      const entry = new Uint8Array(46 + name.length);
      const cv = new DataView(entry.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, UTF8_FLAG, true);
      cv.setUint16(10, method, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, day, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, body.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      entry.set(name, 46);
      central.push(entry);

      write(local);
      write(body);
      offset += local.length + body.length;
      count += 1;
    },
    finish() {
      if (count > 0xffff) throw new Error('Backup has too many files for this backup format.');
      let size = 0;
      for (const entry of central) {
        write(entry);
        size += entry.length;
      }
      const end = new Uint8Array(22);
      const ev = new DataView(end.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(8, count, true);
      ev.setUint16(10, count, true);
      ev.setUint32(12, size, true);
      ev.setUint32(16, offset, true);
      write(end);
      return offset + size + end.length;
    },
  };
}

const concat = (parts: Uint8Array[], total: number): Uint8Array => {
  if (parts.length === 1) return parts[0]!;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/**
 * Reads a ZIP chunk by chunk and hands each file entry to `onEntry` fully decompressed.
 * Only one entry is held in memory at a time. `readChunk` returns an empty array at end of file.
 */
export async function readZipStream(
  readChunk: () => Uint8Array,
  onEntry: (path: string, data: Uint8Array) => Promise<void>,
): Promise<void> {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  const ready: { path: string; data: Uint8Array }[] = [];
  let failure: Error | null = null;

  unzip.onfile = (file) => {
    if (file.name.endsWith('/')) return;
    const parts: Uint8Array[] = [];
    let total = 0;
    file.ondata = (error, chunk, final) => {
      if (error) {
        failure = error;
        return;
      }
      if (chunk.length > 0) {
        parts.push(chunk);
        total += chunk.length;
      }
      if (final) ready.push({ path: file.name, data: concat(parts, total) });
    };
    file.start();
  };

  for (;;) {
    const chunk = readChunk();
    const last = chunk.length === 0;
    unzip.push(chunk, last);
    if (failure) throw failure;
    while (ready.length > 0) {
      const next = ready.shift()!;
      await onEntry(next.path, next.data);
    }
    if (last) return;
  }
}

/** Rejects absolute paths and `..` segments so a crafted archive can't write outside staging. */
export function isSafeArchivePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || /^[a-zA-Z]:/.test(path)) return false;
  return path.split('/').every((segment) => segment !== '..' && segment !== '');
}
