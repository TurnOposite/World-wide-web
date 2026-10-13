/**
 * PUT /api/library/file — how the library bot fills a tower in the cloud
 * (library/bot.mjs publish). The happy path is covered with the bot in
 * tests/library-bot.test.js; this file is about the ways an upload goes
 * wrong, because each one used to leave something behind:
 *   - a body bigger than the limit, with no size declared up front, got no
 *     answer at all and left its temporary file in the library;
 *   - a connection cut halfway left its temporary file in the library and
 *     its descriptor open.
 * What must hold: every upload either lands whole under its own name, or
 * leaves nothing behind — no half-song, no `.upload-…` file, no open file —
 * and the client is never left waiting for an answer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// The server reads its settings once, at import.
const MUSIC = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-upload-'));
Object.assign(process.env, {
  MUSIC_DIR: MUSIC, CACHE_FILE: path.join(MUSIC, '.cache', 'library.json'),
  STATION_KEY: 'k-upload', ALLOW_UPLOADS: '1', UPLOAD_MAX_MB: '1', AUTO_RESCAN_MINUTES: '0',
});
const { createApp } = await import('../server/index.js');

const MB = 1048576;
const server = http.createServer(createApp());
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
test.after(() => { server.closeAllConnections(); server.close(); });

/** Every temporary upload file still in the library. */
function leftovers(dir = MUSIC, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) leftovers(full, acc);
    else if (e.name.includes('.upload-')) acc.push(path.relative(MUSIC, full));
  }
  return acc;
}

/** Wait until the library holds no temporary file, or give up after `ms`. */
async function settled(ms = 3000) {
  const end = Date.now() + ms;
  while (leftovers().length && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return leftovers();
}

/**
 * A raw PUT: `body` chunks are written one by one, with no Content-Length
 * (chunked), unless `size` is declared in the query. `cutAfter` writes that
 * many chunks and then drops the connection. Resolves { status, body } or
 * { error } — never hangs past `timeout`.
 */
function put(rel, chunks, { size = null, cutAfter = null, timeout = 5000 } = {}) {
  const q = `path=${encodeURIComponent(rel)}${size === null ? '' : `&size=${size}`}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { req.destroy(); resolve({ error: 'timeout' }); }, timeout);
    const req = http.request({ host: '127.0.0.1', port, method: 'PUT', path: `/api/library/file?${q}`, agent: false, headers: { 'x-station-key': 'k-upload' } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, body }); });
      res.on('error', (err) => { clearTimeout(timer); resolve({ error: err.code || err.message }); });
    });
    req.on('error', (err) => { clearTimeout(timer); resolve({ error: err.code || err.message }); });
    (async () => {
      for (let i = 0; i < chunks.length; i++) {
        if (cutAfter !== null && i === cutAfter) {
          // Give the server a moment to have started writing, then hang up.
          await new Promise((r) => setTimeout(r, 150));
          req.destroy();
          clearTimeout(timer);
          resolve({ cut: true });
          return;
        }
        if (!req.write(chunks[i])) await new Promise((r) => req.once('drain', r));
      }
      req.end();
    })().catch(() => {});
  });
}

const chunk = (n, fill = 7) => Buffer.alloc(n, fill);

test('an upload lands whole, under its own name, and leaves nothing behind', async () => {
  const parts = [chunk(64 * 1024, 1), chunk(64 * 1024, 2), chunk(1000, 3)];
  const size = parts.reduce((s, p) => s + p.length, 0);
  const r = await put('Haze/whole.mp3', parts, { size });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual(fs.readFileSync(path.join(MUSIC, 'Haze', 'whole.mp3')), Buffer.concat(parts));
  assert.deepEqual(await settled(), []);
});

test('a body bigger than the limit, declared or not, is refused and leaves nothing behind', async () => {
  const declared = await put('Haze/declared.mp3', [chunk(10)], { size: 2 * MB });
  assert.equal(declared.status, 413, 'a declared size over the limit is refused before a byte is read');

  // No size in the query, no Content-Length: the limit is only found out
  // while reading. The client must still get an answer (or a closed
  // connection), not silence.
  const r = await put('Haze/too-big.mp3', Array.from({ length: 24 }, () => chunk(64 * 1024)));
  assert.notEqual(r.error, 'timeout', 'the client was left waiting');
  if (r.status !== undefined) assert.equal(r.status, 413, JSON.stringify(r));
  assert.ok(!fs.existsSync(path.join(MUSIC, 'Haze', 'too-big.mp3')), 'nothing lands under the real name');
  assert.deepEqual(await settled(), [], 'no temporary file is left in the library');
});

test('an upload cut off halfway leaves nothing behind', async () => {
  const r = await put('Zone/cut.mp3', Array.from({ length: 8 }, () => chunk(64 * 1024)), { size: 8 * 64 * 1024, cutAfter: 3 });
  assert.ok(r.cut);
  assert.deepEqual(await settled(), [], 'the half-written file is removed once the connection is gone');
  assert.ok(!fs.existsSync(path.join(MUSIC, 'Zone', 'cut.mp3')));
});

test('a body shorter than its declared size is refused and leaves nothing behind', async () => {
  const r = await put('Zone/short.mp3', [chunk(500)], { size: 1000 });
  assert.equal(r.status, 400, JSON.stringify(r));
  assert.match(r.body, /incomplete/);
  assert.ok(!fs.existsSync(path.join(MUSIC, 'Zone', 'short.mp3')));
  assert.deepEqual(await settled(), []);
});
