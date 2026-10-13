/**
 * Reading .zip files with Node alone — no tar, no unzip, no dependency.
 *
 * Why not `tar -xf`, as the bot did until 2026-10-13: on Windows the `tar`
 * that answers depends on the PATH. From a Git Bash it is GNU tar, which
 * cannot read a zip at all; from a double-clicked .cmd it is Windows' own
 * bsdtar, which receives its arguments in the ANSI code page and so cannot
 * even open "Saken 天 - 森.zip" — measured on the 152 Bandcamp albums of
 * 12 October: none from Git Bash, and not the 81 with such names from a .cmd.
 * A zip is a simple format: a directory at the end of the file, then each
 * entry stored or deflated, which zlib already inflates.
 *
 * Supports what music downloads use: stored (0) and deflate (8), names in
 * UTF-8 (flag 11 or the Info-ZIP unicode-path field) or the old DOS code
 * page, data descriptors, and zip64 for big archives. Refuses, entry by
 * entry and with a reason, what it cannot read safely: encrypted entries and
 * other compression methods.
 *
 * Every entry is written under a temporary name and renamed once its size
 * and CRC have been checked, so an interrupted extraction never leaves half
 * a song behind; nothing outside the destination folder can be written,
 * whatever names the archive carries ("zip slip").
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const EOCD64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

// Bytes 0x80–0xFF of code page 437, which zip names use when not flagged UTF-8.
const CP437 = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0";

function decodeName(bytes, utf8Flag) {
  if (utf8Flag) return bytes.toString('utf8');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    let s = '';
    for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : CP437[b - 0x80];
    return s;
  }
}

async function readAt(fh, position, length) {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

/** Where the central directory is, and how many entries it holds. */
async function findDirectory(fh, size) {
  const tail = await readAt(fh, Math.max(0, size - 65557), Math.min(size, 65557));
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD) { at = i; break; }
  }
  if (at < 0) throw new Error('not a zip file (no end-of-directory record)');
  let entries = tail.readUInt16LE(at + 10);
  let dirSize = tail.readUInt32LE(at + 12);
  let dirOffset = tail.readUInt32LE(at + 16);
  if (entries === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) {
    const loc = at - 20;
    if (loc < 0 || tail.readUInt32LE(loc) !== EOCD64_LOCATOR) throw new Error('zip64 archive without its locator');
    const rec = await readAt(fh, Number(tail.readBigUInt64LE(loc + 8)), 56);
    if (rec.readUInt32LE(0) !== EOCD64) throw new Error('zip64 end-of-directory record not found');
    entries = Number(rec.readBigUInt64LE(32));
    dirSize = Number(rec.readBigUInt64LE(40));
    dirOffset = Number(rec.readBigUInt64LE(48));
  }
  return { entries, dirSize, dirOffset };
}

/**
 * Every entry of a zip, read from its central directory (the end of the
 * file — nothing else is read, so listing a 2 GB album is instant).
 * @returns {Promise<Array<{name, dir, method, encrypted, size, compressedSize, crc, offset}>>}
 */
