/**
 * The booth's own self-test. `node --test dj/test.mjs`, zero dependencies.
 *
 * These exist for one reason: an emission that is not a permutation would be
 * rejected by the server, and an emission that touched a locked slot would
 * interrupt a listener mid-track. Both are silent-until-live failures, so they
 * are asserted here rather than discovered on air.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fold, resolveMood, scoreTrack, movableWindow, planEmission, defaultMusicDir, towerSettings, settingsDirs, stationSettings } from './dj.mjs';

const slot = (id, over = {}) => ({
  id,
  title: id,
  artist: 'x',
  album: null,
  duration: 240,
  genreSlug: 'ambient',
  genreLabel: 'Ambient',
  locked: false,
  cycleIndex: 3,
  withinCycle: 0,
  ...over,
});

const window5 = () => [
  slot('a', { withinCycle: 0, locked: true }),
  slot('b', { withinCycle: 1, genreSlug: 'vgm', genreLabel: 'Video Game' }),
  slot('c', { withinCycle: 2 }),
  slot('d', { withinCycle: 3, genreSlug: 'vgm', genreLabel: 'Video Game' }),
  slot('e', { withinCycle: 4 }),
  slot('f', { cycleIndex: 4, withinCycle: 0 }),
];

test('fold flattens the styled text this library is full of', () => {
  assert.equal(fold('𝗟𝗢𝗦𝗧 𝗩𝗜𝗗𝗘𝗢𝗚𝗔𝗠𝗘 𝗠𝗔𝗟𝗟'), 'lost videogame mall');
  assert.equal(fold('Le soleil est près de moi'), 'le soleil est pres de moi');
});

test('the window never includes a locked slot or crosses a cycle', () => {
  const w = movableWindow(window5());
  assert.deepEqual(w.ids, ['b', 'c', 'd', 'e']);
  assert.equal(w.cycleIndex, 3);
  assert.equal(w.startWithin, 1);
  assert.equal(w.endWithin, 4);
});

test('the longest run wins, not the first', () => {
  const slots = [
    slot('p', { withinCycle: 0 }),
    slot('q', { withinCycle: 1 }),
    slot('r', { withinCycle: 2, locked: true }),
    slot('s', { withinCycle: 3 }),
    slot('t', { withinCycle: 4 }),
    slot('u', { withinCycle: 5 }),
  ];
  assert.deepEqual(movableWindow(slots).ids, ['s', 't', 'u']);
});

test('a window of one is no window at all', () => {
  assert.equal(movableWindow([slot('a'), slot('b', { locked: true, withinCycle: 1 })]), null);
});

test('an emission is always a permutation of the window it names', () => {
  for (const mood of ['game', 'liminal', 'upbeat', 'short set', 'deep']) {
    const p = planEmission(window5(), resolveMood(mood));
    assert.ok(p.ok, mood);
    assert.deepEqual([...p.ids].sort(), ['b', 'c', 'd', 'e'], mood);
  }
});

test('--top N moves only N, and leaves the rest in programmed order', () => {
  const p = planEmission(window5(), resolveMood('game'), { top: 1 });
  assert.equal(p.ids[0], 'b');
  assert.deepEqual(p.ids.slice(1), ['c', 'd', 'e']);
});

test('equal scores keep their programmed order — an emission is a nudge', () => {
  const flat = [slot('m', { withinCycle: 0 }), slot('n', { withinCycle: 1 }), slot('o', { withinCycle: 2 })];
  const p = planEmission(flat, resolveMood('game'));
  assert.deepEqual(p.ids, ['m', 'n', 'o']);
  assert.equal(p.changed, false);
});

test('free text falls back to genre names then to keywords', () => {
  const m = resolveMood('something like vaporwave macroblank');
  assert.equal(m.free, true);
  assert.deepEqual(Object.keys(m.genres), ['vaporwave']);
  assert.ok(m.keywords.includes('macroblank'));
});

test('exclude pushes back, it does not delete', () => {
  const s = slot('z', { genreSlug: 'ambient', title: 'ambient drift' });
  assert.ok(scoreTrack(s, resolveMood('study')) > 0);
  assert.ok(scoreTrack(s, resolveMood('upbeat')) < 0);
});

test('duration preference cannot outrank genre', () => {
  const longVgm = slot('L', { genreSlug: 'vgm', genreLabel: 'Video Game', duration: 4000 });
  const shortAmbient = slot('S', { genreSlug: 'ambient', duration: 120 });
  const mood = resolveMood('game');
  assert.ok(scoreTrack(longVgm, mood) > scoreTrack(shortAmbient, mood));
});

test('a fully locked queue is refused, not guessed at', () => {
  const p = planEmission([slot('a', { locked: true })], resolveMood('game'));
  assert.equal(p.ok, false);
  assert.equal(p.error, 'no_movable_window');
});

// The laptop's layout since 2026-10-13: code in radio-tower-live, music and
// tower.json in Radio Tower\ (docs/LIVE.md).
function laptop() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-settings-'));
  const here = path.join(root, 'radio-tower-live', 'dj');
  const music = path.join(root, 'Radio Tower', 'music');
  fs.mkdirSync(here, { recursive: true });
  fs.mkdirSync(music, { recursive: true });
  fs.mkdirSync(path.join(root, 'Radio Tower', 'library'));
  fs.writeFileSync(path.join(music, 'playlists.json'), '{}');
  fs.writeFileSync(path.join(root, 'Radio Tower', 'library', 'tower.json'), JSON.stringify({ url: 'https://tower.example', key: 'k' }));
  return { root, here, music };
}

test('with no flags, the booth finds the music and tower.json where the laptop keeps them', () => {
  const { here, music } = laptop();
  assert.equal(defaultMusicDir(here), music);
  const saved = towerSettings(settingsDirs(defaultMusicDir(here), here));
  assert.equal(saved.url, 'https://tower.example');
  assert.deepEqual(stationSettings({ env: {}, saved }), { url: 'https://tower.example', key: 'k', keyFrom: 'tower.json' });
});

test('a library beside the booth wins over the laptop fallback, as in watch.cmd', () => {
  const { root, here } = laptop();
  const near = path.join(root, 'radio-tower-live', 'music');
  fs.mkdirSync(near);
  assert.notEqual(defaultMusicDir(here), near, 'an empty ../music is not a library');
  fs.writeFileSync(path.join(near, 'playlists.json'), '{}');
  assert.equal(defaultMusicDir(here), near);
});

test('flags beat the environment, which beats tower.json', () => {
  const saved = { url: 'https://tower.example', key: 'k' };
  assert.equal(stationSettings({ env: { STATION_KEY: 'e' }, saved }).key, 'e');
  assert.equal(stationSettings({ args: { key: 'f' }, env: { STATION_KEY: 'e' }, saved }).keyFrom, '--key');
  assert.equal(stationSettings({ args: { key: true }, env: {}, saved }).key, 'k', 'a bare --key is not a key');
});

test('the saved key is never handed to another station', () => {
  const saved = { url: 'https://tower.example', key: 'k' };
  const local = stationSettings({ args: { url: 'http://localhost:8080' }, env: {}, saved });
  assert.equal(local.url, 'http://localhost:8080');
  assert.equal(local.key, null);
  assert.equal(stationSettings({ env: { STATION_URL: 'https://tower.example/' }, saved }).key, 'k', 'same station, trailing slash or not');
  assert.equal(stationSettings({ env: {}, saved: { url: null, key: null } }).url, 'http://localhost:8080');
});
