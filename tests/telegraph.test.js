/**
 * The telegraph line (server/lib/telegraph.js) — the one chat room.
 *
 * What must hold, since strangers write here:
 *   - a message is plain, short text: control and invisible characters go,
 *     a link becomes « [link] », a name and a text are required;
 *   - one address cannot flood the line, nor say the same thing twice in a row;
 *   - only the station key takes a message off, and can silence its sender;
 *     a wrong key sent with a message is refused, never quietly ignored;
 *   - the line is kept: a new process reads it back, without what was taken
 *     off, and no address is ever written down;
 *   - TELEGRAPH=0 is a tower without a line;
 *   - the website, on another origin, can read and write (CORS).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

// Config is read once, at import: set the environment first.
const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-telegraph-'));
const KEY = 'right-key-0123456789';
Object.assign(process.env, {
  MUSIC_DIR: dir,
  CACHE_FILE: path.join(dir, '.cache', 'l.json'),
  TELEGRAPH_LOG: path.join(dir, 'line', 'telegraph.jsonl'),
  AUTO_RESCAN_MINUTES: '0',
  STATION_KEY: KEY,
});
const { Telegraph, LIMITS, cleanText, cleanIcon, stripLinks, dailyReset } = await import('../server/lib/telegraph.js');
const { RateLimiter } = await import('../server/lib/ratelimit.js');

function clock(start = 1_800_000_000_000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}
const line = (o = {}) => {
  const now = o.now || clock();
  return Object.assign(new Telegraph({ now, ...o }), { clock: now });
};

test('a message is one line of plain text', () => {
  assert.equal(cleanText('  hello\n\tthere  ', 50), 'hello there');
  assert.equal(cleanText('a\u202eb\u200bc\u0007d', 50), 'a b c d', 'direction overrides, zero-width and control characters go');
  assert.equal(cleanText('é'.repeat(300), LIMITS.text).length, LIMITS.text);
  assert.equal([...cleanText('🌙'.repeat(40), 24)].length, 24, 'cut by character, never through one');
  assert.equal(stripLinks('look https://evil.example/x?y=1 and www.spam.example now'), 'look [link] and [link] now');
  assert.equal(cleanIcon('moon.svg'), 'moon.svg');
  for (const bad of ['../secret.png', 'a/b.png', 'x'.repeat(65), '', '<svg>', 'a..b', null]) assert.equal(cleanIcon(bad), null, String(bad));
});

test('posting: a name and a text, cleaned; the stream the sender was on; ids only go up', () => {
  const t = line();
  assert.equal(t.post({ name: '', text: 'hi', who: 'a' }).error, 'no_name');
  assert.equal(t.post({ name: 'Ada', text: ' \n ', who: 'a' }).error, 'empty');
  const one = t.post({ name: '  Ada\u200b  ', icon: 'moon.svg', text: '<b>hello</b> http://x.example', stream: 'Chill', who: 'a' });
  assert.equal(one.ok, true);
  assert.deepEqual({ ...one.message, id: 0, t: 0 }, { id: 0, t: 0, name: 'Ada', icon: 'moon.svg', text: '<b>hello</b> [link]', stream: 'Chill', host: false },
    'markup is kept as the text it is — the page shows text, never markup');
  const two = t.post({ name: 'Bo', icon: '../x', text: 'yo', who: 'b' });
  assert.equal(two.message.icon, null, 'an icon that is not a file name of the bank is no icon');
  assert.ok(two.message.id > one.message.id, 'two messages in the same millisecond still have an order');
  assert.deepEqual(t.since(one.message.id).messages.map((m) => m.text), ['yo']);
  assert.equal(t.since(0).messages.length, 2);
});

test('one address cannot flood the line, nor repeat itself', () => {
  const t = line();
  for (let i = 0; i < 4; i++) assert.equal(t.post({ name: 'A', text: `m${i}`, who: 'flood' }).ok, true, `message ${i + 1} of the burst`);
  const refused = t.post({ name: 'A', text: 'm4', who: 'flood' });
  assert.equal(refused.status, 429);
  assert.ok(refused.retryAfter >= 1);
  assert.equal(t.post({ name: 'B', text: 'hello', who: 'someone else' }).ok, true, 'another address has its own budget');
  t.clock.advance(3000);
  assert.equal(t.post({ name: 'A', text: 'm5', who: 'flood' }).ok, true, 'one more every three seconds');
  t.clock.advance(3000);
  assert.equal(t.post({ name: 'A', text: 'm5', who: 'flood' }).error, 'duplicate', 'the same line twice in a row');
  t.clock.advance(31_000);
  assert.equal(t.post({ name: 'A', text: 'm5', who: 'flood' }).ok, true, '…is fine half a minute later');
});

test('memory stays bounded: the room keeps its last messages only', () => {
  const t = line({ keep: 5, limiter: new RateLimiter({ capacity: 1000, refillPerSec: 1000 }) });
  for (let i = 0; i < 12; i++) t.post({ name: 'A', text: `m${i}`, who: `w${i}` });
  assert.deepEqual(t.since(0).messages.map((m) => m.text), ['m7', 'm8', 'm9', 'm10', 'm11']);
  assert.equal(t._from.size, 5, 'and forgets who sent the ones that left');
});

test('taking a message off, and silencing its sender for a day', () => {
  const t = line();
  const a = t.post({ name: 'Troll', text: 'rude', who: 'troll' }).message;
  const b = t.post({ name: 'Ada', text: 'fine', who: 'ada' }).message;
  assert.equal(t.remove(999).error, 'unknown_message');
  assert.deepEqual(t.remove(a.id, { mute: true }), { ok: true, muted: true });
  const now = t.since(0);
  assert.deepEqual(now.messages.map((m) => m.id), [b.id]);
  assert.deepEqual(now.removed, [a.id], 'a browser that already shows it learns it went');
  assert.equal(t.post({ name: 'Troll', text: 'again', who: 'troll' }).error, 'muted');
  assert.equal(t.post({ name: 'Ada', text: 'still here', who: 'ada' }).ok, true);
  t.clock.advance(24 * 3600_000 + 1);
  assert.equal(t.post({ name: 'Troll', text: 'sorry', who: 'troll' }).ok, true, 'a day later the line is theirs again');
  assert.deepEqual(t.since(0).removed, [], 'and the removal is old news');
});

test('the line is kept: a restart reads it back, without what was taken off, and no address is written', async () => {
  const logFile = path.join(dir, 'kept', 'line.jsonl');
  const now = clock();
  const t = line({ logFile, now });
  const a = t.post({ name: 'Ada', icon: 'moon.svg', text: 'first', stream: 'Chill', who: '203.0.113.7' }).message;
  const b = t.post({ name: 'Bo', text: 'second', who: '203.0.113.8' }).message;
  t.remove(a.id);
  await t.flushed();
  const raw = fs.readFileSync(logFile, 'utf8');
  assert.doesNotMatch(raw, /203\.0\.113/, 'the address never reaches the disk');
  assert.equal(raw.trim().split('\n').length, 3, 'two messages and one removal');
  const again = line({ logFile, now });
  assert.deepEqual(again.since(0).messages, [b]);
  assert.ok(again.post({ name: 'Cy', text: 'third', who: 'c' }).message.id > b.id, 'ids go on from where the log ended');
});

test('the room empties at 05:00 Paris: the programme\'s own day boundary, summer time included', () => {
  const at = dailyReset('05:00', 'Europe/Paris');
  const iso = (t) => new Date(at(Date.parse(t))).toISOString();
  assert.equal(iso('2026-11-13T03:59:59Z'), '2026-11-12T04:00:00.000Z', 'at 04:59 in Paris (winter) the day is still yesterday\'s');
  assert.equal(iso('2026-11-13T04:00:00Z'), '2026-11-13T04:00:00.000Z', '05:00 in Paris is 04:00 UTC in winter');
  assert.equal(iso('2026-11-13T22:30:00Z'), '2026-11-13T04:00:00.000Z');
  assert.equal(iso('2026-07-01T03:00:00Z'), '2026-07-01T03:00:00.000Z', '…and 03:00 UTC in summer');
  for (const off of ['off', '', 'never', '25:00']) assert.equal(dailyReset(off), null, `« ${off} » is a room that never empties`);
});

test('what was said yesterday leaves the room at 05:00, for a page left open and for a restart; the log keeps it', async () => {
  const logFile = path.join(dir, 'daily', 'line.jsonl');
  const now = clock(Date.parse('2026-11-13T03:58:00Z')); // 04:58 in Paris
  const dayStart = dailyReset('05:00', 'Europe/Paris');
  const t = line({ logFile, now, dayStart });
  const late = t.post({ name: 'Owl', text: 'still up', who: 'owl' }).message;
  const seen = t.since(0);
  assert.deepEqual(seen.messages.map((m) => m.text), ['still up']);
  assert.equal(seen.day, Date.parse('2026-11-12T04:00:00Z'), 'the room says when its day began');

  now.advance(3 * 60_000); // 05:01 in Paris
  const after = t.since(0);
  assert.deepEqual(after.messages, [], 'at 05:00 the room is empty again');
  assert.equal(after.day, Date.parse('2026-11-13T04:00:00Z'), '…and says its new day began at 05:00');
  assert.deepEqual(t.since(late.id).messages, [], 'a page asking after yesterday\'s last message gets nothing old');
  assert.equal(t._from.size, 0, 'who sent yesterday\'s messages is forgotten with them');
  const fresh = t.post({ name: 'Lark', text: 'morning', who: 'lark' }).message;
  assert.ok(fresh.id > late.id, 'ids keep going up across the morning');
  assert.deepEqual(t.since(late.id).messages.map((m) => m.text), ['morning']);

  await t.flushed();
  const again = line({ logFile, now, dayStart });
  assert.deepEqual(again.since(0).messages.map((m) => m.text), ['morning'], 'a restart after 05:00 does not bring yesterday back');
  assert.ok(again.lastId >= fresh.id, 'and the ids still only go up');
  const kept = fs.readFileSync(logFile, 'utf8');
  assert.match(kept, /still up/, 'the tower\'s own log keeps what was said (Ortis, 2026-11-10); only the room starts over');
});

test('a room with no daily turn keeps everything, and says nothing of a day', () => {
  const now = clock(Date.parse('2026-11-13T03:58:00Z'));
  const t = line({ now });
  t.post({ name: 'Owl', text: 'still up', who: 'owl' });
  now.advance(48 * 3600_000);
  const out = t.since(0);
  assert.equal(out.messages.length, 1);
  assert.equal('day' in out, false);
});

test('the log is capped: past its size it is set aside once, and a new one starts', async () => {
  const logFile = path.join(dir, 'capped', 'line.jsonl');
  const t = line({ logFile, logMaxBytes: 400, limiter: new RateLimiter({ capacity: 1000, refillPerSec: 1000 }) });
  for (let i = 0; i < 12; i++) t.post({ name: 'A', text: `message number ${i}`, who: `w${i}` });
  await t.flushed();
  assert.ok(fs.statSync(logFile).size <= 400);
  assert.ok(fs.existsSync(`${logFile}.1`), 'the older part is kept beside it');
  assert.deepEqual(fs.readdirSync(path.dirname(logFile)).sort(), ['line.jsonl', 'line.jsonl.1'], 'two files at most');
});

test('a log that cannot be written does not take the line down', async () => {
  const t = line({ logFile: path.join(dir, 'l.json-is-a-file', 'x', 'line.jsonl') });
  fs.writeFileSync(path.join(dir, 'l.json-is-a-file'), 'x');
  const warn = console.warn;
  let said = 0;
  console.warn = () => { said++; };
  try {
    assert.equal(t.post({ name: 'A', text: 'one', who: 'a' }).ok, true);
    assert.equal(t.post({ name: 'B', text: 'two', who: 'b' }).ok, true);
    await t.flushed();
  } finally { console.warn = warn; }
  assert.equal(said, 1, 'said once, not once per message');
  assert.equal(t.since(0).messages.length, 2);
});

/* ------------------------------------------------------------- over HTTP -- */
const { createApp } = await import('../server/index.js');
const app = createApp();
let server;
let base;
test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('the tower: reading is open, writing needs no key, and the station\'s own messages are marked', async () => {
  const empty = await (await fetch(`${base}/api/telegraph`)).json();
  assert.equal(empty.enabled, true);
  assert.deepEqual(empty.messages, []);
  assert.deepEqual(empty.limits, { text: LIMITS.text, name: LIMITS.name });
  assert.ok(Number.isFinite(empty.day) && empty.day <= Date.now() && Date.now() - empty.day < 25 * 3600_000,
    'the tower\'s room empties daily (05:00 Paris by default) and says when today began');

  const sent = await post('/api/telegraph', { name: 'Ada', icon: 'moon.svg', text: 'hello <img src=x> https://x.example', stream: 'Chill' });
  assert.equal(sent.status, 201);
  const { message } = await sent.json();
  assert.equal(message.text, 'hello <img src=x> [link]');
  assert.equal(message.host, false);

  const bad = await post('/api/telegraph', { name: 'Fake', text: 'I am the station' }, { 'x-station-key': 'wrong' });
  assert.equal(bad.status, 401, 'a wrong key is refused outright — not a quiet way to test keys');
  const host = await (await post('/api/telegraph', { name: 'Tower', text: 'good evening' }, { 'x-station-key': KEY })).json();
  assert.equal(host.message.host, true);

  const after = await (await fetch(`${base}/api/telegraph?since=${message.id}`)).json();
  assert.deepEqual(after.messages.map((m) => m.text), ['good evening']);
  assert.equal((await post('/api/telegraph', { name: '', text: 'x' })).status, 400);
  assert.equal((await post('/api/telegraph', { name: 'A', text: 'x'.repeat(5000) })).status, 413, 'a body far past a message is not read');
});

