/**
 * « Phone notification for messages in antenna » (server/lib/notify.js;
 * Ortis, 2026-11-16).
 *
 * What must hold:
 *   - nothing is sent anywhere unless it was set up (no topic, no subscriber);
 *   - Ortis is told when a listener writes — the name and the first 80
 *     characters — and not for the station's own messages;
 *   - at most one notification a minute, each way: what arrives meanwhile
 *     goes out together;
 *   - a device the station subscribed (with the key, from the Booth — Ortis,
 *     2026-11-17: « only accessible to me ») is told, encrypted to it alone;
 *     one that wrote the message is not; the station's own words notify
 *     nobody; a subscription the push service says is gone is forgotten;
 *   - only a real push service's address is ever kept, or called;
 *   - the server's key pair and the subscriptions survive a restart, and
 *     nothing about a listener is on the disk but the subscription;
 *   - a notification that fails never fails the message.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import crypto from 'node:crypto';
import { startTower } from './helpers/tower.js';

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-notify-'));

// A stand-in for both outside services: ntfy (JSON publishing) and a push service.
const got = { ntfy: [], push: [] };
const stub = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c)).on('end', () => {
    const body = Buffer.concat(chunks);
    if (req.url.startsWith('/push/')) {
      got.push.push({ url: req.url, headers: req.headers, body });
      return res.writeHead(req.url.includes('gone') ? 410 : 201).end();
    }
    got.ntfy.push({ url: req.url, json: JSON.parse(body.toString() || '{}') });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
  });
});
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const STUB = `http://127.0.0.1:${stub.address().port}`;
test.after(() => new Promise((r) => stub.close(r)));

const KEY = 'right-key-0123456789';
const tower = await startTower({
  music: dir,
  env: {
    TELEGRAPH_LOG: path.join(dir, 'line', 'telegraph.jsonl'),
    TELEGRAPH_NOTIFY_URL: `${STUB}/a-long-random-topic`,
    TELEGRAPH_PUSH_ALLOW: STUB,
    TELEGRAPH_NOTIFY_GAP_SECONDS: '0',
    PUBLIC_SITE: 'https://site.example',
    STATION_KEY: KEY,
  },
});
const { LineNotifier, PushStore, Batcher, summarise, ntfyTarget } = await import('../server/lib/notify.js');
const { generateKeys, decrypt, b64u } = await import('../server/lib/webpush.js');

function clock(start = 1_800_000_000_000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}
/** A browser's subscription, with the private half kept so the test can read what it is sent. */
const browser = (pathName = `/push/${crypto.randomUUID()}`) => {
  const keys = generateKeys();
  const auth = b64u(crypto.randomBytes(16));
  return { sub: { endpoint: `${STUB}${pathName}`, keys: { p256dh: keys.publicKey, auth } }, read: (body) => JSON.parse(decrypt(body, { ...keys, auth }).toString()) };
};

test('what a notification says: one message, or several together', () => {
  assert.deepEqual(summarise([{ name: 'Ada', text: 'hello there' }]), { title: 'Ada on the telegraph line', body: 'hello there' });
  const long = summarise([{ name: 'Ada', text: 'é'.repeat(200) }]);
  assert.equal([...long.body].length, 80, 'the first 80 characters');
  assert.ok(long.body.endsWith('…'));
  const three = summarise([{ name: 'Ada', text: 'one' }, { name: 'Bo', text: 'two' }, { name: 'Ada', text: 'three' }]);
  assert.deepEqual(three, { title: '3 new messages on the telegraph line', body: 'Ada and Bo. Last: three' });
  assert.match(summarise([1, 2, 3, 4].map((i) => ({ name: `N${i}`, text: 'x' }))).body, /^N1, N2 and 2 more\. Last: x$/);
});

