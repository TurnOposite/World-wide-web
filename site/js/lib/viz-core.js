// GENERATED — copied verbatim from public/viz.js by scripts/site-sync.mjs. Edit the source, not this file.
/**
 * Radio Tower — the visualiser.
 *
 * Ortis's brief, verbatim: "something that can represent physically the sound
 * played live: some waves for quicks, plots going fast for the sound
 * dispersion and a lot of other shenanigans like that" — liminal and very
 * wavy, pastel-shiny and colourful. Two things were already right and must
 * survive: the dark mode, and a sober background that keeps the album cover
 * in focus.
 *
 * So this **frames** the cover rather than competing with it. The canvas fills
 * the art frame and sits *behind* the artwork, which is inset to ~76%; every
 * layer is drawn in the margin band around it, radiating outward from the
 * cover's own silhouette. Nothing is ever drawn over the art.
 *
 * ── The layers, outermost concern first ──────────────────────────────────
 *
 *   bloom     Slow lissajous-drifting radial gradients. Bass swells them.
 *             This is the "liminal" layer: it has no beat, it just breathes.
 *   ring      A squircle hugging the cover's outline, displaced outward by
 *             the spectrum. This is the spectrum-dispersion plot — the shape
 *             of the sound, wrapped around the shape of the record.
 *   dispersal Dots flung outward along the ring's normals, one per band,
 *             fading as they travel. The "plots going fast".
 *   shock     Expanding squircle outlines fired by onset detection. The
 *             "waves for quicks" — these snap, everything else drifts.
 *   ribbon    A hard oscilloscope trace of the raw waveform along the bottom
 *             margin. The one layer that shows literal samples.
 *
 * ── Why two analysers ────────────────────────────────────────────────────
 *
 * A pretty spectrum wants heavy smoothing; onset detection wants none, because
 * smoothing is precisely what erases a transient. One AnalyserNode cannot be
 * both, so there are two, fed in parallel from the same source. They cost a
 * few hundred KB of FFT buffers and no audible latency.
 *
 * ── Why it stays smooth on a phone ───────────────────────────────────────
 *
 * The Pi serves this page but never renders it, so the constraint here is a
 * mid-range phone GPU, not the Pi. Frame cost is measured every frame and the
 * renderer drops through three quality tiers rather than dropping frames —
 * `prefers-reduced-motion` pins it to the calmest tier and disables anything
 * that moves on its own. Everything stops entirely when the tab is hidden.
 *
 * ── Presets and live knobs ────────────────────────────────────────────────
 *
 * `PRESETS` names a look; `frame` is everything above, `bands` adds a large
 * low-band squircle bloom (`_paintLowLayer`) and lets a spark's own size, not
 * just its brightness, track `energy.high`. `Visualizer#knobs` (defaults:
 * `defaultKnobs()`) is the live-tunable surface behind `public/dev-panel.js`
 * (`?viz=dev`) — the render loop reads it fresh every frame, so a slider
 * takes effect on the next frame with nothing to rebuild.
 *
 * ── The stage (full-viewport atmosphere) ─────────────────────────────────
 *
 * `stage` is a third preset. It leaves the small `#viz` canvas exactly as
 * `frame` renders it and additionally paints a second, full-viewport canvas
 * (`#vizStage`, `index.html`) with slow low/mid-driven bloom — the margin
 * around and below the on-air card that used to just be dead black. One
 * `Visualizer` instance owns both canvases: the audio is read once per frame
 * (`_readAudio`) and each canvas gets its own paint call with its own
 * `_resize()`-style geometry, rather than a second instance building a
 * second audio graph — see `docs/DECISIONS.md` for why (the short version:
 * `createMediaElementSource()` can only be called once per `<audio>`, ever).
 *
 * The stage runs at least one quality tier below the small canvas
 * (`stageTierFor`) and drops out entirely — not just to the floor tier —
 * before the small canvas's ring ever would, because the small canvas's
 * floor tier still renders and the stage's "one below the floor" is `null`.
 * It never renders under `prefers-reduced-motion`, keeps its own opacity
 * capped low (`knobs.stageOpacity`), and keeps its blooms out of the
 * rectangle the on-air card and the two panels occupy (`stageBloomPosition`)
 * so it stays atmosphere behind text, not competition with it.
 *
 * No bundler, no framework, no dependency. Plain ES module, served as-is.
 */

/* ══════════════════════════════════════════════════════ pure helpers ══════
 * Everything above the Visualizer class is deliberately free of `window`,
 * `document` and `AudioContext` so `tests/viz.test.js` can import this file
 * in plain Node and check the maths. Keep it that way.
 */

/** Clamp `v` into [lo, hi]. */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Linear interpolation. */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The default hue when a track has no genre (or the API predates
 * `genreAccent`). 210 is `unsorted` in server/lib/genre.js — a cold slate
 * blue that reads as "no opinion" rather than as a wrong opinion.
 */
export const DEFAULT_HUE = 210;

/**
 * The fraction of the art frame the cover itself occupies. Must match
 * `.art-frame img` / `.art-fallback` in styles.css — the margin this leaves
 * is the entire canvas the visualiser gets to work on, so the two numbers
 * moving apart is the one way this design silently breaks.
 */
export const ART_FRACTION = 0.76;

/**
 * The tunables a dev session can move by hand (`?viz=dev`, see
 * `public/dev-panel.js`). These are exactly the numbers that used to be
 * hardcoded inline; every one of them defaults to the value that constant
 * used to be, so a fresh page with no panel open renders pixel-for-pixel
 * identical to before this existed. The render loop reads `this.knobs`
 * fresh every frame — nothing caches a copy — so a slider takes effect on
 * the very next frame with no rebuild.
 */
export function defaultKnobs() {
  return {
    // Per-band gain, applied to bands() output before the attack/release
    // envelope. 1 = unchanged.
    gainLow: 1, gainMid: 1, gainHigh: 1,
    // Shared envelope-follower rates for energy.low/mid/high/overall (dt is
    // seconds; these are the old hardcoded 22 and 5).
    smoothAttack: 22, smoothRelease: 5,
    // OnsetDetector.sensitivity — how far above the rolling mean a flux
    // spike must go to count as a hit.
    onsetSensitivity: 1.55,
    // The bounded hue wobble: driftSpeed scales the two sine frequencies
    // (0.21, 0.077), driftAmp scales their amplitudes (13, 6). 1 = unchanged.
    driftSpeed: 1, driftAmp: 1,
    // How fast the palette eases toward a new track's hue.
    hueEase: 1.6,
    // Per-layer opacity multipliers. 1 = unchanged.
    bloomOpacity: 1, ringOpacity: 1, dispersalOpacity: 1,
    shockOpacity: 1, sparkOpacity: 1, ribbonOpacity: 1,
    // null = adaptive (the normal TIERS walk). 0/1/2 pins a tier for testing
    // how a look reads on the cheapest hardware without needing a phone.
    tierOverride: null,
    // The full-viewport stage (the "stage" preset only). Opacity is a hard
    // cap on legibility grounds — Ortis's brief: "start ~0.35 and expect to
    // come down" — not a stylistic default, so do not raise it without
    // re-checking body text contrast (tests/viz.test.js and
    // scripts/browser-smoke.mjs both do). Scale multiplies bloom radius.
    // stageTierOverride works like tierOverride but for the stage only; it
    // is independent because the stage is meant to be tunable down to
    // "off" (a very low override) without also degrading the small canvas.
    stageOpacity: 0.35, stageScale: 1,
    stageTierOverride: null,
  };
}

