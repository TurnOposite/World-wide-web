/**
 * The control plane — the one piece of shared state the static site has.
 *
 * GitHub is faked at the fetch boundary, so these tests pin exactly what the
 * booth sends and how it reads the answer: ETags (a 304 must not count as a
 * change, and must not re-render every listener every 20 s), the sha a
 * contents PUT needs, one retry on a concurrent edit, a clear message for a
 * bad token, and the Pages copy as the fallback when the API says no.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { GitHubControl, LocalControl, StaticControl, ArtifactControl, b64encode, b64decode } from '../site/js/engine/control.js';
import { routeFromHash } from '../site/js/router.js';
import { toArtifactPage } from '../scripts/site-preview.mjs';
import { skewFromDateHeader, towerAllowed, towerUrls } from '../site/js/engine/transport.js';
import { safeLink } from '../site/js/pages/atlas.js';

const json = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (k) => headers[k] ?? headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

function fakeGitHub({ doc = { version: 1, override: null, look: null } } = {}) {
  const state = { sha: 'sha-1', content: JSON.stringify(doc), etag: '"e1"', puts: [], conflictsLeft: 0, status: null };
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (state.status) return json(state.status, { message: 'nope' });
    if ((opts.method || 'GET') === 'GET') {
      if (opts.headers?.['If-None-Match'] === state.etag) return json(304, null, { ETag: state.etag });
      return json(200, { sha: state.sha, content: b64encode(state.content), encoding: 'base64' }, { ETag: state.etag });
    }
    const body = JSON.parse(opts.body);
    state.puts.push(body);
    if (state.conflictsLeft > 0) { state.conflictsLeft--; state.sha = 'sha-other'; state.etag = '"e-other"'; return json(409, { message: 'conflict' }); }
    if (body.sha !== state.sha) return json(409, { message: 'sha mismatch' });
    state.content = b64decode(body.content);
    state.sha = `sha-${state.puts.length + 1}`;
    state.etag = `"e${state.puts.length + 1}"`;
    return json(200, { content: { sha: state.sha }, commit: { sha: 'c0ffee' } });
  };
  return { state, calls, fetchImpl };
}

test('base64 round-trips the library\'s real titles (思い出の森, ◓, é)', () => {
  const s = JSON.stringify({ t: 'snowpoint lounge - 思い出の森 · silph skyline ◓ · Coração sertão' });
  assert.equal(b64decode(b64encode(s)), s);
});

test('GitHub read: the first read is a change, a 304 afterwards is not', async () => {
  const gh = fakeGitHub({ doc: { version: 1, override: null, look: { preset: 'stage' } } });
  const plane = new GitHubControl({ owner: 'ortis', repo: 'radio-tower', fetchImpl: gh.fetchImpl });
  const first = await plane.read();
  assert.equal(first.changed, true);
  assert.deepEqual(first.doc.look, { preset: 'stage' });
  assert.match(gh.calls[0].url, /\/repos\/ortis\/radio-tower\/contents\/site\/station\/control\.json\?ref=main$/);

  const second = await plane.read();
  assert.equal(second.changed, false);
  assert.equal(gh.calls[1].opts.headers['If-None-Match'], '"e1"');
  assert.equal(plane.writable, false, 'no token, no writes');
});

test('GitHub read falls back to the Pages copy when the API refuses (rate limit, private repo)', async () => {
  const gh = fakeGitHub();
  gh.state.status = 403;
  const pagesDoc = { version: 1, override: null, look: { preset: 'frame' } };
  const fetchImpl = async (url, opts) => (String(url).startsWith('https://ortis.github.io') ? json(200, pagesDoc) : gh.fetchImpl(url, opts));
  const plane = new GitHubControl({ owner: 'ortis', repo: 'radio-tower', fetchImpl, fallbackUrl: 'https://ortis.github.io/radio-tower/station/control.json' });
  const { doc } = await plane.read();
  assert.deepEqual(doc.look, { preset: 'frame' });
});

test('GitHub write commits the whole document with the sha it read, on the right branch', async () => {
  const gh = fakeGitHub();
  const plane = new GitHubControl({ owner: 'ortis', repo: 'radio-tower', token: 'github_pat_x', fetchImpl: gh.fetchImpl });
  const doc = { version: 1, override: { cycleIndex: 9, startWithin: 3, ids: ['a', 'b'] }, look: null };
  const out = await plane.write(doc, { message: 'booth: test' });
  assert.equal(out.commit, 'c0ffee');
  const put = gh.state.puts.at(-1);
  assert.equal(put.sha, 'sha-1');
  assert.equal(put.branch, 'main');
  assert.equal(put.message, 'booth: test');
  assert.deepEqual(JSON.parse(b64decode(put.content)), doc);
  const putCall = gh.calls.find((c) => c.opts.method === 'PUT');
  assert.equal(putCall.opts.headers.Authorization, 'Bearer github_pat_x');
});

test('GitHub write survives one concurrent edit by re-reading the sha', async () => {
  const gh = fakeGitHub();
  gh.state.conflictsLeft = 1;
  const plane = new GitHubControl({ owner: 'o', repo: 'r', token: 't', fetchImpl: gh.fetchImpl });
  await plane.read();
  await plane.write({ version: 1, override: null, look: { preset: 'bands' } });
  assert.equal(gh.state.puts.length, 2);
  assert.equal(gh.state.puts[1].sha, 'sha-other', 'the retry must use the fresh sha');
  assert.deepEqual(JSON.parse(gh.state.content).look, { preset: 'bands' });
});

test('a poll that started before the DJ saved cannot put the old queue back', async () => {
  const gh = fakeGitHub({ doc: { version: 1, override: null, look: null } });
  let release;
  const gate = new Promise((r) => { release = r; });
  let slowNext = false;
  const fetchImpl = async (url, opts = {}) => {
    if (slowNext && (opts.method || 'GET') === 'GET') {
      slowNext = false;
      const answer = await gh.fetchImpl(url, opts); // the document as it was *before* the save
      await gate;
      return answer;
    }
    return gh.fetchImpl(url, opts);
  };
  const plane = new GitHubControl({ owner: 'o', repo: 'r', token: 't', fetchImpl });
  await plane.read();
  await plane.write({ version: 1, override: null, look: { look: 'stage' } }); // an earlier save: no ETag held now
  slowNext = true;
  const polling = plane.read(); // a poll, in flight, will answer with that earlier document
  const reorder = { version: 1, override: { cycleIndex: 3, startWithin: 2, ids: ['a', 'b'] }, look: null };
  await plane.write(reorder);   // the DJ saves again meanwhile
  release();
  const late = await polling;
  assert.deepEqual(late.doc.override, reorder.override, 'the late answer is ignored');
  assert.equal(late.changed, false);
  // …and the next save still carries the reorder, on the right sha.
  await plane.write({ ...reorder, look: { look: 'quiet' } });
  const saved = JSON.parse(gh.state.content);
  assert.deepEqual(saved.override, reorder.override);
  assert.deepEqual(saved.look, { look: 'quiet' });
});

test('a listener without a token asks the API at most every 90 s, reads the Pages copy between, and backs off when limited', async () => {
  const gh = fakeGitHub({ doc: { version: 1, override: null, look: null, updatedAt: '2026-09-27T10:00:00Z' } });
  let pagesDoc = { version: 1, override: null, look: null, updatedAt: '2026-09-27T10:00:00Z' };
  let apiCalls = 0;
  let limitedUntil = 0;
  let t = Date.parse('2026-09-27T10:00:00Z');
  const fetchImpl = async (url, opts) => {
    if (String(url).startsWith('https://ortis.github.io')) return json(200, pagesDoc);
    apiCalls++;
    if (t < limitedUntil) return json(403, { message: 'rate limit' }, { 'X-RateLimit-Reset': String(Math.floor(limitedUntil / 1000)), 'X-RateLimit-Remaining': '0' });
    return gh.fetchImpl(url, opts);
  };
  const plane = new GitHubControl({ owner: 'o', repo: 'r', fetchImpl, fallbackUrl: 'https://ortis.github.io/radio-tower/station/control.json', now: () => t });
  await plane.read();
  assert.equal(apiCalls, 1);
  for (let i = 0; i < 4; i++) { t += 20_000; await plane.read(); }
  assert.equal(apiCalls, 1, 'no API call within 90 s: the Pages copy answers');

  // The DJ committed; Pages deployed it before the next API turn: the newer document wins.
  pagesDoc = { version: 1, override: { cycleIndex: 2, startWithin: 1, ids: ['a', 'b'] }, look: null, updatedAt: '2026-09-27T10:01:30Z' };
  gh.state.content = JSON.stringify(pagesDoc); gh.state.sha = 'sha-dj'; gh.state.etag = '"e-dj"';
  t += 5_000;
  const seen = await plane.read();
  assert.equal(seen.changed, true);
  assert.deepEqual(seen.doc.override.ids, ['a', 'b']);
  // The API agrees at its next turn: no change reported twice.
  t += 90_000;
  const again = await plane.read();
  assert.equal(apiCalls, 2);
  assert.deepEqual(again.doc.override?.ids, ['a', 'b']);
  assert.equal(again.changed, false);

  // Rate-limited: silence from the API until the reset, the Pages copy meanwhile.
  limitedUntil = t + 30 * 60_000;
  t += 90_000;
  await plane.read();
  const calls = apiCalls;
  for (let i = 0; i < 10; i++) { t += 60_000; await plane.read(); }
  assert.equal(apiCalls, calls, 'no API calls while limited');
  t = limitedUntil + 1;
  await plane.read();
  assert.equal(apiCalls, calls + 1, 'asks again after the reset');
});

test('a revert on github.com reaches tabs already open, and a stale Pages copy does not flip it back', async () => {
  const dj = { version: 1, override: { cycleIndex: 2, startWithin: 1, ids: ['a', 'b'] }, look: null, updatedAt: '2026-09-27T10:05:00Z' };
  const gh = fakeGitHub({ doc: dj });
  const pagesDoc = dj; // Pages has not redeployed the revert yet
  let t = Date.parse('2026-09-27T10:06:00Z');
  const fetchImpl = async (url, opts) => (String(url).startsWith('https://ortis.github.io') ? json(200, pagesDoc) : gh.fetchImpl(url, opts));
  const plane = new GitHubControl({ owner: 'o', repo: 'r', fetchImpl, fallbackUrl: 'https://ortis.github.io/radio-tower/station/control.json', now: () => t });
  await plane.read();
  t += 20_000; await plane.read(); // the Pages copy, same as the repo
  // "Revert" on github.com: the older document, with its older date, is back.
  gh.state.content = JSON.stringify({ version: 1, override: null, look: null, updatedAt: '2026-09-27T09:00:00Z' });
  gh.state.sha = 'sha-revert'; gh.state.etag = '"e-revert"';
  t += 90_000;
  const r = await plane.read();
  assert.equal(r.changed, true);
  assert.equal(r.doc.override, null, 'the repository is the authority');
  for (let i = 0; i < 3; i++) {
    t += 20_000;
    const p = await plane.read(); // the stale Pages copy still says `dj`
    assert.equal(p.doc.override, null, 'no flip-flop while Pages catches up');
  }
});

test('the DJ, with a token, asks the API on every read', async () => {
  const gh = fakeGitHub();
  let apiCalls = 0;
  const fetchImpl = async (url, opts) => { if (!String(url).startsWith('https://ortis.github.io')) apiCalls++; return String(url).startsWith('https://ortis.github.io') ? json(200, {}) : gh.fetchImpl(url, opts); };
  const plane = new GitHubControl({ owner: 'o', repo: 'r', token: 't', fetchImpl, fallbackUrl: 'https://ortis.github.io/x/station/control.json' });
  for (let i = 0; i < 3; i++) await plane.read();
  assert.equal(apiCalls, 3);
});

test('GitHub write: no token and a refused token both say what to do', async () => {
  const gh = fakeGitHub();
  const anon = new GitHubControl({ owner: 'o', repo: 'r', fetchImpl: gh.fetchImpl });
  await assert.rejects(anon.write({}), (e) => e.code === 'no_token');

  const bad = new GitHubControl({ owner: 'o', repo: 'r', token: 'wrong', fetchImpl: async (u, o = {}) => (o.method === 'PUT' ? json(401, {}) : gh.fetchImpl(u, o)) });
  await assert.rejects(bad.write({}), (e) => e.code === 'bad_token' && /Contents: read & write/.test(e.message));
});

test('the static plane is read-only and busts caches', async () => {
  const seen = [];
  const plane = new StaticControl('https://ortis.github.io/radio-tower/station/control.json', {
    fetchImpl: async (u, o) => { seen.push({ u, o }); return json(200, { version: 1, override: null }); },
  });
  await plane.read();
  assert.match(seen[0].u, /\?t=\d+$/);
  assert.equal(seen[0].o.cache, 'no-store');
  await assert.rejects(plane.write({}), (e) => e.code === 'read_only');
});

test('the local plane reports a change once per write', async () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const plane = new LocalControl({ storage, channelName: `t-${Math.random()}` });
  const a = await plane.read();
  assert.equal(a.doc.override, null);
  await plane.write({ version: 1, override: { cycleIndex: 1, startWithin: 2, ids: ['x', 'y'] } });
  assert.equal((await plane.read()).changed, true);
  assert.equal((await plane.read()).changed, false);
  plane.channel?.close();
});

test('clock skew from the Date header: a phone 60 s slow is corrected, sub-second noise is not', async () => {
  const mk = (offsetMs) => async () => ({ headers: { get: () => new Date(Date.now() + offsetMs).toUTCString() } });
  const big = await skewFromDateHeader('https://x/station/library.json', { fetchImpl: mk(60_000) });
  assert.ok(Math.abs(big - 60_000) < 1500, `expected ~60000, got ${big}`);
  const small = await skewFromDateHeader('https://x/station/library.json', { fetchImpl: mk(300) });
  assert.equal(small, 0);
  const broken = await skewFromDateHeader('https://x/', { fetchImpl: async () => ({ headers: { get: () => null } }) });
  assert.equal(broken, 0);
});

test('?tower= only tunes to a station this site trusts', () => {
  const here = 'https://ortis.github.io';
  const cfg = { tower: { url: '', allowed: ['https://radio.example.com'] } };
  assert.equal(towerAllowed('https://radio.example.com', cfg, here), true);
  assert.equal(towerAllowed('https://radio.example.com/', cfg, here), true);
  assert.equal(towerAllowed('https://ortis.github.io', cfg, here), true, 'same origin');
  assert.equal(towerAllowed('http://127.0.0.1:8080', cfg, here), true, 'this computer');
  assert.equal(towerAllowed('http://localhost:8080', cfg, here), true);
  assert.equal(towerAllowed('https://evil.example', cfg, here), false);
  assert.equal(towerAllowed('https://radio.example.com.evil.example', cfg, here), false);
  assert.equal(towerAllowed('javascript:alert(1)', cfg, here), false);
  assert.equal(towerAllowed('not a url', cfg, here), false);
});

test('an atlas dossier links only to site paths or https', () => {
  assert.equal(safeLink('portfolio/library'), 'portfolio/library');
  assert.equal(safeLink('https://example.com/x'), 'https://example.com/x');
  assert.equal(safeLink('javascript:alert(1)'), null);
  assert.equal(safeLink('data:text/html,x'), null);
  assert.equal(safeLink(''), null);
});

/* ---------------------------------------------- the claude.ai preview --- */

