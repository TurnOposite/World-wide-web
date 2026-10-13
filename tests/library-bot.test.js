/**
 * The library bot (library/bot.mjs) — what must hold:
 *   - a SpotiMate download, an "Artist - Title" file and a properly tagged
 *     file each land in the folder of the first playlist that wants them,
 *     under a clean "Artist - Title" name;
 *   - a song in two playlists is stored once and listed for both, and the
 *     station puts it on both channels;
 *   - nothing is lost: an unknown file in the inbox goes to _unmatched/, a
 *     second copy to _duplicates/, and an unrelated file in Downloads stays
 *     exactly where it was;
 *   - the embed reader and the importers understand what Spotify and
 *     Exportify actually produce;
 *   - publishing sends only what the tower lacks, and the tower only takes
 *     audio inside its library, with the key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  core, readingsOf, similarity, safeName, fetchEmbed, mergeTracks, sortWaiting, loadState, saveState,
  reconcile, writeChecklist, importFile, emptyState, folderFor, matchFile, buildIndex, publish, summary, writeLists,
} from '../library/bot.mjs';
import { ChannelSet } from '../server/lib/channels.js';

// The server reads its settings once, at import: give it the tower these
// tests stand up before anything imports it (server/lib/library.js included).
const TOWER_MUSIC = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-tower-'));
Object.assign(process.env, {
  MUSIC_DIR: TOWER_MUSIC, CACHE_FILE: path.join(TOWER_MUSIC, '.cache', 'library.json'),
  STATION_KEY: 'k-test-123', ALLOW_UPLOADS: '1', AUTO_RESCAN_MINUTES: '0',
});
const { readMembership } = await import('../server/lib/library.js');

const run = promisify(execFile);
let hasFfmpeg = true;
try { await run('ffmpeg', ['-version']); } catch { hasFfmpeg = false; }

async function tone(file, seconds, { title, artist } = {}) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const meta = [];
  if (title) meta.push('-metadata', `title=${title}`);
  if (artist) meta.push('-metadata', `artist=${artist}`);
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`, ...meta, '-b:a', '64k', file]);
}

/* --------------------------------------------------------------- text -- */

test('a filename is read both ways round, and downloader stamps are not part of the song', () => {
  const r = readingsOf('C:/Users/x/Downloads/SpotiMate.io - Le soleil est près de moi - Air.mp3');
  assert.deepEqual(r[0], { title: 'Le soleil est près de moi', artist: 'Air' });
  const s = readingsOf('Air - La femme d\'argent (1).mp3');
  assert.deepEqual(s[0], { title: 'La femme d\'argent', artist: 'Air' });
  assert.equal(core('Song 2 - Remastered 2012'), 'song 2');
  assert.equal(core('Morse Code (feat. Odile)'), 'morse code');
  assert.equal(core('kakariko {liminal} village'), 'kakariko village');
  assert.equal(core('ÉTÉ'), 'ete');
  assert.ok(similarity(core('ノスタルジア・オブ・アイランド'), core('ノスタルジア・オブ・アイランド')) === 1, 'any script');
  assert.equal(safeName('AC/DC: Back?'), 'AC_DC_ Back_');
  assert.equal(safeName('con'), '_con');
});

test('the matcher is confident or silent: right song, wrong artist, other version', () => {
  const state = { playlists: [{ folder: 'A', tracks: [
    { id: '1', title: 'Le soleil est près de moi', artists: ['Air'], duration: 293 },
    { id: '2', title: 'Some', artists: ['Steve Lacy'], duration: 118 },
  ] }] };
  const songs = buildIndex(state);
  const d = (file, extra = {}) => ({ file, tags: null, duration: null, readings: readingsOf(file), ...extra });
  assert.equal(matchFile(d('SpotiMate.io - Le soleil est près de moi - Air.mp3'), songs)?.song.title, 'Le soleil est près de moi');
  assert.equal(matchFile(d('Steve Lacy - Some.mp3'), songs)?.song.title, 'Some');
  assert.equal(matchFile(d('Somebody Else - Some.mp3'), songs), null, 'same title, another artist');
  assert.equal(matchFile(d('Steve Lacy - Some.mp3', { duration: 400 }), songs), null, 'five minutes longer: another recording');
  assert.equal(matchFile(d('x.mp3', { tags: { title: 'Some', artist: 'Steve Lacy' } }), songs)?.song.title, 'Some', 'tags win over a useless name');
});

