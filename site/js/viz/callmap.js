/**
 * The call map — the station's sound laid out the way bioacousticians lay out
 * birdsong.
 *
 * Ortis asked (2026-10-12) for "the visualisation of bird songs": the plots
 * where every call a bird makes becomes a dot in a 3D space, similar calls
 * land together, each kind of call gets its own colour, and the cloud turns
 * slowly so you can see its depth. The method behind those figures
 * (Sainburg, Thielk & Gentner 2020, "Finding, visualizing, and quantifying
 * latent structure across diverse animal vocal repertoires"; Sethi et al.
 * 2020 for whole-forest soundscapes) is: cut the recording into calls, turn
 * each call into a small spectrum, project those into a few dimensions,
 * cluster, colour by cluster, and draw consecutive calls joined by a line.
 *
 * This does the same thing live, in the listener's browser, over whatever is
 * on air — so it is synced to the music by construction: it hears exactly
 * what the <audio> element plays.
 *
 *   1. Each animation frame, the raw analyser is folded into 24 log-spaced
 *      bands (60 Hz – 14 kHz): a one-column spectrogram.
 *   2. Spectral flux on those bands finds onsets; the ~110 ms after an onset
 *      is one "call". Its features are the *shape* of its mean spectrum
 *      (loudness removed, so a quiet hi-hat and a loud one match), plus its
 *      loudness and how fast it decays.
 *   3. An online PCA — subspace iteration on a forgetting covariance — finds
 *      the three directions the music is varying along *now*, and keeps
 *      re-finding them as tracks change. UMAP would draw tighter islands but
 *      cannot run incrementally at 60 fps; pulling each dot a third of the way
 *      toward its type's centre gets most of the look honestly.
 *   4. k-means names the calls: up to seven types, re-fitted every ten calls
 *      to the calls still alive, warm-started so a type keeps its colour. As
 *      a track changes, old types drift or fold away and new ones appear.
 *   5. Calls live ~42 s and fade; the line through the last second and a
 *      half is the live sound itself moving through the space.
 *
 * Everything above is plain maths on arrays — no DOM — so it is unit-tested
 * in Node (tests/site-callmap.test.js). `paintCallMap()` at the bottom is the
 * only part that draws.
 */

export const BANDS = 24;
export const DIM = BANDS + 2;              // band shape + loudness + decay
export const TYPES = 7;
/** One colour per call type: spaced round the wheel, all from the site's own swatches. */
export const CALL_COLORS = ['#34d399', '#fbbf24', '#38bdf8', '#f472b6', '#a78bfa', '#a3e635', '#fb923c'];

const LIFE_MS = 42000;
const MAX_CALLS = 480;
const CALL_MS = 110;
const REFRACTORY_MS = 70;
const TRAIL_MS = 1500;
const SEQUENCE_GAP_MS = 2500;   // a call this soon after the last one continues its phrase
const PULL = 0.34;              // how far each dot is drawn toward its type's centre
const REFIT_EVERY = 10;         // calls between k-means refits

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* --------------------------------------------------------------- bands -- */

/** Bin ranges for `n` log-spaced bands between `lo` and `hi` Hz. Every band gets at least one bin. */
export function bandEdges(binCount, sampleRate, fftSize, n = BANDS, lo = 60, hi = 14000) {
  const top = Math.min(hi, (sampleRate / 2) * 0.98);
  const edges = [];
  for (let b = 0; b < n; b++) {
    const f0 = lo * Math.pow(top / lo, b / n);
    const f1 = lo * Math.pow(top / lo, (b + 1) / n);
    const i0 = clamp(Math.floor((f0 * fftSize) / sampleRate), 0, binCount - 1);
    const i1 = clamp(Math.ceil((f1 * fftSize) / sampleRate), i0 + 1, binCount);
    edges.push([i0, i1]);
  }
  return edges;
}

/** Byte magnitudes (0–255, already in dB) → band means in 0..1. */
export function foldBands(bins, edges, out = new Float32Array(edges.length)) {
  for (let b = 0; b < edges.length; b++) {
    const [i0, i1] = edges[b];
    let s = 0;
    for (let i = i0; i < i1; i++) s += bins[i];
    out[b] = s / ((i1 - i0) * 255);
  }
  return out;
}