test('the tower: only the key takes a message off', async () => {
  const { message } = await (await post('/api/telegraph', { name: 'Bo', text: 'to be removed' })).json();
  assert.equal((await post('/api/telegraph/remove', { id: message.id })).status, 401);
  const gone = await post('/api/telegraph/remove', { id: message.id, mute: true }, { 'x-station-key': KEY });
  assert.deepEqual(await gone.json(), { ok: true, muted: true });
  const now = await (await fetch(`${base}/api/telegraph`)).json();
  assert.ok(!now.messages.some((m) => m.id === message.id));
  assert.ok(now.removed.includes(message.id));
  // Every request here comes from this machine, so the sender silenced is this test itself.
  assert.equal((await post('/api/telegraph', { name: 'Bo', text: 'me again' })).status, 403);
});

test('the website on another origin can read and write the line', async () => {
  const pre = await fetch(`${base}/api/telegraph`, { method: 'OPTIONS', headers: { Origin: 'https://site.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
  assert.match(pre.headers.get('access-control-allow-headers'), /Content-Type/i);
});

test('TELEGRAPH=0 is a tower without a line', async () => {
  const { apiRouter } = await import('../server/routes/api.js');
  const express = (await import('express')).default;
  const { station, listeners, state } = await import('../server/index.js');
  const { config } = await import('../server/config.js');
  const off = express();
  off.use('/api', apiRouter({ station, listeners, config, state, telegraph: null }));
  const s = await new Promise((resolve) => { const x = off.listen(0, '127.0.0.1', () => resolve(x)); });
  try {
    const b = `http://127.0.0.1:${s.address().port}`;
    assert.deepEqual(await (await fetch(`${b}/api/telegraph`)).json(), { ok: false, enabled: false, messages: [], removed: [] });
    const r = await fetch(`${b}/api/telegraph`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"A","text":"x"}' });
    assert.equal(r.status, 503);
  } finally { await new Promise((resolve) => s.close(resolve)); }
});
