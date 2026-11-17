/**
 * Every door of the tower's API, from the router itself (docs/TESTS-REVIEW.md, section 2).
 *
 * Before 2026-11-17 a new keyed route was safe only if its author remembered to test it, and « no filesystem path
 * leaves the tower » was checked on the endpoints someone thought of. Here the list of routes is read from the
 * router, and every route must be named below as OPEN or KEYED — a new one fails this file until it is placed.
 *
 * What must hold:
 *   - every KEYED route refuses no key and a wrong key (401), and opens with the right one (whatever it then
 *     answers, it is no longer the key's refusal);
 *   - every wrong key, on any keyed route, draws on one budget per address: twenty, then refused before the key is
 *     compared — so no route is a cheaper way to guess;
 *   - no answer, open or keyed, carries a path on the tower's disk, a file name, or a `relPath`. Two keyed
 *     exceptions, the station's own: /status says where the music is (the booth's doctor compares it), and the
 *     library manifest names files, relative to the library. The walk found /health telling anyone where the
 *     music was on the tower's disk (2026-11-17); it moved to /status.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { silentMp3 } from './helpers/audio.js';

const music = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-routes-'));
await silentMp3(path.join(music, 'Haze Crate', 'Door Tester - First Light.mp3'), 40);
await silentMp3(path.join(music, 'Haze Crate', 'Door Tester - Second Wind.mp3'), 35);
await silentMp3(path.join(music, 'Zone', 'Other Act - Third Rail.mp3'), 30);

const KEY = 'right-key-0123456789';
Object.assign(process.env, {
  MUSIC_DIR: music,
  CACHE_FILE: path.join(music, '.cache', 'l.json'),
  TELEGRAPH_LOG: path.join(music, '.line', 'telegraph.jsonl'),
  AUTO_RESCAN_MINUTES: '0',
  STATION_KEY: KEY,
  ALLOW_UPLOADS: '1',
});

/**
 * The table. OPEN: anyone. KEYED: the station key or a 401. A route that is in neither, or a name here that the
 * router no longer has, fails the first test: place it, on purpose.
 */
const OPEN = [
  'GET /collections', 'GET /time', 'GET /health', 'GET /channels', 'GET /station', 'GET /schedule', 'GET /library',
  'GET /track/:id/stream', 'GET /track/:id/art', 'GET /queue', 'GET /telegraph',
  // Anyone may write on the line; a key sent along is checked (the host's messages), tested below.
  'POST /telegraph',
  // Taking a subscription back only ever removes, and answers the same whether it was known.
  'POST /telegraph/unsubscribe',
];
const KEYED = [
  'POST /key', 'POST /queue/reorder', 'POST /queue/clear',
  'POST /telegraph/subscribe', 'POST /telegraph/remove', 'GET /telegraph/log', 'POST /telegraph/restore', 'POST /telegraph/unmute',
  'GET /status', 'POST /rescan', 'GET /library/manifest', 'PUT /library/file',
];

const { createApp, rescan } = await import('../server/index.js');
await rescan({ useCache: false });

/** Every route the app's /api router answers, as « METHOD /path ». */
function routesOf(app) {
  const out = [];
  for (const layer of app._router.stack) {
    for (const inner of layer.handle?.stack || []) {
      if (!inner.route) continue;
      for (const m of Object.keys(inner.route.methods)) if (m !== '_all') out.push(`${m.toUpperCase()} ${inner.route.path}`);
    }
  }
  return out;
}

// The budgets on a stopped clock, as in ratelimit.test: the count of wrong keys is exact.
let t = 1_000_000;
const app = createApp({ now: () => t });
let server;
let base;
test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));