/**
 * A call's features. The weights put the three parts on one footing: shape
 * deviations of ±0.3 and a loudness of 0.5 both land near ±1.
 */
export function callFeatures(frames) {
  const n = frames.length;
  const x = new Float32Array(DIM);
  if (!n) return x;
  const m = new Float32Array(BANDS);
  for (const f of frames) for (let b = 0; b < BANDS; b++) m[b] += f[b] / n;
  let mean = 0;
  for (let b = 0; b < BANDS; b++) mean += m[b];
  mean /= BANDS;
  for (let b = 0; b < BANDS; b++) x[b] = (m[b] - mean) * 3;
  x[BANDS] = mean * 2;
  // Decay: loudness of the first half against the second. Drums fall, pads hold.
  if (n > 1) {
    const half = n >> 1;
    let a = 0, z = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let b = 0; b < BANDS; b++) s += frames[i][b];
      if (i < half) a += s / (BANDS * half); else z += s / (BANDS * (n - half));
    }
    x[BANDS + 1] = clamp((a - z) * 6, -1.5, 1.5);
  }
  return x;
}

function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}

/** Starting axes, before any music: spectral tilt, a mid-range bump, loudness + decay. */
function initialAxes() {
  const W = [new Float32Array(DIM), new Float32Array(DIM), new Float32Array(DIM)];
  for (let b = 0; b < BANDS; b++) {
    const u = b / (BANDS - 1);
    W[0][b] = 1 - 2 * u;                       // low ↔ high
    W[1][b] = Math.cos(u * Math.PI * 2);       // edges ↔ middle
  }
  W[2][BANDS] = 1;
  W[2][BANDS + 1] = 0.7;
  orthonormalise(W);
  return W;
}

function orthonormalise(W) {
  for (let i = 0; i < W.length; i++) {
    for (let k = 0; k < i; k++) {
      let d = 0;
      for (let j = 0; j < DIM; j++) d += W[i][j] * W[k][j];
      for (let j = 0; j < DIM; j++) W[i][j] -= d * W[k][j];
    }
    let n = 0;
    for (let j = 0; j < DIM; j++) n += W[i][j] * W[i][j];
    n = Math.sqrt(n) || 1;
    for (let j = 0; j < DIM; j++) W[i][j] /= n;
  }
  return W;
}

/* ------------------------------------------------- the idle "canopy" -- */

// Before anyone tunes in there is no sound to map, but the room is never dead
// (stage.js). Five imaginary species call instead, so the empty map already
// shows what it is for. The first real frame clears them.
const SPECIES = [
  { peak: 19, width: 1.6, loud: 0.42, decay: 0.5 },   // a high, thin whistle
  { peak: 4, width: 2.4, loud: 0.55, decay: 0.15 },   // a low hoot
  { peak: 13, width: 4, loud: 0.38, decay: 0.3 },     // a mid-range warble
  { peak: 9, width: 30, loud: 0.5, decay: 0.85 },     // a broadband knock
  { peak: 22, width: 2.5, loud: 0.3, decay: 0.05 },   // an insect drone, very high
];

function speciesFrames(sp, rnd) {
  // No two calls of one species are the same: pitch, width, loudness and
  // decay each wander a little, so a species reads as a small cloud.
  const peak = sp.peak + (rnd() - 0.5) * 2.6;
  const width = sp.width * (0.75 + rnd() * 0.5);
  const loud = sp.loud * (0.65 + rnd() * 0.7);
  const decay = clamp(sp.decay + (rnd() - 0.5) * 0.3, 0, 1);
  const frames = [];
  for (let k = 0; k < 6; k++) {
    const f = new Float32Array(BANDS);
    const env = 1 - (decay * k) / 6;
    for (let b = 0; b < BANDS; b++) {
      const g = Math.exp(-((b - peak) ** 2) / (2 * width * width));
      f[b] = clamp((0.12 + loud * g) * env + (rnd() - 0.5) * 0.06, 0, 1);
    }
    frames.push(f);
  }
  return frames;
}

/* ------------------------------------------------------------- the map -- */

