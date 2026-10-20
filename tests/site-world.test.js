/**
 * The world shell's arithmetic (docs/WORLD.md, phase 1): the flag that keeps
 * the classic site untouched, the map every route lands on, and the camera's
 * numbers. The browser half — the flight, the tags, the music playing
 * through it — is in scripts/site-smoke.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { worldChoice, worldWanted } from '../site/js/world/flag.js';
import {
  WORLD, DISTRICTS, MIN_SCALE, byId, districtFor, cameraFor, centreOf, flightMs, ease, pullBack, seamMix, nearest,
} from '../site/js/world/layout.js';
import { routes } from '../scripts/site-build.mjs';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('the world is off unless config.json or the address asks for it', () => {
  assert.equal(worldWanted({}), false);
  assert.equal(worldWanted({ config: { world: false } }), false);
  assert.equal(worldWanted({ config: { world: 'yes' } }), false, 'only a real true turns it on');
  assert.equal(worldWanted({ config: { world: true } }), true);
  assert.equal(worldChoice('?world=1'), 'on');
  assert.equal(worldChoice('?tower=x&world=0'), 'off');
  assert.equal(worldChoice('?classic=1&world=1'), 'off', 'classic wins');
  assert.equal(worldChoice('?worlds=1'), null);
});

test('the site ships with the world off: the classic shell stays live until the switch-over phase', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../site/config.json', import.meta.url), 'utf8'));
  assert.equal(config.world, false);
  assert.equal(worldWanted({ config }), false);
});

test('?world=1 is remembered for the tab, ?world=0 and ?classic=1 forget it', () => {
  const s = memoryStorage();
  assert.equal(worldWanted({ search: '?world=1', storage: s }), true);
  assert.equal(worldWanted({ search: '', storage: s }), true, 'the next page, its query dropped by a relative link');
  assert.equal(worldWanted({ search: '?world=0', storage: s }), false);
  assert.equal(worldWanted({ search: '', storage: s }), false);
  worldWanted({ search: '?world=1', storage: s });
  assert.equal(worldWanted({ search: '?classic=1', storage: s, config: { world: true } }), false, 'classic beats the config too');
  assert.equal(worldWanted({ search: '', storage: s, config: { world: true } }), true);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(worldWanted({ search: '?world=1', storage: broken }), true, 'blocked storage: the flag still holds for this page');
  assert.equal(worldWanted({ search: '', storage: broken }), false);
});

test('eleven districts, coded Z-01…Z-07 and E-01…E-04, each on its own half, none overlapping', () => {
  assert.equal(DISTRICTS.length, 11);
  assert.deepEqual(DISTRICTS.map((d) => d.code), ['Z-01', 'Z-02', 'Z-03', 'Z-04', 'Z-05', 'Z-06', 'Z-07', 'E-01', 'E-02', 'E-03', 'E-04']);
  assert.equal(new Set(DISTRICTS.map((d) => d.id)).size, 11);
  for (const d of DISTRICTS) {
    assert.ok(d.x >= 0 && d.y >= 0 && d.x + d.w <= WORLD.w && d.y + d.h <= WORLD.h, `${d.id} is inside the world`);
    if (d.half === 'zone') assert.ok(d.x + d.w <= WORLD.seam - 100, `${d.id} stays left of the seam`);
    else assert.ok(d.x >= WORLD.seam + 100, `${d.id} stays right of the seam`);
    assert.equal(byId(d.id), d);
    assert.ok(d.title && d.hosts, d.id);
  }
  for (const a of DISTRICTS) {
    for (const b of DISTRICTS) {
      if (a === b) continue;
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(apart, `${a.id} and ${b.id} overlap`);
    }
  }
});

test('every route lands in a district, and every district with a page names a route the build serves', () => {
  const served = new Set(['', ...routes([], [])]);
  for (const d of DISTRICTS) if (d.route !== null) assert.ok(served.has(d.route), `${d.id} → /${d.route}`);
  const expect = {
    home: 'radio', radio: 'radio', ondes: 'ondes', zone: 'zone', atlas: 'atlas', portfolio: 'portfolio',
    playlists: 'playlists', booth: 'booth', lectures: 'lectures', ecrits: 'lectures',
  };
  for (const [name, id] of Object.entries(expect)) assert.equal(districtFor(name, {}), id, name);
  assert.equal(districtFor('echo', {}), 'une');
  assert.equal(districtFor('echo', { slug: 'article-temoin' }), 'articles', 'an article opens on the reading desk');
  assert.equal(districtFor('missing', {}), null, 'a page that does not exist leaves the camera where it is');
  // Every route name main.js declares is mapped (a new route must be placed on the map).
  for (const name of ['home', 'radio', 'ondes', 'playlists', 'atlas', 'lectures', 'zone', 'ecrits', 'echo', 'portfolio', 'booth']) {
    assert.ok(districtFor(name, {}), name);
  }
});

test('the camera centres a district in the free area and fits the whole frame', () => {
  for (const [vw, vh] of [[1280, 860], [1440, 900], [1920, 1080], [390, 844]]) {
    for (const d of DISTRICTS) {
      const cam = cameraFor(d, vw, vh);
      assert.ok(cam.s >= MIN_SCALE && cam.s <= 1, `${d.id} @${vw}: scale ${cam.s}`);
      const left = d.x * cam.s + cam.tx;
      const right = (d.x + d.w) * cam.s + cam.tx;
      const top = d.y * cam.s + cam.ty;
      const bottom = (d.y + d.h) * cam.s + cam.ty;
      // Centred between the tag columns (desktop) or the screen edges (phone).
      assert.ok(Math.abs((left + right) / 2 - vw / 2) < 0.5, `${d.id} @${vw} is centred`);
      if (cam.s > MIN_SCALE) {
        assert.ok(left >= 0 && right <= vw, `${d.id} @${vw}x${vh} fits across: ${left.toFixed(0)}…${right.toFixed(0)}`);
        assert.ok(top >= 0 && bottom <= vh - 64, `${d.id} @${vw}x${vh} fits above the mini-player: ${top.toFixed(0)}…${bottom.toFixed(0)}`);
      }
      if (vw >= 1280) {
        const side = Math.min(260, vw * 0.18);
        assert.ok(left >= side - 1 && right <= vw - side + 1, `${d.id} @${vw} leaves the tag columns clear`);
      }
    }
  }
  // centreOf inverts the transform.
  const d = byId('lectures');
  const cam = cameraFor(d, 1440, 900);
  const c = centreOf(cam, 1440, 900);
  assert.ok(Math.abs(c.x - (d.x + d.w / 2)) < 0.5);
});

test('a flight: 380–820 ms by distance, eased from rest to rest, a pull-back of at most 12 %', () => {
  assert.equal(flightMs(0), 380);
  assert.equal(flightMs(1e6), 820);
  let last = 0;
  for (let dist = 0; dist <= 6000; dist += 250) {
    const ms = flightMs(dist);
    assert.ok(ms >= last && ms >= 380 && ms <= 820);
    last = ms;
  }
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.equal(ease(0.5), 0.5);
  for (let t = 0; t < 1; t += 0.05) assert.ok(ease(t + 0.05) >= ease(t), 'monotonic');
  for (const dist of [0, 400, 3000, 1e5]) {
    assert.equal(pullBack(0, dist), 0);
    assert.ok(pullBack(1, dist) < 1e-12);
    for (let k = 0; k <= 1; k += 0.1) assert.ok(pullBack(k, dist) <= 0.12 + 1e-12);
  }
});

test('the seam: 0 in Zone, 1 in Echo, half-way on the line', () => {
  assert.equal(seamMix(0), 0);
  assert.equal(seamMix(WORLD.seam - 300), 0);
  assert.equal(seamMix(WORLD.seam), 0.5);
  assert.equal(seamMix(WORLD.seam + 300), 1);
  assert.equal(seamMix(WORLD.w), 1);
  for (const d of DISTRICTS) assert.equal(seamMix(d.x + d.w / 2), d.half === 'echo' ? 1 : 0, `${d.id} sits fully on its half`);
});

test('a click on the minimap picks the district under it', () => {
  for (const d of DISTRICTS) assert.equal(nearest(d.x + d.w / 2, d.y + d.h / 2).id, d.id);
  assert.equal(nearest(0, 0).id, 'radio');
  assert.equal(nearest(WORLD.w, WORLD.h).id, 'archives');
});