function fakeDb({ refuse = null } = {}) {
  const store = new Map();
  const subs = new Map();
  let writes = 0;
  const snap = (p) => Object.freeze({ id: p, exists: store.has(p), data: () => (store.has(p) ? Object.freeze(JSON.parse(store.get(p))) : undefined) });
  return {
    get writes() { return writes; },
    remote(p, doc) { store.set(p, JSON.stringify(doc)); (subs.get(p) || []).forEach((fn) => fn(snap(p))); },
    doc(p) {
      if (p.split('/').length % 2) throw new TypeError('odd path');
      return {
        get: async () => snap(p),
        set: async (data) => {
          if (refuse) throw { code: refuse, message: 'no' };
          writes++;
          store.set(p, JSON.stringify(data));
          (subs.get(p) || []).forEach((fn) => fn(snap(p)));
        },
        onSnapshot(next) { subs.set(p, [...(subs.get(p) || []), next]); queueMicrotask(() => next(snap(p))); return () => {}; },
      };
    },
  };
}
const memLocal = () => {
  const mem = new Map();
  return new LocalControl({ storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }, channelName: `t-${Math.random()}` });
};
const tick = () => new Promise((r) => setTimeout(r, 5));

test('preview plane: until the database answers, it is this browser; then it is shared and live', async () => {
  let answer;
  const db = fakeDb();
  const local = memLocal();
  const plane = new ArtifactControl({ dbPromise: new Promise((r) => { answer = r; }), local });
  assert.equal(plane.kind, 'local');
  assert.equal((await plane.read()).doc.override, null, 'the radio starts without waiting');
  let heard = 0;
  plane.onChange(() => heard++);
  answer(db);
  await tick();
  assert.equal(plane.kind, 'artifact');
  const first = await plane.read();
  assert.equal(first.changed, true);

  db.remote('station/control', { version: 1, override: { cycleIndex: 3, startWithin: 2, ids: ['a', 'b'] }, look: null });
  assert.ok(heard >= 2, 'another viewer\'s write is heard without a poll');
  const next = await plane.read();
  assert.equal(next.changed, true);
  assert.deepEqual(next.doc.override.ids, ['a', 'b']);
  next.doc.override.ids.push('mutated');
  assert.equal(Object.isFrozen(next.doc), false, 'the engine gets its own copy, not the frozen snapshot');
  assert.equal((await plane.read()).changed, false, 'no news is not a change');
  local.channel?.close();
});