export class CallMap {
  constructor({ types = TYPES, life = LIFE_MS, random = Math.random } = {}) {
    this.types = types;
    this.life = life;
    this.random = random;
    this.reset();
  }

  reset() {
    this.calls = [];
    this.centroids = [];            // { c, n, lastHit, id }
    this.mean = new Float32Array(DIM);
    this.cov = new Float32Array(DIM * DIM);
    for (let i = 0; i < DIM; i++) this.cov[i * DIM + i] = 0.01;
    this.W = initialAxes();
    this.sigma = [0.5, 0.5, 0.5];
    this.seen = 0;
    this.prevBands = null;
    this.fluxMean = 0;
    this.lastOnset = -Infinity;
    this.open = null;
    this.trail = [];
    this.lastCall = null;
    this.demo = false;
    this._edges = null;
    this._edgeKey = '';
    this._bands = new Float32Array(BANDS);
    this._nextIdle = 0;
  }

  clusterCount() { return this.centroids.length; }

  /** How many live calls each type has right now, indexed by type id. */
  typeCounts() {
    const out = new Array(this.types).fill(0);
    for (const c of this.calls) out[c.type]++;
    return out;
  }

  /**
   * Feed one analyser frame. Returns the call that this frame completed, if any.
   * @param {Uint8Array} bins  getByteFrequencyData() of an unsmoothed analyser
   */
  pushFrame(bins, nowMs, sampleRate, fftSize) {
    if (this.demo) this.reset();
    const key = `${bins.length}:${sampleRate}:${fftSize}`;
    if (key !== this._edgeKey) { this._edges = bandEdges(bins.length, sampleRate, fftSize); this._edgeKey = key; }
    const f = foldBands(bins, this._edges, this._bands);
    return this._pushBands(f, nowMs);
  }

  _pushBands(f, nowMs) {
    let loud = 0, flux = 0;
    for (let b = 0; b < BANDS; b++) {
      loud += f[b];
      if (this.prevBands) { const d = f[b] - this.prevBands[b]; if (d > 0) flux += d; }
    }
    loud /= BANDS;
    flux /= BANDS;
    const threshold = this.fluxMean * 1.45 + 0.004;
    // Adapt after comparing, so a hit does not raise the bar it just cleared.
    this.fluxMean = this.fluxMean * 0.9 + flux * 0.1;
    const onset = this.prevBands && flux > threshold && loud > 0.06 && nowMs - this.lastOnset >= REFRACTORY_MS;
    this.prevBands = Float32Array.from(f);

    let made = null;
    if (onset) {
      if (this.open) made = this._close(nowMs);
      this.open = { frames: [Float32Array.from(f)], start: nowMs };
      this.lastOnset = nowMs;
    } else if (this.open) {
      this.open.frames.push(Float32Array.from(f));
      if (nowMs - this.open.start >= CALL_MS) made = this._close(nowMs);
    }

    // The live cursor: this very frame, placed in the same space. One frame
    // is noisy; a short running average (~70 ms) keeps the line legible.
    const xf = callFeatures([f]);
    const last = this.trail.length ? this.trail[this.trail.length - 1].x : xf;
    for (let i = 0; i < DIM; i++) xf[i] = last[i] + (xf[i] - last[i]) * 0.22;
    this.trail.push({ x: xf, t: nowMs });
    while (this.trail.length && nowMs - this.trail[0].t > TRAIL_MS) this.trail.shift();
    this._prune(nowMs);
    return made;
  }

  _close(nowMs) {
    const { frames, start } = this.open;
    this.open = null;
    return this.addCall(callFeatures(frames), start ?? nowMs);
  }

