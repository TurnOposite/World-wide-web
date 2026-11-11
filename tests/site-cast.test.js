/**
 * The cast (site/js/ui/cast.js): who a listener can be on the telegraph line
 * and in the mini-player (Ortis, 2026-11-11).
 *
 *   - every sprite is a whole 16 × 20 grid of known cells, and no two
 *     characters — nor two looks of one — draw the same picture;
 *   - a choice travels as an icon name the tower accepts and the browser
 *     keeps, and comes back as the same character in the same clothes;
 *   - a name that is not one of the cast's is nobody: no picture is made
 *     from a stranger's text;
 *   - one slide is one step round the ring, and an up-and-down scroll is
 *     not a slide.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAST, WARDROBE, LOOK_NAMES, BASE, W, H, BUST_H, grid, palette, runs, castSvg, castUrl, castIcon, parseCast, castLabel, step, swipe } from '../site/js/ui/cast.js';
import { validIdentity } from '../site/js/ui/telegraph.js';
import { cleanIcon, LIMITS } from '../server/lib/telegraph.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('every sprite is a whole grid of cells the palette knows', () => {
  assert.equal(BASE.length, H);
  assert.ok(CAST.length >= 6, 'a cast worth sliding through');
  for (const who of CAST) {
    for (const [y, row] of Object.entries(who.rows)) {
      assert.equal(row.length, W, `${who.id} row ${y}`);
      assert.ok(Number(y) >= 0 && Number(y) < H, `${who.id} row ${y} is on the grid`);
    }
    const g = grid(who);
    assert.equal(g.length, H);
    const pal = palette(who, 0);
    for (const row of g) {
      assert.equal(row.length, W, who.id);
      for (const ch of row) assert.ok(ch === '.' || /^#[0-9a-f]{6}$/.test(pal[ch] || ''), `${who.id}: « ${ch} » has a colour`);
    }
    // Each run stays on the grid, and together they are exactly the cells that are drawn.
    const drawn = g.join('').replace(/\./g, '').length;
    const rs = runs(who, 0);
    assert.equal(rs.reduce((n, r) => n + r.w, 0), drawn, who.id);
    assert.ok(rs.every((r) => r.x >= 0 && r.x + r.w <= W && r.y >= 0 && r.y < H));
    assert.ok(runs(who, 0, BUST_H).every((r) => r.y < BUST_H), 'a bust stops at the shoulders');
  }
});

test('nobody shares a face, a name or an id — and each has four looks that differ', () => {
  assert.equal(new Set(CAST.map((c) => c.id)).size, CAST.length);
  assert.equal(new Set(CAST.map((c) => c.name)).size, CAST.length);
  assert.equal(new Set(CAST.map((c) => castSvg(c, 0))).size, CAST.length, 'no two characters are the same drawing');
  assert.equal(new Set(CAST.map((c) => castSvg(c, 0, { bust: true }))).size, CAST.length, '…nor the same face on the line');
  for (const who of CAST) {
    assert.match(who.id, /^[a-z]+$/);
    assert.equal(who.looks.length, 4, `${who.id}: a few clothes, not a wardrobe`);
    assert.equal(new Set(who.looks).size, 4);
    for (const key of who.looks) { assert.ok(WARDROBE[key], `${who.id}: ${key}`); assert.ok(LOOK_NAMES[key]); }
    assert.equal(new Set(who.looks.map((_, k) => castSvg(who, k))).size, 4, `${who.id}: every look shows`);
    assert.ok(who.line && who.name);
  }
});

test('a choice travels as an icon name the tower accepts, and comes back the same', () => {
  for (const who of CAST) {
    who.looks.forEach((_, k) => {
      const icon = castIcon(who.id, k);
      assert.equal(cleanIcon(icon), icon, 'the tower carries it (server/lib/telegraph.js)');
      assert.ok(icon.length <= LIMITS.icon);
      assert.equal(validIdentity({ name: 'A', icon })?.icon, icon, 'the browser keeps it');
      const back = parseCast(icon);
      assert.equal(back.who, who);
      assert.equal(back.look, k);
      assert.match(castLabel(icon), new RegExp(LOOK_NAMES[who.looks[k]]));
      assert.match(castUrl(icon), /^data:image\/svg\+xml,/);
      assert.equal(castUrl(icon), castUrl(icon), 'made once');
    });
  }
});

test('a name that is not one of the cast\'s is nobody', () => {
  for (const bad of [null, undefined, '', 42, 'cast.nobody.0', 'cast.operator.4', 'cast.operator.9', 'cast.operator', 'cast.operator.1.2', 'CAST.operator.1', 'cast.operator.1"><script>', '01-wave.svg', 'cast..0']) {
    assert.equal(parseCast(bad), null, String(bad));
    assert.equal(castUrl(bad), null);
    assert.equal(castLabel(bad), '');
  }
  // The drawing is made of the cast's own colours and numbers: nothing from the name reaches it.
  const svg = castSvg(CAST[0], 0);
  assert.doesNotMatch(svg.replace(/^<svg[^>]*>/, ''), /[^<>/a-zA-Z0-9#="\s.-]/);
  assert.doesNotMatch(read('site/js/ui/cast.js'), /innerHTML|insertAdjacentHTML|document\.write/, 'the picker builds with nodes');
});

test('one slide is one step round the ring; a scroll is not a slide', () => {
  assert.equal(step(0, 1, 8), 1);
  assert.equal(step(7, 1, 8), 0);
  assert.equal(step(0, -1, 8), 7);
  assert.equal(step(2, -1, 4), 1);
  assert.equal(swipe(-60, 4), 1, 'a drag to the left brings the next one');
  assert.equal(swipe(60, -4), -1);
  assert.equal(swipe(-12, 0), 0, 'a tap');
  assert.equal(swipe(-40, 80), 0, 'the page scrolling under the finger');
});

test('the line and the mini-player show the cast; the stage keeps the page\'s own scroll', () => {
  const line = read('site/js/ui/telegraph.js');
  assert.match(line, /castFace\(icon, cls\)/);
  assert.match(line, /new CastPicker\(/);
  const bar = read('site/js/ui/minibar.js');
  assert.match(bar, /identity\.on\(paintMe\)/);
  assert.match(read('site/index.html'), /id="mbMe"[^>]*hidden/);
  const css = read('site/css/site.css');
  assert.match(css, /\.cast-stage\{[^}]*touch-action:pan-y/, 'world.js ownsSwipe reads this: a slide here never changes side');
});
