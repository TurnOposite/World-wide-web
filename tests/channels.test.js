/**
 * Channels — several synced clocks from one library (server/lib/channels.js).
 *
 * What must hold:
 *   - Mashup really alternates: every track once per cycle, crates dealt out
 *     in turn, never one crate's whole run back to back;
 *   - each channel is a station in its own right: two listeners on the same
 *     channel agree at every instant, from nothing but the clock;
 *   - the 'all' channel *is* the original programme — nothing that predates
 *     channels moves;
 *   - a DJ's reorder on one channel touches no other;
 *   - the server answers per channel, and a working folder (`_inbox/`) is
 *     never on air.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { Station, interleave } from '../server/lib/schedule.js';
import { ChannelSet, DEFAULT_CHANNEL_SPEC, STREAMS, crateOf, expandSpec, foldPath, inFolders, matches, slugify, withStreams } from '../server/lib/channels.js';
import { CloudEngine, overridesOf } from '../site/js/engine/cloud.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The real cloud library, but with the full dial these tests exercise —
// Mashup, Long mixes, a channel per crate, the old loop — fixed here rather
// than read from site/station/library.json, whose `channels` is a deployment
// choice that changes (2026-10-08: one shuffled channel, at Ortis's request).
const LIBRARY = {
  ...JSON.parse(fs.readFileSync(path.join(ROOT, 'site/station/library.json'), 'utf8')),
  channels: {
    default: 'mashup',
    channels: [
      { slug: 'mashup', label: 'Mashup', order: 'interleave', maxMinutes: 20 },
      { slug: 'long', label: 'Long mixes', order: 'shuffle', minMinutes: 20 },
      { auto: 'crates', order: 'library', minTracks: 5 },
      { slug: 'all', label: 'Album order', order: 'station' },
    ],
  },
};
const EPOCH = Date.parse('2026-01-01T00:00:00Z');

/** A library shaped like Ortis's: three crates of songs, one crate of long mixes. */
function makeLibrary() {
  const tracks = [];
  const add = (crate, n, seconds) => {
    for (let i = 0; i < n; i++) {
      tracks.push({
        id: `${slugify(crate).slice(0, 6)}${String(i).padStart(6, '0')}`.slice(0, 12),
        title: `${crate} ${i + 1}`,
        artist: crate,
        duration: seconds + i * 7,
        relPath: `${crate}/${String(i + 1).padStart(2, '0')}.mp3`,
        genreSlug: 'unsorted',
        genreLabel: 'Unsorted',
      });
    }
  };
  add('BarberBeats', 9, 200);
  add('Upbeat', 6, 180);
  add('VGM', 3, 240);
  add('Liminal Atmosphere', 4, 3600);
  return tracks;
}

/* ------------------------------------------------------------ interleave */

test('interleave plays every track exactly once per cycle, and the same way everywhere', () => {
  const tracks = makeLibrary().filter((t) => t.duration < 1200);
  for (const seed of [1, 99, 2654435761]) {
    const a = interleave(tracks, seed, crateOf);
    const b = interleave(tracks.slice().reverse().reverse(), seed, crateOf);
    assert.equal(a.length, tracks.length);
    assert.deepEqual(new Set(a.map((t) => t.id)).size, tracks.length, 'nothing repeated, nothing dropped');
    assert.deepEqual(a.map((t) => t.id), b.map((t) => t.id), 'same seed, same order');
  }
  assert.notDeepEqual(
    interleave(tracks, 1, crateOf).map((t) => t.id),
    interleave(tracks, 2, crateOf).map((t) => t.id),
    'a new cycle is a new deal',
  );
});

test('interleave deals the crates out in turn — no crate plays twice in a row while others wait', () => {
  // 9 + 6 + 3 songs: BarberBeats is half the songs, so it may sit next to
  // itself at most a handful of times; the smaller crates never may.
  const tracks = makeLibrary().filter((t) => t.duration < 1200);
  for (let cycle = 0; cycle < 50; cycle++) {
    const order = interleave(tracks, cycle * 7919 + 3, crateOf);
    let repeats = 0;
    for (let i = 1; i < order.length; i++) {
      if (crateOf(order[i]) === crateOf(order[i - 1])) {
        repeats++;
        assert.equal(crateOf(order[i]), 'BarberBeats', `cycle ${cycle}: ${crateOf(order[i])} twice in a row`);
      }
    }
    assert.ok(repeats <= 2, `cycle ${cycle}: ${repeats} back-to-back repeats`);
  }
});