  /** Add one call's feature vector. Public so the idle canopy and the tests can drive it. */
  addCall(x, nowMs) {
    this.seen++;
    const a = Math.max(0.01, 1 / this.seen);
    const d = new Float32Array(DIM);
    for (let i = 0; i < DIM; i++) { this.mean[i] += (x[i] - this.mean[i]) * a; d[i] = x[i] - this.mean[i]; }
    // Covariance that forgets: about the last hundred calls count.
    const k = Math.max(0.01, 1 / this.seen);
    for (let i = 0; i < DIM; i++) {
      const row = i * DIM;
      for (let j = 0; j < DIM; j++) this.cov[row + j] += (d[i] * d[j] - this.cov[row + j]) * k;
    }
    this._updateAxes();

    const type = this._classify(x, nowMs);
    const call = {
      x, type, born: nowMs,
      loud: clamp(x[BANDS] / 2, 0, 1),
      prev: this.lastCall && nowMs - this.lastCall.born < SEQUENCE_GAP_MS ? this.lastCall : null,
      demo: this.demo,
    };
    this.calls.push(call);
    if (this.calls.length > MAX_CALLS) this.calls.splice(0, this.calls.length - MAX_CALLS);
    this.lastCall = call;
    if (this.seen % REFIT_EVERY === 0) this.refit();
    return call;
  }

  /** One step of subspace iteration from the current axes: W ← orth(C·W), blended for calm. */
  _updateAxes() {
    const next = this.W.map((w) => {
      const v = new Float32Array(DIM);
      for (let i = 0; i < DIM; i++) {
        let s = 0;
        const row = i * DIM;
        for (let j = 0; j < DIM; j++) s += this.cov[row + j] * w[j];
        v[i] = s;
      }
      return v;
    });
    orthonormalise(next);
    for (let i = 0; i < 3; i++) {
      // Keep each axis pointing the way it did: an eigenvector's sign is arbitrary, a flip would mirror the map.
      let dot = 0;
      for (let j = 0; j < DIM; j++) dot += next[i][j] * this.W[i][j];
      const s = dot < 0 ? -1 : 1;
      for (let j = 0; j < DIM; j++) next[i][j] = this.W[i][j] * 0.7 + s * next[i][j] * 0.3;
    }
    this.W = orthonormalise(next);
    for (let i = 0; i < 3; i++) {
      let v = 0;
      const w = this.W[i];
      for (let r = 0; r < DIM; r++) {
        let s = 0;
        for (let c = 0; c < DIM; c++) s += this.cov[r * DIM + c] * w[c];
        v += w[r] * s;
      }
      this.sigma[i] += (Math.sqrt(Math.max(v, 1e-6)) - this.sigma[i]) * 0.08;
    }
  }

