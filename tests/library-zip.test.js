/**
 * library/zip.mjs — opening album zips with Node alone.
 *
 * Built because the bot's `tar -xf` failed on Ortis's laptop: GNU tar (Git
 * Bash) cannot read zips at all, and Windows' tar cannot open a name like
 * "Saken 天 - 森.zip" — 81 of the 152 Bandcamp albums of 12 October. The
 * archives here are written by hand, below,
 * so each test controls exactly the bytes a real download could contain.
 * What must hold:
 *   - names come out right, in UTF-8 and in the old DOS code page;
 *   - stored, deflated and streamed (data-descriptor) entries come out byte
 *     for byte, and a damaged one is refused without leaving half a file;
 *   - nothing is ever written outside the destination, whatever the names;
 *   - what cannot be read safely is refused with a reason, and the rest of
 *     the album still comes out;
 *   - nothing already there is overwritten.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { listZip, extractZip, safeSegments } from '../library/zip.mjs';
import { makeZip } from './helpers/make-zip.js';

const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-zip-'));
let n = 0;
const tmp = (name) => path.join(scratch, `${++n}-${name}`);

async function zipFile(name, entries, opts) {
  const file = tmp(name);
  await fsp.writeFile(file, makeZip(entries, opts));
  return file;
}

/** Every file under `dir`, as forward-slash relative paths. */
function tree(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full); else out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

const song = (k, size = 5000) => Buffer.from(Array.from({ length: size }, (_, i) => (i * 31 + k * 7) & 0xff));

test('names come out right — UTF-8, the DOS code page, and the Info-ZIP unicode field', async () => {
  // "Café" in code page 437: é is 0x82.
  const dos = Buffer.from([0x43, 0x61, 0x66, 0x82, 0x2e, 0x6d, 0x70, 0x33]);
  // An old tool's DOS name, with the real name alongside in a 0x7075 field.
  const legacy = Buffer.from('Oiseau.mp3', 'latin1');
  const unicode = Buffer.from('Ōiseau 鳥.mp3', 'utf8');
  const field = Buffer.alloc(5 + unicode.length);
  field[0] = 1;
  field.writeUInt32LE(zlib.crc32(legacy), 1);
  unicode.copy(field, 5);
  const extra = Buffer.concat([Buffer.from([0x75, 0x70, field.length & 0xff, field.length >> 8]), field]);

  const file = await zipFile('names.zip', [
    { name: 'Saken 天 - 森/01 木.mp3', data: song(1) },
    { nameBytes: dos, utf8: false, data: song(2) },
    { name: 'Été sans drapeau.mp3', utf8: false, data: song(3) }, // UTF-8 bytes, flag missing
    { nameBytes: legacy, utf8: false, extra, data: song(4) },
  ]);
  const names = (await listZip(file)).map((e) => e.name);
  assert.deepEqual(names, ['Saken 天 - 森/01 木.mp3', 'Café.mp3', 'Été sans drapeau.mp3', 'Ōiseau 鳥.mp3']);
});

test('stored, deflated and streamed entries come out byte for byte, folders kept', async () => {
  const file = await zipFile('kinds.zip', [
    { name: 'Album/01 Stored.mp3', data: song(1), method: 0 },
    { name: 'Album/02 Deflated.mp3', data: song(2, 70_000) },
    { name: 'Album/03 Streamed.mp3', data: song(3), descriptor: true },
    { name: 'Album/empty.txt', data: Buffer.alloc(0), method: 0 },
    { name: 'Album/', data: Buffer.alloc(0), method: 0 },
  ]);
  const dest = tmp('out');
  const r = await extractZip(file, dest);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(tree(dest), ['Album/01 Stored.mp3', 'Album/02 Deflated.mp3', 'Album/03 Streamed.mp3', 'Album/empty.txt']);
  assert.deepEqual(fs.readFileSync(path.join(dest, 'Album', '02 Deflated.mp3')), song(2, 70_000));
  assert.deepEqual(fs.readFileSync(path.join(dest, 'Album', '03 Streamed.mp3')), song(3));
});

test('nothing is ever written outside the destination, whatever the names say', async () => {
  const file = await zipFile('slip.zip', [
    { name: '../../escape.mp3', data: song(1) },
    { name: '/etc/absolute.mp3', data: song(2) },
    { name: 'C:\\Windows\\drive.mp3', data: song(3) },
    { name: 'a/../../../up.mp3', data: song(4) },
    { name: '..', data: song(5) },
  ]);
  const outer = tmp('outer');
  const dest = path.join(outer, 'dest');
  await extractZip(file, dest);
  assert.deepEqual(tree(outer).filter((p) => !p.startsWith('dest/')), [], 'not one byte outside dest/');
  assert.ok(tree(dest).includes('escape.mp3') && tree(dest).includes('Windows/drive.mp3'));
  assert.deepEqual(safeSegments('C:\\a\\..\\b/./c.mp3'), ['a', 'b', 'c.mp3']);
});

test('what cannot be read safely is refused with a reason; the rest of the album still comes out', async () => {
  const file = await zipFile('mixed.zip', [
    { name: 'locked.mp3', data: song(1), flags: 0x1 },
    { name: 'bzip2.mp3', data: song(2), method: 12 },
    { name: 'damaged.mp3', data: song(3), crc: 0x12345678 },
    { name: 'fine.mp3', data: song(4) },
  ]);
  const dest = tmp('out');
  const r = await extractZip(file, dest);
  assert.deepEqual(tree(dest), ['fine.mp3'], 'no half-written or unverified file is left behind');
  const why = Object.fromEntries(r.refused.map((x) => [x.name, x.reason]));
  assert.match(why['locked.mp3'], /encrypted/);
  assert.match(why['bzip2.mp3'], /method 12/);
  assert.match(why['damaged.mp3'], /CRC|damaged/);
});

test('a zip64 archive is read like any other', async () => {
  const file = await zipFile('big.zip', [{ name: 'Disc 1/01.mp3', data: song(9) }, { name: 'Disc 2/01.mp3', data: song(8) }], { zip64: true });
  const dest = tmp('out');
  const r = await extractZip(file, dest);
  assert.equal(r.written.length, 2);
  assert.deepEqual(fs.readFileSync(path.join(dest, 'Disc 2', '01.mp3')), song(8));
});

test('nothing already there is overwritten — a taken name gets (2)', async () => {
  const file = await zipFile('again.zip', [{ name: 'track.mp3', data: song(1) }]);
  const dest = tmp('out');
  await fsp.mkdir(dest, { recursive: true });
  await fsp.writeFile(path.join(dest, 'track.mp3'), 'mine');
  await extractZip(file, dest);
  assert.equal(fs.readFileSync(path.join(dest, 'track.mp3'), 'utf8'), 'mine');
  assert.deepEqual(fs.readFileSync(path.join(dest, 'track (2).mp3')), song(1));
});

test('only the entries asked for are written, flat when asked', async () => {
  const file = await zipFile('pick.zip', [{ name: 'A/cover.jpg', data: song(1) }, { name: 'A/01.mp3', data: song(2) }, { name: 'A/notes.txt', data: song(3) }]);
  const dest = tmp('out');
  await extractZip(file, dest, { want: (e) => e.name.endsWith('.mp3') || e.name.endsWith('.jpg'), flat: true });
  assert.deepEqual(tree(dest), ['01.mp3', 'cover.jpg']);
});

test('a file that is not a zip says so', async () => {
  const file = tmp('not.zip');
  await fsp.writeFile(file, 'this is a text file, not an archive');
  await assert.rejects(listZip(file), /not a zip/);
});