/* -------------------------------------------------------------- the spec */

test('the default spec gives a Mashup of songs, a Long-mix channel, one per crate, and Everything', () => {
  const tracks = makeLibrary();
  const main = new Station(tracks, { epoch: EPOCH });
  const set = new ChannelSet({ station: { epoch: EPOCH }, main }).setTracks(tracks, { now: EPOCH });
  const list = set.list({ now: EPOCH + 1e6 });
  const slugs = list.map((c) => c.slug);
  assert.deepEqual(slugs, ['mashup', 'long', 'crate-barberbeats', 'crate-liminal-atmosphere', 'crate-upbeat', 'crate-vgm', 'all']);
  assert.equal(set.defaultSlug, 'mashup');

  const by = Object.fromEntries(list.map((c) => [c.slug, c]));
  assert.equal(by.mashup.trackCount, 18, 'every song, no long mix');
  assert.equal(by.long.trackCount, 4, 'only the long mixes');
  assert.equal(by.all.trackCount, tracks.length);
  assert.equal(set.get('all'), main, "'all' is the original programme, not a copy");
  assert.ok(set.get('mashup').tracks.every((t) => t.duration < 20 * 60));
  assert.ok(set.get('long').tracks.every((t) => t.duration >= 20 * 60));
  assert.equal(set.get('mashup').order, 'interleave');
});

test('a channel with nothing to play is not offered — the cloud library has no long mix yet', () => {
  const set = new ChannelSet({ station: { epoch: EPOCH } }).setTracks(LIBRARY.tracks, { now: EPOCH });
  const slugs = set.list().map((c) => c.slug);
  assert.ok(slugs.includes('mashup'));
  assert.ok(!slugs.includes('long'), 'no track on the web is 20 minutes or more');
  assert.ok(!slugs.includes('all'), 'no main station given, so no Everything channel');
  assert.equal(set.resolve('long'), 'mashup', 'asking for a missing channel lands on the default');
});

test('crates come from the folder, else the track, else the genre; filters read them case- and accent-blind', () => {
  assert.equal(crateOf({ relPath: 'Liminal Atmosphere/x.mp3' }), 'Liminal Atmosphere');
  assert.equal(crateOf({ relPath: 'loose.mp3', genreLabel: 'Vaporwave' }), 'Vaporwave');
  assert.equal(crateOf({ crate: 'Crates', relPath: 'BarberBeats/x.mp3' }), 'Crates');
  assert.ok(matches({ duration: 60, relPath: 'Été Chill/x.mp3' }, { crates: ['ete chill'] }));
  assert.ok(!matches({ duration: 60, relPath: 'Upbeat/x.mp3' }, { excludeCrates: ['UPBEAT'] }));
  const spec = { channels: [{ slug: 'Night Drive!', crates: ['Upbeat'] }, { slug: 'night-drive', label: 'dupe' }, { auto: 'crates', except: ['Upbeat'] }] };
  const ex = expandSpec(makeLibrary(), spec);
  assert.equal(ex[0].slug, 'night-drive');
  assert.equal(ex.filter((c) => c.slug === 'night-drive').length, 1, 'first slug wins');
  assert.ok(!ex.some((c) => c.slug === 'crate-upbeat'), 'except removes a crate channel');
});

test('a library change on one channel waits for that channel\'s cycle to end, like the station always did', () => {
  const tracks = makeLibrary();
  const set = new ChannelSet({ station: { epoch: EPOCH } }).setTracks(tracks, { now: EPOCH });
  const t = EPOCH + 5 * 3600e3 + 1234;
  const before = set.get('mashup').at(t);
  const more = [...tracks, { id: 'newsong00001', title: 'New', artist: 'X', duration: 150, relPath: 'Upbeat/new.mp3' }];
  set.setTracks(more, { now: t });
  const after = set.get('mashup').at(t);
  assert.equal(after.track.id, before.track.id, 'the song on air did not change under anyone');
  assert.equal(Math.round(after.offset * 1000), Math.round(before.offset * 1000));
});

