/**
 * The queue endpoints over a real server.
 *
 * This station is built to sit on a public Cloudflare tunnel, so /api/queue
 * is the only endpoint that can change what listeners hear. Its access rules
 * are therefore load-bearing, and are tested here against a real HTTP server
 * rather than by calling the Station directly.
 *
 * Runs in its own file because STATION_KEY has to be set before
 * server/config.js is first imported.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

let hasFfmpeg = true;
try {
  await run('ffmpeg', ['-version']);
} catch {
  hasFfmpeg = false;
}

const MUSIC = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-queue-'));
const CACHE = path.join(MUSIC, '.cache', 'library.json');
const KEY = 'test-key-0123456789';

if (hasFfmpeg) {
  // Long enough that the lock window doesn't swallow the whole programme,
  // and uneven so a permutation is visible in the timings.
  const specs = [
    ['01 Alpha.mp3', 20, 220], ['02 Bravo.mp3', 32, 260], ['03 Charlie.mp3', 24, 300],
    ['04 Delta.mp3', 40, 340], ['05 Echo.mp3', 28, 380], ['06 Foxtrot.mp3', 36, 420],
    ['07 Golf.mp3', 22, 460], ['08 Hotel.mp3', 30, 500],
  ];
  for (const [name, seconds, freq] of specs) {
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`,
      '-metadata', `title=${path.basename(name, '.mp3').replace(/^\d+\s/, '')}`,
      '-metadata', 'artist=Test Signal',
      '-b:a', '96k',
      path.join(MUSIC, name),
    ]);
  }
}

process.env.MUSIC_DIR = MUSIC;
process.env.CACHE_FILE = CACHE;
process.env.STATION_EPOCH = '2026-01-01T00:00:00Z';
process.env.AUTO_RESCAN_MINUTES = '0';
process.env.STATION_KEY = KEY;
// Long enough that at least one upcoming slot is always frozen (the test
// tracks are 20–40s), short enough to leave most of the window movable.
process.env.QUEUE_LOCK_SECONDS = '45';

const { createApp, rescan, station } = await import('../server/index.js');

let base;
let server;

test.before(async () => {
  if (hasFfmpeg) await rescan({ useCache: false });
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server?.close());

const get = (p, init) => fetch(base + p, init);
const post = (p, body, headers = {}) =>
  fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

/**
 * Pick a movable window of `n` consecutive slots.
 *
 * Only slots in the first cycle are eligible: this library is smaller than
 * the lookahead, so `upcoming` wraps into the next cycle, and a window may
 * not straddle the seam.
 */
async function freeWindow(n) {
  const { slots, lockSeconds } = await (await get('/api/queue')).json();
  const free = slots.filter((s) => !s.locked);
  if (!free.length) return null;

  // Group by cycle and take whichever run is longest. Picking the *first*
  // unlocked cycle would be flaky: when the clock happens to sit near a cycle
  // boundary that run is only a slot or two long.
  const byCycle = new Map();
  for (const s of free) {
    if (!byCycle.has(s.cycleIndex)) byCycle.set(s.cycleIndex, []);
    byCycle.get(s.cycleIndex).push(s);
  }
  const [cycleIndex, run] = [...byCycle.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (run.length < n) return null;

  // Take the window from the far end of the run, so it is still comfortably
  // unlocked by the time the POST lands.
  const window = run.slice(run.length - n);
  return { window, cycleIndex, startWithin: window[0].withinCycle, lockSeconds };
}

const reorder = (w, ids, key = KEY) =>
  post(
    '/api/queue/reorder',
    { cycleIndex: w.cycleIndex, startWithin: w.startWithin, ids },
    key ? { 'x-station-key': key } : {}
  );

test('GET /api/queue reports editability and marks the imminent slots frozen', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const body = await (await get('/api/queue')).json();
  assert.equal(body.editable, true);
  assert.equal(body.lockSeconds, 45);
  assert.ok(body.slots.length > 0);

  const lockUntil = body.serverTime + body.lockSeconds * 1000;
  for (const slot of body.slots) {
    assert.equal(typeof slot.cycleIndex, 'number');
    assert.equal(typeof slot.withinCycle, 'number');
    // The lock flag must agree with the times the same response reports —
    // the client trusts it to decide what it may drag.
    assert.equal(slot.locked, slot.startsAt < lockUntil, `lock flag wrong for ${slot.title}`);
  }
  // Once a slot is unlocked, every slot behind it is too.
  const firstFree = body.slots.findIndex((s) => !s.locked);
  if (firstFree !== -1) {
    assert.ok(body.slots.slice(firstFree).every((s) => !s.locked), 'lock is not monotonic');
  }
});