test('at most one a minute: the first goes at once, the rest together when the minute is up', async () => {
  const now = clock();
  const sent = [];
  let timer = null;
  const b = new Batcher({ gapMs: 60_000, now, send: (items) => { sent.push(items.map((i) => i.n)); }, setTimer: (fn, ms) => { timer = { fn, ms }; return timer; } });
  b.add({ n: 1 });
  await b.idle();
  assert.deepEqual(sent, [[1]], 'the first one is not held back');
  now.advance(10_000);
  b.add({ n: 2 });
  now.advance(10_000);
  b.add({ n: 3 });
  await b.idle();
  assert.deepEqual(sent, [[1]], 'nothing more within the minute');
  assert.equal(timer.ms, 50_000, 'one timer, for when the minute ends');
  now.advance(40_000);
  timer.fn();
  await b.idle();
  assert.deepEqual(sent, [[1], [2, 3]], 'then what waited goes out as one');
  now.advance(61_000);
  b.add({ n: 4 });
  await b.idle();
  assert.deepEqual(sent.at(-1), [4], 'and after a quiet minute the next is immediate again');
});

test('the ntfy address: where to post, and the topic — never guessed', () => {
  assert.deepEqual(ntfyTarget('https://ntfy.sh/my-topic'), { base: 'https://ntfy.sh', topic: 'my-topic' });
  assert.deepEqual(ntfyTarget('https://push.example/ntfy/my-topic/'), { base: 'https://push.example/ntfy', topic: 'my-topic' });
  for (const bad of ['', 'ntfy.sh/topic', 'https://ntfy.sh/', 'ftp://ntfy.sh/topic']) assert.equal(ntfyTarget(bad), null, bad);
});

test('nothing is set up: nothing is sent, nothing is asked', async () => {
  let calls = 0;
  const n = new LineNotifier({ fetchImpl: async () => { calls++; return { ok: true, status: 200 }; } });
  assert.equal(n.enabled, false);
  n.message({ name: 'Ada', text: 'hello' });
  await n.idle();
  assert.equal(calls, 0);
});

test('Ortis is told when a listener writes, and not when the station does', async () => {
  got.ntfy.length = 0;
  const n = new LineNotifier({ ntfyUrl: `${STUB}/topic-for-ortis`, siteUrl: 'https://site.example/', gapMs: 0 });
  n.message({ name: 'Ada 🌙', text: 'is this thing on?', host: false });
  n.message({ name: 'Tower', text: 'good evening', host: true });
  await n.idle();
  assert.deepEqual(got.ntfy.map((r) => r.json), [{ topic: 'topic-for-ortis', title: 'Ada 🌙 on the telegraph line', message: 'is this thing on?', tags: ['radio'], click: 'https://site.example/antenna' }]);
  assert.equal(got.ntfy[0].url, '/', 'posted to the ntfy server, the topic in the body — so an accented name arrives whole');
});

test('a notification that cannot be sent is one warning, and never an error for the line', async () => {
  const warn = console.warn;
  const said = [];
  console.warn = (m) => said.push(String(m));
  try {
    const n = new LineNotifier({ ntfyUrl: 'https://ntfy.invalid/secret-topic-name', gapMs: 0, fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); } });
    n.message({ name: 'Ada', text: 'one' });
    n.message({ name: 'Ada', text: 'two' });
    await n.idle();
  } finally { console.warn = warn; }
  assert.equal(said.length, 1, 'said once');
  assert.doesNotMatch(said[0], /secret-topic-name/, 'and the topic\'s name — the only secret — is not in the log');
});