/**
 * Build the palette for one genre hue.
 *
 * Pastel-shiny means *mid* lightness and *mid* saturation. The instinct is to
 * push both up, and it is wrong here: every layer composites with `lighter`,
 * so overlapping glows already add toward white. Starting near-white as well
 * means the whole figure clips to a flat neon glare and the hue — the one
 * thing carrying the genre — is the first casualty. These values are chosen
 * to look pastel *after* the additive stack, not before it.
 *
 * The iridescence comes from the sweep: layers sample a *band* of hues either
 * side of the accent instead of all using the same one, so the ring shifts
 * colour along its own length the way an oil slick does.
 *
 * @param {number|null|undefined} hue  degrees, from GENRES[].accent
 * @param {number} drift  slow global rotation in degrees, for shimmer
 */
export function palette(hue, drift = 0) {
  const h = Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : DEFAULT_HUE;
  const at = (offset, s, l, a) => `hsla(${(h + offset + drift + 360) % 360} ${s}% ${l}% / ${a})`;
  return {
    hue: h,
    /** Hue at position `t` (0..1) along an iridescent sweep. */
    sweep: (t, s = 62, l = 66, a = 1) => at(lerp(-38, 38, clamp(t, 0, 1)), s, l, a),
    ring: (a = 0.9) => at(0, 60, 70, a),
    ringGlow: (a = 0.32) => at(18, 70, 54, a),
    bloomA: (a = 0.16) => at(-30, 55, 50, a),
    bloomB: (a = 0.13) => at(28, 50, 46, a),
    shock: (a = 0.5) => at(8, 66, 72, a),
    spark: (a = 0.9) => at(-16, 52, 80, a),
    ribbon: (a = 0.85) => at(12, 64, 68, a),
  };
}

/**
 * Split a frequency-magnitude array into three perceptual bands.
 *
 * The split points are fractions of the bin array, not Hz, and they are
 * deliberately bottom-heavy: an FFT's bins are linear in frequency but
 * hearing is not, so the bottom eighth of the bins covers most of what a
 * listener calls "bass". Values come back as 0..1 means.
 *
 * @param {Uint8Array|number[]} bins
 */
export function bands(bins) {
  const n = bins.length;
  if (!n) return { low: 0, mid: 0, high: 0, overall: 0 };
  const loEnd = Math.max(1, Math.round(n * 0.08));
  const midEnd = Math.max(loEnd + 1, Math.round(n * 0.38));
  let lo = 0, mid = 0, hi = 0, all = 0;
  for (let i = 0; i < n; i++) {
    const v = bins[i] / 255;
    all += v;
    if (i < loEnd) lo += v;
    else if (i < midEnd) mid += v;
    else hi += v;
  }
  return {
    low: lo / loEnd,
    mid: mid / (midEnd - loEnd),
    high: hi / Math.max(1, n - midEnd),
    overall: all / n,
  };
}

/**
 * Onset (transient) detector by spectral flux.
 *
 * Flux is the summed *rise* in each bin between frames — falls are ignored,
 * because a note ending is not an onset. A hit is declared when flux exceeds
 * a rolling mean by `sensitivity`, with a refractory period so one kick drum
 * does not fire three times as its harmonics arrive a frame apart.
 *
 * The rolling mean adapts, which is what makes this work across a library
 * this varied: the same fixed threshold cannot serve both a Brassens guitar
 * and an atmospheric DnB break.
 */
export class OnsetDetector {
  constructor({ sensitivity = 1.55, refractoryMs = 90, memory = 0.92 } = {}) {
    this.sensitivity = sensitivity;
    this.refractoryMs = refractoryMs;
    this.memory = memory;
    this.prev = null;
    this.mean = 0;
    this.lastHitAt = -Infinity;
  }

  /**
   * @param {Uint8Array|number[]} bins  current frequency magnitudes
   * @param {number} nowMs
   * @returns {{hit: boolean, strength: number, flux: number}}
   *   `strength` is 0..1, how far past the threshold this frame went.
   */
  push(bins, nowMs) {
    const n = bins.length;
    if (!n) return { hit: false, strength: 0, flux: 0 };
    let flux = 0;
    if (this.prev) {
      for (let i = 0; i < n; i++) {
        const d = bins[i] - this.prev[i];
        if (d > 0) flux += d;
      }
      flux /= n * 255;
    }
    this.prev = this.prev && this.prev.length === n ? this.prev : new Float32Array(n);
    for (let i = 0; i < n; i++) this.prev[i] = bins[i];

    const threshold = this.mean * this.sensitivity;
    // Adapt *after* comparing, so a hit does not raise the bar it just cleared.
    this.mean = this.mean * this.memory + flux * (1 - this.memory);

    const armed = nowMs - this.lastHitAt >= this.refractoryMs;
    // The 1e-4 floor stops silence (flux ~ 0, mean ~ 0) from firing constantly.
    const hit = armed && flux > threshold && flux > 1e-4;
    if (hit) this.lastHitAt = nowMs;
    return { hit, strength: hit ? clamp((flux - threshold) / (threshold || 1e-4), 0, 1) : 0, flux };
  }
}

/**
 * A point on a squircle (superellipse) of half-width `a`, half-height `b`.
 *
 * This is the shape the whole visualiser is built around, because it is the
 * shape of a rounded album cover. A circle would have been easier and would
 * have looked like every other visualiser; following the artwork's own
 * outline is what makes this read as a *frame* rather than as decoration.
 *
 * `n` controls squareness: 2 is an ellipse, 4 is a squircle, large is a
 * rectangle. 4.2 sits just outside the CSS corner radius.
 */
export function squirclePoint(t, a, b, n = 4.2) {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const e = 2 / n;
  return {
    x: Math.sign(c) * Math.pow(Math.abs(c), e) * a,
    y: Math.sign(s) * Math.pow(Math.abs(s), e) * b,
  };
}