test('preview plane: a write goes to the shared document, and its echo is not news', async () => {
  const db = fakeDb();
  const local = memLocal();
  const plane = new ArtifactControl({ dbPromise: Promise.resolve(db), local });
  await tick();
  await plane.read();
  const doc = { version: 1, override: { cycleIndex: 1, startWithin: 2, ids: ['x', 'y'] }, look: null, updatedAt: 't' };
  await plane.write(doc);
  assert.equal(db.writes, 1);
  assert.equal((await plane.read()).changed, false);
  assert.equal((await local.read()).doc.override, null, 'nothing went to this browser\'s own copy');
  local.channel?.close();
});

test('preview plane: a viewer below Contributor gets a clear no, then a read-only booth', async () => {
  const local = memLocal();
  const plane = new ArtifactControl({ dbPromise: Promise.resolve(fakeDb({ refuse: 'invalid_argument' })), local });
  await tick();
  assert.equal(plane.writable, true, 'writable until the platform says otherwise');
  await assert.rejects(plane.write({ version: 1 }), (e) => e.code === 'view_only' && /view-only/.test(e.message));
  assert.equal(plane.writable, false);
  local.channel?.close();
});

test('preview plane: on any other host (no database) it is this browser only', async () => {
  const local = memLocal();
  const plane = new ArtifactControl({ dbPromise: Promise.resolve(null), local });
  await tick();
  assert.equal(plane.kind, 'local');
  await plane.write({ version: 1, override: null, look: { look: 'quiet' } });
  assert.deepEqual((await local.read()).doc.look, { look: 'quiet' });
  local.channel?.close();
});

