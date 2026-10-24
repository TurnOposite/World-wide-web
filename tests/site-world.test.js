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
  WORLD, DISTRICTS, FIGURES, MIN_SCALE, PHONE_MAX, SHORT_MAX, PHONE_MEDIA, SWIPE, isPhone, phoneTop, swipeHalf,
  byId, districtFor, frameFor, cameraFor, pageZoom, centreOf, flightMs, ease, pullBack, seamMix, nearest,
} from '../site/js/world/layout.js';
import { byTag, pressOf, dateFr } from '../site/js/pages/archives.js';
import { routes } from '../scripts/site-build.mjs';
import { SCREEN_KEY, SCREEN_OPTIONS, SCREEN_DEFAULTS, normalScreen, readScreen, writeScreen, bubbleCount } from '../site/js/world/screen.js';

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
    playlists: 'playlists', booth: 'booth', lectures: 'lectures', ecrits: 'lectures', archives: 'archives',
  };
  for (const [name, id] of Object.entries(expect)) assert.equal(districtFor(name, {}), id, name);
  assert.equal(districtFor('echo', {}), 'une');
  assert.equal(districtFor('echo', { slug: 'article-temoin' }), 'articles', 'an article opens on the reading desk');
  assert.equal(districtFor('missing', {}), null, 'a page that does not exist leaves the camera where it is');
  // Every route name main.js declares is mapped (a new route must be placed on the map).
  for (const name of ['home', 'radio', 'ondes', 'playlists', 'atlas', 'lectures', 'zone', 'ecrits', 'archives', 'echo', 'portfolio', 'booth']) {
    assert.ok(districtFor(name, {}), name);
  }
  // Since phase 4 only Articles has no address of its own: it is reached through an article's.
  assert.deepEqual(DISTRICTS.filter((d) => d.route === null).map((d) => d.id), ['articles']);
  assert.equal(byId('archives').route, 'echo/archives');
});

test('Echo\'s figures stand on the paper, in the gutters: never over a window, every one a symbol the Gazette draws', () => {
  const sprite = fs.readFileSync(new URL('../site/js/ui/echo-front.js', import.meta.url), 'utf8');
  assert.ok(FIGURES.length >= 4);
  for (const f of FIGURES) {
    assert.ok(sprite.includes(`id="s-${f.kind}"`), `${f.kind} is a symbol of echo-front.js`);
    assert.ok(f.x >= WORLD.seam + 20 && f.x + f.w <= WORLD.w && f.y >= 0 && f.y + f.h <= WORLD.h, `${f.kind} is on Echo's paper, past the torn edge`);
    for (const d of DISTRICTS) {
      const apart = f.x + f.w <= d.x || d.x + d.w <= f.x || f.y + f.h <= d.y || d.y + d.h <= f.y;
      assert.ok(apart, `${f.kind} stands over ${d.id}`);
    }
  }
});

test('Archives: the press from the Atlas\'s places, the articles by tag, French dates', () => {
  const places = JSON.parse(fs.readFileSync(new URL('../site/data/places.json', import.meta.url), 'utf8')).places;
  const press = pressOf(places);
  assert.ok(press.length >= 1, 'at least the Jornal NH');
  const nh = press.find((p) => p.slug === 'novo-hamburgo');
  assert.ok(nh && /Jornal NH/.test(nh.outlet));
  const src = places.find((p) => p.slug === 'novo-hamburgo').press;
  assert.equal(nh.column.items.length, src.column.items.length, 'every column is listed');
  assert.equal(nh.series.items.length, src.series.items.length, 'every episode of the series is listed');
  for (const list of [nh.column.items, nh.series.items]) {
    assert.deepEqual(list.map((i) => i.date), list.map((i) => i.date).sort(), 'in date order');
    for (const i of list) assert.ok(fs.existsSync(new URL(`../site/${i.pages[0]}`, import.meta.url)), `${i.pages[0]} is on the site`);
  }
  assert.ok(nh.from <= nh.to && nh.from === [...src.column.items, ...src.series.items].map((i) => i.date).sort()[0]);
  assert.deepEqual(pressOf([{ slug: 'x' }, { slug: 'y', press: { outlet: 'Z', column: { title: 't', items: [] } } }]), [], 'a place without press is left out');

  const arts = [
    { slug: 'b', title: 'B', date: '2026-02-01', tags: ['Écologie', 'paris'] },
    { slug: 'a', title: 'A', date: '2026-01-01', tags: ['paris'] },
  ];
  assert.deepEqual(byTag(arts).map((t) => [t.tag, t.articles.map((a) => a.slug)]), [['Écologie', ['b']], ['paris', ['b', 'a']]],
    'tags in French order, articles kept newest first');
  assert.deepEqual(byTag([]), []);
  assert.equal(dateFr('2024-06-06'), '6 juin 2024');
  assert.equal(dateFr('2024-08-01'), '1er août 2024');
});

