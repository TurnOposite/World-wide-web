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

import { GitHubControl, LocalControl, StaticControl, b64encode, b64decode } from '../site/js/engine/control.js';
import { skewFromDateHeader, towerAllowed } from '../site/js/engine/transport.js';
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
