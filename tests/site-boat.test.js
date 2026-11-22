/**
 * The boat (site/js/boat/, docs/BACKLOG.md F1): a parallel front behind ?boat=1.
 *
 * What must hold: never on by default, on and off by the address and remembered for the tab; every route the site has
 * finds a place on the boat (an unknown one the laptop); every place but the lake opens a page; the camera pose for a
 * place looks straight at its screen, so the screen's centre lands in the middle of the view; and the CSS camera and
 * the projection agree on what is behind the eye.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { boatWanted } from '../site/js/boat/flag.js';
import { PLACES, ORDER, FRONT, placeOf, routeOf, poseFor, project } from '../site/js/boat/scene.js';

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('never on by default; on and off by the address, remembered for the tab', () => {
  assert.equal(boatWanted({ search: '' }), false, 'the map stays the front');
  const s = store();
  assert.equal(boatWanted({ search: '?boat=1', storage: s }), true);
  assert.equal(boatWanted({ search: '', storage: s }), true, 'remembered while the tab lives');
  assert.equal(boatWanted({ search: '?boat=0', storage: s }), false);
  assert.equal(boatWanted({ search: '', storage: s }), false);
  assert.equal(boatWanted({ search: '?boat=1', storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } }), true, 'storage blocked: this page only');
});

test('never on a phone (2026-11-22): a ?boat=1 link gets the map there, and the tab does not remember it', () => {
  const s = store();
  assert.equal(boatWanted({ search: '?boat=1', storage: s, phone: true }), false);
  assert.equal(s.getItem('gt.boat'), null, 'nothing kept for the tab');
  assert.equal(boatWanted({ search: '', storage: s, phone: false }), false, 'widened to a desktop: still the map until asked');
  boatWanted({ search: '?boat=1', storage: s });
  assert.equal(boatWanted({ search: '', storage: s, phone: true }), false, 'chosen on a desktop, then narrowed: the map');
});

test('every route finds its place; every place but the lake opens a page', () => {
  const routes = { radio: 'radio', home: 'radio', playlists: 'playlists', antenna: 'antenna', zone: 'antenna', ondes: 'ondes', booth: 'booth',
    echo: 'echo', articles: 'echo', portfolio: 'echo', atlas: 'echo', lectures: 'echo', missing: 'radio' };
  for (const [route, place] of Object.entries(routes)) assert.equal(placeOf(route), place, route);
  for (const k of ORDER) {
    if (k === 'lake') assert.equal(routeOf(k), null);
    else { assert.ok(routeOf(k), `${k} opens a page`); assert.equal(placeOf(routeOf(k)), k, `${k} round-trips`); }
  }
  assert.deepEqual(FRONT, ['radio', 'playlists', 'antenna', 'ondes', 'booth'], 'the five you face from the hammock');
});

test('the camera looks straight at each screen: its centre in the middle of the view, its size as asked', () => {
  const W = 1440, H = 800, P = 1000;
  for (const k of ORDER.filter((x) => PLACES[x].w)) {
    const pose = poseFor(k, { W, H, P, fitW: 0.8, fitH: 0.76 });
    const c = project(pose, PLACES[k].c, W, H, P);
    assert.ok(c && Math.abs(c.x - W / 2) < 0.5 && Math.abs(c.y - H / 2) < 0.5, `${k}: centre at ${c?.x}, ${c?.y}`);
    const s = PLACES[k];
    const edge = project(pose, [s.c[0] + s.r[0] * s.w / 2, s.c[1] + s.r[1] * s.w / 2, s.c[2] + s.r[2] * s.w / 2], W, H, P);
    const half = Math.abs(edge.x - W / 2);
    assert.ok(half <= 0.8 * W / 2 + 0.5, `${k}: fits the width it was given (${half.toFixed(1)})`);
  }
  assert.equal(project({ x: 0, y: 0, z: 0, yaw: 0, pd: 0, roll: 0 }, [0, 0, 10], W, H, P), null, 'behind the eye: nothing drawn');
});

test('the sky keeps the station\'s clock (2026-11-22): dawn at 6, full night with its stars, plain day; ?sky= picks an hour', async () => {
  const { skyAt, skyMinutes } = await import('../site/js/boat/scene.js');
  const night = skyAt(23 * 60 + 30), dawn = skyAt(6 * 60), noon = skyAt(13 * 60);
  assert.ok(night.star > 0.95 && night.dark > 0.8 && night.lant > 0.9, 'at night the stars are out and the far lanterns lit');
  assert.ok(dawn.star < 0.15 && dawn.sunA > 0.8 && dawn.sunEl > 0 && dawn.sunEl < 0.05, 'at six the sun is on the horizon and the stars nearly gone');
  assert.equal(noon.star, 0); assert.equal(noon.dark, 0); assert.equal(noon.top, '#9cafad', 'by day the lake of 2026-11-18, unchanged');
  for (const k of ['top', 'mid', 'hor', 'wHor', 'wMid', 'wNear', 'sun', 'mist', 'rip']) assert.match(skyAt(1190)[k], /^#[0-9a-f]{6}$/, k);
  let prev = 0;
  for (let m = 17 * 60; m <= 21 * 60; m += 10) { const s = skyAt(m).star; assert.ok(s >= prev - 1e-9, `the stars only come out through the evening (${m})`); prev = s; }
  assert.deepEqual(skyAt(-60), skyAt(23 * 60), 'the day wraps');
  assert.equal(skyMinutes(new Date(), '?boat=1&sky=23:30'), 1410);
  assert.equal(skyMinutes(new Date('2026-11-22T12:00:00Z'), ''), 13 * 60, 'Paris time (UTC+1 in November)');
  assert.equal(skyMinutes(new Date('2026-07-01T12:00:00Z'), '?sky=25:00'), 14 * 60, 'a wrong ?sky= is ignored; summer is UTC+2');
});

test('the lever: one position per stream, in order, up to three; a stream it does not know is none of them', async () => {
  const { LEVER, leverIndex } = await import('../site/js/boat/scene.js');
  assert.deepEqual(LEVER, [0, 45, 90]);
  assert.equal(leverIndex(['all', 'chill', 'energy'], 'all'), 0);
  assert.equal(leverIndex(['all', 'chill', 'energy'], 'energy'), 2);
  assert.equal(leverIndex(['all', 'chill', 'energy', 'mashup'], 'mashup'), -1);
  assert.equal(leverIndex(['all', 'chill'], 'nope'), -1);
});

test('the near clipping\'s geometry: a plane\'s corners from its CSS, the depth the projection uses, a camera never too near', async () => {
  const { cornersOf, depthOf, project, poseFor, PLACES } = await import('../site/js/boat/scene.js');
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  // translate3d(10px, 0, 0) rotateY(90deg) on a 20 × 10 plane: its width now runs along z.
  const c = cornersOf({ w: 20, h: 10, x: 10, y: 0, z: 0, t: 'rotateY(90deg)' });
  assert.ok(near(c[0], [10, -5, 10]) && near(c[1], [10, -5, -10]), JSON.stringify(c));
  const top = cornersOf({ w: 4, h: 6, origin: 'top', x: 0, y: 0, z: 0 });
  assert.deepEqual(top.map((p) => p[1]), [0, 0, 6, 6], 'hung from its top');
  const pivoted = cornersOf({ w: 2, h: 2 }, { x: 0, y: 0, z: 5, t: 'rotateX(90deg)' });
  assert.ok(pivoted.every((p) => Math.abs(p[2] - 5) <= 1), 'a pivot\'s child is placed by the pivot too');
  const pose = { x: 0, y: -100, z: 300, yaw: 10, pd: -5, roll: 3 };
  for (const p of [[0, 0, 0], [40, -60, 120], [-80, 10, -200]]) {
    const q = project(pose, p, 1000, 600, 800);
    assert.ok(Math.abs(q.d - depthOf(pose, p)) < 1e-9, 'the same depth as the projection');
  }
  assert.ok(depthOf(pose, [0, -100, 400]) < 0, 'behind the eye: negative');
  const W = 1536, H = 635, P = 977;
  const close = poseFor('playlists', { W, H, P }), kept = poseFor('playlists', { W, H, P, minD: 0.16 * P });
  const dist = (p) => Math.hypot(p.x - PLACES.playlists.c[0], p.y - PLACES.playlists.c[1], p.z - PLACES.playlists.c[2]);
  assert.ok(dist(close) < 0.1 * P && Math.abs(dist(kept) - 0.16 * P) < 1e-6, `the phone framed from ${dist(close).toFixed(0)} units became ${dist(kept).toFixed(0)}`);
  const { MIN_D, NEAR } = await import('../site/js/boat/boat.js');
  assert.ok(MIN_D > NEAR && NEAR > 0, 'a place\'s screen always stands beyond the clipping distance');
});