/**
 * Map an angle around the squircle to a spectrum bin index.
 *
 * Two things matter here. The sweep is **mirrored** — bass at the top, rising
 * to treble at the bottom on both sides — so the figure stays symmetrical and
 * reads as an object rather than as a chart.
 *
 * And the index curve is `^1.7`, not linear. An FFT's bins are linear in
 * frequency, but almost all the energy in this library sits in the bottom
 * fifth of them; indexing the ring linearly gives a shape that is mostly
 * dead air with a twitch at the top. An exponent **above** 1 makes the index
 * climb slowly, so most of the ring's arc is spent on the bins that actually
 * move. (This was written as `^0.62` first, which does exactly the opposite —
 * `tests/viz.test.js` caught it.)
 */
/**
 * Magnitude at a bin, averaged with its neighbours.
 *
 * A single FFT bin is a spike, and a ring built from spikes reads as a spiky
 * chart — the opposite of the "very wavy" Ortis asked for. Worse, a narrow
 * tone (a sine, a sustained synth note, a bass line holding one pitch) lights
 * exactly one bin and throws a single needle out of an otherwise flat ring.
 *
 * A small triangular window turns each needle into a lobe. The window widens
 * with bin index because FFT bins are linear in frequency while pitch is
 * logarithmic: one bin is a big interval down low and a tiny one up high, so
 * a fixed window would over-smooth the bass and under-smooth the treble.
 *
 * @param {Uint8Array|number[]} bins
 * @param {number} index
 * @returns {number} 0..1
 */
export function magAt(bins, index) {
  const n = bins.length;
  if (!n) return 0;
  const i = clamp(Math.round(index), 0, n - 1);
  const half = clamp(1 + Math.floor((i / n) * 6), 1, 7);
  let sum = 0;
  let weight = 0;
  for (let k = -half; k <= half; k++) {
    const j = i + k;
    if (j < 0 || j >= n) continue;
    const w = 1 - Math.abs(k) / (half + 1);   // triangular
    sum += (bins[j] / 255) * w;
    weight += w;
  }
  return weight ? sum / weight : 0;
}

export function binForAngle(t, binCount) {
  const TAU = Math.PI * 2;
  const norm = ((t % TAU) + TAU) % TAU;
  // 0..1 up one side, 1..0 down the other.
  const mirrored = norm < Math.PI ? norm / Math.PI : (TAU - norm) / Math.PI;
  return Math.min(binCount - 1, Math.floor(Math.pow(mirrored, 1.7) * binCount));
}

/**
 * Quality tiers. The renderer walks down this list when frames get expensive
 * and back up when they get cheap again — degrading detail, never dropping
 * frames, because a stuttering 30fps reads as broken while a smooth 60fps
 * with fewer particles just reads as a different look.
 */
export const TIERS = [
  // tier 0 — the floor. Always affordable; also what reduced-motion pins to.
  { name: 'calm', segments: 72, sparks: 0, blooms: 2, shocks: 0, dpr: 1, trails: 0.30 },
  // tier 1 — mid-range phones settle here.
  { name: 'lively', segments: 128, sparks: 28, blooms: 4, shocks: 3, dpr: 1.5, trails: 0.17 },
  // tier 2 — desktop and recent phones.
  { name: 'full', segments: 192, sparks: 64, blooms: 6, shocks: 5, dpr: 2, trails: 0.12 },
];

/**
 * Decide whether to change tier, given a smoothed frame cost.
 *
 * The band between the two thresholds is wide on purpose. A single threshold
 * makes the renderer oscillate: it drops a tier, gets fast, immediately
 * climbs back, gets slow, and the visible detail flickers once a second.
 *
 * @param {number} tier current tier index
 * @param {number} avgMs smoothed milliseconds per frame
 * @param {number} sampleCount frames measured since the last change
 */
export function nextTier(tier, avgMs, sampleCount) {
  if (sampleCount < 45) return tier;            // too little evidence
  if (avgMs > 20 && tier > 0) return tier - 1;  // below ~50fps: shed detail
  if (avgMs < 11 && tier < TIERS.length - 1) return tier + 1; // comfortably 60+
  return tier;
}

/**
 * Pick the stage's quality tier from the small canvas's current tier.
 *
 * The stage is 5-8x the pixels of the art frame for a look that is
 * atmosphere, not the point — so it must never be the reason a phone drops
 * frames on the thing Ortis already likes. It always runs at least one tier
 * below the frame (`frameTier - 1`), and when the frame is already at the
 * floor tier (0), that is `-1` — meaning **the stage drops out entirely**,
 * not just to its own floor. That is what makes "the stage drops out before
 * the art-frame ring does" true by construction rather than by a separate
 * check: the ring's floor tier always renders something, the stage's does
 * not.
 *
 * An explicit override (the dev panel's stage-tier buttons) always wins —
 * tuning by ear needs to be able to pin a tier regardless of what the frame
 * is doing — but only if it names a real tier; an out-of-range value falls
 * back to the automatic rule rather than silently doing nothing.
 *
 * @param {number} frameTier the small canvas's current tier index
 * @param {number|null} override knobs.stageTierOverride
 * @returns {number|null} a TIERS index, or null meaning "do not render"
 */
export function stageTierFor(frameTier, override) {
  if (Number.isInteger(override) && override >= 0 && override < TIERS.length) return override;
  const auto = frameTier - 1;
  return auto >= 0 ? auto : null;
}

/**
 * Where to center one stage bloom, and how large it is allowed to grow,
 * given the rectangle the on-air card and the two panels occupy (`kc`, in
 * the stage canvas's own pixel space).
 *
 * Ortis's own description of the problem this exists to fix: "everything
 * either side of the on-air card, and the whole page below it, is dead
 * black." Those are exactly the two zones this picks between — beside the
 * content column (`kc.left`/`kc.right`) for two blooms in three, below all
 * of it (`kc.bottom`) for the third — never inside `kc` itself, which is
 * asserted directly in `tests/viz.test.js` rather than left to look right by
 * eye. Two incommensurate sines drift the center within its zone so the
 * wash breathes instead of sitting static.
 *
 * @param {number} w stage canvas width, px
 * @param {number} h stage canvas height, px
 * @param {{top:number,bottom:number,left:number,right:number}} kc the
 *   keep-clear rectangle, same units as w/h
 * @param {number} phase this bloom's running phase (seconds, scaled by its
 *   own speed — see `_seedStageBlooms`)
 * @param {number} seed this bloom's fixed per-instance offset
 * @param {number} i this bloom's index, 0-based — every third one goes below
 * @returns {{x:number,y:number,maxR:number}}
 */
