/**
 * The dials behind the side menus (site/js/world/dials.js) and the selection shard on the tags (site/js/world/tags.js).
 * The half discs came on 2026-11-17 with a reel and a globe; since 2026-11-18 they are flat (Ortis: « clear-cut
 * shapes » in the same semicircles), and the tag pointed at wears a shard (the mood board's MB-01).
 *
 * What must hold:
 *   - each dial is centred on its screen edge, level with its tags, and holds every one of them;
 *   - its needle points at the middle of a tag, and always turns the short way round;
 *   - the ticks cover the half that shows and no more;
 *   - a shard is ten points inside its box, a new one at every jump, the same from the same seed;
 *   - Echo's ransom-note labels keep their letters and never reshuffle;
 *   - all of it is decoration: hidden from assistive technology, no pointer events, not on a phone, and it jumps
 *     rather than swings with reduced motion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dialFor, aimAt, turnTo, ticks, needlePath } from '../site/js/world/dials.js';
import { shardPolygon, ransom } from '../site/js/world/tags.js';

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

test('the needle points at the middle of a tag and turns the short way round', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(aimAt({ left: 90, right: 110, top: 290, bottom: 310 }, 0, 300), 0), 'level with the hub: straight right');
  assert.ok(near(aimAt({ left: -10, right: 10, top: 390, bottom: 410 }, 0, 300), 90), 'below: 90°');
  assert.ok(near(aimAt({ left: 1300, right: 1340, top: 280, bottom: 320 }, 1440, 300), 180), 'Echo\'s dial points left');
  assert.equal(turnTo(170, -170), 190, 'on through 180, not back through 0');
  assert.equal(turnTo(-170, 170), -190);
  assert.equal(turnTo(10, 40), 40);
  assert.equal(turnTo(400, 30), 390, 'from wherever it has wound to');
  assert.match(needlePath(100, 6), /^M0,-6L100,0L0,6L-7\.2,0Z$/);
});

test('the ticks cover the half that shows, majors every 30°', () => {
  const left = ticks('left', 80, 90, 95);
  assert.equal(left[0].a, -90);
  assert.equal(left.at(-1).a, 90);
  assert.equal(left.length, 37);
  assert.deepEqual(left.filter((t) => t.big).map((t) => t.a), [-90, -60, -30, 0, 30, 60, 90]);
  assert.ok(left.every((t) => t.x2 >= -1e-9), 'Zone\'s all on the right of the hub, where its half shows');
  const right = ticks('right', 80, 90, 95);
  assert.ok(right.every((t) => t.x2 <= 1e-9), 'Echo\'s all on the left of its hub');
  assert.ok(Math.abs(Math.hypot(left[6].x2, left[6].y2) - 95) < 1e-9, 'a major reaches the outer radius');
});

test('a shard: ten points inside its box, a new one at every jump, the same from the same seed', () => {
  const seq = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  const a = shardPolygon(seq(1)), b = shardPolygon(seq(1)), c = shardPolygon(seq(2));
  assert.equal(a, b);
  assert.notEqual(a, c);
  const pts = a.slice(8, -1).split(',').map((p) => p.trim().split(' ').map(parseFloat));
  assert.equal(pts.length, 10, 'always ten, so one eases into the next');
  for (const [x, y] of pts) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `${x} ${y} inside the box`);
  const r = seq(3);
  const shapes = new Set(Array.from({ length: 20 }, () => shardPolygon(r)));
  assert.equal(shapes.size, 20, 'a new shape at every jump');
});

test('Echo\'s ransom-note labels keep their letters and never reshuffle', () => {
  for (const w of ['Une', 'Articles', 'Archive', 'Atlas']) {
    const letters = ransom(w);
    assert.equal(letters.map((l) => l.ch).join(''), w, 'the same word, letter for letter');
    assert.deepEqual(ransom(w), letters, 'the same styles every time');
    assert.ok(letters.every((l) => l.k >= 0 && l.k <= 3));
    if (w.length > 4) assert.ok(new Set(letters.map((l) => l.k)).size > 1, `${w}: mixed, or it is no ransom note`);
  }
  assert.equal(ransom('a b')[1].k, -1, 'a space takes no style');
});

test('decoration only: hidden, untouchable, not on a phone; the needle and the shard jump with reduced motion', () => {
  const js = read('site/js/world/dials.js');
  assert.match(js, /el\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(js, /g\.style\.transition = reduced\.matches \? 'none' : ''/, 'the needle jumps, it does not swing');
  const css = read('site/css/world.css');
  assert.match(css, /\.w-dials\{position:absolute;inset:0;pointer-events:none\}/);
  assert.match(css, /@media \(max-width:760px\),\(max-height:500px\)\{\.w-dials\{display:none\}\}/, 'the world\'s own phone breakpoints');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.w-needle-turn\{transition:none\}\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.w-shard,\.w-shard>b\{transition:none\}\}/);
  assert.match(css, /\.w-shard\{position:absolute;left:0;top:0;width:100px;height:40px;pointer-events:none;/);
  assert.doesNotMatch(css, /aria-current="true"\]>span\{box-shadow:0 0 0 2px var\(--w-night\),0 0 0 4px var\(--w-neon-c\)\}/, 'the amber ring is gone');
  const tags = read('site/js/world/tags.js');
  assert.match(tags, /sh\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(tags, /b\.setAttribute\('aria-label', d\.title\)/, 'a ransom-note label is read as its plain name');
  const world = read('site/js/world/world.js');
  // 2026-11-17: placed once, at a bad instant of a slow load, both dials sat 400 px low live. Measured at every arrival.
  assert.match(world, /tags\.mark\(d\.id\);\n(?: {4}\/\/.*\n)+ {4}dials\.place\(\);/, 'measured again at every arrival, after the tag is marked');
  assert.match(world, /tags\.onPoint = \(\) => dials\.aim\(\);/, 'the needles follow the tag pointed at');
  assert.ok(world.indexOf('dials.el') < world.indexOf('viewport, scan'), 'behind the windows');
});
