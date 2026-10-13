import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { parseRange, mimeFor, sendAudio } from '../server/lib/stream.js';

test('no header means a full-body response', () => {
  assert.equal(parseRange(undefined, 1000), null);
  assert.equal(parseRange('', 1000), null);
});

test('open-ended range runs to the last byte', () => {
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 });
});

test('closed range is honoured exactly', () => {
  assert.deepEqual(parseRange('bytes=0-499', 1000), { start: 0, end: 499 });
});

test('range past the end is clamped, not rejected', () => {
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 });
});

test('suffix range returns the tail', () => {
  assert.deepEqual(parseRange('bytes=-200', 1000), { start: 800, end: 999 });
});

test('suffix larger than the file starts at zero', () => {
  assert.deepEqual(parseRange('bytes=-5000', 1000), { start: 0, end: 999 });
});

test('start beyond EOF is unsatisfiable (416)', () => {
  assert.deepEqual(parseRange('bytes=1000-', 1000), { unsatisfiable: true });
  assert.deepEqual(parseRange('bytes=2000-3000', 1000), { unsatisfiable: true });
});

test('inverted range is unsatisfiable', () => {
  assert.deepEqual(parseRange('bytes=500-100', 1000), { unsatisfiable: true });
});

test('multipart and malformed ranges fall back to a full body', () => {
  assert.equal(parseRange('bytes=0-100,200-300', 1000), null);
  assert.equal(parseRange('items=0-100', 1000), null);
  assert.equal(parseRange('bytes=abc-def', 1000), null);
  assert.equal(parseRange('bytes=-', 1000), null);
});

// Every listener joins mid-track, so the player seeks on every join and the
// browser abandons requests constantly. A file stream left open by each one
// is an open descriptor for the life of the process — on a tower that runs
// for weeks, a slow walk to "too many open files" and a silent station.
test('a listener who hangs up mid-file releases the file', async (t) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-stream-'));
  const file = path.join(dir, 'long.mp3');
  // Far more than the socket buffers hold, so the server is still sending
  // when the client goes away.
  await fsp.writeFile(file, Buffer.alloc(16 * 1024 * 1024, 1));
  const opened = t.mock.method(fs, 'createReadStream');
  const app = express();
  app.get('/', (req, res) => sendAudio(req, res, file));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    for (const range of ['bytes=1000-', null]) {
      const before = opened.mock.callCount();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no first chunk')), 5000);
        const req = http.get({ port, host: '127.0.0.1', path: '/', agent: false, headers: range ? { range } : {} }, (res) => {
          res.once('data', () => { clearTimeout(timer); req.destroy(); resolve(); });
        });
        req.on('error', () => {}); // the hang-up is the point
      });
      assert.equal(opened.mock.callCount(), before + 1, 'one file stream per request');
      const stream = opened.mock.calls.at(-1).result;
      const closed = stream.closed || await new Promise((r) => {
        const timer = setTimeout(() => r(false), 3000);
        stream.once('close', () => { clearTimeout(timer); r(true); });
      });
      assert.ok(closed, `${range ?? 'full body'}: the file stream must be closed once the listener has gone`);
    }
  } finally {
    server.closeAllConnections();
    server.close();
    // A leaked stream still holds the file open, and Windows will not delete
    // an open file: close whatever is left before cleaning up.
    for (const c of opened.mock.calls) c.result?.destroy?.();
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('mime types cover the formats the scanner accepts', () => {
  assert.equal(mimeFor('/x/a.mp3'), 'audio/mpeg');
  assert.equal(mimeFor('/x/a.M4A'), 'audio/mp4');
  assert.equal(mimeFor('/x/a.flac'), 'audio/flac');
  assert.equal(mimeFor('/x/a.ogg'), 'audio/ogg');
  assert.equal(mimeFor('/x/a.wav'), 'audio/wav');
  assert.equal(mimeFor('/x/a.xyz'), 'application/octet-stream');
});