  /** Between refits, a new call joins the nearest type and nudges its centre. */
  _classify(x, nowMs) {
    if (!this.centroids.length) {
      this.centroids.push({ c: Float32Array.from(x), n: 1, lastHit: nowMs });
      return 0;
    }
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.centroids.length; i++) {
      const dd = dist2(x, this.centroids[i].c);
      if (dd < bestD) { bestD = dd; best = i; }
    }
    const c = this.centroids[best];
    c.n++;
    c.lastHit = nowMs;
    for (let i = 0; i < DIM; i++) c.c[i] += (x[i] - c.c[i]) * 0.05;
    return best;
  }

  /**
   * Re-fit the types to the calls alive right now: a few rounds of k-means,
   * warm-started from the current centres so a type keeps its colour from
   * one refit to the next. Room for one type per five calls, up to seven;
   * a new type is seeded on the call worst served by the existing ones
   * (k-means++ without the dice), so a new sound gets a new colour within
   * seconds of arriving.
   */
  refit(rounds = 4) {
    const calls = this.calls;
    const n = calls.length;
    if (!n) { this.centroids = []; return; }
    const K = Math.min(this.types, Math.max(1, Math.floor(n / 5)));
    const nearest = (x) => {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < this.centroids.length; i++) {
        const dd = dist2(x, this.centroids[i].c);
        if (dd < bestD) { bestD = dd; best = i; }
      }
      return [best, bestD];
    };
    const worst = () => {
      let at = 0, far = -1;
      for (let i = 0; i < n; i++) {
        const d = this.centroids.length ? nearest(calls[i].x)[1] : Infinity;
        if (d > far) { far = d; at = i; }
      }
      return calls[at];
    };
    while (this.centroids.length < K) this.centroids.push({ c: Float32Array.from(worst().x), n: 0, lastHit: 0 });
    while (this.centroids.length > K) {
      // Fewer calls than types: fold away the type that serves the fewest.
      const counts = new Array(this.centroids.length).fill(0);
      for (const call of calls) counts[nearest(call.x)[0]]++;
      this.centroids.splice(counts.indexOf(Math.min(...counts)), 1);
    }
    const label = new Int32Array(n);
    for (let r = 0; r < rounds; r++) {
      const sum = this.centroids.map(() => new Float32Array(DIM));
      const cnt = new Int32Array(K);
      for (let i = 0; i < n; i++) {
        const [k] = nearest(calls[i].x);
        label[i] = k;
        cnt[k]++;
        const x = calls[i].x;
        for (let j = 0; j < DIM; j++) sum[k][j] += x[j];
      }
      for (let k = 0; k < K; k++) {
        if (cnt[k]) for (let j = 0; j < DIM; j++) this.centroids[k].c[j] = sum[k][j] / cnt[k];
        else this.centroids[k].c = Float32Array.from(worst().x);
      }
    }
    for (const c of this.centroids) { c.n = 0; c.lastHit = 0; }
    for (let i = 0; i < n; i++) {
      const [k] = nearest(calls[i].x);
      calls[i].type = k;
      this.centroids[k].n++;
      this.centroids[k].lastHit = Math.max(this.centroids[k].lastHit, calls[i].born);
    }
  }

  _prune(nowMs) {
    let drop = 0;
    while (drop < this.calls.length && nowMs - this.calls[drop].born > this.life) drop++;
    if (drop) this.calls.splice(0, drop);
    if (this.lastCall && nowMs - this.lastCall.born > this.life) this.lastCall = null;
  }

  /** The imaginary canopy, while nothing plays. */
  idle(nowMs, dt) {
    if (!this.demo) {
      // Real calls fade out first; the imaginary canopy starts on an empty
      // map so it never borrows the music's axes or colours.
      this._prune(nowMs);
      while (this.trail.length && nowMs - this.trail[0].t > TRAIL_MS) this.trail.shift();
      if (this.calls.length) return;
      this.reset();
      this.demo = true;
    }
    if (nowMs >= this._nextIdle) {
      const sp = SPECIES[Math.floor(this.random() * SPECIES.length)];
      this.addCall(callFeatures(speciesFrames(sp, this.random)), nowMs);
      // Birds call in bursts: short gaps mostly, a long silence now and then.
      this._nextIdle = nowMs + (this.random() < 0.85 ? 120 + this.random() * 300 : 800 + this.random() * 1200);
    }
    // The cursor drifts toward the latest call, wandering a little.
    const target = this.lastCall?.x;
    if (target) {
      const prev = this.trail.length ? this.trail[this.trail.length - 1].x : target;
      const x = new Float32Array(DIM);
      const k = 1 - Math.exp(-6 * dt);
      for (let i = 0; i < DIM; i++) x[i] = prev[i] + (target[i] - prev[i]) * k + (this.random() - 0.5) * 0.02;
      this.trail.push({ x, t: nowMs });
      while (this.trail.length && nowMs - this.trail[0].t > TRAIL_MS) this.trail.shift();
    }
    this._prune(nowMs);
  }

  /** A feature vector → a point in the unit cube, on the current axes. */
  project(x, out = [0, 0, 0]) {
    for (let i = 0; i < 3; i++) {
      const w = this.W[i];
      let s = 0;
      for (let j = 0; j < DIM; j++) s += w[j] * (x[j] - this.mean[j]);
      // tanh keeps outliers inside the cube; 1.3σ puts a typical call around ±0.65.
      out[i] = Math.tanh(s / (1.3 * this.sigma[i] + 1e-6));
    }
    return out;
  }

  /** Where every live call sits right now: projected, then drawn toward its type's centre. */
  layout() {
    const centre = this.centroids.map((c) => this.project(c.c));
    const p = [0, 0, 0];
    return this.calls.map((call) => {
      this.project(call.x, p);
      const c = centre[call.type];
      return [p[0] + (c[0] - p[0]) * PULL, p[1] + (c[1] - p[1]) * PULL, p[2] + (c[2] - p[2]) * PULL];
    });
  }

  /** The type a feature vector is closest to (for colouring the live cursor). */
  nearestType(x) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.centroids.length; i++) {
      const dd = dist2(x, this.centroids[i].c);
      if (dd < bestD) { bestD = dd; best = i; }
    }
    return best;
  }
}