/* ------------------------------------------------- in the browser (cloud) */

test('two browsers on the same channel agree at every instant; different channels are different programmes', () => {
  const library = { ...LIBRARY, tracks: makeLibrary() };
  const start = Date.parse('2026-10-07T00:00:00Z');
  let differ = 0;
  for (let i = 0; i < 400; i++) {
    const t = start + i * 91_337;
    for (const ch of ['mashup', 'long', 'crate-upbeat', 'all']) {
      const a = new CloudEngine({ library, clock: () => t, channel: ch });
      const b = new CloudEngine({ library, clock: () => t, channel: ch });
      const x = a.station.at(t);
      const y = b.station.at(t);
      assert.equal(x.track.id, y.track.id, `${ch} differs at ${new Date(t).toISOString()}`);
      assert.ok(Math.abs(x.offset - y.offset) < 1e-6);
    }
    const m = new CloudEngine({ library, clock: () => t, channel: 'mashup' }).station.at(t).track.id;
    const l = new CloudEngine({ library, clock: () => t, channel: 'long' }).station.at(t).track.id;
    if (m !== l) differ++;
  }
  assert.equal(differ, 400, 'Mashup and Long mixes never play the same file');
});

test('switching channel is a different clock, and /api/* answers for the channel asked', () => {
  const library = { ...LIBRARY, tracks: makeLibrary() };
  const t = Date.parse('2026-10-07T12:00:00Z');
  const eng = new CloudEngine({ library, clock: () => t });
  assert.equal(eng.channel, 'mashup', 'the default is the Mashup');
  const { body: chans } = eng.get('/api/channels');
  assert.equal(chans.default, 'mashup');
  assert.ok(chans.channels.find((c) => c.slug === 'long').onAir, 'every channel says what it is playing now');

  const mash = eng.get('/api/station').body;
  assert.equal(mash.station.channel, 'mashup');
  assert.equal(mash.station.channelLabel, 'Mashup');
  assert.ok(mash.onAir.duration < 1200);

  const long = eng.get('/api/station?channel=long').body;
  assert.equal(long.station.channel, 'long');
  assert.ok(long.onAir.duration >= 1200);
  assert.equal(eng.channel, 'mashup', 'asking about a channel does not tune to it');

  assert.equal(eng.setChannel('long'), 'long');
  assert.equal(eng.get('/api/station').body.onAir.id, long.onAir.id);
  assert.equal(eng.setChannel('no-such-thing'), 'mashup', 'an unknown channel lands on the default');
});

test('a DJ reorder on one channel moves nothing on any other', () => {
  const library = { ...LIBRARY, tracks: makeLibrary() };
  const t = Date.parse('2026-10-07T12:00:00Z');
  const dj = new CloudEngine({ library, clock: () => t, channel: 'mashup' });
  const q = dj.get('/api/queue').body;
  const movable = q.slots.filter((s) => !s.locked);
  const run = [];
  for (const s of movable) {
    if (run.length && (s.cycleIndex !== run[0].cycleIndex || s.withinCycle !== run.at(-1).withinCycle + 1)) break;
    run.push(s);
  }
  assert.ok(run.length >= 3, 'need a few movable slots');
  const ids = run.map((s) => s.id).reverse();
  const prop = dj.proposeReorder({ cycleIndex: run[0].cycleIndex, startWithin: run[0].withinCycle, ids });
  assert.equal(prop.ok, true, JSON.stringify(prop));
  assert.equal(prop.doc.override, null, "the 'all' slot is untouched");
  assert.deepEqual(prop.doc.overrides.mashup.ids, ids);
  assert.deepEqual(Object.keys(overridesOf(prop.doc)), ['mashup']);

  const listener = new CloudEngine({ library, clock: () => t, control: prop.doc, channel: 'mashup' });
  assert.equal(listener.controlStatus, 'applied');
  const firstMoved = listener.station.slotStartsAt(run[0].cycleIndex, run[0].withinCycle);
  assert.equal(listener.station.at(firstMoved + 1).track.id, ids[0]);

  for (const ch of ['long', 'crate-upbeat', 'all']) {
    const other = new CloudEngine({ library, clock: () => t, control: prop.doc, channel: ch });
    const plain = new CloudEngine({ library, clock: () => t, channel: ch });
    assert.equal(other.controlStatus, 'none', `${ch} holds no override`);
    for (let k = 0; k < 50; k++) {
      const at = t + k * 300_000;
      assert.equal(other.station.at(at).track.id, plain.station.at(at).track.id, `${ch} moved at +${k * 5} min`);
    }
  }

  // Clearing it again leaves the document as it was for everyone else.
  const later = new CloudEngine({ library, clock: () => t, control: prop.doc, channel: 'mashup' });
  const cleared = later.proposeClear();
  assert.equal(cleared.doc.overrides?.mashup ?? null, null);
});

