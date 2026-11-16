/**
 * The station's view of the telegraph line (Ortis, 2026-11-16: « more
 * parameters in the chat logs for admin with history beyond what's not kept
 * and restore option »).
 *
 * What must hold:
 *   - the log says more than the room is told — the track on air, a sender
 *     tag — and the room is never told either;
 *   - the tag is the same for one sender within a day, changes at the day's
 *     turn, and no address is anywhere on the disk;
 *   - the history reads both log files, says what happened to each message
 *     (on the line, taken off, gone at 05:00), and filters by day and words;
 *   - restore puts back exactly one message, with its id and its time, for
 *     listeners who ask by id too, and across a restart;
 *   - a silenced sender stays silenced across a restart, and can be given the
 *     line back;
 *   - a whole room cannot be flooded from many addresses;
 *   - the log can be told how many days to go back;
 *   - none of it without the station key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-telegraph-log-'));
const KEY = 'right-key-0123456789';
Object.assign(process.env, {
  MUSIC_DIR: dir,
  CACHE_FILE: path.join(dir, '.cache', 'l.json'),
  TELEGRAPH_LOG: path.join(dir, 'line', 'telegraph.jsonl'),
  AUTO_RESCAN_MINUTES: '0',
  STATION_KEY: KEY,
});
const { Telegraph, dailyReset, replay, historyCsv } = await import('../server/lib/telegraph.js');
const { RateLimiter } = await import('../server/lib/ratelimit.js');

function clock(start = Date.parse('2026-11-16T12:00:00Z')) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}
const paris = dailyReset('05:00', 'Europe/Paris');
const open = (o = {}) => new Telegraph({ dayStart: paris, limiter: new RateLimiter({ capacity: 1000, refillPerSec: 1000 }), ...o });
const lines = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('the log says more than the room is told: the track on air and a sender tag, never an address', async () => {
  const logFile = path.join(dir, 'fields', 'line.jsonl');
  const now = clock();
  const t = open({ logFile, now, onAir: () => ({ id: 'trk-default', title: 'Carrier Wave' }) });
  const a = t.post({ name: 'Ada', icon: 'moon.svg', text: 'first', stream: 'Chill', who: '203.0.113.7', on: { id: 'trk-9', title: 'Night Shift', path: '/srv/x.mp3' } });
  const b = t.post({ name: 'Ada', text: 'second', who: '203.0.113.7' });
  const c = t.post({ name: 'Bo', text: 'third', who: '203.0.113.8', on: null });
  assert.deepEqual(Object.keys(a.message), ['id', 't', 'name', 'icon', 'text', 'stream', 'host'], 'the room gets what it always got');
  for (const m of t.since(0).messages) assert.ok(!('tag' in m) && !('on' in m), 'no tag and no track in what listeners read');
  await t.flushed();
  const kept = lines(logFile);
  assert.deepEqual(kept[0].on, { id: 'trk-9', title: 'Night Shift' }, 'the track the route named: its id and title, nothing else of it');
  assert.deepEqual(kept[1].on, { id: 'trk-default', title: 'Carrier Wave' }, '…or the tower\'s own, when none is named');
  assert.equal('on' in kept[2], false, 'nothing on air is nothing written');
  assert.match(kept[0].tag, /^[\w-]{22}$/);
  assert.equal(kept[0].tag, kept[1].tag, 'one sender, one tag, within the day');
  assert.notEqual(kept[0].tag, kept[2].tag);
  assert.equal(b.ok && c.ok, true);
  for (const f of fs.readdirSync(path.dirname(logFile))) assert.doesNotMatch(fs.readFileSync(path.join(path.dirname(logFile), f), 'utf8'), /203\.0\.113/, `${f}: no address on the disk`);
});

test('the tag lasts one day: a restart keeps it, the morning changes it, and the day before last cannot be tied to anyone', async () => {
  const logFile = path.join(dir, 'salt', 'line.jsonl');
  const now = clock(Date.parse('2026-11-16T12:00:00Z'));
  const one = open({ logFile, now });
  const today = one._tag('203.0.113.7');
  assert.equal(open({ logFile, now })._tag('203.0.113.7'), today, 'a restart during the day gives the same sender the same tag');
  const salt1 = JSON.parse(fs.readFileSync(`${logFile}.salt`, 'utf8'));
  now.advance(24 * 3600_000); // the next broadcast day
  const two = open({ logFile, now });
  assert.notEqual(two._tag('203.0.113.7'), today, 'the next morning it is another tag');
  const salt2 = JSON.parse(fs.readFileSync(`${logFile}.salt`, 'utf8'));
  assert.equal(salt2.prev, salt1.salt, 'yesterday\'s salt is kept one more day (a silence holds across 05:00)');
  now.advance(24 * 3600_000);
  open({ logFile, now })._tag('x');
  const salt3 = JSON.parse(fs.readFileSync(`${logFile}.salt`, 'utf8'));
  assert.ok(salt3.salt !== salt1.salt && salt3.prev !== salt1.salt, '…and after that it is gone');
});

test('the history: everything kept, across both files, with what happened to each message', async () => {
  const logFile = path.join(dir, 'history', 'line.jsonl');
  const now = clock(Date.parse('2026-11-15T12:00:00Z'));
  const before = open({ logFile, now });
  const old = [];
  for (let i = 0; i < 6; i++) { old.push(before.post({ name: 'Owl', text: `yesterday ${i}`, who: 'owl' }).message); now.advance(60_000); }
  await before.flushed();
  // The log turned over in the night: yesterday is in the set-aside file, and the tower was restarted.
  fs.renameSync(logFile, `${logFile}.1`);
  now.advance(24 * 3600_000);
  const t = open({ logFile, now });
  const a = t.post({ name: 'Ada', text: 'good morning', stream: 'Chill', who: 'ada' }).message;
  now.advance(1000);
  const b = t.post({ name: 'Troll', text: 'RUDE words', who: 'troll' }).message;
  now.advance(1000);
  t.remove(b.id, { mute: true });

  const all = await t.history();
  assert.equal(all.total, 8);
  assert.deepEqual(all.entries.map((e) => e.id), [b.id, a.id, ...old.map((m) => m.id).reverse()], 'newest first, the set-aside file included');
  const by = new Map(all.entries.map((e) => [e.id, e]));
  assert.equal(by.get(a.id).state, 'on');
  assert.equal(by.get(b.id).state, 'removed');
  assert.equal(by.get(b.id).silenced, true);
  assert.equal(by.get(b.id).removedAt, now());
  assert.ok(by.get(b.id).mutedUntil > now(), 'a row says its sender is silenced, and until when');
  assert.equal(by.get(old[0].id).state, 'left', 'what the room let go at 05:00 is still in the log');
  assert.equal(all.day, paris(now()));
  assert.deepEqual(all.muted.map((m) => m.tag), [by.get(b.id).tag]);

  assert.deepEqual((await t.history({ q: 'rude' })).entries.map((e) => e.id), [b.id], 'by words, whatever the case');
  assert.deepEqual((await t.history({ name: 'ad' })).entries.map((e) => e.id), [a.id], 'by name');
  assert.equal((await t.history({ to: paris(now()) - 1 })).total, 6, 'by day: before this morning');
  assert.equal((await t.history({ from: paris(now()) })).total, 2, '…and since');
  const page = await t.history({ limit: 3, offset: 3 });
  assert.deepEqual([page.total, page.entries.length, page.entries[0].id], [8, 3, old[4].id], 'in pages');

  const csv = historyCsv([{ ...by.get(b.id), text: '=HYPERLINK("x"), she said\n"hi"' }, by.get(a.id)]);
  const [head, first] = csv.split('\r\n');
  assert.equal(head, 'id,time,name,character,stream,text,station,track_id,track_title,sender_tag,state,taken_off,silenced,restored');
  assert.match(first, /,"'=HYPERLINK\(""x""\), she said\n""hi""",/,'a cell that would run as a formula is defused, quotes doubled');
  assert.match(csv, /good morning,,,,[\w-]{22},on,,,\r\n$/);
});

test('restore: exactly one message back, with its id and its time — for listeners who ask by id, and after a restart', async () => {
  const logFile = path.join(dir, 'restore', 'line.jsonl');
  const now = clock(Date.parse('2026-11-15T12:00:00Z'));
  const t = open({ logFile, now });
  const old = t.post({ name: 'Owl', text: 'said yesterday', who: 'owl', on: { id: 'trk-1', title: 'Low Band' } }).message;
  now.advance(24 * 3600_000);
  const a = t.post({ name: 'Ada', text: 'today', who: 'ada' }).message;
  const gone = t.post({ name: 'Bo', text: 'taken off', who: 'bo' }).message;
  t.remove(gone.id);
  assert.deepEqual(t.since(0).messages.map((m) => m.id), [a.id]);

  assert.equal((await t.restore(a.id)).error, 'on_the_line', 'a message on the line is not restored twice');
  assert.equal((await t.restore(12345)).error, 'unknown_message');

  now.advance(5000);
  const back = await t.restore(gone.id);
  assert.deepEqual(back.message, { ...gone, restored: now() }, 'its id, its time, its words; and when it came back');
  const seen = t.since(a.id + 1_000_000);
  assert.deepEqual(seen.messages, [], 'nothing is newer than what the page has…');
  assert.deepEqual(seen.restored?.map((m) => m.id), [gone.id], '…so what was put back is said apart');
  assert.deepEqual(seen.removed, [], 'and it is no longer on the list of what went');

  const back2 = await t.restore(old.id);
  assert.equal(back2.message.t, old.t, 'yesterday\'s message keeps yesterday\'s time');
  assert.deepEqual(t.since(0).messages.map((m) => m.id), [old.id, a.id, gone.id], 'in the room, in order');
  assert.equal((await t.history()).entries.find((e) => e.id === old.id).state, 'on');

  await t.flushed();
  const again = open({ logFile, now });
  assert.deepEqual(again.since(0).messages.map((m) => [m.id, m.restored]), [[old.id, back2.message.restored], [a.id, undefined], [gone.id, back.message.restored]],
    'a restart keeps what was put back');
  const h = await again.history();
  assert.deepEqual(h.entries.find((e) => e.id === old.id).on, { id: 'trk-1', title: 'Low Band' }, 'and the log still knows what was on air');
  assert.equal(h.total, 3, 'each message once, whatever happened to it');

  again.remove(gone.id);
  assert.deepEqual(again.since(0).messages.map((m) => m.id), [old.id, a.id], 'what was put back can be taken off again');
  now.advance(24 * 3600_000);
  assert.deepEqual(again.since(0).messages, [], 'and the next morning the room is empty, restored or not');
});

test('a restored message whose first line has left the log still comes back at the next start; so does a room whose log just turned over', async () => {
  const logFile = path.join(dir, 'restore-rotated', 'line.jsonl');
  const now = clock();
  const t = open({ logFile, now, logMaxBytes: 600 });
  const first = t.post({ name: 'Owl', text: 'the one to keep', who: 'owl' }).message;
  t.remove(first.id);
  const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  // Fill until the log turns over once: the message is then in the set-aside file only.
  for (let i = 0; i < 20 && !read(`${logFile}.1`).includes('the one to keep'); i++) { t.post({ name: 'A', text: `early ${i}`, who: `w${i}` }); await t.flushed(); }
  assert.ok(!read(logFile).includes('the one to keep') && read(`${logFile}.1`).includes('the one to keep'), 'this test needs the message in the set-aside file');
  const inRoom = t.since(0).messages.map((m) => m.id);
  assert.deepEqual(open({ logFile, now }).since(0).messages.map((m) => m.id), inRoom, 'a restart right after the log turned over keeps the whole room');

  assert.equal((await t.restore(first.id)).ok, true);
  const firstLine = new RegExp(`^\{"id":${first.id},`, 'm');
  // …and until it turns over again: the line the message was first written on is gone from the disk.
  for (let i = 0; i < 20 && firstLine.test(read(`${logFile}.1`)); i++) { t.post({ name: 'A', text: `late ${i}`, who: `v${i}` }); await t.flushed(); }
  assert.doesNotMatch(read(`${logFile}.1`) + read(logFile), firstLine, 'this test needs the first line gone');
  const again = open({ logFile, now });
  assert.ok(again.since(0).messages.some((m) => m.id === first.id && m.text === 'the one to keep'), 'the restore event carries the message with it');
});

test('a silenced sender stays silenced across a restart and across 05:00, and can be given the line back', async () => {
  const logFile = path.join(dir, 'mute', 'line.jsonl');
  const now = clock(Date.parse('2026-11-16T02:00:00Z')); // 03:00 in Paris: the day turns in two hours
  const t = open({ logFile, now });
  const m = t.post({ name: 'Troll', text: 'rude', who: 'troll' }).message;
  assert.deepEqual(t.remove(m.id, { mute: true }), { ok: true, muted: true });
  await t.flushed();

  const again = open({ logFile, now });
  assert.equal(again.post({ name: 'Troll', text: 'back?', who: 'troll' }).error, 'muted', 'a deploy does not forgive (BACKLOG B7)');
  assert.equal(again.post({ name: 'Ada', text: 'hello', who: 'ada' }).ok, true);
  now.advance(3 * 3600_000); // 06:00 in Paris: a new day, a new salt
  assert.equal(again.post({ name: 'Troll', text: 'morning?', who: 'troll' }).error, 'muted', 'still silenced after the day turned');

  const [who] = again.muted();
  assert.equal(again.unmute('nobody').error, 'not_muted');
  assert.deepEqual(again.unmute(who.tag), { ok: true });
  assert.equal(again.post({ name: 'Troll', text: 'thank you', who: 'troll' }).ok, true);
  await again.flushed();
  assert.equal(open({ logFile, now }).post({ name: 'Troll', text: 'still fine', who: 'troll' }).ok, true, 'and that, too, survives a restart');

  const day = open({ logFile: path.join(dir, 'mute2', 'line.jsonl'), now });
  const x = day.post({ name: 'Troll', text: 'rude', who: 'troll' }).message;
  day.remove(x.id, { mute: true });
  now.advance(24 * 3600_000 + 1);
  assert.equal(day.post({ name: 'Troll', text: 'sorry', who: 'troll' }).ok, true, 'a day later the line is theirs again');
  assert.deepEqual(day.muted(), []);
});

test('the room has a ceiling of its own: many addresses cannot flood it, and the station is never told to wait', () => {
  const now = clock();
  const t = new Telegraph({ now });
  let sent = 0;
  let refused = null;
  for (let i = 0; i < 40 && !refused; i++) {
    const out = t.post({ name: 'A', text: `m${i}`, who: `address-${i}` });
    if (out.ok) sent++; else refused = out;
  }
  assert.equal(sent, 30, 'thirty at once, whoever sends them');
  assert.deepEqual([refused.status, refused.error], [429, 'busy_line']);
  assert.ok(refused.retryAfter >= 1);
  assert.equal(t.post({ name: 'Tower', text: 'calm down', who: 'studio', host: true }).ok, true, 'the station\'s own message goes through');
  now.advance(2000);
  assert.equal(t.post({ name: 'B', text: 'one more', who: 'someone new' }).ok, true, 'then one every two seconds');
});

test('the log can be told how many days to go back', async () => {
  const logFile = path.join(dir, 'keep', 'line.jsonl');
  const now = clock(Date.parse('2026-11-01T12:00:00Z'));
  const t = open({ logFile, now });
  t.post({ name: 'Owl', text: 'two weeks ago', who: 'owl' });
  now.advance(10 * 86_400_000);
  t.post({ name: 'Owl', text: 'four days ago', who: 'owl' });
  now.advance(4 * 86_400_000);
  t.post({ name: 'Owl', text: 'today', who: 'owl' });
  await t.flushed();
  assert.equal((await t.history()).total, 3, 'with no number set, nothing is dropped by age');

  const week = open({ logFile, now, logKeepDays: 7 });
  await week.flushed();
  assert.deepEqual((await week.history()).entries.map((e) => e.text), ['today', 'four days ago']);
  assert.doesNotMatch(fs.readFileSync(logFile, 'utf8'), /two weeks ago/, 'older lines leave the file itself');
  now.advance(4 * 86_400_000);
  week.since(0); // the day turned: the log is trimmed again
  await week.flushed();
  assert.deepEqual((await week.history()).entries.map((e) => e.text), ['today']);
});

test('an older log (before 2026-11-16) still reads: no tag, no track, a removal without a reason', () => {
  const { entries, muted } = replay(['{"id":5,"t":5,"name":"Ada","icon":null,"text":"old","stream":null,"host":false}\nnot json\n{"del":5,"t":9}\n', '{"id":7,"t":7,"name":"Bo","text":"new"}\n']);
  assert.deepEqual([...entries.keys()], [5, 7]);
  assert.deepEqual(entries.get(5), { id: 5, t: 5, name: 'Ada', icon: null, text: 'old', stream: null, host: false, on: null, tag: null, removedAt: 9, silenced: false, restoredAt: null });
  assert.equal(muted.size, 0);
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
const keyed = { 'x-station-key': KEY };

test('the tower: the log, restore and un-silence answer only to the station key', async () => {
  const { message } = await (await post('/api/telegraph', { name: 'Ada', text: 'for the log' })).json();
  for (const [method, p, body] of [['GET', '/api/telegraph/log'], ['GET', '/api/telegraph/log?format=csv'], ['POST', '/api/telegraph/restore', { id: message.id }], ['POST', '/api/telegraph/unmute', { tag: 'x' }]]) {
    const none = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(none.status, 401, `${method} ${p} without the key`);
    assert.doesNotMatch(await none.text(), /for the log/);
  }
  const room = await (await fetch(`${base}/api/telegraph`)).json();
  assert.ok(room.messages.every((m) => !('tag' in m) && !('on' in m)), 'the open room never carries the log\'s extra fields');
});

test('the tower: the station reads the log, takes a message off, puts it back, and gives a silenced sender the line again', async () => {
  const { message } = await (await post('/api/telegraph', { name: 'Bo', text: 'put me back' })).json();
  assert.deepEqual(await (await post('/api/telegraph/remove', { id: message.id, mute: true }, keyed)).json(), { ok: true, muted: true });
  assert.equal((await post('/api/telegraph', { name: 'Bo', text: 'am I silenced' })).status, 403);

  const log = await (await fetch(`${base}/api/telegraph/log?q=put%20me`, { headers: keyed })).json();
  assert.equal(log.ok, true);
  assert.equal(log.total, 1);
  const row = log.entries[0];
  assert.deepEqual([row.id, row.state, row.silenced, typeof row.tag, row.host], [message.id, 'removed', true, 'string', false]);
  assert.equal(log.muted.length, 1);
  assert.equal(log.muted[0].tag, row.tag);
  assert.equal(log.keepDays, 0);

  const back = await (await post('/api/telegraph/restore', { id: message.id }, keyed)).json();
  assert.equal(back.message.id, message.id);
  assert.ok(back.message.restored >= message.t);
  const room = await (await fetch(`${base}/api/telegraph?since=${Date.now() + 60_000}`)).json();
  assert.deepEqual(room.restored.map((m) => m.text), ['put me back'], 'a page that asks by id is told what came back');
  assert.ok(!room.removed.includes(message.id));
  assert.equal((await post('/api/telegraph/restore', { id: message.id }, keyed)).status, 409);
  assert.equal((await post('/api/telegraph/restore', { id: 1 }, keyed)).status, 404);

  assert.deepEqual(await (await post('/api/telegraph/unmute', { tag: row.tag }, keyed)).json(), { ok: true });
  assert.equal((await post('/api/telegraph', { name: 'Bo', text: 'thank you' })).status, 201);
  assert.equal((await post('/api/telegraph/unmute', { tag: row.tag }, keyed)).status, 404);

  const csv = await fetch(`${base}/api/telegraph/log?format=csv`, { headers: keyed });
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /attachment; filename="telegraph-line-\d{4}-\d\d-\d\d\.csv"/);
  const text = await csv.text();
  assert.match(text, /^id,time,name,/);
  assert.match(text, /put me back/);
  assert.doesNotMatch(text, /127\.0\.0\.1|::1/, 'no address in the export either');
});
