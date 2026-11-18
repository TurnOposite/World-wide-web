/**
 * The track-change caption (site/js/ui/caption.js, the mood board's MB-03) and the cover drawn for a track without one
 * (site/js/ui/util.js, MB-10).
 *
 * What must hold:
 *   - the scramble settles left to right and ends on the title, spaces left alone;
 *   - a track the scan could not name gets a name, never « Unknown artist »; a named one keeps its name;
 *   - the drawn cover carries the title, a barcode that is the same for the same track, and when it started, Paris time;
 *   - the caption answers the station's track event, not the first one of a visit, not twice for one track, and is read
 *     politely while the drawing stays out of the accessibility tree.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { scrambleFrames, mountCaption } from '../site/js/ui/caption.js';
import { artistOf, barsOf, stampOf, labelLines, blankCover, UNKNOWN_ARTIST } from '../site/js/ui/util.js';

const seq = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };

test('the scramble settles left to right and ends on the title, spaces left alone', () => {
  const title = 'Tears in Helm';
  const frames = scrambleFrames(title, 10, seq(1));
  assert.equal(frames.length, 10);
  assert.equal(frames.at(-1), title, 'the last frame is the title');
  for (const f of frames) {
    assert.equal([...f].length, [...title].length, 'never longer or shorter');
    [...title].forEach((c, i) => { if (c === ' ') assert.equal([...f][i], ' ', 'spaces stay spaces'); });
  }
  const settled = frames.map((f) => { let n = 0; while (n < title.length && f[n] === title[n]) n++; return n; });
  assert.ok(settled.every((n, i) => i === 0 || n >= settled[i - 1]), 'what has settled stays settled');
  assert.notEqual(frames[0], title, 'it starts as noise');
  assert.equal(scrambleFrames('バックの宝探し', 4, seq(2)).at(-1), 'バックの宝探し', 'Japanese titles settle too');
});

test('a track the scan could not name gets a name; a named one keeps its own', () => {
  assert.equal(artistOf({ artist: UNKNOWN_ARTIST }), 'Anonymous transmission');
  assert.equal(artistOf({ artist: '  ' }), 'Anonymous transmission');
  assert.equal(artistOf({}), 'Anonymous transmission');
  assert.equal(artistOf({ artist: UNKNOWN_ARTIST }, 'fr'), 'Transmission anonyme', 'in French on the Echo side');
  assert.equal(artistOf({ artist: 'Macroblank' }), 'Macroblank');
});

test('the drawn cover: the title on the label, the same barcode for the same track, the start in Paris time', () => {
  assert.deepEqual(barsOf('33ad82292ebd'), barsOf('33ad82292ebd'));
  assert.notDeepEqual(barsOf('33ad82292ebd'), barsOf('33ad82292ebe'));
  assert.equal(barsOf('x').length, 30);
  assert.ok(barsOf('x').every((w) => w >= 1 && w <= 3));
  assert.deepEqual(stampOf(Date.parse('2026-11-18T01:05:00Z')), { time: '▶ 02:05', date: '18 NOV 2026' }, 'Paris in winter is UTC + 1');
  assert.deepEqual(stampOf(Date.parse('2026-07-01T22:30:00Z')), { time: '▶ 00:30', date: '02 JUL 2026' }, 'and UTC + 2 in summer, the next day');
  assert.equal(stampOf(NaN), null);
  assert.deepEqual(labelLines('Emapea  Best Of  Jazzy Beats  1 Hour Playlist'), ['Emapea Best Of', 'Jazzy Beats 1 Hour', 'Playlist']);
  assert.equal(labelLines('one two three four five six seven eight nine ten eleven twelve').length, 3, 'three lines at most');
  assert.match(labelLines('one two three four five six seven eight nine ten eleven twelve')[2], /…$/, 'cut with an ellipsis');
  assert.deepEqual(labelLines(''), ['—']);
  const svg = blankCover({ id: 'abc', title: 'A <b> & title', startsAt: Date.parse('2026-11-18T01:05:00Z') });
  assert.match(svg, /^<svg class="blank"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /A &lt;b&gt; &amp; title/, 'the title escaped');
  assert.match(svg, /▶ 02:05/);
  assert.doesNotMatch(blankCover({ id: 'abc', title: 'x' }), /▶/, 'no start, no stamp');
});

test('the caption answers the track event: not the first of a visit, not twice for one track, read politely', () => {
  // Just enough of a page for the module: elements that keep their class, text and attributes.
  const made = [];
  const node = () => {
    const kids = new Map();
    const n = {
      classList: { set: new Set(), add(...c) { c.forEach((x) => this.set.add(x)); }, remove(...c) { c.forEach((x) => this.set.delete(x)); }, contains(c) { return this.set.has(c); } },
      attrs: {}, textContent: '', offsetWidth: 1,
      setAttribute(k, v) { this.attrs[k] = v; },
      set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
      querySelector(sel) { if (!kids.has(sel)) kids.set(sel, node()); return kids.get(sel); },
      append(...xs) { made.push(...xs); },
    };
    return n;
  };
  globalThis.document = { createElement: () => node() };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  const player = new EventTarget();
  const root = node();
  const cap = mountCaption(player, { reduced: { matches: true }, root, hold: 60_000 });
  const live = made.find((n) => n.attrs['aria-live']);
  assert.equal(live.attrs['aria-live'], 'polite');
  assert.equal(cap.el.attrs['aria-hidden'], 'true', 'the drawing stays out of the accessibility tree');
  const send = (t) => player.dispatchEvent(new CustomEvent('track', { detail: t }));
  send({ id: 'a', title: 'First', artist: 'X' });
  assert.ok(!cap.el.classList.contains('in'), 'the track you arrive on is not a change');
  send({ id: 'b', title: 'Second', artist: UNKNOWN_ARTIST });
  assert.ok(cap.el.classList.contains('in'), 'a change shows it');
  assert.equal(cap.el.querySelector('.cap-what b').textContent, 'Second', 'with less motion, the title at once');
  assert.equal(cap.el.querySelector('.cap-who').textContent, 'Anonymous transmission');
  assert.equal(live.textContent, 'Now playing: Second, Anonymous transmission');
  assert.match(cap.el.querySelector('.cap-art').innerHTML, /class="blank"/, 'no cover: the drawn one');
  cap.hide();
  assert.ok(cap.el.classList.contains('out'));
  send({ id: 'b', title: 'Second', artist: UNKNOWN_ARTIST });
  assert.ok(!cap.el.classList.contains('in'), 'the same track again is no change');
  delete globalThis.document;
});
