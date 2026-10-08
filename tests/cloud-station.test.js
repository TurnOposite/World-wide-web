/**
 * The station, when it runs in a visitor's browser instead of on the Pi.
 *
 * What must hold (docs/CLOUD.md §3):
 *   - the site's copy of the clock *is* the server's clock (byte-identical);
 *   - the cloud channel lines up to the second with the Wix draft of
 *     2026-09-09 (same epoch, order and durations) — a listener on either
 *     hears the same thing;
 *   - two browsers that hold the same control document compute the same
 *     programme at every instant, and a DJ's reorder never touches anything
 *     inside the lock fence or outside its window;
 *   - a reorder is refused here for exactly the reasons the Pi refuses it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Station } from '../server/lib/schedule.js';
import { stationPayload, queuePayload } from '../server/lib/payloads.js';
import { CloudEngine } from '../site/js/engine/cloud.js';
import { validateLibrary } from '../scripts/cloud-library.mjs';
import { SYNCED, expected } from '../scripts/site-sync.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOYED = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/station/library.json'), 'utf8'));
// The control mechanics below are pinned to the library's running order (the
// 'all' channel). Whether the dial *offers* that channel is a deployment
// choice in library.json (2026-10-08: no — one shuffled channel), so the
// engine here gets the dial that includes it; the deployed dial has its own
// test below.
const LIBRARY = { ...DEPLOYED, channels: { default: 'all', channels: [{ slug: 'all', label: 'Album order', order: 'station' }] } };
const EPOCH = Date.parse(LIBRARY.epoch);
const TOTAL = LIBRARY.tracks.reduce((s, t) => s + t.duration, 0);

// These tests pin the control mechanics against the programme they were
// written for — the library's own running order, the Wix draft's — which
// since channels (2026-10-07) is the 'all' channel. The default channel is
// now Mashup; tests/channels.test.js covers channels and the switch.
const engineAt = (t, control = null) => new CloudEngine({ library: LIBRARY, control, base: 'https://example.github.io/radio-tower/', clock: () => t, channel: 'all' });

test('the deployed dial: one channel, the whole library shuffled (Ortis, 2026-10-08)', () => {
  const t = Date.parse('2026-10-08T12:00:00Z');
  const eng = new CloudEngine({ library: DEPLOYED, base: 'https://example.github.io/radio-tower/', clock: () => t });
  const { body } = eng.get('/api/channels');
  assert.equal(body.channels.length, 1);
  assert.equal(body.default, body.channels[0].slug);
  assert.equal(body.channels[0].order, 'shuffle');
  assert.equal(body.channels[0].trackCount, DEPLOYED.tracks.length, 'every track is on it');
  const order = eng.station.cycleOrder(eng.station.at(t).cycleIndex).map((x) => x.id);
  assert.notDeepEqual(order, DEPLOYED.tracks.map((x) => x.id), 'shuffled, not the running order');
});

/* ------------------------------------------------------------- the copies */

test('the site runs the server\'s own clock and payload builders, byte for byte', () => {
  for (const [src, dst] of SYNCED) {
    const have = fs.readFileSync(path.join(ROOT, dst), 'utf8');
    assert.equal(have, expected(src), `${dst} drifted from ${src} — run node scripts/site-sync.mjs`);
  }
});

/* ---------------------------------------------------------- the library */

test('library.json is valid: unique ids, exact durations, https sources, no lossless files', () => {
  assert.deepEqual(validateLibrary(LIBRARY), []);
  assert.equal(LIBRARY.tracks.length, 28);
  // 1 h 39 min 51 s, the loop measured on Wix to the second (PLAYLIST.md, 10 Sept).
  assert.equal(Math.round(TOTAL), 5991);
});

test('validateLibrary catches the mistakes that would desync or overspend', () => {
  const bad = {
    epoch: 'nope',
    tracks: [
      { id: 'abc', title: 'x', duration: 0, sources: [] },
      { id: 'abc', title: '', duration: 10, sources: ['http://insecure/x.mp3'] },
      { id: '0123456789ab', title: 'y', duration: 10, sources: ['https://cdn/x.wav'] },
    ],
  };
  const problems = validateLibrary(bad).join('\n');
  for (const needle of ['epoch', 'id must be', 'duplicate id', 'duration', 'at least one source', 'missing title', 'https://', 'lossless']) {
    assert.match(problems, new RegExp(needle), `expected a complaint about ${needle}`);
  }
});