// Caddy, on loopback, says who the client is: a new address for each check keeps one check's wrong keys out of the next.
let lastIp = 0;
const freshIp = () => `198.51.100.${++lastIp}`;
let trackId;
async function call(route, { key, ip = freshIp(), body = {} } = {}) {
  const [method, p] = route.split(' ');
  if (!trackId) trackId = (await (await fetch(`${base}/api/library`)).json()).items[0].id;
  const headers = { 'X-Forwarded-For': ip };
  if (key !== undefined) headers['X-Station-Key'] = key;
  const init = { method, headers };
  if (method === 'POST') { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  if (method === 'PUT') { headers['Content-Type'] = 'application/octet-stream'; init.body = ''; }
  return fetch(base + '/api' + p.replace(':id', trackId), init);
}

test('every route of the API is placed: open, or behind the key', () => {
  const routes = routesOf(app);
  assert.ok(routes.length >= 20, `${routes.length} routes read from the router`);
  const unplaced = routes.filter((r) => !OPEN.includes(r) && !KEYED.includes(r));
  assert.deepEqual(unplaced, [], 'a route that is in neither list: add it to OPEN or KEYED in tests/routes.test.js');
  const gone = [...OPEN, ...KEYED].filter((r) => !routes.includes(r));
  assert.deepEqual(gone, [], 'named here, gone from the router');
  assert.deepEqual(OPEN.filter((r) => KEYED.includes(r)), [], 'in both lists');
});

test('every keyed route: no key, a wrong key → 401; the right key opens it', async () => {
  for (const route of KEYED) {
    const none = await call(route);
    assert.equal(none.status, 401, `${route} with no key`);
    assert.equal((await none.json()).error, 'bad_key', route);
    const wrong = await call(route, { key: 'wrong-key-0123456789' });
    assert.equal(wrong.status, 401, `${route} with a wrong key`);
    const right = await call(route, { key: KEY });
    assert.ok(![401, 429, 503].includes(right.status), `${route} with the right key: ${right.status} ${await right.text()}`);
  }
});

test('a key sent to an open route is checked too: a wrong one on the line is refused, not posted as anyone', async () => {
  const r = await call('POST /telegraph', { key: 'wrong-key-0123456789', body: { name: 'x', text: 'a host message?' } });
  assert.equal(r.status, 401);
});

test('wrong keys share one budget across every keyed route: twenty, then refused before the key is compared', async () => {
  const ip = freshIp();
  const codes = [];
  for (let i = 0; i < 20; i++) codes.push((await call(KEYED[i % KEYED.length], { key: `wrong-${i}`, ip })).status);
  assert.deepEqual(codes, Array(20).fill(401));
  for (const route of KEYED) {
    const r = await call(route, { key: KEY, ip });
    assert.equal(r.status, 429, `${route}: locked out, even with the right key`);
    assert.equal(r.headers.get('retry-after'), '30');
  }
  t += 30_000;
  assert.equal((await call('POST /key', { key: KEY, ip })).status, 200, 'half a minute later, one more try');
});

test('no answer carries a path on the tower\'s disk, a file name or a relPath', async () => {
  // Every form the library's place on disk could take in a JSON answer.
  const where = [music, music.replaceAll('\\', '/'), JSON.stringify(music).slice(1, -1), os.tmpdir(), JSON.stringify(os.tmpdir()).slice(1, -1)];
  const files = ['Door Tester - First Light.mp3', 'Second Wind.mp3', 'Third Rail.mp3', 'Haze Crate/', 'telegraph.jsonl'];
  const leaks = [];
  const look = async (route, r, { namesAllowed = false, pathAllowed = false } = {}) => {
    assert.ok(r.status < 500, `${route}: ${r.status}`);
    const type = r.headers.get('content-type') || '';
    const head = [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\n');
    const text = /json|text|csv/.test(type) ? await r.text() : '';
    if (!pathAllowed) for (const s of where) if ((text + head).includes(s)) leaks.push(`${route}: the path ${s}`);
    if (namesAllowed) return;
    for (const s of files) if ((text + head).includes(s)) leaks.push(`${route}: the file ${s}`);
    if (/relPath|"abs"|"fullPath"/.test(text)) leaks.push(`${route}: a path field`);
  };
  for (const route of OPEN) await look(route, await call(route));
  for (const route of KEYED) await look(route, await call(route, { key: KEY }), { namesAllowed: route === 'GET /library/manifest', pathAllowed: route === 'GET /status' });
  // The same with what a listener's page asks for.
  for (const q of ['/station?channel=all', '/schedule?channel=all&hours=2', '/queue?channel=all', '/library?channel=all']) {
    await look(`GET ${q}`, await fetch(`${base}/api${q}`, { headers: { 'X-Forwarded-For': freshIp() } }));
  }
  assert.deepEqual(leaks, []);
});

test('the station, with its key, still sees where its music is', async () => {
  assert.equal((await (await call('GET /status', { key: KEY })).json()).musicDir, music);
  assert.equal((await (await call('GET /health')).json()).musicDir, undefined);
});

test('the manifest names files only relative to the library', async () => {
  const body = await (await call('GET /library/manifest', { key: KEY })).json();
  assert.ok(body.files.length >= 3);
  for (const f of body.files) assert.ok(!path.isAbsolute(f.path) && !f.path.includes('..') && !f.path.includes('\\'), f.path);
});