test('hash routes: #/ecrits/voyages is a route, #view is an anchor', () => {
  assert.equal(routeFromHash(''), '');
  assert.equal(routeFromHash('#/'), '');
  assert.equal(routeFromHash('#/radio'), 'radio');
  assert.equal(routeFromHash('#/ecrits/voyages/'), 'ecrits/voyages');
  assert.equal(routeFromHash('#/ecrits/l%27ascenceur'), "ecrits/l'ascenceur");
  assert.equal(routeFromHash('#view'), null);
  assert.equal(routeFromHash('#book=thesis'), null);
});

test('the preview page is page content: the host adds the document around it', () => {
  const page = toArtifactPage('<!DOCTYPE html>\n<html lang="fr"><head><base href="/"><title>x</title><link rel="stylesheet" href="css/site.css"></head>\n<body>\n<main id="view"></main>\n<script type="module" src="js/main.js"></script>\n</body></html>');
  assert.ok(page.startsWith('<title>Globe Trotter</title>'));
  assert.match(page, /<link rel="stylesheet" href="css\/site.css">/);
  assert.match(page, /<script type="module" src="js\/main.js"><\/script>/);
  assert.doesNotMatch(page, /<!doctype|<html|<head|<body|<base/i);
});

test('a tower on another origin: its covers and streams are fetched from the tower, not the website', () => {
  const tower = 'https://129-151-227-129.sslip.io';
  const body = {
    onAir: { id: 'a', artUrl: '/api/track/a/art', streamUrl: '/api/track/a/stream' },
    upNext: [{ id: 'b', artUrl: null }, { id: 'c', artUrl: '/api/track/c/art' }],
    library: { items: [{ artUrl: 'https://cdn.example/c.jpg' }, { artUrl: '//cdn.example/d.jpg' }] },
    title: '/not-a-url-field',
  };
  const out = towerUrls(body, tower);
  assert.equal(out.onAir.artUrl, `${tower}/api/track/a/art`);
  assert.equal(out.onAir.streamUrl, `${tower}/api/track/a/stream`);
  assert.equal(out.upNext[0].artUrl, null);
  assert.equal(out.upNext[1].artUrl, `${tower}/api/track/c/art`);
  assert.equal(out.library.items[0].artUrl, 'https://cdn.example/c.jpg', 'absolute urls untouched');
  assert.equal(out.library.items[1].artUrl, '//cdn.example/d.jpg');
  assert.equal(out.title, '/not-a-url-field', 'only …Url fields');
  assert.equal(towerUrls(body, ''), body, 'same origin: nothing to do');
});
