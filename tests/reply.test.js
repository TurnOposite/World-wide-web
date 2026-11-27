/**
 * Replies from the phone (server/lib/reply.js; Ortis, 2026-11-25: « reply to the chat I received a notification
 * about directly through my phone without looking at the website »).
 *
 * What must hold:
 *   - what is published on the reply topic goes on the line as the station's own, under the name and picture of
 *     the station's last message there (else TELEGRAPH_REPLY_NAME), and notifies nobody;
 *   - nothing published before the tower started is replayed; a reconnection asks for what came after the last
 *     message taken, and a message seen twice goes on the line once;
 *   - the reply topic cannot be the notification topic (the station would answer itself);
 *   - with a reply topic, the line's notifications carry a « Reply » button to ntfy's page for it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import http from 'node:http';
import { startTower } from './helpers/tower.js';

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-reply-'));

// A stand-in for ntfy: JSON publishing on POST /, and the topic's JSON stream on GET /<topic>/json.
const got = { posts: [], asked: [] };
let streams = [];
const stub = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.includes('/json')) {
    got.asked.push(req.url);
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.write(`${JSON.stringify({ id: 'open1', event: 'open', topic: 'reply-topic' })}\n`);
    streams.push(res);
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c)).on('end', () => {
    got.posts.push(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
  });
});
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const STUB = `http://127.0.0.1:${stub.address().port}`;
const publish = (ev) => { for (const s of streams) s.write(`${JSON.stringify({ event: 'message', topic: 'reply-topic', time: 1, ...ev })}\n`); };
const until = async (fn, ms = 3000) => { for (let t = 0; t < ms; t += 20) { if (fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return fn(); };

const KEY = 'right-key-0123456789';
const tower = await startTower({
  music: dir,
  env: {
    TELEGRAPH_LOG: path.join(dir, 'line', 'telegraph.jsonl'),
    TELEGRAPH_NOTIFY_URL: `${STUB}/notify-topic`,
    TELEGRAPH_REPLY_URL: `${STUB}/reply-topic`,
    TELEGRAPH_NOTIFY_GAP_SECONDS: '0',
    PUBLIC_SITE: 'https://site.example',
    STATION_KEY: KEY,
  },
});
test.after(async () => {
  await tower.mod.reply?.stop();
  for (const s of streams) s.end();
  await tower.close?.();
  await new Promise((r) => { stub.closeAllConnections?.(); stub.close(r); });
});
const { ReplyListener } = await import('../server/lib/reply.js');

test('the listener: from now on only, each message once, and a reconnection picks up after the last one', async () => {
  const texts = [];
  const t0 = 1_800_000_000_000;
  const l = new ReplyListener({ url: `${STUB}/reply-topic`, onText: (t) => texts.push(t), now: () => t0 });
  assert.equal(l.webUrl, `${STUB}/reply-topic`);
  streams = [];
  got.asked.length = 0;
  l.start();
  await until(() => streams.length === 1);
  assert.equal(got.asked[0], `/reply-topic/json?since=${t0 / 1000}`, 'the first connection asks only for what comes from now');
  publish({ id: 'm1', message: '  on my way  ' });
  publish({ id: 'm1', message: 'on my way' });
  publish({ event: 'keepalive', id: 'k1' });
  publish({ id: 'm2', message: '   ' });
  await until(() => l.since === 'm2');
  assert.deepEqual(texts, ['on my way'], 'trimmed; a repeat, a keepalive and an empty message are not put on the line');
  streams[0].end(); // ntfy closes the stream
  await until(() => streams.length === 2, 5000);
  assert.equal(got.asked[1], '/reply-topic/json?since=m2', 'and the next asks for what came after');
  publish({ id: 'm3', message: 'second' });
  await until(() => texts.length === 2);
  assert.deepEqual(texts, ['on my way', 'second']);
  await l.stop();
});

test('the reply topic cannot be the notification topic, nor something that is not an address', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(new ReplyListener({ url: 'https://ntfy.sh/same', notifyUrl: 'https://ntfy.sh/same', onText() {} }).enabled, false);
    assert.equal(new ReplyListener({ url: 'not an address', onText() {} }).enabled, false);
    assert.equal(new ReplyListener({ url: 'https://ntfy.sh/other', notifyUrl: 'https://ntfy.sh/same', onText() {} }).enabled, true);
  } finally { console.warn = warn; }
});

test('the tower: a reply goes on the line as the station, under its last name and picture, and notifies nobody', async () => {
  const say = (body, key) => tower.get('/api/telegraph', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'x-station-key': key } : {}) }, body: JSON.stringify(body) });
  got.posts.length = 0;
  assert.equal((await say({ name: 'Ada', text: 'anyone there?' })).status, 201);
  await tower.mod.notifier.idle();
  assert.equal(got.posts.length, 1);
  assert.deepEqual(got.posts[0].actions, [{ action: 'view', label: 'Reply', url: `${STUB}/reply-topic`, clear: true }], 'the listener\'s message comes with a Reply button');

  const first = tower.mod.replyToLine('before the station has spoken');
  assert.equal(first.message.name, 'The station');
  assert.equal(first.message.host, true);
  assert.equal((await say({ name: 'Ortis', icon: 'cast.keeper.1', text: 'hello from the booth' }, KEY)).status, 201);
  const out = tower.mod.replyToLine('yes, here — from my phone');
  assert.deepEqual([out.message.name, out.message.icon, out.message.host], ['Ortis', 'cast.keeper.1', true]);
  const line = await tower.json('/api/telegraph');
  assert.equal(line.messages.at(-1).text, 'yes, here — from my phone');
  await tower.mod.notifier.idle();
  assert.equal(got.posts.length, 1, 'the station\'s words, from the phone or the booth, notify nobody');
  assert.equal((await tower.json('/api/status', { headers: { 'x-station-key': KEY } })).notifications.replies, true);
});
