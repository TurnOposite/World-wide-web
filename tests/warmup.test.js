/**
 * Roadmap #2 — scan progress and startup behaviour on a large library.
 *
 * Before this change, `server/index.js` awaited the first `rescan()` before
 * calling `server.listen()`. On a large library over slow USB that scan can
 * take minutes, and for that whole window the site was simply unreachable —
 * indistinguishable from a crashed process. Now the port opens immediately,
 * and `/api/health` / `/api/station` report a `scanning` warm-up state
 * instead of the misleading `no_tracks` ("empty library, go add some MP3s")
 * the old code would have shown once the port did open.
 *
 * `node --test` runs each file in its own process, so importing
 * `server/index.js` here gives a *fresh* module instance that has never
 * scanned anything — the true cold-boot shape. We drive `state` directly
 * into "a scan is in flight" rather than racing a real filesystem scan:
 * scanning an empty temp directory resolves in well under a millisecond, so
 * trying to catch it mid-flight would be flaky, not a real test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MUSIC = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-warmup-'));
process.env.MUSIC_DIR = MUSIC;
process.env.CACHE_FILE = path.join(MUSIC, '.cache', 'library.json');
process.env.STATION_EPOCH = '2026-01-01T00:00:00Z';
process.env.AUTO_RESCAN_MINUTES = '0';

const { createApp, state, station } = await import('../server/index.js');

let base;
let server;

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server?.close());

const get = (p) => fetch(base + p);

test('the port answers even though nothing has been scanned yet', async () => {
  assert.equal(state.lastScanAt, null, 'test setup assumption: no scan has run yet');
  assert.equal(station.isEmpty, true);
  const res = await get('/api/health');
  assert.equal(res.status, 200);
});

test('/api/health reports "scanning", not "no_tracks", while the first scan is in flight', async () => {
  state.scanning = true; // simulate: rescan() has started and not yet resolved
  try {
    const body = await (await get('/api/health')).json();
    assert.equal(body.status, 'scanning');
    assert.equal(body.ok, false);
  } finally {
    state.scanning = false;
  }
});

test('/api/station tells the player it is warming up, not that the library is empty', async () => {
  state.scanning = true;
  try {
    const body = await (await get('/api/station')).json();
    assert.equal(body.onAir, null);
    assert.equal(body.warmingUp, true);
    assert.match(body.message, /warming up/i);
  } finally {
    state.scanning = false;
  }
});

test('once a scan completes, "scanning" becomes "no_tracks" if the library really is empty', async () => {
  state.lastScanAt = Date.now(); // simulate: rescan() resolved and found nothing
  const body = await (await get('/api/health')).json();
  assert.equal(body.status, 'no_tracks');
  assert.equal(body.ok, false);
  const stationBody = await (await get('/api/station')).json();
  assert.equal(stationBody.warmingUp, false);
  assert.match(stationBody.message, /no playable audio/i);
});

test.after(async () => {
  await fs.rm(MUSIC, { recursive: true, force: true });
});