/* ------------------------------------------------------------ Spotify -- */

test('the embed page is read the way Spotify serves it', async () => {
  const entity = {
    name: 'Gone fishing', subtitle: 'ZoNeKo',
    trackList: [
      { uri: 'spotify:track:3Aa4ijCL9iilxsCLk48JnG', title: 'Le soleil est près de moi', subtitle: 'Air', duration: 293000, entityType: 'track' },
      { uri: 'spotify:track:0FmjQ91CI1HubjGKab5Sx6', title: 'Morse Code', subtitle: 'Men I Trust, Odile, Geoffroy', duration: 205000, entityType: 'track' },
      { uri: 'spotify:episode:x', title: 'A podcast', subtitle: 'Show', duration: 1, entityType: 'episode' },
    ],
  };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script></html>`;
  const got = await fetchEmbed('6Sj4JhgDD52zkbCJ0oqWJR', { fetchImpl: async () => new Response(html) });
  assert.equal(got.name, 'Gone fishing');
  assert.equal(got.tracks.length, 2, 'episodes are not songs');
  assert.deepEqual(got.tracks[1], { id: '0FmjQ91CI1HubjGKab5Sx6', title: 'Morse Code', artists: ['Men I Trust', 'Odile', 'Geoffroy'], duration: 205 });
});

test('a capped re-read never forgets the tracks a full import found, nor which file is which', () => {
  const pl = { tracks: [{ id: 'a', title: 'A', artists: ['x'], file: 'P/x - A.mp3' }, { id: 'z', title: 'Z', artists: ['x'] }] };
  mergeTracks(pl, [{ id: 'a', title: 'A', artists: ['x'] }, { id: 'b', title: 'B', artists: ['x'] }], { complete: false });
  assert.deepEqual(pl.tracks.map((t) => t.id), ['a', 'b', 'z']);
  assert.equal(pl.tracks[0].file, 'P/x - A.mp3');
  mergeTracks(pl, [{ id: 'b', title: 'B', artists: ['x'] }], { complete: true });
  assert.deepEqual(pl.tracks.map((t) => t.id), ['b'], 'a complete list is the truth');
});

test('an Exportify CSV becomes a full playlist, quotes and commas included', async () => {
  const lib = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-bot-csv-'));
  const csv = path.join(lib, 'Haze.csv');
  await fsp.writeFile(csv, '\uFEFF"Track URI","Track Name","Artist Name(s)","Track Duration (ms)"\r\n"spotify:track:1","Contramão","Leo Tucherman","227000"\r\n"spotify:track:2","Hey, ""you""","A, B","1000"\r\n');
  const state = emptyState();
  await importFile(lib, state, csv, { log: () => {} });
  const pl = state.playlists[0];
  assert.equal(pl.name, 'Haze');
  assert.equal(pl.folder, 'Haze');
  assert.equal(pl.partial, false);
  assert.deepEqual(pl.tracks[1], { id: '2', title: 'Hey, "you"', artists: ['A', 'B'], duration: 1, file: null });
});

/* ------------------------------------------------------------- sorting -- */

test('sorting files every arrival in the right folder, once, and loses nothing', { skip: !hasFfmpeg && 'ffmpeg not installed' }, async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-bot-'));
  const lib = path.join(root, 'music');
  const home = path.join(root, 'home');
  const downloads = path.join(home, 'Downloads');
  const realHome = process.env.HOME;
  process.env.HOME = home; // os.homedir() → the fake home, so "Downloads" is ours to inspect
  process.env.USERPROFILE = home;
  try {
    const state = emptyState();
    const A = { id: 'A0000000000000000000aa', name: 'Gone fishing', tracks: [
      { id: 't1', title: 'Le soleil est près de moi', artists: ['Air'], duration: 3 },
      { id: 't2', title: 'Nerves', artists: ['Fabio Góes'], duration: 4 },
      { id: 't3', title: 'Some', artists: ['Steve Lacy'], duration: 3 },
      { id: 't5', title: 'Portrait of Tracy', artists: ['Jaco Pastorius'], duration: 142 },
    ] };
    A.folder = folderFor(state, A.name, A.id); state.playlists.push(A);
    const B = { id: 'B0000000000000000000bb', name: 'Zone: night/day', tracks: [
      { id: 't1b', title: 'Le soleil est près de moi', artists: ['Air'], duration: 3 },
      { id: 't4', title: 'Moonlight', artists: ['Embee'], duration: 5 },
    ] };
    B.folder = folderFor(state, B.name, B.id); state.playlists.push(B);
    assert.equal(B.folder, 'Zone_ night_day', 'a folder name Windows accepts');
    await saveState(lib, state);

    await tone(path.join(lib, '_inbox', 'SpotiMate.io - Le soleil est près de moi - Air.mp3'), 3);
    await tone(path.join(lib, '_inbox', 'track07.mp3'), 4, { title: 'Nerves', artist: 'Fabio Góes' });
    await tone(path.join(lib, '_inbox', 'Somebody - Not On Any Playlist.mp3'), 2);
    await tone(path.join(downloads, 'Embee - Moonlight.mp3'), 5);
    await tone(path.join(downloads, 'voice memo.mp3'), 2);
    await tone(path.join(lib, 'SpotiMate.io - Some - Steve Lacy.mp3'), 3);

    const log = [];
    const st = await loadState(lib);
    const r = await sortWaiting(lib, st, { log: (l) => log.push(l) });
    assert.deepEqual(r.filed.map((f) => f.to).sort(), [
      'Gone fishing/Air - Le soleil est près de moi.mp3',
      'Gone fishing/Fabio Góes - Nerves.mp3',
      'Gone fishing/Steve Lacy - Some.mp3',
      'Zone_ night_day/Embee - Moonlight.mp3',
    ]);
    assert.deepEqual(r.unmatched, ['Somebody - Not On Any Playlist.mp3']);
    assert.ok(fs.existsSync(path.join(lib, '_unmatched', 'Somebody - Not On Any Playlist.mp3')));
    assert.ok(fs.existsSync(path.join(downloads, 'voice memo.mp3')), 'not on any playlist, not ours: left alone');
    assert.ok(!fs.existsSync(path.join(downloads, 'Embee - Moonlight.mp3')), 'a wanted song leaves Downloads');

    const saved = await loadState(lib);
    assert.deepEqual(saved.files['Gone fishing/Air - Le soleil est près de moi.mp3'], ['Gone fishing', 'Zone_ night_day'], 'one file, two playlists');
    assert.equal(summary(saved).find((s) => s.name === 'Zone: night/day').have, 2);

    // The same song again: kept aside, never over the first.
    await tone(path.join(lib, '_inbox', 'Air - Le soleil est près de moi.mp3'), 3);
    const again = await sortWaiting(lib, saved, { log: () => {} });
    assert.deepEqual(again.duplicates, ['Air - Le soleil est près de moi.mp3']);
    assert.ok(fs.existsSync(path.join(lib, '_duplicates', 'Air - Le soleil est près de moi.mp3')));

    // Dropped by hand straight into a playlist folder: recognised, not moved.
    const C = { id: 'C0000000000000000000cc', name: 'Hand', folder: 'Hand', tracks: [{ id: 't9', title: 'Heaven 7', artists: ['Unknown Mortal Orchestra'], duration: 2 }] };
    saved.playlists.push(C);
    await tone(path.join(lib, 'Hand', 'whatever.mp3'), 2, { title: 'Heaven 7', artist: 'Unknown Mortal Orchestra' });
    assert.equal(await reconcile(lib, saved), 1);
    assert.equal(saved.playlists[2].tracks[0].file, 'Hand/whatever.mp3');

    // --to: everything in the inbox into one playlist, matched or not — but never Downloads.
    await tone(path.join(lib, '_inbox', 'mystery.mp3'), 2);
    await tone(path.join(downloads, 'another memo.mp3'), 2);
    const forced = await sortWaiting(lib, saved, { to: 'Hand', log: () => {} });
    assert.deepEqual(forced.filed.map((f) => f.to), ['Hand/mystery.mp3']);
    assert.ok(fs.existsSync(path.join(downloads, 'another memo.mp3')));

    // The checklist says what is left.
    await saveState(lib, saved);
    const { haveAll, totalAll } = await writeChecklist(lib, saved);
    assert.equal(totalAll, 7);
    assert.equal(haveAll, 6);
    const html = await fsp.readFile(path.join(lib, '_checklist.html'), 'utf8');
    assert.match(html, /open\.spotify\.com\/track\/t5/, 'the one song still missing, with its link');
    assert.doesNotMatch(html, /open\.spotify\.com\/track\/t2"/, 'a song already filed is not on the list');

    // Every song, written out to read and to open in a spreadsheet.
    assert.deepEqual(await writeLists(lib, saved), { playlists: 3, songs: 7 });
    const txt = await fsp.readFile(path.join(lib, '_playlists.txt'), 'utf8');
    assert.match(txt, /== Gone fishing — 4 songs/);
    assert.match(txt, /✓ 1\. Air — Le soleil est près de moi/);
    assert.match(txt, /  4\. Jaco Pastorius — Portrait of Tracy  \(2:22\)/);
    const csv = (await fsp.readFile(path.join(lib, '_playlists.csv'), 'utf8')).replace(/^\uFEFF/, '').split('\r\n');
    assert.equal(csv[0], 'Playlist,No.,Title,Artists,Duration,In library,File,Spotify link');
    assert.equal(csv.filter(Boolean).length, 8);

    // …and the station reads the membership: one file, a channel each.
    const membership = await readMembership(lib);
    assert.deepEqual(membership.get('Gone fishing/Air - Le soleil est près de moi.mp3'), ['Gone fishing', 'Zone_ night_day']);
    const tracks = [...membership.keys()].map((rel, i) => ({ id: `x${i}`, title: rel, artist: 'a', duration: 200, relPath: rel, crates: membership.get(rel) }));
    tracks.push({ id: 'pad1', title: 'p', duration: 200, relPath: 'Zone_ night_day/pad1.mp3' }, { id: 'pad2', title: 'q', duration: 200, relPath: 'Zone_ night_day/pad2.mp3' });
    const set = new ChannelSet({ station: { epoch: 0 } }).setTracks(tracks, { now: 0 });
    const zone = set.get('crate-zone-night-day').tracks.map((t) => t.relPath);
    assert.ok(zone.includes('Gone fishing/Air - Le soleil est près de moi.mp3'), 'filed under Gone fishing, still on the Zone channel');
  } finally {
    process.env.HOME = realHome;
  }
});

/* ------------------------------------------------------------- publish -- */

test('publishing sends only what the tower lacks; the tower takes only audio in its library, with the key', { skip: !hasFfmpeg && 'ffmpeg not installed' }, async () => {
  const towerMusic = TOWER_MUSIC;
  const lib = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-laptop-'));
  await tone(path.join(lib, 'Haze', 'potsu - letting go.mp3'), 3);
  await tone(path.join(lib, 'Haze', 'Leo Tucherman - Contramão.mp3'), 2);
  await tone(path.join(lib, '_inbox', 'not yet sorted.mp3'), 2);
  await fsp.writeFile(path.join(lib, 'playlists.json'), JSON.stringify({ files: {} }));
  // The tower already has one of them.
  await fsp.mkdir(path.join(towerMusic, 'Haze'), { recursive: true });
  await fsp.copyFile(path.join(lib, 'Haze', 'potsu - letting go.mp3'), path.join(towerMusic, 'Haze', 'potsu - letting go.mp3'));

  const { createApp, rescan } = await import('../server/index.js');
  await rescan({ useCache: false });
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(publish(lib, base, 'wrong', { log: () => {} }), /refused the key/);
    const r = await publish(lib, base, 'k-test-123', { log: () => {} });
    assert.equal(r.sent, 2, 'the missing song and playlists.json — not the one it has, not the inbox');
    assert.ok(fs.existsSync(path.join(towerMusic, 'Haze', 'Leo Tucherman - Contramão.mp3')));
    assert.ok(!fs.existsSync(path.join(towerMusic, '_inbox')));
    const again = await publish(lib, base, 'k-test-123', { log: () => {} });
    assert.equal(again.total, 1, 'second time round only playlists.json, which always goes');

    const put = (p, body = 'x') => fetch(`${base}/api/library/file?path=${encodeURIComponent(p)}`, { method: 'PUT', headers: { 'x-station-key': 'k-test-123' }, body });
    assert.equal((await put('../escape.mp3')).status, 400);
    assert.equal((await put('Haze/notes.txt')).status, 400, 'audio only');
    assert.equal((await put('/etc/passwd.mp3')).status, 200);
    assert.ok(fs.existsSync(path.join(towerMusic, 'etc', 'passwd.mp3')) && !fs.existsSync('/etc/passwd.mp3'), 'an absolute path lands inside the library');
    assert.equal((await fetch(`${base}/api/library/manifest`)).status, 401, 'no key, no listing');
  } finally {
    server.close();
  }
});

/* -------------------------------------------------------------- albums -- */

test('album zips open into Crates/Bandcamp — once, a copy, never a sound pack or a second download', async () => {
  const { makeZip } = await import('./helpers/make-zip.js');
  const { openAlbums, ALBUMS_FILE, albumFolderName } = await import('../library/bot.mjs');
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-albums-'));
  const lib = path.join(root, 'music');
  const downloads = path.join(root, 'Downloads');
  await fsp.mkdir(downloads, { recursive: true });
  // Big enough to be songs (a sound pack's files are tiny), not real audio:
  // the tags will not parse, so names do the matching, as for any untagged file.
  const mp3 = (k) => Buffer.alloc(300 * 1024, k);
  const z = (name, entries) => fsp.writeFile(path.join(downloads, name), makeZip(entries, {}));
  await z('Brickmason - Gaiawave.zip', [
    { name: 'Brickmason - Gaiawave - 01 My Gaia.mp3', data: mp3(1), method: 0 },
    { name: 'Brickmason - Gaiawave - 02 Browser Games.mp3', data: mp3(2), method: 0 },
    { name: 'cover.jpg', data: Buffer.alloc(2000, 3), method: 0 },
    { name: 'liner notes.txt', data: Buffer.from('thanks'), method: 0 },
  ]);
  await z('Brickmason - Gaiawave (1).zip', [{ name: 'Brickmason - Gaiawave - 01 My Gaia.mp3', data: mp3(1), method: 0 }]);
  await z('Saken 天 - 森.zip', [{ name: '森/01 Air - Le soleil est près de moi.mp3', data: mp3(4), method: 0 }, { name: '森/02 木.mp3', data: mp3(5), method: 0 }]);
  await z('sfx.zip', Array.from({ length: 12 }, (_, i) => ({ name: `hit${i}.ogg`, data: Buffer.alloc(9000, i), method: 0 })));
  await z('tax papers.zip', [{ name: 'form.pdf', data: Buffer.alloc(5000, 9), method: 0 }]);

  const state = emptyState();
  state.playlists = [{ id: 'p1', name: 'Gone fishing', folder: 'Gone fishing', tracks: [{ id: 'a', title: 'Le soleil est près de moi', artists: ['Air'], duration: null }] }];
  await saveState(lib, state);

  const dry = await openAlbums(lib, state, { downloads: false, from: [downloads], dryRun: true, log: () => {} });
  assert.deepEqual(dry.opened.map((o) => o.folder).sort(), ['Crates/Bandcamp/Brickmason - Gaiawave', 'Crates/Bandcamp/Saken 天 - 森']);
  assert.ok(!fs.existsSync(path.join(lib, 'Crates')), 'a dry run writes nothing');

  const r = await openAlbums(lib, state, { downloads: false, from: [downloads], log: () => {} });
  const album = path.join(lib, 'Crates', 'Bandcamp', 'Brickmason - Gaiawave');
  assert.deepEqual(fs.readdirSync(album).sort(), ['Brickmason - Gaiawave - 01 My Gaia.mp3', 'Brickmason - Gaiawave - 02 Browser Games.mp3', 'cover.jpg'], 'the tracks and the sleeve, not the notes');
  assert.ok(fs.existsSync(path.join(lib, 'Crates', 'Bandcamp', 'Saken 天 - 森', '森', '02 木.mp3')), 'a name in Japanese comes out whole');
  const why = Object.fromEntries(r.skipped.map((s) => [s.zip, s.reason]));
  assert.match(why['Brickmason - Gaiawave (1).zip'], /already in the library/, 'the second download of an album is not a second album');
  assert.match(why['sfx.zip'], /sound pack/);
  assert.equal(why['tax papers.zip'], undefined, 'a zip with no audio is not its business');
  assert.equal(fs.readdirSync(downloads).length, 5, 'every zip is still in Downloads: albums are copied, never moved');

  // The track a playlist wants is credited to it, where it lies.
  assert.equal(r.matched, 1);
  const saved = await loadState(lib);
  const rel = 'Crates/Bandcamp/Saken 天 - 森/森/01 Air - Le soleil est près de moi.mp3';
  assert.deepEqual(saved.files[rel], ['Crates', 'Gone fishing'], 'plays on its crate and on the playlist\'s channel');

  const again = await openAlbums(lib, await loadState(lib), { downloads: false, from: [downloads], log: () => {} });
  assert.equal(again.opened.length, 0, `${ALBUMS_FILE} remembers what was opened`);
  assert.equal(albumFolderName('Saken 天 - 森 (3).zip'), 'Saken 天 - 森');
  await assert.rejects(openAlbums(lib, state, { downloads: false, from: [downloads], into: '_hidden', log: () => {} }), /starts with _/);
});

test('--since leaves older zips alone', async () => {
  const { makeZip } = await import('./helpers/make-zip.js');
  const { openAlbums, parseDay } = await import('../library/bot.mjs');
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-since-'));
  const downloads = path.join(root, 'dl');
  await fsp.mkdir(downloads, { recursive: true });
  const old = path.join(downloads, 'Old - Album.zip');
  await fsp.writeFile(old, makeZip([{ name: '01.mp3', data: Buffer.alloc(300 * 1024, 1), method: 0 }]));
  fs.utimesSync(old, new Date('2025-03-01'), new Date('2025-03-01'));
  await fsp.writeFile(path.join(downloads, 'New - Album.zip'), makeZip([{ name: '01.mp3', data: Buffer.alloc(300 * 1024, 2), method: 0 }]));
  const r = await openAlbums(path.join(root, 'music'), emptyState(), { downloads: false, from: [downloads], since: parseDay('2026-10-12'), dryRun: true, log: () => {} });
  assert.deepEqual(r.opened.map((o) => o.zip), ['New - Album.zip']);
  assert.throws(() => parseDay('12/10/2026'), /2026-10-12/);
});

test('the tower settings are found beside the music when the bot runs from elsewhere', async () => {
  const { towerSettings } = await import('../library/bot.mjs');
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-settings-'));
  const here = path.join(root, 'radio-tower-live', 'library');
  const beside = path.join(root, 'Radio Tower', 'library');
  await fsp.mkdir(here, { recursive: true });
  await fsp.mkdir(beside, { recursive: true });
  await fsp.writeFile(path.join(beside, 'tower.json'), JSON.stringify({ url: 'https://tower.example', key: 'k' }));
  assert.deepEqual(towerSettings(here, beside), { url: 'https://tower.example', key: 'k' });
  await fsp.writeFile(path.join(here, 'tower.json'), JSON.stringify({ url: 'https://first.example', key: 'k1' }));
  assert.equal(towerSettings(here, beside).url, 'https://first.example', 'the first folder given wins');
  assert.deepEqual(towerSettings(path.join(root, 'nowhere')), { url: null, key: null });
});

test('without --lib the bot finds the music where the laptop keeps it, as watch.cmd does', async () => {
  const { defaultLib } = await import('../library/bot.mjs');
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-lib-'));
  const here = path.join(root, 'radio-tower-live', 'library');
  const laptop = path.join(root, 'Radio Tower', 'music');
  await fsp.mkdir(here, { recursive: true });
  await fsp.mkdir(laptop, { recursive: true });
  assert.equal(defaultLib(here), path.join(root, 'radio-tower-live', 'music'), 'no library anywhere: ../music, as before');
  await fsp.writeFile(path.join(laptop, 'playlists.json'), '{}');
  assert.equal(defaultLib(here), laptop);
  await fsp.mkdir(path.join(root, 'radio-tower-live', 'music'));
  await fsp.writeFile(path.join(root, 'radio-tower-live', 'music', 'playlists.json'), '{}');
  assert.equal(defaultLib(here), path.join(root, 'radio-tower-live', 'music'), 'a library beside the code wins');
});

test('the booth shortcut carries the key in the fragment only, and the command never prints it', async () => {
  const { boothShortcut, WEBSITE } = await import('../library/bot.mjs');
  const BOT = path.join(import.meta.dirname, '..', 'library', 'bot.mjs');
  const s = boothShortcut('https://site.example/', 'a b&c');
  assert.equal(s, '[InternetShortcut]\r\nURL=https://site.example/booth#key=a%20b%26c\r\n');
  const u = new URL(/^URL=(.*)$/m.exec(s)[1].trim());
  assert.equal(u.pathname, '/booth');
  assert.equal(u.search, '', 'a query string would reach the server');

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-shortcut-'));
  const music = path.join(root, 'Radio Tower', 'music');
  const out = path.join(root, 'Desktop');
  await fsp.mkdir(music, { recursive: true });
  await fsp.mkdir(path.join(root, 'Radio Tower', 'library'));
  await fsp.mkdir(out);
  await fsp.writeFile(path.join(root, 'Radio Tower', 'library', 'tower.json'), JSON.stringify({ url: 'https://tower.example', key: 'sekrit-0123' }));
  const r = await run(process.execPath, [BOT, 'shortcut', '--lib', music, '--out', out]);
  assert.equal(await fsp.readFile(path.join(out, 'Radio Tower booth.url'), 'utf8'), boothShortcut(WEBSITE, 'sekrit-0123'));
  assert.ok(!`${r.stdout}${r.stderr}`.includes('sekrit'), 'the key is not printed');
  await assert.rejects(run(process.execPath, [BOT, 'shortcut', '--lib', path.join(root, 'nowhere', 'music'), '--out', out]), /no tower\.json/);
});

test('a zip dropped in _inbox is opened by Node — even named in Japanese — then sorted like any arrival', async () => {
  const { makeZip } = await import('./helpers/make-zip.js');
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-inboxzip-'));
  const lib = path.join(root, 'music');
  const state = emptyState();
  state.playlists = [{ id: 'p1', name: 'Gone fishing', folder: 'Gone fishing', tracks: [{ id: 'a', title: 'Le soleil est près de moi', artists: ['Air'], duration: null }] }];
  await fsp.mkdir(path.join(lib, '_inbox'), { recursive: true });
  await fsp.writeFile(path.join(lib, '_inbox', '空気 - 太陽.zip'), makeZip([
    { name: 'Air - Le soleil est près de moi.mp3', data: Buffer.alloc(40_000, 1), method: 0 },
    { name: 'Air - Not On Any Playlist.mp3', data: Buffer.alloc(40_000, 2), method: 0 },
  ]));
  const r = await sortWaiting(lib, state, { downloads: false, log: () => {} });
  assert.deepEqual(r.filed.map((f) => f.to), ['Gone fishing/Air - Le soleil est près de moi.mp3']);
  assert.deepEqual(r.unmatched, ['Air - Not On Any Playlist.mp3']);
  assert.ok(fs.existsSync(path.join(lib, '_unmatched', 'opened-zips', '空気 - 太陽.zip')), 'the opened zip is kept, out of the way');
});