test("the old single override still means the 'all' channel", () => {
  const library = { ...LIBRARY, tracks: makeLibrary() };
  const t = Date.parse('2026-10-07T12:00:00Z');
  const all = new CloudEngine({ library, clock: () => t, channel: 'all' });
  const cur = all.station.at(t);
  const order = all.station.cycleOrder(cur.cycleIndex + 1);
  const doc = { version: 1, override: { cycleIndex: cur.cycleIndex + 1, startWithin: 0, ids: [order[1].id, order[0].id] } };
  assert.equal(new CloudEngine({ library, clock: () => t, control: doc, channel: 'all' }).controlStatus, 'applied');
  assert.equal(new CloudEngine({ library, clock: () => t, control: doc, channel: 'mashup' }).controlStatus, 'none');
});

/* ------------------------------------------------------------ the server */

const run = promisify(execFile);
let hasFfmpeg = true;
try { await run('ffmpeg', ['-version']); } catch { hasFfmpeg = false; }

test('the server answers per channel, keeps its old answers without one, and never airs _inbox/', { skip: !hasFfmpeg && 'ffmpeg not installed' }, async () => {
  const MUSIC = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-channels-'));
  const files = [
    ['Upbeat/01 Fast.mp3', 4, 220], ['Upbeat/02 Faster.mp3', 5, 260], ['Upbeat/03 Fastest.mp3', 3, 290],
    ['VGM/01 Overworld.mp3', 6, 330], ['VGM/02 Dungeon.mp3', 4, 390], ['VGM/03 Boss.mp3', 3, 420],
    ['_inbox/SpotiMate.io - Not Yet - Sorted.mp3', 3, 500],
  ];
  for (const [rel, seconds, freq] of files) {
    await fsp.mkdir(path.dirname(path.join(MUSIC, rel)), { recursive: true });
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`,
      '-metadata', `title=${path.basename(rel, '.mp3')}`, '-metadata', 'artist=Test', '-b:a', '64k', path.join(MUSIC, rel)]);
  }
  // A channel spec beside the music: one custom channel, then the defaults.
  await fsp.writeFile(path.join(MUSIC, 'channels.json'), JSON.stringify({
    default: 'mashup',
    channels: [{ slug: 'games', label: 'Games only', crates: ['VGM'] }, ...DEFAULT_CHANNEL_SPEC.channels],
  }));

  process.env.MUSIC_DIR = MUSIC;
  process.env.CACHE_FILE = path.join(MUSIC, '.cache', 'library.json');
  process.env.STATION_EPOCH = '2026-01-01T00:00:00Z';
  process.env.AUTO_RESCAN_MINUTES = '0';
  delete process.env.CHANNELS_FILE;
  const { createApp, rescan, station } = await import('../server/index.js');
  const scan = await rescan({ useCache: false });
  assert.equal(scan.tracks.length, 6, '_inbox/ is not part of the library');

  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p) => (await fetch(base + p)).json();
  try {
    const ch = await get('/api/channels');
    assert.equal(ch.default, 'mashup');
    // Since 2026-11-10 a tower with a channels.json also carries the two streams; with no Chill or Energy
    // folder they are on the dial as waiting, and asking for one plays the default channel.
    assert.deepEqual(ch.channels.map((c) => c.slug), ['games', 'mashup', 'crate-upbeat', 'crate-vgm', 'all', 'chill', 'energy']);
    assert.deepEqual(ch.channels.filter((c) => c.empty).map((c) => c.slug), ['chill', 'energy']);
    assert.equal((await get('/api/station?channel=chill')).station.channel, 'mashup');

    const games = await get('/api/station?channel=games');
    assert.equal(games.station.channel, 'games');
    assert.match(games.onAir.title, /Overworld|Dungeon|Boss/);

    const plain = await get('/api/station');
    assert.equal('channel' in plain.station, false, 'no channel asked, the original answer');
    assert.equal(plain.onAir.id, station.at(Date.now()).track.id);

    const q = await get('/api/queue?channel=crate-upbeat');
    assert.equal(q.channel, 'crate-upbeat');
    assert.ok(q.slots.every((s) => /Fast/.test(s.title)));

    const unknown = await get('/api/station?channel=nope');
    assert.equal(unknown.station.channel, 'mashup', 'an unknown channel is answered by the default, and says so');
  } finally {
    server.close();
  }
});

/* ------------------------------------------------------------ the streams -- */
// Ortis, 2026-11-10: two streams beside Everything, filled by folders, drafted from the labels.
const song = (relPath, genreSlug = 'unsorted', minutes = 4) => ({ id: slugify(relPath).slice(0, 12), title: relPath, artist: 'x', relPath, genreSlug, duration: minutes * 60 });

test('a channel can name folders at any depth, compared the way the programme compares them', () => {
  const t = song('Crates/Bandcamp/Snowpoint Lounge - 感情 ep/01 a.mp3');
  assert.equal(foldPath('\\Crates\\Bandcamp/'), 'crates/bandcamp');
  assert.equal(inFolders(t, ['crates/bandcamp/snowpoint_lounge  -  感情 EP']), true, 'case, underscores and runs of spaces do not matter');
  assert.equal(inFolders(t, ['Crates/Band']), false, 'a folder, not a prefix of its name');
  assert.equal(inFolders(t, ['Crates']), true);
  assert.equal(inFolders({ id: 'x', duration: 60 }, ['Crates']), false, 'a track with no path (the static site) is in no folder');
  assert.equal(matches(t, { folders: ['Crates/Bandcamp'] }), true);
  assert.equal(matches(t, { folders: ['Chill'] }), false);
  assert.equal(matches(t, { excludeFolders: ['Crates/Bandcamp'] }), false);
});

test("what a channel asks for is met in full — or, with match: 'any', by one kind", () => {
  const jazzInCrates = song('Crates/Phone/a.mp3', 'jazz');
  const dnbInChill = song('Chill/b.mp3', 'dnb-jungle');
  const both = { folders: ['Chill'], genres: ['jazz'] };
  assert.equal(matches(jazzInCrates, both), false, 'as before: every kind named');
  assert.equal(matches(dnbInChill, both), false);
  assert.equal(matches(jazzInCrates, { ...both, match: 'any' }), true, 'the label brings it in');
  assert.equal(matches(dnbInChill, { ...both, match: 'any' }), true, 'so does the folder, whatever the label');
  assert.equal(matches(song('Phone/c.mp3', 'vgm'), { ...both, match: 'any' }), false);
  assert.equal(matches(dnbInChill, { ...both, match: 'any', excludeFolders: ['Chill'] }), false, 'an exclusion always holds');
  assert.equal(matches(song('Chill/long.mp3', 'jazz', 90), { ...both, match: 'any', maxMinutes: 35 }), false, 'so does a length limit');
  assert.equal(matches(jazzInCrates, { crates: ['Crates'], genres: ['jazz'] }), true, 'crates and genres together, as since 2026-10-07');
});

test('the file to publish carries the two streams beside Everything: empty they stay on the dial, marked; filled they play', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/channels.programme.json'), 'utf8'));
  assert.deepEqual(doc.channels.map((c) => c.slug), ['all', 'chill', 'energy']);
  assert.equal(doc.default, 'all', 'Everything stays the station a visitor lands on');
  const today = [
    song('BarberBeats/undersaken - x.mp3', 'barber-beats'),
    song('Crates/Phone/MICROMECHA - y.mp3', 'dnb-jungle'),
    song('Phone long mixes/a long jazz mix.mp3', 'jazz', 120),
  ];
  const main = new Station(today, { epoch: EPOCH });
  const set = new ChannelSet({ spec: doc, station: { epoch: EPOCH }, main }).setTracks(today);
  // Ortis, 2026-11-10: « make the stream interface live now and build infra for their content, but no content for now ».
  const dial = set.list();
  assert.deepEqual(dial.map((c) => [c.slug, c.empty === true, c.trackCount]), [['all', false, 3], ['chill', true, 0], ['energy', true, 0]],
    'no label fills a stream by itself: both are on the dial, empty');
  assert.equal(dial[1].onAir, null);
  assert.equal(set.has('chill'), false, 'an empty stream has no clock…');
  assert.equal(set.get('chill'), null);
  assert.equal(set.resolve('chill'), 'all', '…and whoever asks for it hears Everything');
  assert.deepEqual(set.stations(), [main]);

  // The content follows: his folders, and any folder or label he lists in channels.json.
  const later = [...today, song('Chill/a new one.mp3', 'electronic'), song('Chill/second.mp3'), song('Energy/loud.mp3', 'jazz')];
  set.setTracks(later);
  const names = (slug) => set.get(slug).tracks.map((t) => t.relPath).sort();
  assert.deepEqual(names('chill'), ['Chill/a new one.mp3', 'Chill/second.mp3'], 'what is in his Chill folder, whatever its label');
  assert.deepEqual(names('energy'), ['Energy/loud.mp3']);
  assert.deepEqual(set.list().map((c) => c.empty === true), [false, false, false]);
  assert.equal(set.get('all'), main, "Everything is the tower's own programme, untouched");
  const listed = structuredClone(doc);
  Object.assign(listed.channels[1], { folders: ['Chill', 'BarberBeats'], genres: ['jazz'] });
  const wider = new ChannelSet({ spec: listed, station: { epoch: EPOCH }, main }).setTracks(later);
  assert.deepEqual(wider.get('chill').tracks.map((t) => t.relPath.split('/')[0]).sort(), ['BarberBeats', 'Chill', 'Chill', 'Phone long mixes'],
    'a folder already on the tower, and a label, added to the list in channels.json');
  assert.ok(!wider.get('chill').tracks.some((t) => t.relPath.startsWith('Energy/')), 'the jazz piece in Energy stays on Energy');
  // Each stream is a station in its own right: the same answer for everyone on it.
  const at = EPOCH + 86_400_000 * 300 + 12_345;
  assert.equal(set.get('chill').at(at).track.id, new ChannelSet({ spec: doc, station: { epoch: EPOCH }, main }).setTracks(later).get('chill').at(at).track.id);
  // A stream emptied again goes back to waiting; an ordinary channel with nothing in it is still left out.
  set.setTracks(today);
  assert.equal(set.list()[1].empty, true);
  const plain = new ChannelSet({ spec: { channels: [{ slug: 'all', order: 'station' }, { slug: 'x', folders: ['Nowhere'] }] }, station: { epoch: EPOCH }, main }).setTracks(today);
  assert.deepEqual(plain.list().map((c) => c.slug), ['all']);
});

test('the streams are the tower\'s own: a channels.json written before them gets both, one that defines them wins, one can refuse them', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/channels.programme.json'), 'utf8'));
  const plain = ({ _why, ...c }) => c;
  assert.deepEqual(doc.channels.slice(1).map(plain), STREAMS.map((s) => ({ ...s })), 'the file to publish and the code say the same two streams');
  const old = { default: 'all', programme: doc.programme, channels: [doc.channels[0]] }; // the live file of 2026-11-07
  const got = withStreams(old);
  assert.deepEqual(got.channels.map((c) => c.slug), ['all', 'chill', 'energy']);
  assert.equal(got.programme, old.programme, 'nothing else in the file is touched');
  assert.deepEqual(old.channels.map((c) => c.slug), ['all'], 'nor the spec it was given');
  const mine = { channels: [{ slug: 'all', label: 'Everything' }, { slug: 'chill', label: 'My chill', folders: ['Mine'] }] };
  assert.deepEqual(withStreams(mine).channels.map((c) => c.label), ['Everything', 'My chill', 'Energy'], 'his own Chill wins; Energy still joins');
  assert.equal(withStreams({ streams: false, channels: old.channels }).channels.length, 1);
  assert.equal(withStreams(doc), doc, 'a file that already has both is left as it is');
  assert.equal(withStreams(null), null);
});
