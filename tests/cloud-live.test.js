/**
 * scripts/cloud-live-check.mjs — the one command that checks the published
 * site from outside. Faked at the fetch boundary: these tests pin what it
 * calls a failure and what it tells Ortis to do about it, since the day it
 * runs for real is the day nobody wants to debug the checker.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { liveCheck, checkAudio } from '../scripts/cloud-live-check.mjs';

const SITE = 'https://ortis.github.io/radio-tower/';
const ORIGIN = 'https://ortis.github.io';

const res = (status, body = '', headers = {}) => {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get: (k) => h[k.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  };
};

const library = {
  epoch: '2026-01-01T00:00:00Z',
  tracks: [
    { id: 'aaaaaaaaaaaa', title: 'One', duration: 100, sources: ['https://static.wixstatic.com/mp3/one.mp3'] },
    { id: 'bbbbbbbbbbbb', title: 'Two', duration: 120, sources: ['https://static.wixstatic.com/mp3/two.mp3', 'https://r2.example/two.mp3'] },
  ],
};

function world({ audio = {}, base = '/radio-tower/', github = { owner: 'ortis', repo: 'radio-tower' }, api = 200 } = {}) {
  const seen = [];
  const fetchImpl = async (url, opts = {}) => {
    seen.push({ url, opts });
    const u = String(url);
    if (u === SITE) return res(200, `<base href="${base}"><meta property="og:image" content="${SITE}assets/share-card.jpg">`, { 'Content-Type': 'text/html' });
    if (u === `${SITE}atlas`) return res(200, '<html>', { 'Content-Type': 'text/html' });
    if (u.endsWith('share-card.jpg')) return res(200, '', { 'Content-Type': 'image/jpeg' });
    if (u.endsWith('config.json')) return res(200, { github });
    if (u.endsWith('library.json')) return res(200, library);
    if (u.endsWith('control.json') && u.startsWith(SITE)) return res(200, '{"version":1,"override":null}');
    if (u.startsWith('https://api.github.com/')) return res(api, {}, { 'X-RateLimit-Remaining': '57' });
    if (u.endsWith('.mp3')) {
      const a = audio[u] || { status: 206, cors: '*' };
      return res(a.status, '', { 'Content-Type': 'audio/mpeg', ...(a.cors ? { 'Access-Control-Allow-Origin': a.cors } : {}) });
    }
    return res(404);
  };
  return { fetchImpl, seen };
}

const levels = (rs) => Object.fromEntries(rs.map((r) => [r.name, r.level]));

test('a healthy site passes every check, and the audio is asked for like a browser asks', async () => {
  const w = world();
  const rs = await liveCheck(SITE, { fetchImpl: w.fetchImpl });
  assert.deepEqual(rs.filter((r) => r.level !== 'PASS'), []);
  const mp3 = w.seen.find((s) => String(s.url).endsWith('one.mp3'));
  assert.equal(mp3.opts.headers.Range, 'bytes=0-1');
  assert.equal(mp3.opts.headers.Origin, ORIGIN);
  assert.ok(w.seen.every((s) => !s.opts.method || s.opts.method === 'GET'), 'it only ever reads');
});

test('Wix refusing the audio is a failure that points at the bandwidth', async () => {
  const w = world({ audio: { 'https://static.wixstatic.com/mp3/one.mp3': { status: 403 } } });
  const rs = await liveCheck(SITE, { fetchImpl: w.fetchImpl });
  const audio = rs.find((r) => /audio/.test(r.name));
  assert.equal(audio.level, 'FAIL');
  assert.match(audio.detail, /1\/2 play/);
  assert.match(audio.fix, /bandwidth|Media/i);
});

test('a track with a working second copy still plays', async () => {
  const w = world({ audio: { 'https://static.wixstatic.com/mp3/two.mp3': { status: 403 } } });
  const rs = await liveCheck(SITE, { fetchImpl: w.fetchImpl });
  assert.equal(levels(rs)["every track's audio loads in a browser"], 'PASS');
});

test('audio without a CORS header fails — the player asks with crossorigin', async () => {
  const r = await checkAudio(async () => res(206, '', { 'Content-Type': 'audio/mpeg' }), 'https://x/a.mp3', ORIGIN);
  assert.equal(r.ok, false);
  assert.match(r.why, /CORS/);
  const other = await checkAudio(async () => res(206, '', { 'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': 'https://elsewhere.example' }), 'https://x/a.mp3', ORIGIN);
  assert.equal(other.ok, false, 'a CORS header for another site is no CORS header');
  const noRange = await checkAudio(async () => res(200, '', { 'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': '*' }), 'https://x/a.mp3', ORIGIN);
  assert.equal(noRange.ok, true);
  assert.match(noRange.warn, /byte ranges/);
});

test('a site built for the wrong path, and a private repository, each say what to do', async () => {
  const rs = await liveCheck(SITE, { fetchImpl: world({ base: '/', api: 404 }).fetchImpl });
  const l = levels(rs);
  assert.equal(l['the site knows where it lives'], 'FAIL');
  assert.equal(l['listeners can read the queue through GitHub'], 'WARN');
  assert.match(rs.find((r) => r.name.startsWith('listeners')).fix, /private/);
});

test('no repository in config.json is a warning: the site plays, the booth is read-only', async () => {
  const rs = await liveCheck(SITE, { fetchImpl: world({ github: { owner: '', repo: '' } }).fetchImpl });
  assert.equal(levels(rs)['the booth knows its repository'], 'WARN');
  assert.equal(rs.filter((r) => r.level === 'FAIL').length, 0);
});