/* ------------------------------------------------------------ painting -- */

const RGB = CALL_COLORS.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const rgba = (t, a) => `rgba(${RGB[t % RGB.length][0]},${RGB[t % RGB.length][1]},${RGB[t % RGB.length][2]},${a.toFixed(3)})`;

/**
 * Draw the map: a turning cube with a floor grid, every call as a glowing
 * dot with its shadow on the floor, consecutive calls joined, the newest
 * ringing, and the live sound as a line through the space.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CallMap} map
 * @param {object} v  { w, h, t (scene seconds), now (ms), cx, cy, R, alpha, labels }
 */
export const CAMERA = 7;          // camera distance, in cube half-widths: enough perspective to read depth
const PITCH = [0.26, 0.46];       // the camera bobs between these elevations (radians)

/**
 * The cube half-width R that keeps the whole turning cube inside a w × h box,
 * whatever the angle: the worst case is a corner pointing at the camera.
 */
export function fitRadius(w, h) {
  const near = CAMERA / (CAMERA - Math.sqrt(3));
  const horiz = Math.SQRT2 * near;
  const vert = (Math.cos(PITCH[0]) + Math.SQRT2 * Math.sin(PITCH[1])) * near;
  return Math.max(40, Math.min((w * 0.47) / horiz, (h * 0.47) / vert));
}