test('a reorder without the key is refused', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const w = await freeWindow(2);
  if (!w) return t.skip('not enough unlocked slots');
  const ids = [w.window[1].id, w.window[0].id];

  assert.equal((await reorder(w, ids, null)).status, 401);
  assert.equal((await reorder(w, ids, 'wrong-key-here')).status, 401);
  assert.equal((await (await get('/api/queue')).json()).override, null);
});

test('a reorder with the key permutes the window', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const w = await freeWindow(3);
  if (!w) return t.skip('not enough unlocked slots');

  const ids = [w.window[2].id, w.window[0].id, w.window[1].id];
  const res = await reorder(w, ids);
  assert.equal(res.status, 200, await res.text());

  const after = await (await get('/api/queue')).json();
  const placed = after.slots
    .filter((s) => s.cycleIndex === w.cycleIndex
      && s.withinCycle >= w.startWithin
      && s.withinCycle < w.startWithin + ids.length)
    .map((s) => s.id);
  assert.deepEqual(placed, ids, 'window did not take the requested order');

  await post('/api/queue/clear', {}, { 'x-station-key': KEY });
});

test('a slot too close to air cannot be moved', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const { slots } = await (await get('/api/queue')).json();
  const locked = slots.find((s) => s.locked);
  if (!locked) return t.skip('nothing is currently locked');

  const res = await post(
    '/api/queue/reorder',
    {
      cycleIndex: locked.cycleIndex,
      startWithin: locked.withinCycle,
      ids: ['a', 'b'], // never reached — the lock check fires first
    },
    { 'x-station-key': KEY }
  );
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'too_close_to_air');
});

test('an id that does not belong to the window is refused, not misapplied', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const w = await freeWindow(2);
  if (!w) return t.skip('not enough unlocked slots');

  const res = await reorder(w, [w.window[0].id, 'deadbeefcafe']);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'not_a_permutation');
  assert.equal((await (await get('/api/queue')).json()).override, null);
});

test('a window running past the end of the cycle is refused', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const w = await freeWindow(2);
  if (!w) return t.skip('not enough unlocked slots');

  const res = await post(
    '/api/queue/reorder',
    {
      cycleIndex: w.cycleIndex,
      startWithin: w.startWithin,
      ids: new Array(50).fill(0).map((_, i) => `x${i}`),
    },
    { 'x-station-key': KEY }
  );
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'window_crosses_cycle');
});

test('reordering never changes the library revision', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const before = await (await get('/api/queue')).json();
  const w = await freeWindow(2);
  if (!w) return t.skip('not enough unlocked slots');

  await reorder(w, [w.window[1].id, w.window[0].id]);
  const after = await (await get('/api/queue')).json();

  // The revision encodes track count and cycle duration. A reorder must
  // touch neither, or every client would treat it as a library change and
  // re-sync for no reason.
  assert.equal(after.revision, before.revision);
  await post('/api/queue/clear', {}, { 'x-station-key': KEY });
});

test('clear removes the override', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const w = await freeWindow(2);
  if (!w) return t.skip('not enough unlocked slots');

  const res = await reorder(w, [w.window[1].id, w.window[0].id]);
  assert.equal(res.status, 200, await res.text());
  assert.ok((await (await get('/api/queue')).json()).override);

  assert.equal((await post('/api/queue/clear', {}, { 'x-station-key': KEY })).status, 200);
  assert.equal((await (await get('/api/queue')).json()).override, null);
});

test('the queue endpoints leak no filesystem paths', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const raw = await (await get('/api/queue')).text();
  assert.ok(!raw.includes('relPath'), 'relPath leaked');
  assert.ok(!raw.includes(MUSIC), 'absolute music path leaked');
});

// roadmap #6 — POST /api/rescan now shares STATION_KEY with the queue write
// endpoints above. This file is where that's provable end-to-end: it already
// has a real STATION_KEY and a real, ffmpeg-backed music directory to add a
// file to.
test('a rescan without the key is refused, without running the scan', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const before = station.tracks.length;
  assert.equal((await post('/api/rescan', {}, {})).status, 401);
  assert.equal((await post('/api/rescan', {}, { 'x-station-key': 'wrong-key' })).status, 401);
  assert.equal(station.tracks.length, before, 'an unauthenticated call must not touch the library');
});

test('a rescan with the key picks up a newly added file', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const before = station.tracks.length;
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=550:duration=4',
    '-metadata', 'title=Late Addition', '-metadata', 'artist=Test Signal',
    '-b:a', '96k', path.join(MUSIC, '09 - Late Addition.mp3'),
  ]);
  const res = await post('/api/rescan', {}, { 'x-station-key': KEY });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.tracks, before + 1);
  assert.equal(station.tracks.length, before + 1);
});