test('subscriptions: only a real push service\'s address is kept; the key pair and the list survive a restart', async () => {
  const file = path.join(dir, 'store', 'push.json');
  const store = new PushStore({ file, subject: 'https://site.example', allowOrigins: [STUB] });
  await store.flushed();
  const a = browser();
  assert.deepEqual(store.add(a.sub), { ok: true });
  assert.deepEqual(store.add(a.sub), { ok: true }, 'asking twice is one subscription');
  assert.equal(store.size, 1);
  for (const bad of [
    { endpoint: 'http://127.0.0.1:8080/api/rescan', keys: a.sub.keys },
    { endpoint: 'http://169.254.169.254/opc/v2/instance/', keys: a.sub.keys },
    { endpoint: 'https://evil.example/push', keys: a.sub.keys },
    { endpoint: a.sub.endpoint, keys: { p256dh: 'short', auth: a.sub.keys.auth } },
    { endpoint: a.sub.endpoint },
    null,
  ]) assert.equal(store.add(bad).error, 'bad_subscription', JSON.stringify(bad)?.slice(0, 60));
  assert.equal(store.size, 1);
  await store.flushed();

  const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(kept.subs[0]).sort(), ['endpoint', 'keys', 't'], 'what is kept of a listener: the subscription and when — no name, no address');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o077, 0, 'the file holds the server\'s private key: the service alone reads it');
  const again = new PushStore({ file, subject: 'https://site.example', allowOrigins: [STUB] });
  assert.equal(again.publicKey, store.publicKey, 'the same key pair: every subscription is tied to it');
  assert.equal(again.size, 1);
  const strict = new PushStore({ file, subject: 'https://site.example' });
  assert.equal(strict.size, 0, 'a tower without the self-test\'s allowance does not even load a subscription to a made-up address');

  const tiny = new PushStore({ subject: 'https://site.example', allowOrigins: [STUB], max: 1 });
  tiny.add(browser().sub);
  assert.equal(tiny.add(browser().sub).error, 'full', 'and there is a ceiling');
  const fromEnv = generateKeys();
  assert.equal(new PushStore({ keys: fromEnv, subject: 'https://site.example' }).publicKey, fromEnv.publicKey, 'a key pair given in the environment is the one used');
});

test('listeners who asked are told — but not of their own message; a subscription that is gone is forgotten', async () => {
  got.push.length = 0;
  const store = new PushStore({ subject: 'https://site.example', allowOrigins: [STUB] });
  const ada = browser();
  const bo = browser();
  const gone = browser('/push/gone-1');
  for (const b of [ada, bo, gone]) store.add(b.sub);
  const n = new LineNotifier({ push: store, gapMs: 0 });
  assert.equal(n.enabled, true);

  n.message({ name: 'Ada', text: 'hello from Ada', host: false }, { from: ada.sub.endpoint });
  await n.idle();
  const to = (b) => got.push.filter((r) => `${STUB}${r.url}` === b.sub.endpoint);
  assert.equal(to(ada).length, 0, 'Ada is not told about what she just said');
  assert.equal(to(bo).length, 1);
  assert.deepEqual(bo.read(to(bo)[0].body), { title: 'Ada on the telegraph line', body: 'hello from Ada', tag: 'telegraph', url: 'antenna' });
  assert.throws(() => ada.read(to(bo)[0].body), 'and only Bo\'s browser can read Bo\'s copy');
  assert.match(to(bo)[0].headers.authorization, /^vapid t=/);
  assert.equal(store.size, 2, 'the push service said 410: that subscription is forgotten');

  got.push.length = 0;
  n.message({ name: 'Tower', text: 'good evening', host: true });
  await n.idle();
  assert.deepEqual([to(ada).length, to(bo).length], [0, 0], 'the station\'s own words are the station\'s: nobody is told of them');
});

test('several messages in one batch: a listener who wrote them all is skipped, one who wrote some is told', async () => {
  got.push.length = 0;
  const now = clock();
  let timer = null;
  const store = new PushStore({ subject: 'https://site.example', allowOrigins: [STUB] });
  const ada = browser();
  const bo = browser();
  store.add(ada.sub);
  store.add(bo.sub);
  const n = new LineNotifier({ push: store, gapMs: 60_000, now, setTimer: (fn) => { timer = fn; return {}; } });
  n.message({ name: 'Listener', text: 'first' });
  await n.idle();
  got.push.length = 0;
  n.message({ name: 'Ada', text: 'one' }, { from: ada.sub.endpoint });
  n.message({ name: 'Bo', text: 'two' }, { from: bo.sub.endpoint });
  now.advance(60_000);
  timer();
  await n.idle();
  assert.equal(got.push.length, 2, 'each has something they did not write');
  assert.equal(bo.read(got.push.find((r) => `${STUB}${r.url}` === bo.sub.endpoint).body).title, '2 new messages on the telegraph line');
});

/* ------------------------------------------------------------- over HTTP -- */
const { base, post } = tower;
const { notifier } = tower.mod;
test.after(() => tower.close());