export function stageBloomPosition(w, h, kc, phase, seed, i) {
  const margin = Math.min(w, h) * 0.03;
  const sideLeftRoom = Math.max(0, kc.left - margin);
  const sideRightRoom = Math.max(0, w - kc.right - margin);
  const belowRoom = Math.max(0, h - kc.bottom - margin);
  const preferSide = i % 3 !== 2 && (sideLeftRoom > 20 || sideRightRoom > 20);

  if (preferSide) {
    const goRight = sideRightRoom >= sideLeftRoom;
    const room = goRight ? sideRightRoom : sideLeftRoom;
    const baseX = goRight ? w - room / 2 : room / 2;
    const x = baseX + Math.sin(phase * 0.5 + seed) * room * 0.28;
    const top = Math.max(0, kc.top);
    const spanH = Math.max(1, kc.bottom - top);
    const y = top + spanH * (0.5 + 0.44 * Math.sin(phase * 0.37 + seed * 1.9));
    return { x, y, maxR: room * 0.9 };
  }
  const y = kc.bottom + margin + belowRoom * (0.15 + 0.5 * (0.5 + 0.5 * Math.sin(phase * 0.4 + seed)));
  const x = w * (0.5 + 0.42 * Math.sin(phase * 0.63 + seed * 1.3));
  return { x, y, maxR: Math.min(belowRoom, h) * 0.85 };
}

/**
 * Named looks. `frame` is the visual that has always shipped — every layer
 * above unchanged — and stays the default. `bands` adds true layer
 * independence: a large slow squircle bloom keyed to `energy.low` (new,
 * `_paintLowLayer`), the same mid-band ring/sweep as `frame` (literally the
 * same method call — nothing about it changes), and sparks whose *size*
 * additionally scales with `energy.high` via `highSizeGain` (the mid/high
 * split Ortis asked for: "bigger for bigger", not just brighter).
 *
 * `highSizeGain: 0` in `frame` is not a placeholder — it is what makes
 * `_fireSparks`' shared formula produce byte-identical output to before this
 * existed (`+ energy.high * 0` is a no-op), which is how "the current visual
 * stays the default and must look identical when the new work is switched
 * off" is actually enforced rather than merely asserted.
 */
export const PRESETS = {
  frame: { label: 'Frame', lowLayer: false, highSizeGain: 0, stage: false },
  bands: { label: 'Bands', lowLayer: true, highSizeGain: 4.2, stage: false },
  // Same small-canvas look as `frame` — the ring Ortis already likes stays
  // untouched — plus the full-viewport stage switched on. See the class-level
  // stage methods below and docs/DECISIONS.md for why it's a flag on top of
  // `frame`'s own numbers rather than a fourth independent look.
  stage: { label: 'Stage', lowLayer: false, highSizeGain: 0, stage: true },
};
export const DEFAULT_PRESET = 'frame';

/* ══════════════════════════════════════════════════════════ renderer ══════ */

const TAU = Math.PI * 2;

/**
 * The visualiser proper.
 *
 * Owns the audio graph, the canvas, and the animation loop. Construct it
 * once, call `attach()` on first play (a user gesture is required for
 * AudioContext), and `setTrack()` whenever the on-air track changes.
 */