export function paintCallMap(ctx, map, v) {
  const { now, cx, cy, R, alpha = 1 } = v;
  const yaw = v.t * 0.13;
  const pitch = (PITCH[0] + PITCH[1]) / 2 + ((PITCH[1] - PITCH[0]) / 2) * Math.sin(v.t * 0.07);
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const D = CAMERA;
  const proj = (x, y, z) => {
    const x1 = x * cyw + z * syw;
    const z1 = -x * syw + z * cyw;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    const s = D / (D + z2);
    return [cx + x1 * R * s, cy - y2 * R * s, z2, s];
  };

  ctx.save();
  ctx.lineCap = 'round';

  // The frame of reference: floor grid, the cube's edges, three labelled axes.
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(148,163,184,${(0.09 * alpha).toFixed(3)})`;
  ctx.beginPath();
  for (let i = -4; i <= 4; i++) {
    const u = i / 4;
    let a = proj(u, -1, -1), b = proj(u, -1, 1);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    a = proj(-1, -1, u); b = proj(1, -1, u);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  ctx.strokeStyle = `rgba(148,163,184,${(0.06 * alpha).toFixed(3)})`;
  ctx.beginPath();
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const a = proj(x, -1, z), b = proj(x, 1, z);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  for (let k = 0; k < 4; k++) {
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const a = proj(c[k][0], 1, c[k][1]), b = proj(c[(k + 1) % 4][0], 1, c[(k + 1) % 4][1]);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  const o = proj(-1, -1, -1);
  const axes = [['PC1', proj(1, -1, -1)], ['PC2', proj(-1, 1, -1)], ['PC3', proj(-1, -1, 1)]];
  ctx.strokeStyle = `rgba(203,213,225,${(0.28 * alpha).toFixed(3)})`;
  ctx.beginPath();
  for (const [, e] of axes) { ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); }
  ctx.stroke();
  if (v.labels) {
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = `rgba(203,213,225,${(0.5 * alpha).toFixed(3)})`;
    for (const [label, e] of axes) ctx.fillText(label, e[0] + 5, e[1] - 4);
  }

  const pts = map.layout();
  const calls = map.calls;
  const n = calls.length;
  const P = new Array(n);
  const fade = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = pts[i];
    P[i] = proj(x, y, z);
    const age = (now - calls[i].born) / map.life;
    fade[i] = Math.pow(clamp(1 - age, 0, 1), 1.4);
  }

  // Shadows on the floor: the cheapest depth cue there is.
  for (let i = 0; i < n; i++) {
    const s = proj(pts[i][0], -1, pts[i][2]);
    ctx.fillStyle = rgba(calls[i].type, 0.16 * fade[i] * alpha);
    ctx.beginPath();
    ctx.ellipse(s[0], s[1], 2.4 * s[3], 1.1 * s[3], 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Each call joined to the one before it — the phrase, as the papers draw transitions.
  ctx.lineWidth = 0.8;
  const index = new Map(calls.map((c, i) => [c, i]));
  for (let i = 0; i < n; i++) {
    const j = index.get(calls[i].prev);
    if (j === undefined) continue;
    ctx.strokeStyle = rgba(calls[i].type, 0.22 * Math.min(fade[i], fade[j]) * alpha);
    ctx.beginPath();
    ctx.moveTo(P[j][0], P[j][1]);
    ctx.lineTo(P[i][0], P[i][1]);
    ctx.stroke();
  }

  // The calls, far ones first, glowing additively.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => P[b][2] - P[a][2]);
  ctx.globalCompositeOperation = 'lighter';
  for (const i of order) {
    const c = calls[i];
    const [x, y, z, s] = P[i];
    const age = now - c.born;
    const fresh = clamp(1 - age / 600, 0, 1);
    const fog = 0.55 + 0.45 * clamp((1 - z) / 2, 0, 1);
    const a = fade[i] * fog * alpha;
    const r = (1.6 + c.loud * 3.6) * s * (1 + fresh * 1.6) * (R / 260 + 0.4);
    ctx.fillStyle = rgba(c.type, 0.13 * a);
    ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(c.type, 0.9 * a);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (fresh > 0) {
      ctx.strokeStyle = rgba(c.type, 0.55 * fresh * alpha);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, r + (1 - fresh) * 26, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // The live sound: this second and a half, as a line, with a cursor at its head.
  const tr = map.trail;
  if (tr.length > 1) {
    const q = [0, 0, 0];
    let prev = null;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < tr.length; i++) {
      map.project(tr[i].x, q);
      const p = proj(q[0], q[1], q[2]);
      if (prev) {
        ctx.strokeStyle = `rgba(226,232,240,${(0.42 * (i / tr.length) * alpha).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
      }
      prev = p;
    }
    const head = tr[tr.length - 1];
    const t = map.centroids.length ? map.nearestType(head.x) : 0;
    ctx.strokeStyle = rgba(t, 0.9 * alpha);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(prev[0], prev[1], 5, 0, Math.PI * 2);
    ctx.moveTo(prev[0] - 10, prev[1]); ctx.lineTo(prev[0] - 6, prev[1]);
    ctx.moveTo(prev[0] + 6, prev[1]); ctx.lineTo(prev[0] + 10, prev[1]);
    ctx.moveTo(prev[0], prev[1] - 10); ctx.lineTo(prev[0], prev[1] - 6);
    ctx.moveTo(prev[0], prev[1] + 6); ctx.lineTo(prev[0], prev[1] + 10);
    ctx.stroke();
  }

  // A figure caption, like the papers have: what you are looking at, and the key.
  if (v.labels) {
    const counts = map.typeCounts();
    const live = counts.map((k, t) => [t, k]).filter(([, k]) => k > 0);
    const base = Math.min(cy + R * 1.75, v.h - (v.bottomInset ?? 80));
    ctx.font = '10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle';
    const head = map.demo ? 'CALL MAP · waiting for the music — imaginary birds meanwhile' : `CALL MAP · ${n} sounds in the last ${Math.round(map.life / 1000)} s · ${live.length} kinds`;
    const keyW = live.length * 46;
    const headW = ctx.measureText(head).width;
    let x = cx - (headW + 18 + keyW) / 2;
    ctx.fillStyle = `rgba(203,213,225,${(0.55 * alpha).toFixed(3)})`;
    ctx.fillText(head, x, base);
    x += headW + 18;
    for (const [t, k] of live) {
      ctx.fillStyle = rgba(t, 0.95 * alpha);
      ctx.beginPath(); ctx.arc(x + 4, base, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(203,213,225,${(0.55 * alpha).toFixed(3)})`;
      ctx.fillText(String(k), x + 12, base);
      x += 46;
    }
  }
  ctx.restore();
}
