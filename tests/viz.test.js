/**
 * The visualiser's maths, checked without a browser.
 *
 * `public/viz.js` keeps every pure helper above the `Visualizer` class and
 * free of `window`, `document` and `AudioContext` specifically so this file
 * can import it in plain Node. The rendering itself is proved by the browser
 * smoke test; what is proved here is the part that is easy to get subtly
 * wrong and impossible to eyeball: band splits, onset thresholds, the
 * hysteresis that stops the quality tier oscillating, and the one cross-file
 * invariant this design rests on (the artwork inset).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  palette, bands, OnsetDetector, squirclePoint, binForAngle, magAt,
  nextTier, TIERS, clamp, lerp, DEFAULT_HUE, ART_FRACTION,
  defaultKnobs, PRESETS, DEFAULT_PRESET,
  stageTierFor, stageBloomPosition,
} from '../public/viz.js';
import { GENRE_BY_SLUG } from '../server/lib/genre.js';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

/* ------------------------------------------------------------- palette --- */

test('palette falls back to the neutral hue rather than producing NaN colours', () => {
  for (const bad of [null, undefined, NaN, 'purple', {}]) {
    const p = palette(bad);
    assert.equal(p.hue, DEFAULT_HUE, `${String(bad)} should fall back`);
    assert.ok(!/NaN/.test(p.ring()), `${String(bad)} produced "${p.ring()}"`);
  }
});

test('palette normalises hues onto the wheel instead of emitting out-of-range CSS', () => {
  assert.equal(palette(-75).hue, 285);
  assert.equal(palette(645).hue, 285);
  for (const h of [-720, -1, 0, 359, 360, 1080]) {
    assert.ok(palette(h).hue >= 0 && palette(h).hue < 360, `hue ${h} escaped the wheel`);
  }
});

