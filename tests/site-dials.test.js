/**
 * The dials behind the side menus (site/js/world/dials.js; Ortis, 2026-11-17): Zone's cassette reel, Echo's
 * 1920s globe.
 *
 * What must hold:
 *   - each dial is centred on its screen edge, level with its tags, and holds every one of them;
 *   - the globe is a true orthographic view: what faces us is drawn, what is behind goes to the rim;
 *   - the world map's paths read back as rings of longitude and latitude;
 *   - they are decoration: hidden from assistive technology, no pointer events, not on a phone, still with
 *     reduced motion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dialFor, ortho, ringsOf, ringPath, graticule } from '../site/js/world/dials.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('a dial sits on its edge, level with its tags, and holds every one of them', () => {
  const tags = [{ left: 20, right: 160, top: 130, bottom: 170 }, { left: 30, right: 170, top: 450, bottom: 490 }];
  const zone = dialFor(tags, { side: 'left', width: 1440 });
  assert.deepEqual([zone.cx, zone.cy], [0, 310]);
  for (const b of tags) for (const [x, y] of [[b.right, b.top], [b.right, b.bottom]]) assert.ok(Math.hypot(x - zone.cx, y - zone.cy) <= zone.r, 'every corner inside');
  const right = tags.map((b) => ({ ...b, left: 1440 - b.right, right: 1440 - b.left }));
  const echo = dialFor(right, { side: 'right', width: 1440 });
  assert.deepEqual([echo.cx, echo.cy, echo.r], [1440, 310, zone.r], 'the same dial, mirrored');
  assert.equal(dialFor([{ left: 0, right: 10, top: 0, bottom: 10 }], { side: 'left', width: 800 }).r, 170, 'never smaller than its minimum');
  assert.equal(dialFor([{ left: 0, right: 900, top: 0, bottom: 900 }], { side: 'left', width: 1000 }).r, 420, 'nor larger than its maximum');
  assert.equal(dialFor([], { side: 'left', width: 1000 }), null, 'no tags, no dial');
});

test('the globe: what faces us is drawn where it should be, what is behind goes to the rim', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const [x0, y0, s0] = ortho(0, 0, 0, 100);
  assert.ok(near(x0, 0) && near(y0, 0) && s0, 'the centre of the face');
  const [x1, , s1] = ortho(60, 0, 0, 100);
  assert.ok(near(x1, 100 * Math.sin(Math.PI / 3)) && s1, 'east of the centre, to the right');
  const [, y2] = ortho(0, 45, 0, 100);
  assert.ok(near(y2, -100 * Math.sin(Math.PI / 4)), 'north is up');
  const [x3, y3, s3] = ortho(170, 10, 0, 100);
  assert.ok(!s3 && near(Math.hypot(x3, y3), 100), 'behind the globe: on the rim');
  assert.equal(ortho(170, 0, 180, 100)[2], true, 'turned, the far side comes round');
  assert.equal(ringPath([[150, 10], [160, 10], [160, 20]], 0, 100), '', 'a coast wholly behind is not drawn');
  assert.match(ringPath([[-10, 0], [10, 0], [0, 10]], 0, 100), /^M[-\d.]+,[-\d.]+L.*Z$/);
  assert.ok(graticule(0, 100).length >= 10, 'meridians and parallels');
});

test('the world map reads back as rings of longitude and latitude', () => {
  assert.deepEqual(ringsOf(['M180,90L190,90L190,80Z']), [[[0, 0], [10, 0], [10, 10]]]);
  assert.deepEqual(ringsOf(['M0,0L1,1Z', 'M1,1L2,2L3,3']), [[[-179, 89], [-178, 88], [-177, 87]]], 'a ring of two points is no coast; one left open still is');
  const map = JSON.parse(read('site/data/world.json'));
  const rings = ringsOf(map.paths);
  assert.ok(rings.length > 50, `${rings.length} rings`);
  for (const r of rings) for (const [lon, lat] of r) assert.ok(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90);
});

test('decoration only: hidden, untouchable, not on a phone, still with reduced motion; it turns at a change of page', () => {
  const js = read('site/js/world/dials.js');
  assert.match(js, /el\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(js, /if \(reduced\.matches\) \{ shown = target; drawGlobe\(shown\); return; \}/, 'the globe jumps, it does not spin');
  const css = read('site/css/world.css');
  assert.match(css, /\.w-dials\{position:absolute;inset:0;pointer-events:none\}/);
  assert.match(css, /@media \(max-width:760px\),\(max-height:500px\)\{\.w-dials\{display:none\}\}/, 'the world\'s own phone breakpoints');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.w-reel-turn\{transition:none\}\}/);
  const world = read('site/js/world/world.js');
  assert.match(world, /if \(before && before !== d\.id\) dials\.turn\(d\.half\);/);
  // 2026-11-17: placed once, at a bad instant of a slow load, both dials sat 400 px low live. Measured at every arrival.
  assert.match(world, /dials\.place\(\);\n {4}if \(before && before !== d\.id\)/, 'measured again at every arrival');
  assert.match(world, /landRings = ringsOf\(j\.paths\); dials\.settle\(\);/, 'and a few times once the map arrives');
  assert.ok(world.indexOf('dials.el') < world.indexOf('viewport, scan'), 'behind the windows');
});