test('a site path may be percent-encoded; a raw space or another scheme may not', () => {
  const lib = (s) => ({ epoch: '2026-01-01T00:00:00Z', tracks: [{ id: '0123456789ab', title: 't', duration: 10, sources: [s] }] });
  assert.deepEqual(validateLibrary(lib('/radio-tower/__fixtures/01%20Carrier%20Wave.mp3')), []);
  assert.deepEqual(validateLibrary(lib('station/preview-audio/0123456789ab.mp3')), []);
  for (const bad of ['station/01 Carrier Wave.mp3', 'javascript:alert(1)', 'data:audio/mpeg;base64,AAAA', '/x/%zz.mp3']) {
    assert.match(validateLibrary(lib(bad)).join('\n'), /source must be/, bad);
  }
});

/* ------------------------------------------------ same second as Wix draft */

/** The Wix block's own algorithm, transcribed (Web-Creative/_Travail/13_…). */
function wixPositionAt(ms) {
  let p = (((ms / 1000 - EPOCH / 1000) % TOTAL) + TOTAL) % TOTAL;
  for (let i = 0; i < LIBRARY.tracks.length; i++) {
    if (p < LIBRARY.tracks[i].duration) return { index: i, offset: p };
    p -= LIBRARY.tracks[i].duration;
  }
  return { index: 0, offset: 0 };
}

test('the cloud channel plays the same track at the same second as the Wix draft', () => {
  const start = Date.parse('2026-09-26T00:00:00Z');
  for (let i = 0; i < 2000; i++) {
    const t = start + i * 37_613; // ~21 hours, off-grid on purpose
    const mine = engineAt(t).station.at(t);
    const wix = wixPositionAt(t);
    assert.equal(mine.track.id, LIBRARY.tracks[wix.index].id, `track differs at ${new Date(t).toISOString()}`);
    assert.ok(Math.abs(mine.offset - wix.offset) < 0.01, `offset differs at ${new Date(t).toISOString()}`);
  }
});

test('shuffle:false keeps the running order in every cycle; the default still shuffles', () => {
  const tracks = LIBRARY.tracks;
  const fixed = new Station(tracks, { epoch: EPOCH, shuffle: false });
  const shuffled = new Station(tracks, { epoch: EPOCH });
  for (const c of [1, 7, 4242]) {
    assert.deepEqual(fixed.cycleOrder(c).map((t) => t.id), tracks.map((t) => t.id));
  }
  assert.notDeepEqual(shuffled.cycleOrder(7).map((t) => t.id), tracks.map((t) => t.id));
});

/* ---------------------------------------------------------------- payloads */

