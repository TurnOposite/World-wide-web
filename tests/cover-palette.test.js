import test from 'node:test';
import assert from 'node:assert/strict';
import { coverLook, rgbToHsl } from '../public/cover-palette.js';

/** A w×h RGBA image from a function (x, y) → [r, g, b]. */
function image(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a = 255] = paint(x, y);
    data.set([r, g, b, a], (y * w + x) * 4);
  }
  return data;
}

const gap = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

test('rgbToHsl knows the primaries', () => {
  assert.equal(rgbToHsl(255, 0, 0).h, 0);
  assert.equal(rgbToHsl(0, 255, 0).h, 120);
  assert.equal(rgbToHsl(0, 0, 255).h, 240);
  assert.equal(rgbToHsl(128, 128, 128).s, 0);
});

test('a red cover is red, saturated, mid-light', () => {
  const look = coverLook(image(48, 48, () => [220, 30, 40]), 48, 48);
  assert.ok(gap(look.hue, 356) < 6, `hue ${look.hue}`);
  assert.ok(look.sat > 0.8);
  assert.equal(look.mono, false);
  assert.equal(look.colors.length, 1);
});

test('a black-and-white cover is mono, low saturation, and its lightness is measured', () => {
  const look = coverLook(image(48, 48, (x) => (x < 24 ? [10, 10, 10] : [240, 240, 240])), 48, 48);
  assert.equal(look.mono, true);
  assert.ok(look.sat < 0.05);
  assert.ok(Math.abs(look.light - 0.49) < 0.05, `light ${look.light}`);
});

test('a blue sky with an orange sun: blue leads, orange answers', () => {
  const look = coverLook(image(48, 48, (x, y) => ((x - 30) ** 2 + (y - 14) ** 2 < 64 ? [245, 140, 30] : [40, 110, 210])), 48, 48);
  assert.ok(gap(look.hue, 215) < 12, `hue ${look.hue}`);
  assert.ok(gap(look.accent, 30) < 12, `accent ${look.accent}`);
});

test('transparent pixels are ignored; an empty image has no look', () => {
  const look = coverLook(image(8, 8, (x) => (x < 4 ? [0, 200, 0, 0] : [0, 0, 220])), 8, 8);
  assert.ok(gap(look.hue, 240) < 6);
  assert.equal(coverLook(new Uint8ClampedArray(0), 0, 0), null);
  assert.equal(coverLook(image(4, 4, () => [0, 0, 0, 0]), 4, 4), null);
});

test('the same pixels always give the same look', () => {
  const px = image(32, 32, (x, y) => [(x * 7) % 256, (y * 11) % 256, (x * y) % 256]);
  assert.deepEqual(coverLook(px, 32, 32), coverLook(px, 32, 32));
});

test('the palette: no cover changes nothing; a cover leans every role toward its second colour', async () => {
  const { palette, lookParams, NEUTRAL_LOOK } = await import('../public/viz.js');
  const plain = palette(285, 4);
  const neutral = palette(285, 4, NEUTRAL_LOOK);
  for (const k of ['ring', 'ringGlow', 'bloomA', 'bloomB', 'shock', 'spark', 'ribbon']) assert.equal(neutral[k](), plain[k]());
  assert.equal(neutral.sweep(0.3), plain.sweep(0.3));
  assert.deepEqual(lookParams(null), NEUTRAL_LOOK);

  const sunset = lookParams({ hue: 215, accent: 30, sat: 0.7, light: 0.3, mono: false });
  assert.equal(sunset.span, 175);
  assert.ok(sunset.lightShift < 0, 'a dark cover sinks the stage');
  const lit = palette(215, 0, sunset);
  const hueOf = (s) => Number(/hsla\(([\d.]+)/.exec(s)[1]);
  assert.equal(hueOf(lit.ring()), 215, 'the ring keeps the main hue');
  assert.equal(hueOf(lit.bloomB()), (215 + 28 + 175) % 360, 'the second bloom takes the answering hue');

  const grey = lookParams({ hue: 220, accent: 250, sat: 0.02, light: 0.5, mono: true });
  const sat = (s) => Number(/hsla\([\d.]+ ([\d.]+)%/.exec(s)[1]);
  assert.ok(sat(palette(220, 0, grey).ring()) < 15, 'a black-and-white cover gives a nearly grey stage');
});
