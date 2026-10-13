/**
 * Zip archives written byte by byte, for tests that need exact control over
 * what a download contains (tests/library-zip.test.js, tests/library-bot.test.js).
 */
import zlib from 'node:zlib';

/**
 * A zip, written by hand. Each entry: { name | nameBytes, data, method (8),
 * utf8 (true), flags, crc (override), descriptor, extra }.
 */
export function makeZip(entries, { zip64 = false } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBytes = e.nameBytes ?? Buffer.from(e.name, 'utf8');
    const raw = e.data;
    const method = e.method ?? 8;
    const crc = e.crc ?? zlib.crc32(raw);
    const body = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const extra = e.extra ?? Buffer.alloc(0);
    const flags = (e.utf8 === false ? 0 : 0x800) | (e.flags ?? 0) | (e.descriptor ? 0x8 : 0);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(e.descriptor ? 0 : crc, 14);
    lh.writeUInt32LE(e.descriptor ? 0 : body.length, 18);
    lh.writeUInt32LE(e.descriptor ? 0 : raw.length, 22);
    lh.writeUInt16LE(nameBytes.length, 26);
    let dd = Buffer.alloc(0);
    if (e.descriptor) {
      dd = Buffer.alloc(16);
      dd.writeUInt32LE(0x08074b50, 0);
      dd.writeUInt32LE(crc, 4);
      dd.writeUInt32LE(body.length, 8);
      dd.writeUInt32LE(raw.length, 12);
    }
    const local = Buffer.concat([lh, nameBytes, body, dd]);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBytes.length, 28);
    ch.writeUInt16LE(extra.length, 30);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, nameBytes, extra]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  if (!zip64) return Buffer.concat([...locals, cd, eocd]);
  // zip64: the classic record only says "see the 64-bit one".
  const rec = Buffer.alloc(56);
  rec.writeUInt32LE(0x06064b50, 0);
  rec.writeBigUInt64LE(44n, 4);
  rec.writeBigUInt64LE(BigInt(entries.length), 24);
  rec.writeBigUInt64LE(BigInt(entries.length), 32);
  rec.writeBigUInt64LE(BigInt(cd.length), 40);
  rec.writeBigUInt64LE(BigInt(offset), 48);
  const loc = Buffer.alloc(20);
  loc.writeUInt32LE(0x07064b50, 0);
  loc.writeBigUInt64LE(BigInt(offset + cd.length), 8);
  loc.writeUInt32LE(1, 16);
  eocd.writeUInt16LE(0xffff, 8);
  eocd.writeUInt16LE(0xffff, 10);
  eocd.writeUInt32LE(0xffffffff, 12);
  eocd.writeUInt32LE(0xffffffff, 16);
  return Buffer.concat([...locals, cd, rec, loc, eocd]);
}