test('the genres Ortis named do not paint the same picture', () => {
  // The whole reason genreAccent is plumbed through the API: barber beats and
  // atmospheric DnB must be visibly different rooms.
  const barber = GENRE_BY_SLUG.get('barber-beats').accent;
  const dnb = GENRE_BY_SLUG.get('dnb-jungle').accent;
  assert.notEqual(barber, dnb);
  assert.notEqual(palette(barber).ring(), palette(dnb).ring());

  // And every genre in the table must yield a usable colour.
  for (const [slug, g] of GENRE_BY_SLUG) {
    const c = palette(g.accent).ring();
    assert.match(c, /^hsla\(/, `${slug} produced "${c}"`);
    assert.ok(!/NaN|undefined/.test(c), `${slug} produced "${c}"`);
  }
});

test('the iridescent sweep actually changes hue along its length', () => {
  const p = palette(285);
  assert.notEqual(p.sweep(0), p.sweep(1));
});

/* --------------------------------------------------------------- bands --- */

test('bands splits bottom-heavy, so bass is not diluted across the whole FFT', () => {
  const n = 1024;
  const bassOnly = new Uint8Array(n);
  for (let i = 0; i < Math.round(n * 0.05); i++) bassOnly[i] = 255;
  const b = bands(bassOnly);
  assert.ok(b.low > 0.5, `low was ${b.low}`);
  assert.ok(b.high < 0.01, `high was ${b.high}`);

  const trebleOnly = new Uint8Array(n);
  for (let i = Math.round(n * 0.6); i < n; i++) trebleOnly[i] = 255;
  const t = bands(trebleOnly);
  assert.ok(t.high > t.low, `high ${t.high} should beat low ${t.low}`);
  assert.equal(t.low, 0);
});

test('bands is safe on an empty buffer and bounded on a full one', () => {
  assert.deepEqual(bands(new Uint8Array(0)), { low: 0, mid: 0, high: 0, overall: 0 });
  const full = new Uint8Array(512).fill(255);
  const b = bands(full);
  for (const k of ['low', 'mid', 'high', 'overall']) {
    assert.ok(b[k] >= 0 && b[k] <= 1, `${k} = ${b[k]} left 0..1`);
  }
  assert.ok(Math.abs(b.overall - 1) < 1e-9);
});

/* --------------------------------------------------------------- onset --- */

const silence = (n) => new Uint8Array(n);
const loud = (n) => new Uint8Array(n).fill(200);

test('silence never fires an onset, however long it lasts', () => {
  const d = new OnsetDetector();
  let hits = 0;
  for (let i = 0; i < 300; i++) {
    if (d.push(silence(256), i * 16).hit) hits++;
  }
  assert.equal(hits, 0, 'a silent stream produced onsets');
});

test('a transient fires, and the refractory period stops it firing three times', () => {
  const d = new OnsetDetector({ refractoryMs: 90 });
  const n = 256;

  d.push(silence(n), 0);
  const first = d.push(loud(n), 0);
  assert.ok(first.hit, 'the rise from silence to full should be an onset');
  assert.ok(first.strength > 0 && first.strength <= 1, `strength ${first.strength}`);

  // Same rise again, 10ms later: inside the refractory window, must not fire.
  d.push(silence(n), 10);
  assert.equal(d.push(loud(n), 10).hit, false, 'fired inside the refractory window');

  // Past the window, it arms again.
  d.push(silence(n), 400);
  assert.ok(d.push(loud(n), 400).hit, 'never re-armed after the refractory window');
});

test('a decaying note is not an onset — only rises count', () => {
  const d = new OnsetDetector();
  const n = 256;
  d.push(loud(n), 0);
  // Fall away gradually. Not one frame of this is an onset.
  for (let i = 1; i <= 20; i++) {
    const frame = new Uint8Array(n).fill(Math.max(0, 200 - i * 10));
    assert.equal(d.push(frame, i * 100).hit, false, `frame ${i} fired on a decay`);
  }
});

test('the threshold adapts, so a loud passage stops firing on every frame', () => {
  const d = new OnsetDetector();
  const n = 256;
  let hits = 0;
  // A busy, constantly-rising-and-falling signal: a naive fixed threshold
  // fires on every other frame here. The rolling mean should throttle it.
  for (let i = 0; i < 200; i++) {
    const frame = new Uint8Array(n).fill(i % 2 ? 220 : 40);
    if (d.push(frame, i * 16).hit) hits++;
  }
  assert.ok(hits < 60, `fired ${hits}/200 frames — the mean is not adapting`);
  assert.ok(hits > 0, 'adapted so hard it went deaf');
});

/* ------------------------------------------------------------- geometry --- */

test('squirclePoint stays inside its bounding box for every angle', () => {
  for (let i = 0; i < 720; i++) {
    const p = squirclePoint((i / 720) * Math.PI * 2, 100, 60);
    assert.ok(Math.abs(p.x) <= 100.0001, `x=${p.x}`);
    assert.ok(Math.abs(p.y) <= 60.0001, `y=${p.y}`);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test('n=2 is an ellipse, and a high n pushes toward the corners', () => {
  // With n=2 and a=b the squircle is exactly a circle.
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const p = squirclePoint(t, 50, 50, 2);
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - 50) < 1e-9, `radius ${Math.hypot(p.x, p.y)}`);
  }
  // At 45°, a squarer exponent must reach further out than a circle does.
  const diag = Math.PI / 4;
  const circle = squirclePoint(diag, 50, 50, 2);
  const squircle = squirclePoint(diag, 50, 50, 4.2);
  assert.ok(Math.hypot(squircle.x, squircle.y) > Math.hypot(circle.x, circle.y));
});

test('magAt turns a single-bin needle into a lobe, without inventing energy', () => {
  const n = 512;
  const needle = new Uint8Array(n);
  needle[100] = 255;   // one pure tone, one lit bin

  // The neighbours must pick up some of it — that is the whole point, and it
  // is what stops a sustained sine throwing a spike out of a flat ring.
  assert.ok(magAt(needle, 99) > 0, 'the neighbouring bin stayed dark');
  assert.ok(magAt(needle, 101) > 0, 'the neighbouring bin stayed dark');
  // But it must decay away, not smear across the spectrum.
  assert.ok(magAt(needle, 100) > magAt(needle, 101), 'the peak did not stay the peak');
  assert.equal(magAt(needle, 400), 0, 'energy leaked to an unrelated bin');
  // And it must not amplify: a lone bin averaged with silence is quieter.
  assert.ok(magAt(needle, 100) < 1, 'smoothing invented energy');
});

test('magAt is bounded, safe at the edges, and exact on a flat spectrum', () => {
  const flat = new Uint8Array(256).fill(255);
  // A flat spectrum must survive smoothing untouched, including at the edges
  // where the window runs off the end of the array.
  for (const i of [0, 1, 128, 254, 255]) {
    assert.ok(Math.abs(magAt(flat, i) - 1) < 1e-9, `bin ${i} -> ${magAt(flat, i)}`);
  }
  // Out-of-range and nonsense indices must clamp, not throw or return NaN.
  for (const i of [-50, 999, 0.5, NaN]) {
    const v = magAt(flat, i);
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `index ${i} -> ${v}`);
  }
  assert.equal(magAt(new Uint8Array(0), 0), 0);
});

