/**
 * Genre backdrops — the mapping and the cross-fade state machine, checked
 * without a browser. `createBackdropSwitcher` only ever touches `classList`
 * and `style.backgroundImage`, so a tiny mock element is enough; the render
 * itself (blur/opacity/transition) is CSS and is checked visually, not here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { backdropUrlForGenre, backdropUrl, GENRE_BACKDROPS, ALL_BACKDROPS, createBackdropSwitcher } from '../public/backdrops.js';

function mockLayer() {
  const classes = new Set();
  return {
    style: { backgroundImage: '' },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
  };
}

test('backdropUrlForGenre only resolves the mapped slugs', () => {
  for (const slug of Object.keys(GENRE_BACKDROPS)) {
    const url = backdropUrlForGenre(slug);
    assert.match(url, /^\/assets\/backdrops\/.+\.webp$/, `${slug} should resolve to a real path`);
  }
  for (const unmapped of ['lofi', 'jazz', 'ambient', 'unsorted', null, undefined, 'made-up-genre']) {
    assert.equal(backdropUrlForGenre(unmapped), null, `${unmapped} should fall back to the sober default`);
  }
});

test('backdropUrl only resolves names that actually exist in the asset set', () => {
  for (const name of ALL_BACKDROPS) {
    assert.match(backdropUrl(name), /^\/assets\/backdrops\/.+\.webp$/);
  }
  assert.equal(backdropUrl('not-a-real-backdrop'), null);
});

test('createBackdropSwitcher: exactly one layer visible at a time, and it holds the new url', () => {
  const a = mockLayer();
  const b = mockLayer();
  const setBackdrop = createBackdropSwitcher(a, b);

  setBackdrop('/assets/backdrops/birdup.webp');
  const oneVisible = () => [a, b].filter((l) => l.classList.contains('visible'));
  assert.equal(oneVisible().length, 1, 'first call must show exactly one layer');
  const [shown] = oneVisible();
  assert.equal(shown.style.backgroundImage, 'url("/assets/backdrops/birdup.webp")');

  setBackdrop('/assets/backdrops/thatbirdominous.webp');
  assert.equal(oneVisible().length, 1, 'a change must still show exactly one layer, not both mid-swap');
  const [shownNow] = oneVisible();
  assert.notEqual(shownNow, shown, 'the swap must alternate which physical layer is front');
  assert.equal(shownNow.style.backgroundImage, 'url("/assets/backdrops/thatbirdominous.webp")');
});

test('createBackdropSwitcher: the same url twice is a no-op, not a re-trigger', () => {
  const a = mockLayer();
  const b = mockLayer();
  let toggles = 0;
  const wrap = (l) => ({ style: l.style, classList: { ...l.classList, toggle: (c, on) => { toggles++; l.classList.toggle(c, on); } } });
  const setBackdrop = createBackdropSwitcher(wrap(a), wrap(b));
  setBackdrop('/assets/backdrops/birdup.webp');
  const after1 = toggles;
  setBackdrop('/assets/backdrops/birdup.webp');
  assert.equal(toggles, after1, 'repeating the current url must not touch classList again');
});

test('createBackdropSwitcher: null clears the visible layer (falls back to the sober default)', () => {
  const a = mockLayer();
  const b = mockLayer();
  const setBackdrop = createBackdropSwitcher(a, b);
  setBackdrop('/assets/backdrops/birdup.webp');
  setBackdrop(null);
  assert.equal(a.classList.contains('visible'), false);
  assert.equal(b.classList.contains('visible'), false);
});
