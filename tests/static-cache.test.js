/**
 * The cache policy on `public/`.
 *
 * Why this file exists: `express.static` was configured with `maxAge: '1h'`,
 * which put `Cache-Control: public, max-age=3600` on every ES module and
 * stylesheet the player loads. A returning listener therefore kept running
 * whatever JavaScript they had first cached, for an hour at a time, with no
 * signal that anything was wrong — and, because the module map is populated
 * from that same cache, `await import('/viz.js')` could return a *different,
 * older* module than `fetch('/viz.js', {cache:'no-store'})` returned in the
 * same page. Two correct deploys were mistaken for silent failures before
 * that was worked out live (docs/HANDOFF-2026-08-20.md).
 *
 * The rule these tests pin: **anything the browser executes revalidates;
 * only /assets/ may be held without asking.** Getting this wrong is invisible
 * in every other test in this suite — the server serves the right bytes
 * either way — so it is asserted directly on the response headers.
 *
 * No ffmpeg, no music, no station state: this is purely about headers, so it
 * runs everywhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http, { createServer } from 'node:http';

process.env.MUSIC_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-cache-'));
process.env.CACHE_FILE = path.join(process.env.MUSIC_DIR, '.cache', 'library.json');

const { createApp } = await import('../server/index.js');

const server = createServer(createApp());
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => server.close());

/** Every path here is something the browser parses and runs. */
const EXECUTABLE = [
  '/', '/index.html', '/app.js', '/viz.js', '/backdrops.js', '/styles.css', '/schedule.html',
  // The rooms added 2026-09-23 (Library, Photos, Crates) follow the same rule.
  '/library.html', '/library.js', '/photos.html', '/photos.js', '/crates.html', '/crates.js', '/collections.css', '/sitenav.js',
];

for (const url of EXECUTABLE) {
  test(`${url} is served no-cache so a deploy actually reaches a returning listener`, async () => {
    const res = await fetch(base + url);
    assert.equal(res.status, 200, `${url} should be served`);
    const cc = res.headers.get('cache-control') ?? '';
    assert.match(cc, /no-cache/, `${url} sent "${cc}" — a returning listener would run stale code`);
    assert.doesNotMatch(cc, /max-age=(?!0)\d+/, `${url} sent "${cc}" — a non-zero max-age is the bug this test exists for`);
  });
}

/**
 * Deliberately node:http and not fetch(). Node's fetch (undici) applies its
 * own client-side cache semantics to a conditional request and answers 200
 * from its side of the wire, which hides the server's 304 and makes this test
 * fail against a server that is behaving correctly. A raw request is both the
 * honest thing to measure and closer to what a browser actually sends.
 */
const request = (headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: server.address().port, path: '/app.js', headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
  });

test('no-cache still means "keep it, but ask" — a conditional request gets a 304, not a re-download', async () => {
  const first = await request();
  assert.equal(first.status, 200);
  assert.ok(first.headers.etag, 'express.static should still send an ETag; without one, no-cache would cost a full re-download every load');

  const second = await request({ 'If-None-Match': first.headers.etag });
  assert.equal(second.status, 304, 'a revalidation should be answered with an empty 304');
  assert.equal(second.body, '', '304 bodies are empty — this is what makes no-cache cheap');
});

test('/assets/ may be cached hard — images are large and their names change with their contents', async () => {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'assets', 'backdrops');
  let sample;
  try {
    const entries = await fs.readdir(dir);
    sample = entries.find((f) => /\.(webp|png|jpe?g|svg)$/i.test(f));
  } catch {
    /* no assets dir on this checkout */
  }
  if (!sample) return; // nothing to assert against; not a failure

  const res = await fetch(`${base}/assets/backdrops/${encodeURIComponent(sample)}`);
  assert.equal(res.status, 200);
  const cc = res.headers.get('cache-control') ?? '';
  assert.match(cc, /max-age=\d{4,}/, `assets should stay cacheable, got "${cc}"`);
});