export async function listZip(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const { entries, dirSize, dirOffset } = await findDirectory(fh, size);
    const dir = await readAt(fh, dirOffset, dirSize);
    const out = [];
    let p = 0;
    for (let n = 0; n < entries; n++) {
      if (p + 46 > dir.length || dir.readUInt32LE(p) !== CENTRAL) throw new Error('damaged central directory');
      const flags = dir.readUInt16LE(p + 8);
      const method = dir.readUInt16LE(p + 10);
      const crc = dir.readUInt32LE(p + 16);
      let compressedSize = dir.readUInt32LE(p + 20);
      let uncompressed = dir.readUInt32LE(p + 24);
      const nameLen = dir.readUInt16LE(p + 28);
      const extraLen = dir.readUInt16LE(p + 30);
      const commentLen = dir.readUInt16LE(p + 32);
      let offset = dir.readUInt32LE(p + 42);
      const nameBytes = dir.subarray(p + 46, p + 46 + nameLen);
      const extra = dir.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
      let name = decodeName(nameBytes, Boolean(flags & 0x800));
      for (let e = 0; e + 4 <= extra.length;) {
        const id = extra.readUInt16LE(e);
        const len = extra.readUInt16LE(e + 2);
        const field = extra.subarray(e + 4, e + 4 + len);
        if (id === 0x0001) {
          // zip64: the 64-bit values, in this order, for the 32-bit fields that overflowed.
          let q = 0;
          if (uncompressed === 0xffffffff && q + 8 <= field.length) { uncompressed = Number(field.readBigUInt64LE(q)); q += 8; }
          if (compressedSize === 0xffffffff && q + 8 <= field.length) { compressedSize = Number(field.readBigUInt64LE(q)); q += 8; }
          if (offset === 0xffffffff && q + 8 <= field.length) { offset = Number(field.readBigUInt64LE(q)); q += 8; }
        } else if (id === 0x7075 && field.length > 5 && field[0] === 1) {
          // Info-ZIP unicode path: the UTF-8 name, if it still belongs to this entry.
          if (zlib.crc32 === undefined || field.readUInt32LE(1) === zlib.crc32(nameBytes)) name = field.subarray(5).toString('utf8');
        }
        e += 4 + len;
      }
      out.push({
        name,
        dir: name.endsWith('/') || name.endsWith('\\'),
        method,
        encrypted: Boolean(flags & 0x1),
        size: uncompressed,
        compressedSize,
        crc,
        offset,
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } finally {
    await fh.close();
  }
}

/**
 * A name from inside an archive, as path segments that are safe to create
 * under the destination: no "..", no drive letters, no absolute paths, no
 * characters Windows refuses. `clean` names one segment (the bot's safeName).
 */
export function safeSegments(name, clean = (s) => s) {
  return String(name)
    .split(/[\\/]+/)
    .map((s) => s.replace(/^[a-zA-Z]:$/, ''))
    .filter((s) => s && s !== '.' && s !== '..')
    .map(clean)
    .filter(Boolean);
}

/** Counts bytes and computes the CRC-32 of what passes through. */
function checker() {
  const t = new Transform({
    transform(chunk, _enc, cb) {
      t.bytes += chunk.length;
      if (zlib.crc32) t.crc = zlib.crc32(chunk, t.crc);
      cb(null, chunk);
    },
  });
  t.bytes = 0;
  t.crc = 0;
  return t;
}

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(p);
  const stem = p.slice(0, p.length - ext.length);
  for (let n = 2; ; n++) {
    const c = `${stem} (${n})${ext}`;
    if (!fs.existsSync(c)) return c;
  }
}

/**
 * Extract the entries `want` accepts into `dest`, keeping their folders.
 * Never overwrites: a name already taken gets " (2)". Returns what was
 * written and what was refused, entry by entry; throws only when the file
 * is not a readable zip at all.
 *
 * @param {string} file
 * @param {string} dest
 * @param {object} [o]
 * @param {(entry) => boolean} [o.want]          which entries to write
 * @param {(segment: string) => string} [o.clean] makes one path segment safe
 * @param {boolean} [o.flat]                     drop the archive's folders
 * @returns {Promise<{written: Array<{name, path, size}>, refused: Array<{name, reason}>}>}
 */
export async function extractZip(file, dest, { want = () => true, clean = (s) => s, flat = false } = {}) {
  const entries = await listZip(file);
  const root = path.resolve(dest);
  const written = [];
  const refused = [];
  const fh = await fsp.open(file, 'r');
  try {
    for (const e of entries) {
      if (e.dir || !want(e)) continue;
      if (e.encrypted) { refused.push({ name: e.name, reason: 'encrypted' }); continue; }
      if (e.method !== 0 && e.method !== 8) { refused.push({ name: e.name, reason: `compression method ${e.method} is not supported` }); continue; }
      const segs = safeSegments(e.name, clean);
      if (!segs.length) { refused.push({ name: e.name, reason: 'no usable name' }); continue; }
      const target = uniquePath(path.join(root, ...(flat ? segs.slice(-1) : segs)));
      if (!path.resolve(target).startsWith(root + path.sep)) { refused.push({ name: e.name, reason: 'outside the destination' }); continue; }

      const local = await readAt(fh, e.offset, 30);
      if (local.length < 30 || local.readUInt32LE(0) !== LOCAL) { refused.push({ name: e.name, reason: 'damaged entry' }); continue; }
      const start = e.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);

      await fsp.mkdir(path.dirname(target), { recursive: true });
      const tmp = `${target}.part-${process.pid}`;
      const check = checker();
      try {
        const source = e.compressedSize > 0
          ? fs.createReadStream(file, { start, end: start + e.compressedSize - 1 })
          : Readable.from([]);
        const stages = e.method === 8 ? [source, zlib.createInflateRaw(), check] : [source, check];
        await pipeline(...stages, fs.createWriteStream(tmp));
        if (check.bytes !== e.size) throw new Error(`size ${check.bytes}, expected ${e.size}`);
        if (zlib.crc32 && (check.crc >>> 0) !== (e.crc >>> 0)) throw new Error('CRC mismatch — the download is damaged');
        await fsp.rename(tmp, target);
        written.push({ name: e.name, path: target, size: e.size });
      } catch (err) {
        await fsp.rm(tmp, { force: true });
        refused.push({ name: e.name, reason: err.message });
      }
    }
  } finally {
    await fh.close();
  }
  return { written, refused };
}