test('the tower: the station\'s device asks to be told, with the key; is told of the next message; can take it back', async () => {
  const line = await (await fetch(`${base}/api/telegraph`)).json();
  assert.equal('push' in line, false, 'the open room says nothing of notifications: they are the station\'s (2026-11-17)');
  const keyed = { 'x-station-key': KEY };
  const log = await (await fetch(`${base}/api/telegraph/log`, { headers: keyed })).json();
  assert.match(log.push?.key || '', /^[\w-]{87}$/, 'the Booth reads the public half of the tower\'s push key with the log');
  assert.doesNotMatch(JSON.stringify(log), /privateKey/);

  // Refused without the key, or with a wrong one, and no path in any answer: tests/routes.test.js, for every route.
  assert.equal((await post('/api/telegraph/subscribe', { endpoint: 'http://127.0.0.1:1/x', keys: { p256dh: 'x', auth: 'y' } }, keyed)).status, 400);
  assert.equal((await post('/api/telegraph/subscribe', { endpoint: 'https://evil.example/hook', keys: browser().sub.keys }, keyed)).status, 400, 'the tower will not be made to call an address a stranger chose');
  const me = browser();
  const other = browser();
  assert.equal((await post('/api/telegraph/subscribe', me.sub, keyed)).status, 201);
  assert.equal((await post('/api/telegraph/subscribe', other.sub, keyed)).status, 201);

  got.push.length = 0;
  got.ntfy.length = 0;
  const sent = await post('/api/telegraph', { name: 'Ada', text: 'anyone there?', push: me.sub.endpoint });
  assert.equal(sent.status, 201, 'the message is answered first');
  await notifier.idle();
  assert.deepEqual(got.push.map((r) => `${STUB}${r.url}`), [other.sub.endpoint], 'the other listener is told; the one who wrote is not');
  assert.deepEqual(other.read(got.push[0].body), { title: 'Ada on the telegraph line', body: 'anyone there?', tag: 'telegraph', url: 'antenna' });
  assert.deepEqual(got.ntfy.map((r) => [r.json.topic, r.json.title, r.json.click]), [['a-long-random-topic', 'Ada on the telegraph line', 'https://site.example/antenna']], 'and so is Ortis');

  assert.deepEqual(await (await post('/api/telegraph/unsubscribe', { endpoint: other.sub.endpoint })).json(), { ok: true });
  assert.deepEqual(await (await post('/api/telegraph/unsubscribe', { endpoint: 'https://never.seen/x' })).json(), { ok: true }, 'the same answer for one it never knew');
  got.push.length = 0;
  await post('/api/telegraph', { name: 'Bo', text: 'me too' });
  await notifier.idle();
  assert.deepEqual(got.push.map((r) => `${STUB}${r.url}`), [me.sub.endpoint], 'taken back: no more notifications for them');

  // Asking over and over from one address is refused before it reaches the store.
  let refused = 0;
  for (let i = 0; i < 8; i++) if ((await post('/api/telegraph/subscribe', browser().sub, { 'x-station-key': KEY })).status === 429) refused++;
  assert.ok(refused >= 2, `${refused} refused`);
});

test('a tower with notifications off says nothing of them and refuses subscriptions', async () => {
  const { apiRouter } = await import('../server/routes/api.js');
  const express = (await import('express')).default;
  const { station, listeners, state, telegraph } = await import('../server/index.js');
  const { config } = await import('../server/config.js');
  const off = express();
  off.use('/api', apiRouter({ station, listeners, config, state, telegraph, notifier: null }));
  const s = await new Promise((resolve) => { const x = off.listen(0, '127.0.0.1', () => resolve(x)); });
  try {
    const b = `http://127.0.0.1:${s.address().port}`;
    assert.equal('push' in (await (await fetch(`${b}/api/telegraph`)).json()), false);
    const r = await fetch(`${b}/api/telegraph/subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-station-key': KEY }, body: JSON.stringify(browser().sub) });
    assert.equal(r.status, 503);
    assert.equal((await fetch(`${b}/api/telegraph`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"A","text":"still works"}' })).status, 201, 'and the line itself is untouched');
  } finally { await new Promise((resolve) => s.close(resolve)); }
});
