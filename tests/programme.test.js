import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  makeCalendar, normalizeProgramme, artistsOf, spreadArtists, planLibrary, buildDay,
  DailyStation, DEFAULT_PROGRAMME,
} from '../server/lib/programme.js';

const EPOCH = Date.parse('2026-01-01T00:00:00Z');
const cal = makeCalendar({ timeZone: 'Europe/Paris', dayStarts: '05:00' });
const DAY = 86_400_000;

/** A small library shaped like the real one: favourites, the loop, albums, long mixes. */
function library() {
  const out = [];
  const add = (relPath, artist, duration) => out.push({ id: `id${String(out.length).padStart(4, '0')}`, relPath, artist, title: relPath.split('/').pop(), duration });
  for (let i = 0; i < 6; i++) add(`For Radio/fav${i}.mp3`, i % 2 ? 'undersaken' : 'snowpoint lounge', 200 + i * 10);
  for (let i = 0; i < 3; i++) add(`For The Waves/wave${i}.mp3`, 'slowerpace', 240);
  for (let i = 0; i < 30; i++) add(`BarberBeats/loop${i}.mp3`, ['undersaken', 'Mabisyo', 'silph skyline', 'Blank Banshee'][i % 4], 180 + (i % 5) * 20);
  for (let a = 0; a < 40; a++) for (let i = 0; i < 10; i++) add(`Crates/Bandcamp/album${a}/t${i}.mp3`, a % 4 === 0 ? `Artist ${a}` : 'undersaken', 150 + ((a * 7 + i * 13) % 200));
  for (let i = 0; i < 7; i++) add(`Liminal Atmosphere/mix${i}.mp3`, i === 3 ? 'undersaken' : `Mixer ${i}`, 1500 + i * 700);
  for (let i = 0; i < 4; i++) add(`More often/up${i}.mp3`, `Pushed ${i}`, 200);
  for (let i = 0; i < 2; i++) add(`Less often/down${i}.mp3`, `Rested ${i}`, 200);
  return out;
}

const tracks = library();
const rules = normalizeProgramme(DEFAULT_PROGRAMME);
const day0 = cal.dayOfDate('2026-10-14');

test('the broadcast day turns over at 05:00 Paris time, summer and winter', () => {
  // 14 October 2026: CEST, UTC+2 — 05:00 local is 03:00 UTC.
  assert.equal(cal.dayStart(day0), Date.parse('2026-10-14T03:00:00Z'));
  // 14 January 2027: CET, UTC+1 — 04:00 UTC.
  assert.equal(cal.dayStart(cal.dayOfDate('2027-01-14')), Date.parse('2027-01-14T04:00:00Z'));
  assert.equal(cal.dayOf(Date.parse('2026-10-14T02:59:59Z')), day0 - 1, '04:59 Paris still belongs to the day before');
  assert.equal(cal.dayOf(Date.parse('2026-10-14T03:00:00Z')), day0);
});

test('the days the clocks change last 25 and 23 hours, and no instant falls between days', () => {
  const autumn = cal.dayOfDate('2026-10-24'); // clocks go back early on Sunday 25 October
  assert.equal(cal.dayStart(autumn + 1) - cal.dayStart(autumn), 25 * 3_600_000);
  const spring = cal.dayOfDate('2027-03-27'); // forward early on Sunday 28 March
  assert.equal(cal.dayStart(spring + 1) - cal.dayStart(spring), 23 * 3_600_000);
  for (const d of [autumn, autumn + 1, spring, spring + 1]) {
    assert.equal(cal.dayOf(cal.dayStart(d)), d);
    assert.equal(cal.dayOf(cal.dayStart(d) - 1), d - 1);
  }
});

test('a broken rules block falls back instead of throwing', () => {
  const r = normalizeProgramme({ timeZone: 'Mars/Olympus', dayStarts: '29:99', lanes: 'nope' });
  assert.equal(r.timeZone, 'Europe/Paris');
  assert.equal(r.dayStarts, '05:00');
  assert.equal(r.lanes.length, DEFAULT_PROGRAMME.lanes.length);
  assert.deepEqual(normalizeProgramme(null).lanes.map((l) => l.kind), ['spaced', 'every', 'every', 'every', 'fill', 'every']);
  const odd = normalizeProgramme({ lanes: [{ name: 'Long', minMinutes: 20, perDay: 'lots', apart: -1 }, { name: 'Rest' }] });
  assert.equal(odd.lanes[0].perDay, 4);
  assert.equal(odd.lanes[0].apart, 3);
});