export class Visualizer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {boolean} [opts.reducedMotion] force the calm tier
   * @param {string} [opts.preset] a key of PRESETS; falls back to DEFAULT_PRESET
   * @param {object} [opts.knobs] a live-tunable object; falls back to defaultKnobs()
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = null;
    // The full-viewport stage — a second canvas, painted from the same audio
    // read as `canvas` above (see the class doc comment). Optional: a
    // Visualizer with no stageCanvas behaves exactly as it did before the
    // stage existed, which is what every page other than index.html gets for
    // free by simply not passing one.
    this.stageCanvas = opts.stageCanvas || null;
    this.stageCtx = null;
    this.stageAvailable = Boolean(this.stageCanvas);
    this._stageActive = false;
    this.ac = null;
    this.spec = null;      // smoothed analyser, for the pretty layers
    this.wave = null;      // unsmoothed analyser, for transients
    this.specBins = null;
    this.waveBins = null;
    this.fluxBins = null;

    this.available = true;   // false once Web Audio has been ruled out
    this.running = false;
    this.rafId = null;

    this.hue = DEFAULT_HUE;
    this.targetHue = DEFAULT_HUE;
    this.drift = 0;
    this.phase = 0;

    this.onset = new OnsetDetector();
    this.shocks = [];
    this.sparks = [];
    this.blooms = [];
    this.lowSmooth = 0;   // the low layer's own ~300ms-smoothed level

    this.energy = { low: 0, mid: 0, high: 0, overall: 0 };
    this.playing = false;

    // The live tuning surface for the dev panel (`?viz=dev`). A plain data
    // object, not private state — `dev-panel.js` mutates it directly and the
    // render loop reads it fresh every frame, so no wiring is needed beyond
    // sharing the reference. Passed in rather than always constructed fresh
    // so a hot-reloaded Visualizer (public/app.js) can hand its replacement
    // the *same* object and keep whatever a listener was mid-tuning.
    this.knobs = opts.knobs || defaultKnobs();

    this.preset = PRESETS[opts.preset] ? opts.preset : DEFAULT_PRESET;

    this.reducedMotion = Boolean(opts.reducedMotion);
    this.tier = this.reducedMotion ? 0 : 1;   // start mid and let it settle
    this.frameMs = 16;
    this.samples = 0;
    this.lastFrameAt = 0;

    this._seedBlooms();
    this.stageBlooms = [];
    this._seedStageBlooms();
  }

  get quality() {
    const override = this.knobs.tierOverride;
    if (!this.reducedMotion && Number.isInteger(override) && TIERS[override]) return TIERS[override];
    return TIERS[this.reducedMotion ? 0 : this.tier];
  }

  /** @returns {object|null} the stage's tier config, or null if it should not render at all */
  get stageQuality() {
    const t = stageTierFor(this.tier, this.knobs.stageTierOverride);
    return t == null ? null : TIERS[t];
  }

  /** @param {string} name a key of PRESETS; ignored if unknown */
  setPreset(name) {
    if (PRESETS[name]) this.preset = name;
  }

  /**
   * Build the audio graph. Must be called from a user gesture (browsers
   * suspend an AudioContext created outside one, and iOS never resumes it).
   *
   * Returns false if Web Audio is unavailable or the media element cannot be
   * tapped — which happens when the stream is cross-origin without CORS. The
   * caller hides the canvas and audio keeps playing untouched; a missing
   * visualiser must never cost a listener the music.
   *
   * @param {HTMLMediaElement} audioEl
   */
  attach(audioEl) {
    if (this.ac) return true;
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) throw new Error('no AudioContext');
      this.ac = new AC();
      const source = this.ac.createMediaElementSource(audioEl);

      this.spec = this.ac.createAnalyser();
      this.spec.fftSize = 2048;
      this.spec.smoothingTimeConstant = 0.78;   // pretty, laggy

      this.wave = this.ac.createAnalyser();
      this.wave.fftSize = 1024;
      this.wave.smoothingTimeConstant = 0;      // honest, jumpy

      // Both analysers tap the source in parallel; only the source reaches the
      // speakers. An AnalyserNode is pass-through, so routing audio *through*
      // one would work too — but then the graph's latency would depend on
      // which layer we happened to want, which is a strange thing to be true.
      source.connect(this.spec);
      source.connect(this.wave);
      source.connect(this.ac.destination);

      this.specBins = new Uint8Array(this.spec.frequencyBinCount);
      this.fluxBins = new Uint8Array(this.spec.frequencyBinCount);
      this.waveBins = new Uint8Array(this.wave.fftSize);

      this.ctx = this.canvas.getContext('2d', { alpha: true });
      if (!this.ctx) throw new Error('no 2d context');
      if (this.ac.state === 'suspended') this.ac.resume();
      return true;
    } catch {
      this.available = false;
      this.ac = null;
      return false;
    }
  }

  /** Called on every track change: retarget the palette hue. */
  setTrack(track) {
    const h = track?.genreAccent;
    this.targetHue = Number.isFinite(h) ? h : DEFAULT_HUE;
  }

  setPlaying(on) {
    this.playing = Boolean(on);
    if (this.playing && this.ac?.state === 'suspended') this.ac.resume();
  }

  /**
   * Start the loop. Safe to call repeatedly. Works without `attach()` — the
   * idle "carrier" animation runs on a bare 2d context, so the frame is never
   * dead before a listener has tuned in.
   */
  start() {
    if (this.running || !this.available) return;
    if (!this.ctx) {
      this.ctx = this.canvas.getContext('2d', { alpha: true });
      if (!this.ctx) { this.available = false; return; }
    }
    this.running = true;
    this.lastFrameAt = 0;
    const loop = (ts) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);
      this._frame(ts);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /* ---------------------------------------------------------------- frame */

  _frame(ts) {
    const t0 = performance.now();
    const dt = this.lastFrameAt ? clamp((ts - this.lastFrameAt) / 1000, 0, 0.1) : 0.016;
    this.lastFrameAt = ts;

    const size = this._resize();
    if (!size) return;
    const { w, h } = size;

    this._readAudio(ts, dt);
    this._paint(w, h, dt);
    // Same audio read, second canvas — painted inside the same measured
    // frame on purpose, so a heavy stage feeds back into the tier walk below
    // exactly like any other cost would, and the frame's own tier can shed
    // detail (which in turn sheds the stage's tier, see stageTierFor) if the
    // combined cost is too high for the device it's running on.
    this._paintStageIfActive(dt);

    // Measure and adapt. `performance.now()` twice per frame is cheap next to
    // the drawing it is measuring.
    const cost = performance.now() - t0;
    this.frameMs = this.frameMs * 0.9 + cost * 0.1;
    this.samples++;
    if (!this.reducedMotion) {
      const t = nextTier(this.tier, this.frameMs, this.samples);
      if (t !== this.tier) { this.tier = t; this.samples = 0; this._seedBlooms(); }
    }
  }

  /**
   * Size the backing store to the element, honouring the tier's DPR cap.
   * Assigning to canvas.width clears it, so this only touches the canvas when
   * the size has actually changed — otherwise the trail buffer is wiped every
   * frame and there are no trails.
   */
  _resize() {
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (!cssW || !cssH) return null;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, this.quality.dpr);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return { w, h, dpr };
  }

  /* ----------------------------------------------------------------- stage */

  /**
   * Decide whether the stage should be painted this frame and, if so, do it.
   * Handles every reason it might not be: no stage canvas was passed to the
   * constructor, the current preset doesn't ask for it, reduced motion,
   * a failed 2d context, or the adaptive tier dropping it out entirely
   * (`stageQuality` returning null). Whenever it goes from painting to not,
   * it clears the canvas once rather than leaving the last frame's bloom
   * stranded on screen.
   */
  _paintStageIfActive(dt) {
    const wants = !this.reducedMotion && this.stageCanvas && this.stageAvailable && PRESETS[this.preset]?.stage;
    if (!wants) {
      if (this._stageActive) this._clearStage();
      this._stageActive = false;
      return;
    }
    if (!this.stageCtx) {
      try {
        this.stageCtx = this.stageCanvas.getContext('2d', { alpha: true });
      } catch {
        this.stageCtx = null;
      }
      if (!this.stageCtx) { this.stageAvailable = false; return; }
    }
    const sq = this.stageQuality;
    if (!sq) {
      if (this._stageActive) this._clearStage();
      this._stageActive = false;
      return;
    }
    const size = this._resizeStage(sq.dpr);
    if (!size) return;
    this._stageActive = true;
    const pal = palette(this.hue, this.drift);
    this._paintStageWash(size.w, size.h, size.dpr, pal, dt, sq);
  }

  _clearStage() {
    if (this.stageCtx && this.stageCanvas) {
      this.stageCtx.clearRect(0, 0, this.stageCanvas.width, this.stageCanvas.height);
    }
  }

  /**
   * Size the stage's backing store, honouring its own (lower) tier's DPR cap.
   */
  _resizeStage(dprCap) {
    const c = this.stageCanvas;
    const cssW = c.clientWidth;
    const cssH = c.clientHeight;
    if (!cssW || !cssH) return null;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, dprCap);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return { w, h, dpr };
  }

  /**
   * The rectangle (in stage-canvas pixels) the on-air card and the two
   * panels occupy, measured fresh from the live DOM every call — no cache.
   *
   * `#vizStage` is `position:fixed`, so its own pixels never move when the
   * page scrolls, but `getBoundingClientRect()` is always viewport-relative
   * and therefore *does* move with scroll. Caching this across scroll events
   * (an earlier version of this method cached it until the canvas resized)
   * left the keep-clear rectangle pinned to wherever the card happened to be
   * at the moment it was first measured — on a page taller than the
   * viewport, that is scroll position zero, where the on-air card and two
   * panels alone can already exceed the viewport height, so the stale
   * rectangle covered the *entire* canvas and nothing ever rendered again at
   * any scroll position. Caught live during this feature's own verification
   * pass (see docs/DECISIONS.md) — a scrolled screenshot showed no bloom
   * anywhere despite plenty of genuinely empty page below the panels.
   * `getBoundingClientRect()` on three elements, once per stage-active
   * frame, is cheap: it forces a layout only if one is already pending, and
   * the stage already runs at a reduced tier.
   *
   * Returns null if the page doesn't have those elements (i.e. this is not
   * index.html) — the caller must not paint in that case.
   */
  _stageKeepClear(dpr) {
    if (typeof document === 'undefined') return null;
    const mainEl = document.querySelector('main');
    const onair = document.querySelector('.onair');
    if (!mainEl || !onair) return null;
    const m = mainEl.getBoundingClientRect();
    const panelsEl = document.querySelector('.panels');
    const bottomEl = panelsEl || onair;
    return {
      top: onair.getBoundingClientRect().top * dpr,
      bottom: bottomEl.getBoundingClientRect().bottom * dpr,
      left: m.left * dpr,
      right: m.right * dpr,
    };
  }

  /** The stage's own paint: slow low/mid bloom, kept out of `_stageKeepClear`. */
  _paintStageWash(w, h, dpr, pal, dt, sq) {
    const ctx = this.stageCtx;
    const kc = this._stageKeepClear(dpr);
    // Fresh canvas every frame (no trail accumulation — see docs/DECISIONS.md
    // for why the frame canvas's translucent-fill trail trick would slowly
    // opaque this one to black instead of fading, since this canvas has no
    // solid background under it the way .art-frame does).
    ctx.clearRect(0, 0, w, h);
    if (!kc) return;

    const opacity = clamp(this.knobs.stageOpacity, 0, 1);
    if (opacity <= 0) return;
    const scale = clamp(this.knobs.stageScale, 0.3, 2.5);
    const swell = 0.7 + this.energy.low * 1.2;
    const count = Math.min(sq.blooms, this.stageBlooms.length);

    for (let i = 0; i < count; i++) {
      const b = this.stageBlooms[i];
      if (!this.reducedMotion) b.phase += dt * b.speed;
      const { x, y, maxR } = stageBloomPosition(w, h, kc, b.phase, b.seed, i);
      const r = Math.min(maxR, Math.min(w, h) * b.radius * swell * scale);
      if (r < 4) continue;
      const level = i % 2 ? this.energy.low : this.energy.mid;
      const tint = i % 2 ? pal.bloomA : pal.bloomB;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      // Base alphas here are deliberately much higher than _paintBloom's
      // (0.085) or _paintLowLayer's (0.05-0.09) equivalents on the small
      // canvas — those both sit under a translucent-fill trail that
      // reinforces itself frame after frame (see the trail comment above),
      // so a single frame is only ever part of what a viewer sees stacked up.
      // This canvas clears every frame, so one pass has to *be* the visible
      // result; without this compensation `knobs.stageOpacity`'s own default
      // of 0.35 rendered at an average alpha of well under 1/255 across a
      // real screenshot — technically painting, invisibly. Caught live
      // during this feature's own verification pass (see docs/DECISIONS.md).
      g.addColorStop(0, tint((0.34 + level * 0.30) * opacity));
      g.addColorStop(0.6, tint((0.14 + level * 0.12) * opacity));
      g.addColorStop(1, 'hsla(0 0% 0% / 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  _readAudio(ts, dt) {
    const k = this.knobs;
    // Ease the hue rather than cutting to it. A track change is already a
    // visible event (new artwork); a colour cut on top of it is one event too
    // many, and the ease is what makes the palette feel like weather.
    const delta = ((this.targetHue - this.hue + 540) % 360) - 180;
    this.hue += delta * clamp(dt * k.hueEase, 0, 1);
    // A *bounded* wobble, not a rotation. This was `(drift + dt * 4.5) % 360`
    // first, which is a 4.5°/s rotation of the entire palette: after a minute
    // on air, barber beats (285, violet) had drifted through pink into orange
    // and the genre cue — the whole reason genreAccent is plumbed through the
    // API — was gone. Shimmer must never outvote identity.
    this.phase = (this.phase + dt) % 1e6;
    this.drift =
      Math.sin(this.phase * 0.21 * k.driftSpeed) * 13 * k.driftAmp +
      Math.sin(this.phase * 0.077 * k.driftSpeed) * 6 * k.driftAmp;

    if (!this.spec || !this.playing) {
      // Idle: let everything sink toward a slow breathing carrier so the
      // frame stays alive between tune-ins without pretending to hear sound.
      const breathe = 0.11 + 0.05 * Math.sin(ts / 1400);
      this.energy.low = lerp(this.energy.low, breathe, dt * 1.5);
      this.energy.mid = lerp(this.energy.mid, breathe * 0.7, dt * 1.5);
      this.energy.high = lerp(this.energy.high, breathe * 0.35, dt * 1.5);
      this.energy.overall = lerp(this.energy.overall, breathe * 0.6, dt * 1.5);
      this._followLow(dt);
      return;
    }

    this.spec.getByteFrequencyData(this.specBins);
    this.wave.getByteTimeDomainData(this.waveBins);
    this.wave.getByteFrequencyData(this.fluxBins);

    const b = bands(this.specBins);
    // Attack fast, release slow — the standard envelope-follower asymmetry.
    // Symmetric smoothing makes bass look like it is fading in, which is
    // exactly wrong for percussion.
    const follow = (cur, next) => lerp(cur, next, next > cur ? clamp(dt * k.smoothAttack, 0, 1) : clamp(dt * k.smoothRelease, 0, 1));
    this.energy.low = follow(this.energy.low, b.low * k.gainLow);
    this.energy.mid = follow(this.energy.mid, b.mid * k.gainMid);
    this.energy.high = follow(this.energy.high, b.high * k.gainHigh);
    this.energy.overall = follow(this.energy.overall, b.overall);
    this._followLow(dt);

    // Onsets run off the *unsmoothed* analyser — this is the whole reason
    // there are two of them. Sensitivity is read from the knobs every frame
    // so the dev panel's slider takes effect immediately.
    this.onset.sensitivity = k.onsetSensitivity;
    const { hit, strength } = this.onset.push(this.fluxBins, ts);
    if (hit && this.quality.shocks) this._fireShock(strength);
    if (hit) this._fireSparks(strength);
  }

  /**
   * The low layer's own envelope, independent of the fast attack/release
   * used everywhere else. A ~300ms time constant so a swelling squircle
   * reads as a *swell* — the slow, weighty end of "large, slow, low-
   * frequency" — rather than twitching with every kick like the ring does.
   */
  _followLow(dt) {
    const timeConstant = 0.3;
    const step = 1 - Math.exp(-dt / timeConstant);
    this.lowSmooth = lerp(this.lowSmooth, this.energy.low, step);
  }

  /* ---------------------------------------------------------------- paint */

  _paint(w, h, dt) {
    const ctx = this.ctx;
    const q = this.quality;
    const pal = palette(this.hue, this.reducedMotion ? 0 : this.drift);

    // Trails: instead of clearing, veil the previous frame in the frame's own
    // background colour. Old pixels decay toward the background over several
    // frames, which is what makes fast motion leave a wake. The alpha is the
    // tier's `trails` value — lower means longer, more expensive-looking tails.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(14, 18, 22, ${q.trails})`;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    // The artwork occupies ART_FRACTION of the frame (see styles.css). Every
    // layer is placed relative to its half-size so nothing is ever drawn over
    // the cover — the constraint that makes this a frame and not a wallpaper.
    const artHalf = (Math.min(w, h) * ART_FRACTION) / 2;
    const gap = Math.min(w, h) * 0.022;
    const room = Math.min(w, h) / 2 - artHalf - gap;   // usable margin band

    // The bloom is the *background*, and Ortis kept the sober background on
    // the list of things already right. So it composites normally: additive
    // blending accumulates frame on frame, and a big soft gradient added 60
    // times a second saturates the whole frame to a flat glare within
    // seconds. Painting it source-over keeps it a wash behind everything.
    this._paintBloom(ctx, w, h, pal, dt);
    // The low layer only exists in presets that ask for it (`bands`) — a
    // second background wash, still source-over for the same reason, so
    // `frame` renders through unchanged code with this call simply skipped.
    if (PRESETS[this.preset].lowLayer) this._paintLowLayer(ctx, cx, cy, artHalf, gap, room, pal);

    // The *foreground* layers do composite additively — they are thin, they
    // overlap rarely, and where they cross, brightening instead of occluding
    // is exactly the sheen we want.
    ctx.globalCompositeOperation = 'lighter';
    this._paintRing(ctx, cx, cy, artHalf, gap, room, pal, dt);
    if (q.shocks) this._paintShocks(ctx, cx, cy, artHalf, gap, pal, dt);
    if (q.sparks) this._paintSparks(ctx, pal, dt, w, h);
    this._paintRibbon(ctx, w, h, artHalf, cy, pal);

    ctx.globalCompositeOperation = 'source-over';
  }

  /** Layer 1 — slow drifting bloom. The liminal one. */
  _paintBloom(ctx, w, h, pal, dt) {
    const q = this.quality;
    if (!q.blooms) return;
    const o = this.knobs.bloomOpacity;
    const swell = 0.7 + this.energy.low * 1.5;
    for (let i = 0; i < q.blooms; i++) {
      const b = this.blooms[i];
      if (!b) continue;
      if (!this.reducedMotion) b.phase += dt * b.speed;
      // Lissajous drift: two incommensurate sines, so the path never repeats
      // exactly and the field never looks like it is on a loop.
      const x = w * (0.5 + 0.42 * Math.sin(b.phase * 0.7 + b.seed));
      const y = h * (0.5 + 0.42 * Math.sin(b.phase * 0.53 + b.seed * 1.7));
      const r = Math.min(w, h) * b.radius * swell;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      // Low alphas on purpose. The bloom's job is to tint the dark, not to
      // light it — the moment it becomes legible as shapes it is competing
      // with the album art instead of sitting behind it.
      g.addColorStop(0, i % 2 ? pal.bloomA(0.085 * o) : pal.bloomB(0.075 * o));
      g.addColorStop(0.55, i % 2 ? pal.bloomA(0.03 * o) : pal.bloomB(0.025 * o));
      g.addColorStop(1, 'hsla(0 0% 0% / 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  /**
   * Layer 0 (the `bands` preset only) — a large, slow squircle bloom keyed
   * to `energy.low`, smoothed over ~300ms by `_followLow`. The low band's
   * own object: "a bassline moves something large and slow" rather than
   * only tinting the drifting blooms above.
   *
   * A radial gradient is always circular, so the softness comes from the
   * gradient while the *shape* comes from filling a squircle path with it —
   * the same trick `_paintRing` uses to stay a squircle rather than a circle.
   * Hollow at the centre on purpose: that space belongs to the album art,
   * one frame band further out than `_paintRing`'s own base radius, so a
   * loud bass hit swells *around* the cover rather than glowing into it.
   */
  _paintLowLayer(ctx, cx, cy, artHalf, gap, room, pal) {
    const o = this.knobs.bloomOpacity;
    const level = clamp(this.lowSmooth, 0, 1);
    const base = artHalf + gap;
    const reach = Math.max(2, room);
    // Amplitude maps to size, not just brightness — bigger for bigger.
    const r = base + Math.pow(level, 1.1) * reach * 0.95;

    const g = ctx.createRadialGradient(cx, cy, base * 0.55, cx, cy, r);
    g.addColorStop(0, 'hsla(0 0% 0% / 0)');
    g.addColorStop(0.7, pal.bloomA((0.05 + level * 0.09) * o));
    g.addColorStop(1, 'hsla(0 0% 0% / 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * TAU;
      const p = squirclePoint(t, r, r);
      if (i === 0) ctx.moveTo(cx + p.x, cy + p.y);
      else ctx.lineTo(cx + p.x, cy + p.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** Layer 2 + 3 — the spectrum ring hugging the cover, and its dispersal dots. */
  _paintRing(ctx, cx, cy, artHalf, gap, room, pal, dt) {
    const q = this.quality;
    const ringO = this.knobs.ringOpacity;
    const dispersalO = this.knobs.dispersalOpacity;
    const bins = this.specBins;
    const n = q.segments;
    const base = artHalf + gap;
    // 0.92, not 1: the ring must never quite touch the frame edge, or a loud
    // passage clips into a flat line against the border and stops reading as
    // a curve at all.
    const reach = Math.max(2, room) * 0.92;

    // Per-segment temporal smoothing. Reallocated when the tier changes the
    // segment count — the array is state, and stale state of the wrong length
    // would silently index undefined.
    if (!this.ringSmooth || this.ringSmooth.length !== n) this.ringSmooth = new Float32Array(n);

    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU - Math.PI / 2;   // start at the top
      const raw = bins ? magAt(bins, binForAngle(t + Math.PI / 2, bins.length)) : this.energy.overall;
      // Attack fast, release slow, per segment. This is what turns a spectrum
      // into something *wavy*: without it the ring is a twitching spike chart,
      // with it the shape flows and settles like liquid.
      const prev = this.ringSmooth[i];
      const eased = raw > prev
        ? lerp(prev, raw, clamp(dt * 18, 0, 1))
        : lerp(prev, raw, clamp(dt * 4.5, 0, 1));
      this.ringSmooth[i] = eased;
      // 1.15 rather than 1.35: a gentler curve keeps quiet bands visible
      // instead of collapsing them onto the base radius.
      const out = base + Math.pow(eased, 1.15) * reach;
      const p = squirclePoint(t, out, out);
      pts[i] = { x: cx + p.x, y: cy + p.y, mag: eased, t };
    }

    // The ring itself, drawn as short iridescent arcs rather than one stroke:
    // a single stroke can only have one colour, and the whole point is that
    // the hue travels along the curve.
    ctx.lineWidth = Math.max(1.2, Math.min(cx, cy) * 0.012);
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      // Lightness stays in the 50s. Pushed higher, the additive core clips to
      // pure white and the hue — the only thing telling barber beats from
      // atmospheric DnB — disappears exactly where the eye is looking.
      ctx.strokeStyle = pal.sweep(i / n, 64, 58, (0.34 + a.mag * 0.36) * ringO);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // A soft outer echo of the same curve — this is what makes it glow rather
    // than merely being a line.
    ctx.strokeStyle = pal.ringGlow((0.07 + this.energy.overall * 0.13) * ringO);
    ctx.lineWidth = Math.max(3, Math.min(cx, cy) * 0.05);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Dispersal: dots pushed further out than the ring where that band is
    // loud, so a spike in one frequency visibly *throws* material outward.
    if (q.sparks) {
      const step = Math.max(1, Math.round(n / 48));
      for (let i = 0; i < n; i += step) {
        const p = pts[i];
        if (p.mag < 0.30) continue;
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const push = p.mag * reach * 0.55;
        ctx.fillStyle = pal.sweep(i / n, 58, 78, p.mag * 0.55 * dispersalO);
        ctx.beginPath();
        ctx.arc(p.x + (dx / len) * push, p.y + (dy / len) * push, Math.max(0.8, p.mag * 2.4), 0, TAU);
        ctx.fill();
      }
    }
  }

  /** Layer 4 — expanding squircles on transients. The "waves for quicks". */
  _paintShocks(ctx, cx, cy, artHalf, gap, pal, dt) {
    const maxR = Math.max(cx, cy) * 1.5;
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.r += dt * s.speed;
      s.life -= dt * 1.35;
      if (s.life <= 0 || s.r > maxR) { this.shocks.splice(i, 1); continue; }
      const radius = artHalf + gap + s.r;
      ctx.strokeStyle = pal.shock(clamp(s.life, 0, 1) * 0.42 * s.strength * this.knobs.shockOpacity);
      ctx.lineWidth = Math.max(1, 3.2 * s.life);
      ctx.beginPath();
      for (let k = 0; k <= 64; k++) {
        const t = (k / 64) * TAU;
        const p = squirclePoint(t, radius, radius);
        if (k === 0) ctx.moveTo(cx + p.x, cy + p.y);
        else ctx.lineTo(cx + p.x, cy + p.y);
      }
      ctx.stroke();
    }
  }

  /** Layer 4b — sparks flung on transients, drifting and fading. */
  _paintSparks(ctx, pal, dt, w, h) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 8 * dt;              // a touch of drag-as-gravity, so they arc
      s.life -= dt * s.decay;
      if (s.life <= 0 || s.x < -20 || s.x > w + 20 || s.y < -20 || s.y > h + 20) {
        this.sparks.splice(i, 1);
        continue;
      }
      ctx.fillStyle = pal.spark(clamp(s.life, 0, 1) * 0.85 * this.knobs.sparkOpacity);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (0.4 + s.life * 0.6), 0, TAU);
      ctx.fill();
    }
  }

  /** Layer 5 — the oscilloscope ribbon along the bottom margin. */
  _paintRibbon(ctx, w, h, artHalf, cy, pal) {
    const wave = this.waveBins;
    const bandTop = cy + artHalf + Math.min(w, h) * 0.028;
    const bandH = h - bandTop;
    if (bandH < 6) return;
    const midY = bandTop + bandH / 2;
    const amp = bandH * 0.42;
    const n = this.quality.segments;

    ctx.lineWidth = Math.max(1, h * 0.003);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const frac = i / n;
      let v;
      if (wave) {
        // 128 is silence in a byte time-domain buffer.
        v = (wave[Math.floor(frac * (wave.length - 1))] - 128) / 128;
      } else {
        v = Math.sin(frac * 9 + this.drift * 0.06) * this.energy.overall * 0.7;
      }
      const x = frac * w;
      const y = midY - v * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Fade the trace out at both ends. Drawn at flat alpha it terminates in
    // two hard pixels against the frame border and reads as a rule someone
    // drew, rather than as a signal passing through.
    const a = (0.30 + this.energy.overall * 0.3) * this.knobs.ribbonOpacity;
    const fade = ctx.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, pal.ribbon(0));
    fade.addColorStop(0.18, pal.ribbon(a));
    fade.addColorStop(0.82, pal.ribbon(a));
    fade.addColorStop(1, pal.ribbon(0));
    ctx.strokeStyle = fade;
    ctx.stroke();
  }

  /* ------------------------------------------------------------- emitters */

  _seedBlooms() {
    const want = TIERS[TIERS.length - 1].blooms;
    while (this.blooms.length < want) {
      const i = this.blooms.length;
      this.blooms.push({
        phase: i * 1.7,
        seed: i * 2.399,                       // golden-ish, so they spread out
        speed: 0.11 + (i % 3) * 0.045,
        radius: 0.20 + (i % 4) * 0.055,
      });
    }
  }

  /**
   * Up to one bloom per tier's `blooms` budget at the stage's own (lower)
   * tier — never more than TIERS[TIERS.length - 2] needs, since the stage
   * never runs at the top tier by construction (`stageTierFor`). Slower and
   * larger than the frame's own blooms: this is background weather behind a
   * page of text, not something with a beat.
   */
  _seedStageBlooms() {
    const want = TIERS[TIERS.length - 2].blooms;
    for (let i = 0; i < want; i++) {
      this.stageBlooms.push({
        phase: i * 2.1,
        seed: i * 3.117,
        speed: 0.05 + (i % 3) * 0.02,
        radius: 0.9 + (i % 3) * 0.25,
      });
    }
  }

  _fireShock(strength) {
    const q = this.quality;
    if (this.shocks.length >= q.shocks) this.shocks.shift();
    this.shocks.push({
      r: 0,
      speed: 90 + strength * 260,
      life: 1,
      strength: 0.45 + strength * 0.55,
    });
  }

  /**
   * The high layer, mechanically: sparks are already "small, fast, many" and
   * already `OnsetDetector`-gated (only ever called from a hit in
   * `_readAudio`), in both presets. What `bands` adds is `highSizeGain`
   * (`PRESETS[this.preset].highSizeGain`) — 0 in `frame`, so
   * `+ energy.high * 0` is an exact no-op and this method's output for the
   * default preset is unchanged; a positive value in `bands` makes a spark's
   * *radius*, not just its brightness, track how loud the high band actually
   * is on top of the onset that triggered it — "bigger for bigger".
   */
  _fireSparks(strength) {
    const q = this.quality;
    if (!q.sparks) return;
    const budget = q.sparks - this.sparks.length;
    if (budget <= 0) return;
    const count = Math.min(budget, Math.round(3 + strength * 9));
    const { width: w, height: h } = this.canvas;
    const cx = w / 2;
    const cy = h / 2;
    const artHalf = (Math.min(w, h) * ART_FRACTION) / 2;
    const highSizeGain = PRESETS[this.preset].highSizeGain;
    for (let i = 0; i < count; i++) {
      const t = Math.random() * TAU;
      const p = squirclePoint(t, artHalf, artHalf);
      const dx = p.x || Math.cos(t);
      const dy = p.y || Math.sin(t);
      const len = Math.hypot(dx, dy) || 1;
      const speed = 40 + strength * 190 + Math.random() * 60;
      this.sparks.push({
        x: cx + p.x,
        y: cy + p.y,
        vx: (dx / len) * speed,
        vy: (dy / len) * speed,
        r: 0.8 + Math.random() * 1.8 + this.energy.high * highSizeGain,
        life: 1,
        decay: 0.9 + Math.random() * 0.9,
      });
    }
  }
}

export default Visualizer;