test('binForAngle is mirrored, in range, and weighted toward the low bins', () => {
  const N = 512;
  for (let i = 0; i < 360; i++) {
    const idx = binForAngle((i / 360) * Math.PI * 2, N);
    assert.ok(Number.isInteger(idx) && idx >= 0 && idx < N, `angle ${i} -> ${idx}`);
  }
  // Mirror symmetry: the left and right halves of the ring must agree, or the
  // figure reads as a lopsided chart instead of an object.
  for (const frac of [0.1, 0.25, 0.4, 0.5]) {
    const a = binForAngle(frac * Math.PI * 2, N);
    const b = binForAngle((1 - frac) * Math.PI * 2, N);
    assert.equal(a, b, `mirror broke at ${frac}`);
  }
  // The ^0.62 curve exists to spend angle on the bins that carry the energy:
  // the first half of the sweep must cover well under half the bins.
  assert.ok(binForAngle(Math.PI / 2, N) < N * 0.42, 'the sweep is effectively linear');
});

/* ---------------------------------------------------------------- tiers --- */

test('tier changes need evidence, and clamp at both ends', () => {
  assert.equal(nextTier(2, 40, 5), 2, 'changed tier on 5 frames of evidence');
  assert.equal(nextTier(0, 40, 500), 0, 'dropped below the floor tier');
  assert.equal(nextTier(TIERS.length - 1, 2, 500), TIERS.length - 1, 'climbed past the top tier');
  assert.equal(nextTier(2, 40, 500), 1, 'a slow frame should shed a tier');
  assert.equal(nextTier(0, 2, 500), 1, 'a fast frame should regain a tier');
});

test('the tier thresholds have a dead band, so quality cannot oscillate', () => {
  // A frame cost between the two thresholds must hold still at every tier.
  // Without this gap the renderer drops a tier, gets fast, climbs back, gets
  // slow, and the visible detail flickers about once a second.
  for (let tier = 0; tier < TIERS.length; tier++) {
    for (const ms of [11.5, 14, 17, 19.5]) {
      assert.equal(nextTier(tier, ms, 500), tier, `tier ${tier} moved at ${ms}ms`);
    }
  }
});

test('every tier is internally sane and they are ordered cheapest-first', () => {
  for (const t of TIERS) {
    assert.ok(t.segments >= 32, `${t.name} has too few segments`);
    assert.ok(t.dpr >= 1 && t.dpr <= 2, `${t.name} dpr ${t.dpr}`);
    assert.ok(t.trails > 0 && t.trails <= 1, `${t.name} trails ${t.trails}`);
  }
  for (let i = 1; i < TIERS.length; i++) {
    assert.ok(TIERS[i].segments >= TIERS[i - 1].segments, 'segments not ordered');
    assert.ok(TIERS[i].sparks >= TIERS[i - 1].sparks, 'sparks not ordered');
    assert.ok(TIERS[i].dpr >= TIERS[i - 1].dpr, 'dpr not ordered');
    // Longer trails cost more, so the alpha must *fall* as tiers get richer.
    assert.ok(TIERS[i].trails <= TIERS[i - 1].trails, 'trail decay not ordered');
  }
  // The floor tier is what reduced-motion pins to: it must not move on its own.
  assert.equal(TIERS[0].sparks, 0);
  assert.equal(TIERS[0].shocks, 0);
});