test('artists: collaborations count as each artist, aliases fold, untagged files read the title', () => {
  assert.deepEqual(artistsOf({ artist: 'undersaken & GORE' }), ['undersaken', 'gore']);
  assert.deepEqual(artistsOf({ artist: 'Saken 天' }, { 'saken 天': 'undersaken' }), ['undersaken']);
  assert.deepEqual(artistsOf({ artist: 'Unknown artist', title: 'Macroblank - 一生に一度' }), ['macroblank']);
  assert.deepEqual(artistsOf({ artist: 'Unknown artist', title: 'no dash here' }), []);
});

test('spreadArtists: one artist who is most of the day plays in the shortest runs there can be', () => {
  const items = [];
  for (let i = 0; i < 70; i++) items.push({ id: `u${i}`, a: 'U' });
  for (let i = 0; i < 30; i++) items.push({ id: `o${i}`, a: `O${i % 6}` });
  const out = spreadArtists(items, (t) => t.a, (l) => l, (x, y) => x.a === y.a, 7);
  assert.equal(out.length, 100);
  let run = 1;
  let worst = 1;
  for (let i = 1; i < out.length; i++) {
    run = out[i].a === out[i - 1].a ? run + 1 : 1;
    worst = Math.max(worst, run);
    if (out[i].a !== 'U') assert.notEqual(out[i].a, out[i - 1].a, 'two other artists side by side');
  }
  assert.ok(worst <= Math.ceil(70 / 31), `a run of ${worst}`);
});