test('the browser answers /api/station in the server\'s shape, with absolute CDN audio and site art', () => {
  const t = Date.parse('2026-09-26T12:00:00Z');
  const eng = engineAt(t);
  const { status, body } = eng.get('/api/station');
  assert.equal(status, 200);
  const direct = stationPayload(eng.station, { now: t, config: eng.config, urls: eng.urls, extra: { mode: 'cloud', origin: null } });
  assert.deepEqual(Object.keys(body).sort(), Object.keys(direct).sort());
  assert.match(body.onAir.streamUrl, /^https:\/\/static\.wixstatic\.com\/mp3\//);
  assert.equal(body.upcoming.length, 5);
  assert.equal(body.station.mode, 'cloud');
  // No server, so no count — the field is absent, never a fake zero.
  assert.equal('listeners' in body, false);
  const withArt = [body.onAir, ...body.upcoming].find((x) => x.artUrl);
  if (withArt) assert.match(withArt.artUrl, /^https:\/\/example\.github\.io\/radio-tower\/collections\/music\/covers\//);
});

test('/api/schedule and /api/library answer like the server, including its errors', () => {
  const t = Date.parse('2026-09-26T12:00:00Z');
  const eng = engineAt(t);
  const sched = eng.get(`/api/schedule?from=${new Date(t).toISOString()}&to=${new Date(t + 3600e3).toISOString()}`);
  assert.equal(sched.status, 200);
  assert.ok(sched.body.items.length >= 12);
  assert.equal(eng.get('/api/schedule?from=garbage').status, 400);
  const lib = eng.get('/api/library?q=hyrule');
  assert.equal(lib.body.total, 12);
  assert.equal(eng.get('/api/nope').status, 404);
});

/* ------------------------------------------------------------ the queue */

function movableWindow(eng) {
  const q = eng.get('/api/queue').body;
  const free = q.slots.filter((s) => !s.locked);
  // A window must stay inside one cycle (the Pi's rule too).
  const cycle = free[0].cycleIndex;
  return free.filter((s) => s.cycleIndex === cycle);
}

/**
 * An instant where the queue has both a locked slot and at least `n` movable
 * ones in the same cycle — so each test exercises what it claims to, instead
 * of depending on where a hard-coded time happens to fall in the 1 h 39 loop.
 */
function busyInstant(n = 4) {
  for (let t = Date.parse('2026-09-26T12:00:00Z'); ; t += 5_000) {
    const eng = engineAt(t);
    const q = eng.get('/api/queue').body;
    if (!q.slots.some((s) => s.locked)) continue;
    if (movableWindow(eng).length >= n) return t;
  }
}

test('a reorder proposed by the DJ is a control document every listener can apply', () => {
  const t = busyInstant();
  const dj = engineAt(t);
  const win = movableWindow(dj);
  assert.ok(win.length >= 3, 'need a few movable slots');
  const ids = win.map((s) => s.id);
  const reversed = [...ids].reverse();

  const prop = dj.proposeReorder({ cycleIndex: win[0].cycleIndex, startWithin: win[0].withinCycle, ids: reversed });
  assert.equal(prop.ok, true, JSON.stringify(prop));
  assert.deepEqual(prop.doc.override.ids, reversed);

  const listener = engineAt(t, prop.doc);
  assert.equal(listener.controlStatus, 'applied');
  const firstMoved = listener.station.slotStartsAt(win[0].cycleIndex, win[0].withinCycle);
  assert.equal(listener.station.at(firstMoved + 1).track.id, reversed[0]);
});

test('"back to the station clock" while a moved track is on air leaves it on air for every listener', () => {
  const t = busyInstant();
  const dj = engineAt(t);
  const win = movableWindow(dj);
  const ids = win.map((s) => s.id);
  const rotated = [ids.at(-1), ...ids.slice(0, -1)];
  const prop = dj.proposeReorder({ cycleIndex: win[0].cycleIndex, startWithin: win[0].withinCycle, ids: rotated });
  assert.equal(prop.ok, true);

  // Later: the moved track is playing, and the DJ clears.
  const later = dj.station.slotStartsAt(win[0].cycleIndex, win[0].withinCycle) + 20_000;
  const booth = engineAt(later, prop.doc);
  assert.equal(booth.station.at(later).track.id, ids.at(-1));
  const clear = booth.proposeClear();
  assert.equal(clear.full, false);
  assert.ok(clear.until > later);
  const listener = engineAt(later, clear.doc);
  assert.equal(listener.controlStatus, 'applied');
  assert.equal(listener.station.at(later).track.id, ids.at(-1), 'the song on air did not change under anyone');
  assert.equal(Math.round(listener.station.at(later).offset), Math.round(booth.station.at(later).offset));

  // Once it has played out, clearing is complete.
  const done = engineAt(clear.until + 1_000, clear.doc).proposeClear();
  assert.equal(done.full, true);
  assert.equal(done.doc.override, null);
});

test('two listeners holding the same control document agree at every instant', () => {
  const t = busyInstant();
  const dj = engineAt(t);
  const win = movableWindow(dj);
  const ids = win.map((s) => s.id);
  const rotated = [...ids.slice(1), ids[0]];
  const prop = dj.proposeReorder({ cycleIndex: win[0].cycleIndex, startWithin: win[0].withinCycle, ids: rotated });
  assert.equal(prop.ok, true, JSON.stringify(prop));
  const { doc } = prop;

  const a = engineAt(t, doc);
  assert.equal(a.controlStatus, 'applied');
  const b = engineAt(t + 9_000, JSON.parse(JSON.stringify(doc))); // polled later, same doc
  for (let s = 0; s < 3 * 3600; s += 7) {
    const at = t + s * 1000;
    const x = a.station.at(at);
    const y = b.station.at(at);
    assert.equal(x.track.id, y.track.id, `listeners disagree ${s}s after the change`);
    assert.equal(Math.round(x.offset * 1000), Math.round(y.offset * 1000));
  }
});

test('a reorder never moves what is on air, the lock fence, or anything after its window', () => {
  const t = busyInstant();
  const before = engineAt(t);
  const win = movableWindow(before);
  const ids = win.map((s) => s.id);
  const { doc } = before.proposeReorder({ cycleIndex: win[0].cycleIndex, startWithin: win[0].withinCycle, ids: [...ids].reverse() });
  const after = engineAt(t, doc);

  const windowStart = before.station.slotStartsAt(win[0].cycleIndex, win[0].withinCycle);
  const last = win[win.length - 1];
  const windowEnd = before.station.slotStartsAt(last.cycleIndex, last.withinCycle) + before.station.get(last.id).duration * 1000;
  assert.ok(windowStart >= t + before.config.queueLockSeconds * 1000, 'window must start beyond the fence');

  for (let at = t; at < windowStart; at += 2000) {
    assert.equal(after.station.at(at).track.id, before.station.at(at).track.id, 'something inside the fence moved');
  }
  for (let at = windowEnd + 1; at < windowEnd + 6 * 3600e3; at += 60_000) {
    const x = after.station.at(at);
    const y = before.station.at(at);
    assert.equal(x.track.id, y.track.id, 'something after the window moved');
    assert.equal(Math.round(x.offset * 1000), Math.round(y.offset * 1000));
  }
});

test('the cloud refuses what the Pi refuses: inside the fence, not a permutation, across a cycle', () => {
  const t = busyInstant();
  const eng = engineAt(t);
  const q = eng.get('/api/queue').body;
  assert.equal(q.lockSeconds, 180);
  const locked = q.slots.filter((s) => s.locked);
  assert.ok(locked.length >= 1);

  const fenced = eng.proposeReorder({ cycleIndex: locked[0].cycleIndex, startWithin: locked[0].withinCycle, ids: [locked[0].id, q.slots[locked.length].id] });
  assert.equal(fenced.ok, false);
  assert.equal(fenced.error, 'too_close_to_air');

  const win = movableWindow(eng);
  const stranger = LIBRARY.tracks.find((tr) => !win.some((s) => s.id === tr.id)).id;
  const notPerm = eng.proposeReorder({ cycleIndex: win[0].cycleIndex, startWithin: win[0].withinCycle, ids: [stranger, win[1].id] });
  assert.equal(notPerm.ok, false);
  assert.equal(notPerm.error, 'not_a_permutation');

  const lastIndex = LIBRARY.tracks.length - 1;
  const across = eng.proposeReorder({ cycleIndex: win[0].cycleIndex, startWithin: lastIndex, ids: [LIBRARY.tracks[lastIndex].id, LIBRARY.tracks[0].id] });
  assert.equal(across.ok, false);
});

test('a control document from a finished cycle is ignored as stale, a foreign one is rejected', () => {
  const t = Date.parse('2026-09-26T12:00:00Z');
  const eng = engineAt(t);
  const cycle = eng.station.at(t).cycleIndex;
  eng.applyControl({ version: 1, override: { cycleIndex: cycle - 3, startWithin: 0, ids: [LIBRARY.tracks[1].id, LIBRARY.tracks[0].id] } });
  assert.equal(eng.controlStatus, 'stale');
  eng.applyControl({ version: 1, override: { cycleIndex: cycle + 1, startWithin: 0, ids: ['deadbeefdead', 'feedfacefeed'] } });
  assert.equal(eng.controlStatus, 'rejected');
  assert.equal(eng.station.queueOverride, null, 'a rejected override must not linger');
  eng.applyControl({ version: 1, override: null, look: { preset: 'stage' } });
  assert.equal(eng.controlStatus, 'none');
  assert.deepEqual(eng.look, { preset: 'stage' });
});

test('clear and look proposals keep the rest of the document', () => {
  const t = Date.parse('2026-09-26T12:00:00Z');
  const eng = engineAt(t, { version: 1, override: null, look: { preset: 'stage' }, updatedAt: null });
  const cleared = eng.proposeClear();
  assert.deepEqual(cleared.doc.look, { preset: 'stage' });
  assert.equal(cleared.doc.override, null);
  const looked = eng.proposeLook({ preset: 'frame', intensity: 0.5 });
  assert.deepEqual(looked.doc.look, { preset: 'frame', intensity: 0.5 });
});

test('the queue payload is the server\'s, plus what a cloud booth needs to know', () => {
  const t = Date.parse('2026-09-26T12:00:00Z');
  const eng = engineAt(t);
  const { body } = eng.get('/api/queue');
  const direct = queuePayload(eng.station, { now: t, config: eng.config, editable: true, urls: eng.urls });
  for (const k of Object.keys(direct)) assert.ok(k in body, `missing ${k}`);
  assert.equal(body.mode, 'cloud');
  assert.equal(body.slots.length, 12);
  assert.equal(body.controlStatus, 'none');
});