test('the camera centres a district in the free area and fits the whole frame', () => {
  for (const [vw, vh] of [[1280, 860], [1440, 900], [1920, 1080], [390, 844], [844, 390], [667, 375], [932, 430]]) {
    for (const d of DISTRICTS) {
      const cam = cameraFor(d, vw, vh);
      const f = frameFor(d, vw, vh);
      assert.ok(cam.s >= MIN_SCALE && cam.s <= 1, `${d.id} @${vw}: scale ${cam.s}`);
      // On a phone (upright or on its side) the frame is the screen, shown at 1:1; on a desktop it is the map's own size.
      if (isPhone(vw, vh)) assert.equal(cam.s, 1, `${d.id} @${vw}x${vh}: a phone shows its frame at 1:1`);
      else assert.deepEqual(f, { w: d.w, h: d.h });
      const left = d.x * cam.s + cam.tx;
      const right = (d.x + f.w) * cam.s + cam.tx;
      const top = d.y * cam.s + cam.ty;
      const bottom = (d.y + f.h) * cam.s + cam.ty;
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

test('a page reads at 1:1: its zoom undoes the camera\'s scale, and a phone\'s frames never overlap', () => {
  for (const [vw, vh] of [[1280, 860], [1440, 900], [1920, 1080], [900, 700]]) {
    for (const d of DISTRICTS) {
      const { s } = cameraFor(d, vw, vh);
      assert.ok(Math.abs(pageZoom(s) * s - 1) < 1e-3, `${d.id} @${vw}: zoom ${pageZoom(s)} × scale ${s}`);
    }
  }
  assert.equal(pageZoom(1), 1, 'no zoom where the camera does not scale');
  for (const [vw, vh] of [[360, 640], [390, 844], [430, 932], [760, 1024]]) {
    const rects = DISTRICTS.map((d) => ({ id: d.id, x: d.x, y: d.y, ...frameFor(d, vw, vh) }));
    for (const r of rects) assert.ok(r.w >= 240 && r.w <= vw && r.h >= 240, `${r.id} @${vw}x${vh}: ${r.w}×${r.h}`);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        assert.ok(apart, `${a.id} and ${b.id} overlap on a ${vw}x${vh} phone`);
      }
    }
  }
});

test('a phone on its side is a phone: the frame starts under the one-line header, fits above the mini-player, never overlaps another', () => {
  assert.equal(PHONE_MEDIA, `(max-width: ${PHONE_MAX}px), (max-height: ${SHORT_MAX}px)`);
  assert.ok(isPhone(390, 844) && isPhone(844, 390) && isPhone(932, 430) && isPhone(760, 1024));
  assert.ok(!isPhone(1280, 860) && !isPhone(1024, 768) && !isPhone(761, 501), 'a tablet on its side and a laptop keep the desktop map');
  assert.ok(phoneTop(390) < phoneTop(844), 'on its side the strip shares the header\'s line');
  for (const [vw, vh] of [[667, 375], [740, 360], [844, 390], [932, 430], [1180, 500]]) {
    const rects = DISTRICTS.map((d) => ({ id: d.id, x: d.x, y: d.y, ...frameFor(d, vw, vh) }));
    for (const r of rects) {
      assert.ok(r.w >= 240 && r.w <= vw - 24 && r.h >= 160, `${r.id} @${vw}x${vh}: ${r.w}×${r.h}`);
      const cam = cameraFor(byId(r.id), vw, vh);
      const left = r.x + cam.tx;
      assert.ok(Math.abs(left + r.w / 2 - vw / 2) < 0.5, `${r.id} @${vw}x${vh} is centred`);
      assert.equal(r.y + cam.ty, phoneTop(vh), `${r.id} @${vw}x${vh} starts under the header`);
      assert.ok(r.y + cam.ty + r.h <= vh - 64, `${r.id} @${vw}x${vh} ends above the mini-player`);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        assert.ok(apart, `${a.id} and ${b.id} overlap on a ${vw}x${vh} phone on its side`);
      }
    }
  }
  // world.css spells out the same breakpoints (a media query cannot read a JS constant).
  const css = fs.readFileSync(new URL('../site/css/world.css', import.meta.url), 'utf8');
  assert.ok(css.includes(`@media (max-width:${PHONE_MAX}px),(max-height:${SHORT_MAX}px){`), 'the phone rules cover a phone on its side');
  assert.ok(css.includes(`@media (max-height:${SHORT_MAX}px){`), 'the one-line header');
  assert.ok(css.includes(`@media (min-width:${PHONE_MAX + 1}px) and (min-height:${SHORT_MAX + 1}px){`), 'the stacked menu is a desktop\'s only');
});

test('a swipe across a phone goes to the other half; a scroll, a slow drag, the screen\'s edge or the half already in view do nothing', () => {
  const g = (o) => ({ x0: 300, dx: -180, dy: 10, ms: 220, vw: 390, ...o });
  assert.equal(swipeHalf('zone', g()), 'echo', 'finger to the left: Echo, which lies to the right');
  assert.equal(swipeHalf('echo', g({ x0: 90, dx: 180 })), 'zone', 'finger to the right: back to Zone');
  assert.equal(swipeHalf('echo', g()), null, 'already on Echo');
  assert.equal(swipeHalf('zone', g({ x0: 90, dx: 180 })), null, 'already on Zone');
  assert.equal(swipeHalf('zone', g({ dx: -(SWIPE.min - 1) })), null, 'too short');
  assert.equal(swipeHalf('zone', g({ dx: -120, dy: 90 })), null, 'mostly down: a scroll');
  assert.equal(swipeHalf('zone', g({ ms: SWIPE.ms + 1 })), null, 'too slow: a drag, not a swipe');
  assert.equal(swipeHalf('echo', g({ x0: SWIPE.edge - 1, dx: 180 })), null, 'from the left edge: the phone\'s own Back');
  assert.equal(swipeHalf('zone', g({ x0: 390 - SWIPE.edge + 1 })), null, 'from the right edge');
  assert.equal(swipeHalf(undefined, g()), 'echo', 'off the map (no half yet): a swipe still goes');
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

test('« Écran »: four settings, each default one of its own choices, anything unknown falls back', () => {
  assert.deepEqual(Object.keys(SCREEN_OPTIONS), ['bg', 'bub', 'list', 'scan']);
  assert.deepEqual(SCREEN_OPTIONS.bg.choices.map(([v]) => v), ['grid', 'rain', 'void'], 'Grille, Pluie, Vide');
  for (const [k, { choices }] of Object.entries(SCREEN_OPTIONS)) {
    assert.ok(choices.some(([v]) => v === SCREEN_DEFAULTS[k]), `default ${k} is a choice`);
    assert.ok(choices.every(([v, name]) => v && name), `${k}: every choice has a value and a name`);
  }
  assert.deepEqual(normalScreen(null), SCREEN_DEFAULTS);
  assert.deepEqual(normalScreen('rain'), SCREEN_DEFAULTS);
  assert.deepEqual(normalScreen({ bg: 'rain', bub: 'lots', list: 'stack', scan: 0, extra: 'x' }),
    { ...SCREEN_DEFAULTS, bg: 'rain', list: 'stack' }, 'only known values survive, nothing extra');
});

test('« Écran » is remembered per browser, and a broken or blocked storage gives the defaults', () => {
  const store = memoryStorage();
  assert.deepEqual(readScreen(store), SCREEN_DEFAULTS);
  writeScreen(store, { ...SCREEN_DEFAULTS, bg: 'void', scan: 'off' });
  assert.deepEqual(readScreen(store), { ...SCREEN_DEFAULTS, bg: 'void', scan: 'off' });
  store.setItem(SCREEN_KEY, '{not json');
  assert.deepEqual(readScreen(store), SCREEN_DEFAULTS);
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(readScreen(blocked), SCREEN_DEFAULTS);
  assert.doesNotThrow(() => writeScreen(blocked, SCREEN_DEFAULTS));
  assert.deepEqual(readScreen(null), SCREEN_DEFAULTS);
});

test('the bubbles: at most 26, half on a phone, none when asked or under reduced motion', () => {
  assert.equal(bubbleCount('few'), 10);
  assert.equal(bubbleCount('many'), 26);
  assert.equal(bubbleCount('none'), 0);
  assert.equal(bubbleCount('???'), 10);
  assert.equal(bubbleCount('many', { phone: true }), 13);
  assert.equal(bubbleCount('few', { phone: true }), 5);
  for (const p of ['few', 'many', 'none']) assert.equal(bubbleCount(p, { reduced: true }), 0);
});

test('Zone\'s faces are self-hosted: every @font-face in world.css points at a woff2 in site/fonts, with its licence', () => {
  const css = fs.readFileSync(new URL('../site/css/world.css', import.meta.url), 'utf8');
  const faces = [...css.matchAll(/@font-face\{[^}]*\}/g)].map((m) => m[0]);
  const fams = new Set(faces.map((f) => f.match(/font-family:"([^"]+)"/)[1]));
  assert.deepEqual([...fams].sort(), ['Chakra Petch', 'IBM Plex Mono']);
  let bytes = 0;
  for (const f of faces) {
    const src = f.match(/url\("\.\.\/fonts\/([\w-]+\.woff2)"\)/);
    assert.ok(src, `local woff2 only: ${f.slice(0, 80)}`);
    bytes += fs.statSync(new URL(`../site/fonts/${src[1]}`, import.meta.url)).size;
    assert.match(f, /font-display:swap/);
  }
  assert.ok(bytes < 60 * 1024, `Zone's fonts stay small: ${bytes} bytes`);
  assert.doesNotMatch(css, /fonts\.(googleapis|gstatic)\.com/);
  const ofl = fs.readFileSync(new URL('../site/fonts/OFL.txt', import.meta.url), 'utf8');
  assert.match(ofl, /Chakra Petch Project Authors/);
  assert.match(ofl, /IBM Corp/);
});