test('every day fills exactly from its 05:00 to the next, including the 25-hour day', () => {
  const st = new DailyStation(tracks, { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  for (const d of [day0, day0 + 1, cal.dayOfDate('2026-10-24'), cal.dayOfDate('2027-03-27')]) {
    const order = st.cycleOrder(d);
    const total = order.reduce((s, t) => s + t.duration, 0) * 1000;
    assert.ok(Math.abs(total - (cal.dayStart(d + 1) - cal.dayStart(d))) < 2, `day ${cal.dateOf(d)} is off by ${total - (cal.dayStart(d + 1) - cal.dayStart(d))} ms`);
  }
});

test('the station is a pure function: two stations, same library and rules, same programme', () => {
  const a = new DailyStation(tracks, { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  const b = new DailyStation([...tracks].reverse(), { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  for (const t of [Date.parse('2026-10-14T12:34:56Z'), Date.parse('2026-10-20T02:00:00Z'), Date.parse('2026-12-31T23:59:59Z')]) {
    const x = a.at(t);
    const y = b.at(t);
    assert.equal(x.track.id, y.track.id);
    assert.equal(x.startsAt, y.startsAt);
  }
});

test('favourites every day, the loop once every two days, every album track within its pass, mixed', () => {
  const st = new DailyStation(tracks, { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  const plan = st._era.plan;
  const lane = (name) => plan.lanes.find((l) => l.name === name);
  const favs = lane('Favourites').tracks.map((t) => t.id);
  const loop = lane('Loop').tracks.map((t) => t.id);
  const albums = lane('Albums').tracks.map((t) => t.id);
  assert.equal(favs.length, 9);
  assert.equal(lane('Long mixes').tracks.length, 7);

  const days = 12;
  const heard = new Map();
  for (let d = day0; d < day0 + days; d++) {
    const order = st.cycleOrder(d);
    const ids = order.map((t) => t.id);
    for (const f of favs) assert.ok(ids.includes(f), `favourite ${f} missing on ${cal.dateOf(d)}`);
    for (const id of ids) heard.set(id, (heard.get(id) || 0) + 1);
    // Albums are mixed track by track: never a run of one album.
    const folder = (t) => t.relPath.split('/').slice(0, -1).join('/');
    for (let i = 1; i < order.length; i++) {
      if (order[i].relPath.startsWith('Crates/')) assert.notEqual(folder(order[i]), folder(order[i - 1]), `two tracks of one album in a row on ${cal.dateOf(d)}`);
    }
  }
  for (let d = day0; d < day0 + days; d += 2) {
    const ids = new Set([...st.cycleOrder(d), ...st.cycleOrder(d + 1)].map((t) => t.id));
    for (const r of loop) assert.ok(ids.has(r), `loop track ${r} skipped in the pass from ${cal.dateOf(d)}`);
  }
  for (const id of albums) assert.ok(heard.get(id) >= 1, `album track ${id} never played in ${days} days`);
  const mean = (ids) => ids.reduce((s, id) => s + (heard.get(id) || 0), 0) / ids.length;
  assert.ok(mean(favs) > mean(loop) && mean(loop) > mean(albums), `${mean(favs)} / ${mean(loop)} / ${mean(albums)}`);
});

test('long mixes: at most four a day, in turn, never two in a row, at least three songs between', () => {
  const st = new DailyStation(tracks, { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  const longIds = new Set(st._era.plan.spaced.tracks.map((t) => t.id));
  const heard = new Set();
  for (let d = day0; d < day0 + 4; d++) {
    const order = st.cycleOrder(d);
    const at = order.map((t, i) => (longIds.has(t.id) ? i : -1)).filter((i) => i >= 0);
    assert.ok(at.length <= 4, `${at.length} long mixes on ${cal.dateOf(d)}`);
    assert.equal(at.length, 4, 'the day has room for four');
    for (let j = 1; j < at.length; j++) assert.ok(at[j] - at[j - 1] - 1 >= 3, `only ${at[j] - at[j - 1] - 1} songs between two long mixes`);
    assert.equal(new Set(at.map((i) => order[i].id)).size, at.length, 'no long mix twice in a day');
    // Spread through the day, not bunched: the first in the first half, the last in the second.
    const startOf = (i) => order.slice(0, i).reduce((s, t) => s + t.duration, 0);
    assert.ok(startOf(at[0]) < 43_200 && startOf(at[at.length - 1]) > 43_200);
    for (const i of at) heard.add(order[i].id);
  }
  assert.equal(heard.size, 7, 'each long mix comes round in turn');
});

test('the reserved lanes: More often every three days, Less often once a month', () => {
  const st = new DailyStation(tracks, { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  const plan = st._era.plan;
  const up = plan.lanes.find((l) => l.name === 'More often').tracks.map((t) => t.id);
  const down = plan.lanes.find((l) => l.name === 'Less often').tracks.map((t) => t.id);
  assert.equal(up.length, 4);
  const count = new Map();
  for (let d = day0; d < day0 + 30; d++) for (const t of st.cycleOrder(d)) count.set(t.id, (count.get(t.id) || 0) + 1);
  for (const id of up) assert.ok(count.get(id) >= 10, `More often: ${count.get(id)} plays in 30 days`);
  // Less often can come back as an encore, but its own turn is once per 30 days.
  for (const id of down) assert.ok(count.get(id) >= 1 && count.get(id) < count.get(up[0]), `Less often: ${count.get(id)} plays`);
});

test('the last track of a day is cut at 05:00 and still resolves to its file', () => {
  const st = new DailyStation(tracks, { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  const before = st.at(cal.dayStart(day0 + 1) - 1000);
  assert.ok(before.endsAt <= cal.dayStart(day0 + 1));
  assert.equal(st.at(cal.dayStart(day0 + 1)).startsAt, cal.dayStart(day0 + 1), 'the new day starts on the dot');
  assert.equal(st.get(before.track.id).id, before.track.id);
});

test('a library change waits for the next 05:00 — the day on air does not move', () => {
  const st = new DailyStation(tracks, { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  const noon = Date.parse('2026-10-14T10:00:00Z');
  const before = st.at(noon + 3_600_000);
  const more = [...tracks];
  for (let i = 0; i < 25; i++) more.push({ id: `new${i}`, relPath: `Crates/Bandcamp/new/t${i}.mp3`, artist: 'Newcomer', title: `n${i}`, duration: 210 });
  st.setTracks(more, { now: noon });
  const after = st.at(noon + 3_600_000);
  assert.equal(after.track.id, before.track.id);
  assert.equal(after.startsAt, before.startsAt);
  // From the next morning, the newcomers are in the programme.
  const ids = new Set();
  for (let d = day0 + 1; d < day0 + 12; d++) for (const t of st.cycleOrder(d)) ids.add(t.id);
  assert.ok(ids.has('new0') && ids.has('new24'));
});

test('new rules are staged like a new library, at the next day boundary', () => {
  const st = new DailyStation(tracks, { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  const noon = Date.parse('2026-10-14T10:00:00Z');
  const today = st.cycleOrder(day0).map((t) => t.id).join();
  const loopDaily = { ...DEFAULT_PROGRAMME, lanes: DEFAULT_PROGRAMME.lanes.map((l) => (l.name === 'Loop' ? { ...l, every: 1 } : l)) };
  st.setTracks(tracks, { now: noon, programme: loopDaily });
  assert.equal(st.cycleOrder(day0).map((t) => t.id).join(), today);
  const rot = st._nextEra.plan.lanes.find((l) => l.name === 'Loop').tracks.map((t) => t.id);
  const tomorrow = new Set(st.cycleOrder(day0 + 1).map((t) => t.id));
  for (const r of rot) assert.ok(tomorrow.has(r), 'rotation is daily from tomorrow');
});

test('the DJ booth still works: a permutation of upcoming slots inside a day', () => {
  const st = new DailyStation(tracks, { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  const now = Date.parse('2026-10-14T12:00:00Z');
  const next = st.upcoming(now, 4);
  const ids = next.map((t) => t.id).reverse();
  const plan = st.planQueueOrder({ cycleIndex: next[0].cycleIndex, startWithin: next[0].withinCycle, ids }, { now, lockMs: 0 });
  assert.equal(plan.ok, true);
  st.applyQueueOverride(plan.override);
  assert.deepEqual(st.upcoming(now, 4).map((t) => t.id), ids);
  const end = st.cycleOrder(day0).reduce((s, t) => s + t.duration, 0);
  assert.ok(Math.abs(end * 1000 - (cal.dayStart(day0 + 1) - cal.dayStart(day0))) < 2, 'the day still ends at 05:00');
});

test('a library of three short tracks still fills the day, and an empty one is silent', () => {
  const tiny = [1, 2, 3].map((i) => ({ id: `s${i}`, relPath: `x/${i}.mp3`, artist: `A${i}`, title: `t${i}`, duration: 100 + i }));
  const st = new DailyStation(tiny, { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  const total = st.cycleOrder(day0).reduce((s, t) => s + t.duration, 0);
  assert.ok(Math.abs(total * 1000 - DAY) < 2);
  const empty = new DailyStation([], { epoch: EPOCH, programme: DEFAULT_PROGRAMME });
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.at(Date.parse('2026-10-14T12:00:00Z')), null);
});

test('planLibrary: a rotation too big for the day slows down instead of crowding out the albums', () => {
  const huge = [];
  // 800 × 5 min every two days would be 33 h a day.
  for (let i = 0; i < 800; i++) huge.push({ id: `r${i}`, relPath: `Loop/${i}.mp3`, artist: `A${i % 9}`, duration: 300 });
  for (let i = 0; i < 100; i++) huge.push({ id: `c${i}`, relPath: `Crates/Bandcamp/x/${i}.mp3`, artist: 'B', duration: 300 });
  const plan = planLibrary(huge, rules, cal);
  const rot = plan.lanes.find((l) => l.name === 'Loop');
  assert.ok(rot.period > 2, `period ${rot.period}`);
  const day = buildDay(plan, day0, { calendar: cal, rules });
  const albums = day.filter((t) => t.relPath.startsWith('Crates/')).reduce((s, t) => s + t.duration, 0);
  assert.ok(albums >= 86_400 * 0.09, `the albums kept ${albums} s`);
  assert.ok(Math.abs(day.reduce((s, t) => s + t.duration, 0) * 1000 - DAY) < 2);
});

/* ------------------------------------------------------------ the server */

/**
 * Silent MPEG-1 Layer III frames (128 kbit/s, 44.1 kHz): enough for the
 * scanner to read a duration, so this runs where ffmpeg is not installed.
 * Untagged, so the artist comes from an "Artist - Title" file name.
 */
async function silentMp3(file, seconds) {
  const frame = Buffer.alloc(417);
  frame.writeUInt32BE(0xfffb9064, 0);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, Buffer.concat(Array(Math.round((seconds * 44100) / 1152)).fill(frame)));
}

test('a tower whose channels.json has a programme plays the daily programme', async () => {
  const MUSIC = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-programme-'));
  const files = [
    ['For Radio/undersaken - Malon.mp3', 40], ['For Radio/snowpoint lounge - Red Chain.mp3', 45],
    ['BarberBeats/Mabisyo - Grove.mp3', 30], ['BarberBeats/undersaken - Taurus.mp3', 35], ['BarberBeats/Blank Banshee - Eco Zones.mp3', 25],
    ['Crates/Bandcamp/undersaken - wallpaper sky/undersaken - One.mp3', 30],
    ['Crates/Bandcamp/undersaken - wallpaper sky/undersaken - Two.mp3', 32],
    ['Crates/Bandcamp/deadoralive - Parallaxis/deadoralive - Three.mp3', 28],
    ['Liminal Atmosphere/Macroblank - Long one.mp3', 120],
  ];
  for (const [rel, s] of files) await silentMp3(path.join(MUSIC, rel), s);
  const programme = {
    ...DEFAULT_PROGRAMME,
    lanes: DEFAULT_PROGRAMME.lanes.map((l) => (l.name === 'Long mixes' ? { ...l, minMinutes: 1.5 } : l)),
  };
  await fsp.writeFile(path.join(MUSIC, 'channels.json'), JSON.stringify({
    default: 'all',
    programme,
    channels: [{ slug: 'all', label: 'Radio Tower', order: 'station' }],
  }));

  process.env.MUSIC_DIR = MUSIC;
  process.env.CACHE_FILE = path.join(MUSIC, '.cache', 'library.json');
  process.env.STATION_EPOCH = '2026-01-01T00:00:00Z';
  process.env.AUTO_RESCAN_MINUTES = '0';
  delete process.env.CHANNELS_FILE;
  const { createApp, rescan, station } = await import('../server/index.js');
  assert.ok(station instanceof DailyStation, 'the programme in channels.json makes the tower daily');
  await rescan({ useCache: false });

  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p) => (await fetch(base + p)).json();
  try {
    const ch = await get('/api/channels');
    assert.equal(ch.default, 'all');
    assert.equal(ch.channels[0].order, 'daily');

    const now = Date.now();
    const plain = await get('/api/station');
    const all = await get('/api/station?channel=all');
    assert.equal(plain.onAir.id, all.onAir.id, 'with or without a channel, one programme');
    assert.equal(plain.onAir.id, station.at(now).track.id);

    const today = station.calendar.dayOf(now);
    const start = station.calendar.dayStart(today);
    const iso = (ms) => encodeURIComponent(new Date(ms).toISOString());
    const guide = await get(`/api/schedule?from=${iso(start)}&to=${iso(start + 3_600_000)}`);
    assert.equal(guide.items[0].startsAt, start, 'the day opens on the dot at 05:00');
    const favs = new Set(station.cycleOrder(today).map((t) => t.title));
    assert.ok(favs.has('undersaken - Malon') && favs.has('snowpoint lounge - Red Chain'), 'the favourites are in today');
  } finally {
    server.close();
  }
});

test('library/channels.programme.json — the file to publish — holds exactly the default rules', async () => {
  const doc = JSON.parse(await fsp.readFile(new URL('../library/channels.programme.json', import.meta.url), 'utf8'));
  assert.deepEqual(normalizeProgramme(doc.programme), normalizeProgramme(DEFAULT_PROGRAMME));
  assert.equal(doc.default, 'all');
  assert.equal(doc.channels.find((c) => c.slug === 'all')?.order, 'station', "the 'all' channel is the tower's own (daily) programme");
});
