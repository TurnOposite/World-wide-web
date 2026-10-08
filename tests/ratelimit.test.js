/**
 * Roadmap #14 — the tower on the public internet must survive a noisy client.
 *   - a per-address budget: a burst, then a steady rate, then 429 with
 *     Retry-After; other addresses and this machine itself are unaffected;
 *   - memory stays bounded however many addresses or listener ids a flood
 *     invents;
 *   - guessing the station key is budgeted far more tightly than reading;
 *   - the website on another origin can send the key (CORS preflight).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';

// Config is read once, at import: set the environment first.
const music = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-ratelimit-'));
Object.assign(process.env, {
  MUSIC_DIR: music,
  CACHE_FILE: path.join(music, '.cache', 'l.json'),
  AUTO_RESCAN_MINUTES: '0',
  STATION_KEY: 'right-key-0123456789',
  RATE_BURST: '40',
  RATE_PER_SECOND: '1',
});
const { RateLimiter, rateLimit, isLoopback } = await import('../server/lib/ratelimit.js');
const { Listeners } = await import('../server/lib/listeners.js');

function clock(start = 1_000_000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

test('a burst, then a steady rate, then a clear refusal', () => {
  const now = clock();
  const rl = new RateLimiter({ capacity: 5, refillPerSec: 2, now });
  for (let i = 0; i < 5; i++) assert.equal(rl.take('a').ok, true, `request ${i + 1} of the burst`);
  const refused = rl.take('a');
  assert.equal(refused.ok, false);
  assert.equal(refused.retryAfter, 1);
  assert.equal(rl.take('b').ok, true, 'another address has its own budget');
  now.advance(500); // half a second earns one request back at 2/s
  assert.equal(rl.take('a').ok, true);
  assert.equal(rl.take('a').ok, false);
  assert.equal(rl.allows('a'), false);
  now.advance(10_000);
  assert.equal(rl.allows('a'), true, 'allows() looks without spending');
  assert.equal(rl.allows('a'), true);
});

test('memory is bounded however many addresses a flood invents', () => {
  const now = clock();
  const rl = new RateLimiter({ capacity: 3, refillPerSec: 1, maxKeys: 100, now });
  for (let i = 0; i < 5000; i++) rl.take(`10.0.${i >> 8}.${i & 255}`);
  assert.ok(rl.size <= 100, `${rl.size} buckets kept`);
  now.advance(5_000); // everyone has refilled: full buckets are forgotten
  rl.take('fresh');
  assert.equal(rl.size, 1);
});

test('the least recently seen address is the one forgotten', () => {
  const now = clock();
  const rl = new RateLimiter({ capacity: 3, refillPerSec: 0.001, maxKeys: 2, now });
  rl.take('old');
  rl.take('regular');
  rl.take('old'); // seen again: now the most recent
  rl.take('new'); // over the cap: 'regular' goes
  assert.deepEqual([...rl.buckets.keys()], ['old', 'new']);
});

test('listener ids are capped, real listeners kept', () => {
  const l = new Listeners({ ttlMs: 60_000, maxIds: 50 });
  l.ping('me');
  for (let i = 0; i < 1000; i++) {
    l.ping(`flood-${i}`);
    if (i % 10 === 0) l.ping('me'); // a real listener keeps polling
  }
  assert.equal(l.count(), 50);
  assert.ok(l.seen.has('me'), 'the listener who keeps pinging survives the flood');
});

test('loopback is this machine', () => {
  for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(isLoopback(ip), true, ip);
  for (const ip of ['203.0.113.9', '10.0.0.253', '', undefined]) assert.equal(isLoopback(ip), false, String(ip));
});

test('the middleware answers 429 with Retry-After and the usual JSON shape', () => {
  const rl = new RateLimiter({ capacity: 1, refillPerSec: 1, now: clock() });
  const mw = rateLimit(rl);
  const res = { headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let passed = 0;
  mw({ ip: '203.0.113.9' }, res, () => passed++);
  mw({ ip: '203.0.113.9' }, res, () => passed++);
  assert.equal(passed, 1);
  assert.equal(res.code, 429);
  assert.equal(res.headers['Retry-After'], '1');
  assert.deepEqual(res.body, { error: 'rate_limited', retryAfter: 1 });
});

test('the tower: floods refused per address, keys budgeted, the website allowed to send the key', async () => {
  const { createApp } = await import('../server/index.js');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Caddy (on loopback) says who the client is; only loopback is believed.
  const as = (ip, init = {}) => ({ ...init, headers: { ...(init.headers || {}), 'X-Forwarded-For': ip } });
  try {
    let ok = 0;
    let last;
    for (let i = 0; i < 45; i++) {
      last = await fetch(`${base}/api/time`, as('203.0.113.9'));
      if (last.status === 200) ok++;
    }
    assert.ok(ok >= 40 && ok <= 42, `${ok} of 45 answered (burst 40, 1/s)`);
    assert.equal(last.status, 429);
    assert.ok(Number(last.headers.get('retry-after')) >= 1);
    assert.equal((await last.json()).error, 'rate_limited');
    assert.equal((await fetch(`${base}/api/time`, as('198.51.100.7'))).status, 200, 'a different listener is unaffected');
    for (let i = 0; i < 60; i++) assert.equal((await fetch(`${base}/api/time`)).status, 200, 'this machine itself is never limited');

    // Guessing the key: twenty tries, then refused before the key is even compared.
    const guess = (key) => fetch(`${base}/api/queue/clear`, as('192.0.2.50', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Station-Key': key }, body: '{}' }));
    const codes = [];
    for (let i = 0; i < 22; i++) codes.push((await guess(`wrong-${i}`)).status);
    assert.deepEqual(codes.slice(0, 20), Array(20).fill(401));
    assert.deepEqual(codes.slice(20), [429, 429]);
    const right = await guess('right-key-0123456789');
    assert.equal(right.status, 429, 'locked out for a while, even with the right key');
    assert.equal((await fetch(`${base}/api/queue/clear`, as('192.0.2.51', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Station-Key': 'right-key-0123456789' }, body: '{}' }))).status !== 401, true, 'the DJ elsewhere is not');

    // The website on Vercel asks first (preflight) before sending the key.
    const pre = await fetch(`${base}/api/queue/reorder`, { method: 'OPTIONS', headers: { Origin: 'https://example.vercel.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-station-key' } });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-headers'), /x-station-key/i);
    assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
  } finally {
    server.close();
  }
});