/* ---------------------------------------------------------------- stage --- */

test('stageTierFor stays at least one tier below the frame, and drops out at the floor', () => {
  // The floor tier (0) is what the small canvas's ring always renders at
  // minimum — so "one below the floor" (-1) must mean "do not render",
  // which is the concrete mechanism behind "the stage drops out before the
  // art-frame ring does".
  assert.equal(stageTierFor(0, null), null, 'stage must drop out when the frame is at the floor tier');
  assert.equal(stageTierFor(1, null), 0);
  assert.equal(stageTierFor(2, null), 1);
  // Never equal to or above the frame's own tier, at any frame tier.
  for (let t = 0; t < TIERS.length; t++) {
    const s = stageTierFor(t, null);
    if (s != null) assert.ok(s < t, `stage tier ${s} was not below frame tier ${t}`);
  }
});

test('stageTierFor: an explicit override wins over the automatic rule', () => {
  assert.equal(stageTierFor(0, 2), 2, 'an override should be able to run the stage even at the frame floor');
  assert.equal(stageTierFor(2, 0), 0, 'an override should be able to pin the stage below its automatic tier');
});

test('stageTierFor: an out-of-range override falls back to the automatic rule rather than doing nothing', () => {
  assert.equal(stageTierFor(1, 99), stageTierFor(1, null));
  assert.equal(stageTierFor(1, -5), stageTierFor(1, null));
  assert.equal(stageTierFor(1, 1.5), stageTierFor(1, null));
});

test('stageBloomPosition never centers a bloom inside the keep-clear rectangle', () => {
  const w = 1400, h = 2000;
  // A plausible on-air-card-and-panels rectangle roughly centred in a page
  // taller than the viewport, with real side margins on a wide screen.
  const kc = { top: 80, bottom: 640, left: 160, right: 1240 };
  for (let i = 0; i < 12; i++) {
    const { x, y, maxR } = stageBloomPosition(w, h, kc, i * 0.7, i * 1.3, i);
    assert.ok(maxR >= 0, `bloom ${i} got a negative radius budget`);
    const inside = x > kc.left && x < kc.right && y > kc.top && y < kc.bottom;
    assert.ok(!inside, `bloom ${i} centered at (${x.toFixed(0)},${y.toFixed(0)}) inside the keep-clear rect`);
  }
});

test('stageBloomPosition: every third bloom goes below the content, the rest go beside it', () => {
  const w = 1400, h = 2000;
  const kc = { top: 80, bottom: 640, left: 160, right: 1240 };
  for (let i = 0; i < 9; i++) {
    const { y } = stageBloomPosition(w, h, kc, 0, 0, i);
    if (i % 3 === 2) assert.ok(y >= kc.bottom, `bloom ${i} should be below the content, y=${y}`);
    else assert.ok(y <= kc.bottom, `bloom ${i} should be beside the content (y <= kc.bottom), y=${y}`);
  }
});

test('stageBloomPosition degrades gracefully with no side room (e.g. a narrow phone viewport)', () => {
  // On a phone, main fills the full width — there is no side gutter at all.
  const w = 390, h = 1400;
  const kc = { top: 60, bottom: 520, left: 0, right: 390 };
  for (let i = 0; i < 6; i++) {
    const { x, y, maxR } = stageBloomPosition(w, h, kc, i, i * 0.9, i);
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(maxR), `bloom ${i} produced a non-finite value`);
    assert.ok(maxR >= 0, `bloom ${i} got a negative radius budget with no side room`);
  }
});

/* ------------------------------------------------------------ invariant --- */

