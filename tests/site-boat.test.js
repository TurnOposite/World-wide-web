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
