/**
 * The call map (site/js/viz/callmap.js) — the maths behind the Canopy look.
 *
 * What has to hold for it to be the birdsong-style map Ortis asked for:
 * sounds that are alike land together, sounds that differ get different
 * colours, a call is born on an onset (not on every frame), the cloud stays
 * inside its cube, and the map forgets — old calls fade out, an idle page
 * shows the imaginary canopy, and the first real frame clears it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CallMap, BANDS, DIM, bandEdges, foldBands, callFeatures, fitRadius, CALL_COLORS, TYPES } from '../site/js/viz/callmap.js';

const SR = 48000;
const FFT = 2048;
const BINS = FFT / 2;

/** Deterministic noise, so a failure reproduces. */
function rng(seed = 7) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** A byte spectrum with energy around `hz` (width in octaves), at `level` 0..1. */
function spectrum(hz, octaves, level, floor = 0.15, rnd = Math.random) {
  const out = new Uint8Array(BINS);
  for (let i = 1; i < BINS; i++) {
    const f = (i * SR) / FFT;
    const d = Math.log2(f / hz) / octaves;
    const v = floor + level * Math.exp(-d * d * 2) + (rnd() - 0.5) * 0.03;
    out[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  return out;
}

/** Drive the map with a beat: a low kick and a high hat alternating, with silence-ish gaps between. */
function playBeat(map, seconds, rnd) {
  let t = 1000;
  const quiet = spectrum(1000, 3, 0.0, 0.04, rnd);
  const frameMs = 1000 / 60;
  const step = 250; // a hit every 250 ms
  for (let ms = 0; ms < seconds * 1000; ms += frameMs) {
    const phase = ms % step;
    const which = Math.floor(ms / step) % 2;
    const bins = phase < 120
      ? (which ? spectrum(9000, 0.6, 0.7 * (1 - phase / 200), 0.12, rnd) : spectrum(70, 0.8, 0.8 * (1 - phase / 200), 0.12, rnd))
      : quiet;
    map.pushFrame(bins, t + ms, SR, FFT);
  }
  return t + seconds * 1000;
}

test('bands cover 60 Hz – 14 kHz, every band at least one bin, in order', () => {
  const e = bandEdges(BINS, SR, FFT);
  assert.equal(e.length, BANDS);
  for (const [a, b] of e) assert.ok(b > a && a >= 0 && b <= BINS);
  for (let i = 1; i < e.length; i++) assert.ok(e[i][0] >= e[i - 1][0]);
  const lowHz = (e[0][0] * SR) / FFT, highHz = (e[BANDS - 1][1] * SR) / FFT;
  assert.ok(lowHz <= 60 && highHz >= 13500, `${lowHz}–${highHz} Hz`);
  const f = foldBands(new Uint8Array(BINS).fill(255), e);
  assert.ok(f.every((v) => Math.abs(v - 1) < 1e-6));
});

test('a call is shape, loudness and decay — and loudness alone does not change its shape', () => {
  const e = bandEdges(BINS, SR, FFT);
  const soft = foldBands(spectrum(3000, 1, 0.3, 0.1, rng(1)), e);
  const loud = foldBands(spectrum(3000, 1, 0.3, 0.3, rng(1)), e);
  const a = callFeatures([soft]);
  const b = callFeatures([loud]);
  assert.equal(a.length, DIM);
  let shape = 0;
  for (let i = 0; i < BANDS; i++) shape += (a[i] - b[i]) ** 2;
  assert.ok(shape < 0.01, `shape moved by ${shape}`);
  assert.ok(b[BANDS] > a[BANDS], 'the louder call is louder');
  const falling = callFeatures([loud, loud, soft, soft]);
  assert.ok(falling[BANDS + 1] > 0, 'a call that dies away has positive decay');
});

test('a beat becomes calls on its onsets, not one per frame', () => {
  const map = new CallMap({ random: rng(2) });
  playBeat(map, 6, rng(3));
  // 6 s at one hit per 250 ms is 24 hits; allow a little either way for the first frames.
  assert.ok(map.calls.length >= 18 && map.calls.length <= 30, `${map.calls.length} calls`);
});

test('a kick and a hat are told apart: two kinds of sound, two colours, two places', () => {
  const map = new CallMap({ random: rng(4) });
  playBeat(map, 12, rng(5));
  map.refit();
  const calls = map.calls;
  // The beat alternates, so consecutive calls are the two different sounds.
  const pairsDiffer = calls.slice(1).filter((c, i) => c.type !== calls[i].type).length / (calls.length - 1);
  assert.ok(map.clusterCount() >= 2, `${map.clusterCount()} types`);
  assert.ok(pairsDiffer > 0.8, `${Math.round(pairsDiffer * 100)}% of neighbours differ in type`);
  // Same-type calls sit closer together on screen than different-type ones.
  const pos = map.layout();
  let same = 0, ns = 0, diff = 0, nd = 0;
  for (let i = 0; i < calls.length; i++) for (let j = i + 1; j < calls.length; j++) {
    const d = Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1], pos[i][2] - pos[j][2]);
    if (calls[i].type === calls[j].type) { same += d; ns++; } else { diff += d; nd++; }
  }
  assert.ok(same / ns < (diff / nd) * 0.6, `same ${(same / ns).toFixed(2)} vs different ${(diff / nd).toFixed(2)}`);
});