test('ART_FRACTION matches --art-fraction in styles.css', async () => {
  // The one cross-file invariant this design rests on. viz.js places its ring
  // from ART_FRACTION rather than measuring the <img>, so if the CSS inset and
  // this constant drift apart the visualiser silently starts drawing *over*
  // the album art — the exact thing Ortis asked it never to do. Nothing else
  // in the suite would notice.
  const css = await fs.readFile(path.join(REPO_ROOT, 'public/styles.css'), 'utf8');
  const m = css.match(/--art-fraction:\s*([\d.]+)%/);
  assert.ok(m, '--art-fraction not found in styles.css');
  assert.equal(
    Number(m[1]) / 100,
    ART_FRACTION,
    `styles.css says ${m[1]}% but viz.js ART_FRACTION is ${ART_FRACTION}`,
  );
});

/* --------------------------------------------------------------- basics --- */

test('clamp and lerp behave', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.equal(lerp(10, 20, 0), 10);
  assert.equal(lerp(10, 20, 1), 20);
});

/* -------------------------------------------------------- knobs & presets --- */

test('defaultKnobs() reproduces the historical hardcoded constants and returns a fresh object every call', () => {
  const a = defaultKnobs();
  const b = defaultKnobs();
  assert.notEqual(a, b, 'two callers mutating their own knobs must not share state');
  // The numbers a slider defaults to must equal what used to be a literal in
  // the render loop, or "identical when the panel is untouched" is false.
  assert.equal(a.gainLow, 1);
  assert.equal(a.gainMid, 1);
  assert.equal(a.gainHigh, 1);
  assert.equal(a.smoothAttack, 22);
  assert.equal(a.smoothRelease, 5);
  assert.equal(a.onsetSensitivity, 1.55);
  assert.equal(a.driftSpeed, 1);
  assert.equal(a.driftAmp, 1);
  assert.equal(a.hueEase, 1.6);
  for (const k of ['bloomOpacity', 'ringOpacity', 'dispersalOpacity', 'shockOpacity', 'sparkOpacity', 'ribbonOpacity']) {
    assert.equal(a[k], 1, `${k} should default to 1 (no change)`);
  }
  assert.equal(a.tierOverride, null);
  // The stage's own knobs: capped low on legibility grounds (Ortis's brief:
  // "start ~0.35 and expect to come down"), scale 1 = unchanged, and no tier
  // pinned by default so stageTierFor's automatic rule governs it.
  assert.equal(a.stageOpacity, 0.35);
  assert.equal(a.stageScale, 1);
  assert.equal(a.stageTierOverride, null);
});

test('PRESETS: frame is a genuine no-op, bands actually differs, stage keeps the ring but turns the full-page canvas on', () => {
  assert.ok(PRESETS[DEFAULT_PRESET], 'DEFAULT_PRESET must name a real preset');
  assert.equal(DEFAULT_PRESET, 'frame');
  // This is the concrete guarantee behind "must look identical when the new
  // work is switched off": _fireSparks adds `energy.high * highSizeGain` to a
  // spark's radius, so frame's gain must be exactly 0 for any energy.high.
  assert.equal(PRESETS.frame.highSizeGain, 0);
  assert.equal(PRESETS.frame.lowLayer, false);
  assert.equal(PRESETS.frame.stage, false);
  // bands must actually be a different look, or the preset switch is inert.
  assert.notEqual(PRESETS.bands.highSizeGain, 0);
  assert.equal(PRESETS.bands.lowLayer, true);
  assert.equal(PRESETS.bands.stage, false);
  // stage renders the small canvas exactly like frame (the ring Ortis already
  // likes is never touched by this feature) and is the only preset with the
  // full-page canvas switched on.
  assert.equal(PRESETS.stage.highSizeGain, PRESETS.frame.highSizeGain);
  assert.equal(PRESETS.stage.lowLayer, PRESETS.frame.lowLayer);
  assert.equal(PRESETS.stage.stage, true);
  assert.equal(Object.keys(PRESETS).filter((k) => PRESETS[k].stage).length, 1, 'exactly one preset should turn the stage on');
  for (const name of Object.keys(PRESETS)) {
    assert.equal(typeof PRESETS[name].label, 'string', `${name} needs a display label`);
  }
});
