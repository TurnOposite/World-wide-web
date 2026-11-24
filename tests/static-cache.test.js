/**
 * The cache policy on the website the tower serves (SITE_DIR — the cloud tower serves its own site).
 *
 * Until 2026-11-25 this pinned the Pi-era player in `public/`; that player is retired
 * (archive/pi-player-2026-11-25/) and the same rule is pinned on the site, served from `site/` as-is.
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
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startTower } from './helpers/tower.js';

const SITE = fileURLToPath(new URL('../site', import.meta.url));
const tower = await startTower({ prefix: 'rt-cache-', env: { SITE_DIR: SITE } });
const { base } = tower;
test.after(() => tower.close());

/** Every path here is something the browser parses and runs — or, config.json, what a deploy changes. */
const EXECUTABLE = [
  '/', '/index.html', '/js/main.js', '/js/router.js', '/js/player.js', '/js/lib/viz-core.js', '/js/lib/schedule.js',
  '/css/site.css', '/css/world.css', '/sw.js', '/config.json',
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
    const req = http.get({ host: '127.0.0.1', port: tower.server.address().port, path: '/js/main.js', headers }, (res) => {
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
  // fileURLToPath, not URL.pathname: on Windows the latter is "/C:/…", the
  // readdir below failed, and this test passed without checking anything.
  // The site's assets are committed, so a missing sample is a failure here, not a skip (the old one, on
  // public/assets/backdrops, passed without checking anything on a checkout that had none).
  const sample = (await fs.readdir(path.join(SITE, 'assets'))).find((f) => /\.(webp|png|jpe?g|svg)$/i.test(f));
  assert.ok(sample, 'site/assets/ holds an image to check');

  const res = await fetch(`${base}/assets/${encodeURIComponent(sample)}`);
  assert.equal(res.status, 200);
  const cc = res.headers.get('cache-control') ?? '';
  assert.match(cc, /max-age=\d{4,}/, `assets should stay cacheable, got "${cc}"`);
});

// The website is served by Vercel, not by this server (docs/LIVE.md), so the
// same rule has to hold in vercel.json — where no other test would notice it
// broken, and a returning listener would run stale modules again.
test('vercel.json keeps the rule: only assets, portfolio files and clippings are held', async () => {
  const cfg = JSON.parse(await fs.readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(cfg.buildCommand, 'node scripts/site-build.mjs');
  assert.equal(cfg.outputDirectory, 'dist');
  const cacheOf = (source) => cfg.headers.find((h) => h.source === source)?.headers
    .find((x) => x.key.toLowerCase() === 'cache-control')?.value ?? '';
  for (const source of ['/station/control.json', '/config.json']) {
    assert.match(cacheOf(source), /max-age=0\b.*must-revalidate/, `${source} is what the DJ and the deploy change — it must never be held`);
  }
  assert.match(cacheOf('/assets/(.*)'), /max-age=\d{4,}/);
  for (const h of cfg.headers) {
    const held = h.headers.some((x) => x.key.toLowerCase() === 'cache-control' && /max-age=[1-9]/.test(x.value));
    if (held) assert.match(h.source, /^\/(assets|collections|press)\//, `${h.source}: only files that are not code may be held`);
  }
});