test('consecutive calls are joined as a phrase', () => {
  const map = new CallMap({ random: rng(6) });
  playBeat(map, 3, rng(7));
  const linked = map.calls.filter((c) => c.prev).length;
  assert.ok(linked >= map.calls.length - 2, `${linked}/${map.calls.length}`);
});

test('the cloud stays inside its cube and the cube inside the screen', () => {
  const map = new CallMap({ random: rng(8) });
  playBeat(map, 8, rng(9));
  for (const p of map.layout()) for (const v of p) assert.ok(v >= -1 && v <= 1 && Number.isFinite(v));
  for (const [w, h] of [[1440, 800], [390, 700], [800, 1200]]) {
    const R = fitRadius(w, h);
    assert.ok(R > 40 && R * Math.SQRT2 < w / 2, `${w}×${h}: R ${R.toFixed(0)}`);
  }
});

test('no more types than colours, and the map forgets', () => {
  const map = new CallMap({ random: rng(10), life: 5000 });
  const end = playBeat(map, 12, rng(11));
  assert.ok(map.clusterCount() <= TYPES && TYPES <= CALL_COLORS.length);
  const quiet = new Uint8Array(BINS).fill(10);
  for (let t = end; t < end + 6000; t += 16) map.pushFrame(quiet, t, SR, FFT);
  assert.equal(map.calls.length, 0, 'after a lifetime of silence nothing is left');
});

test('an idle page shows the imaginary canopy, and the first real frame clears it', () => {
  const map = new CallMap({ random: rng(12) });
  for (let t = 0; t < 15000; t += 16) map.idle(t, 0.016);
  assert.ok(map.demo && map.calls.length > 8, `${map.calls.length} imaginary calls`);
  assert.ok(map.clusterCount() >= 3, 'the imaginary species come out as several types');
  map.pushFrame(spectrum(200, 1, 0.5, 0.1, rng(13)), 16000, SR, FFT);
  assert.equal(map.demo, false);
  assert.ok(map.calls.every((c) => !c.demo), 'no imaginary bird survives real music');
});

test('the axes stay orthonormal however long it runs', () => {
  const map = new CallMap({ random: rng(14) });
  playBeat(map, 20, rng(15));
  const W = map.W;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) {
    let d = 0;
    for (let j = 0; j < DIM; j++) d += W[i][j] * W[k][j];
    assert.ok(Math.abs(d - (i === k ? 1 : 0)) < 1e-3, `W${i}·W${k} = ${d}`);
  }
});
