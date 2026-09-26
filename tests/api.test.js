/**
 * Integration test: boot the real server over a real (generated) music
 * directory and exercise every endpoint the player depends on.
 *
 * Requires ffmpeg to synthesise the audio. Skips cleanly if it is absent so
 * the suite still runs on a machine that only has Node.
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

const MUSIC = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-music-'));
const CACHE = path.join(MUSIC, '.cache', 'library.json');

if (hasFfmpeg) {
  const specs = [
    { name: '01 - Carrier Wave.mp3', seconds: 6, freq: 220, title: 'Carrier Wave', artist: 'Test Signal' },
    { name: '02 - Night Shift.mp3', seconds: 8, freq: 330, title: 'Night Shift', artist: 'Test Signal' },
    { name: '03 - Dead Air.mp3', seconds: 5, freq: 440, title: 'Dead Air', artist: 'Other Act' },
  ];
  for (const s of specs) {
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `sine=frequency=${s.freq}:duration=${s.seconds}`,
      '-metadata', `title=${s.title}`,
      '-metadata', `artist=${s.artist}`,
      '-metadata', 'album=Tower Tests',
      '-b:a', '96k',
      path.join(MUSIC, s.name),
    ]);
  }
  await fs.writeFile(path.join(MUSIC, 'readme.txt'), 'not audio');
}

process.env.MUSIC_DIR = MUSIC;
process.env.CACHE_FILE = CACHE;
process.env.STATION_EPOCH = '2026-01-01T00:00:00Z';
process.env.STATION_NAME = 'Test Tower';
process.env.AUTO_RESCAN_MINUTES = '0';

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

test('GET /api/health reports the station state', async () => {
  const res = await get('/api/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.uptimeSeconds, 'number');
  assert.equal(body.version, '0.1.0');
  if (hasFfmpeg) {
    assert.equal(body.ok, true);
    assert.equal(body.status, 'on_air');
    assert.equal(body.tracks, 3);
    assert.ok(body.nowPlayingId);
  }
});

test('GET /api/time returns a plausible server clock', async () => {
  const before = Date.now();
  const { t } = await (await get('/api/time')).json();
  const after = Date.now();
  assert.ok(t >= before - 1000 && t <= after + 1000, `server time ${t} outside [${before}, ${after}]`);
});

test('GET /api/station describes what is on air', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const body = await (await get('/api/station')).json();
  assert.equal(body.station.name, 'Test Tower');
  assert.ok(body.onAir, 'nothing on air');
  assert.ok(body.onAir.offset >= 0 && body.onAir.offset <= body.onAir.duration);
  assert.match(body.onAir.streamUrl, /^\/api\/track\/[0-9a-f]{12}\/stream$/);
  assert.equal(body.upcoming.length, 5);
  assert.ok(body.onAir.startsAt <= body.serverTime);
  assert.ok(body.onAir.endsAt >= body.serverTime);
});

test('/api/station never leaks a filesystem path', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const raw = await (await get('/api/station')).text();
  assert.ok(!raw.includes('relPath'), 'relPath leaked to the client');
  assert.ok(!raw.includes(MUSIC), 'absolute music path leaked to the client');
});

test('two /api/station calls a second apart advance the offset, not the track', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');

  // This only means something if we are not about to roll over mid-test. The
  // schedule is a pure function of `now - epoch` (BRIEF.md §3), so rather than
  // sampling wherever the real wall clock happens to be and skipping when
  // we're unlucky, park the station a third of the way into the longest track
  // of cycle 0 by shifting `station.epoch` — equivalent to injecting a fixed
  // `now` without a test seam on the public API. That guarantees headroom
  // instead of hoping for it, so the flakiness (and the skip) goes away.
  const order = station.cycleOrder(0);
  let acc = 0;
  let longest = order[0];
  let longestStart = 0;
  for (const track of order) {
    if (track.duration > longest.duration) {
      longest = track;
      longestStart = acc;
    }
    acc += track.duration + station.gapSeconds;
  }
  const parkAt = longestStart + longest.duration / 3;

  // Shifting `station.epoch` used to be enough, but since the era mechanism
  // landed (docs/DECISIONS.md 2026-08-18, "Deferring library changes to the
  // next cycle boundary") `epoch` is only read in the constructor to seed the
  // first era. The live time origin is `era.startTimeMs`, so that is what has
  // to move. Shift every era by the same delta to keep their relative
  // timing — and the queued-era boundary — intact.
  const anchors = [station._era, station._nextEra].filter(Boolean);
  const delta = Date.now() - parkAt * 1000 - station._era.startTimeMs;
  const originalEpoch = station.epoch;
  const originalStarts = anchors.map((era) => era.startTimeMs);
  for (const era of anchors) era.startTimeMs += delta;
  station.epoch += delta;

  try {
    const a = await (await get('/api/station')).json();
    assert.equal(a.onAir.id, longest.id, 'expected to be parked on the longest track');
    assert.ok(a.onAir.remaining >= 3, `not enough headroom: ${a.onAir.remaining}s remaining`);

    await new Promise((r) => setTimeout(r, 1100));
    const b = await (await get('/api/station')).json();
    assert.equal(b.onAir.id, a.onAir.id);
    assert.ok(b.onAir.offset > a.onAir.offset, 'offset did not advance');
    assert.ok(b.onAir.offset - a.onAir.offset < 2.5, 'offset advanced too fast');
  } finally {
    anchors.forEach((era, i) => {
      era.startTimeMs = originalStarts[i];
    });
    station.epoch = originalEpoch;
  }
});

test('listener counting responds to the listener ping', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  await get('/api/station?listener=alpha');
  await get('/api/station?listener=beta');
  const body = await (await get('/api/station?listener=gamma')).json();
  assert.ok(body.listeners >= 3, `expected >= 3 listeners, got ${body.listeners}`);
});

test('GET /api/library lists and searches', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const all = await (await get('/api/library')).json();
  assert.equal(all.total, 3);
  assert.equal(all.items.length, 3);
  assert.ok(all.items.every((i) => !('relPath' in i)));

  const hit = await (await get('/api/library?q=night')).json();
  assert.equal(hit.total, 1);
  assert.equal(hit.items[0].title, 'Night Shift');

  const byArtist = await (await get('/api/library?q=other%20act')).json();
  assert.equal(byArtist.total, 1);

  const paged = await (await get('/api/library?limit=2&offset=2')).json();
  assert.equal(paged.items.length, 1);
});

test('GET /api/schedule returns a contiguous programme guide for a window', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const from = new Date(Date.now() + 5000).toISOString();
  const to = new Date(Date.now() + 5000 + 3 * 3600_000).toISOString();
  const res = await get(`/api/schedule?from=${from}&to=${to}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.from, Date.parse(from));
  assert.equal(body.to, Date.parse(to));
  assert.equal(body.revision, station.revision);
  assert.ok(body.items.length > 0, 'expected at least one scheduled item');
  assert.ok(!JSON.stringify(body.items).includes('relPath'), 'relPath leaked into the schedule');
  for (let i = 1; i < body.items.length; i++) {
    assert.equal(body.items[i].startsAt, body.items[i - 1].endsAt, `gap before item ${i}`);
  }
  assert.ok(body.items.at(-1).endsAt >= body.to);
});

test('GET /api/schedule defaults from=now, to=now+2h when omitted', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const before = Date.now();
  const body = await (await get('/api/schedule')).json();
  const after = Date.now();
  assert.ok(body.from >= before && body.from <= after, 'default from was not "now"');
  assert.equal(body.to - body.from, 2 * 3600_000);
});

test('GET /api/schedule caps an oversized window rather than erroring', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 30 * 24 * 3600_000).toISOString(); // 30 days
  const body = await (await get(`/api/schedule?from=${from}&to=${to}`)).json();
  assert.equal(body.to - body.from, 48 * 3600_000, 'window was not capped to 48h');
});

test('GET /api/schedule rejects malformed or inverted windows', async () => {
  assert.equal((await get('/api/schedule?from=not-a-date')).status, 400);
  const now = new Date().toISOString();
  const earlier = new Date(Date.now() - 3600_000).toISOString();
  assert.equal((await get(`/api/schedule?from=${now}&to=${earlier}`)).status, 400);
});

test('streaming: full body', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const id = station.tracks[0].id;
  const res = await get(`/api/track/${id}/stream`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'audio/mpeg');
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 1000, 'suspiciously small body');
});

test('streaming: range request returns 206 with the exact slice', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const id = station.tracks[0].id;
  const full = Buffer.from(await (await get(`/api/track/${id}/stream`)).arrayBuffer());

  const res = await get(`/api/track/${id}/stream`, { headers: { Range: 'bytes=100-199' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), `bytes 100-199/${full.length}`);
  assert.equal(res.headers.get('content-length'), '100');
  const slice = Buffer.from(await res.arrayBuffer());
  assert.equal(slice.length, 100);
  assert.deepEqual(slice, full.subarray(100, 200), 'ranged bytes do not match the full body');
});

test('streaming: open-ended and suffix ranges', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const id = station.tracks[0].id;
  const full = Buffer.from(await (await get(`/api/track/${id}/stream`)).arrayBuffer());

  const open = await get(`/api/track/${id}/stream`, { headers: { Range: 'bytes=1000-' } });
  assert.equal(open.status, 206);
  assert.equal(Number(open.headers.get('content-length')), full.length - 1000);

  const suffix = await get(`/api/track/${id}/stream`, { headers: { Range: 'bytes=-500' } });
  assert.equal(suffix.status, 206);
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), full.subarray(full.length - 500));
});

test('streaming: unsatisfiable range returns 416', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const id = station.tracks[0].id;
  const res = await get(`/api/track/${id}/stream`, { headers: { Range: 'bytes=99999999-' } });
  assert.equal(res.status, 416);
  assert.match(res.headers.get('content-range'), /^bytes \*\/\d+$/);
});

test('streaming: HEAD gives the size without the body', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not available');
  const id = station.tracks[0].id;
  const res = await get(`/api/track/${id}/stream`, { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.ok(Number(res.headers.get('content-length')) > 1000);
  assert.equal((await res.text()).length, 0);
});

test('unknown track id is a clean 404', async () => {
  const res = await get('/api/track/deadbeef1234/stream');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'unknown_track');
});

test('path traversal through the track id is not possible', async () => {
  for (const evil of ['..%2F..%2Fetc%2Fpasswd', '....//....//etc/passwd', '%2e%2e%2f%2e%2e%2fetc%2fpasswd']) {
    const res = await get(`/api/track/${evil}/stream`);
    assert.ok([400, 404].includes(res.status), `traversal returned ${res.status} for ${evil}`);
  }
});

test('the player HTML and assets are served', async () => {
  const html = await get('/');
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  const body = await html.text();
  assert.ok(body.includes('Radio Tower'));

  assert.equal((await get('/app.js')).status, 200);
  assert.equal((await get('/styles.css')).status, 200);
});

test('the programme guide page and its script are served', async () => {
  const html = await get('/schedule.html');
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.ok((await html.text()).includes('Programme guide'));

  assert.equal((await get('/schedule.js')).status, 200);
});

test('unknown routes return JSON 404, not an HTML error page', async () => {
  const res = await get('/api/nope');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'not_found');
});

test('CORS headers allow the tower to be embedded elsewhere', async () => {
  const res = await get('/api/health');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('access-control-expose-headers') || '', /Content-Range/);
});

// This file runs with no STATION_KEY set (queue-api.test.js is the file that
// sets one, since config.js reads the env once at import time) — so it is the
// right place to prove roadmap #6's fail-closed default: with no key
// configured at all, the endpoint refuses rather than silently running.
// The authenticated, actually-picks-up-a-file path is proved in
// tests/queue-api.test.js, which has a real STATION_KEY to send.
test('POST /api/rescan with no STATION_KEY configured is refused, not run', async (t) => {
  const before = station.tracks.length;
  const res = await fetch(base + '/api/rescan', { method: 'POST' });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'rescan_disabled');
  // Refused before ctx.rescan() is ever called — the library must be
  // completely untouched, not just "the response says no".
  assert.equal(station.tracks.length, before);
});

test.after(async () => {
  await fs.rm(MUSIC, { recursive: true, force: true });
});
