/**
 * The full-page visualiser — roadmap #28, done the way the post-mortem said.
 *
 * docs/DESIGN-POSTMORTEM.md: the old Stage preset shipped a bloom wash because
 * its brief measured the constraints and left the goal an adjective. Here the
 * goal is structural: **every layer paints on one full-viewport canvas**, and
 * legibility comes from the page, not from starving the effect — panels sit on
 * opaque backing, and the on-air card is translucent only over the cover, so
 * the ring that hugs the cover shows through exactly where there is no text.
 * `tests/site-viz.test.js` asserts the goal: most of the canvas outside the
 * card carries paint while the music plays.
 *
 * The maths (palette, bands, onset detection, squircle, tiers) is the tested
 * core of public/viz.js, copied in verbatim as ../lib/viz-core.js.
 *
 * One AudioContext, two analysers (smoothed for the shapes, raw for onsets
 * and the waveform), created on the first Tune in and never again:
 * `createMediaElementSource()` works once per <audio>, ever.
 */
import { palette, bands, OnsetDetector, squirclePoint, magAt, clamp, lerp, TIERS, nextTier } from '../lib/viz-core.js';

const TAU = Math.PI * 2;

/** Attack/release envelope: rise fast, fall slow — what makes a pulse read as a pulse. */
function follow(cur, target, dt, attack = 22, release = 5) {
  const rate = target > cur ? attack : release;
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

export class Stage {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} o
   * @param {() => object} o.settings   effective visual settings (./settings.js)
   * @param {() => {mode:'radio'|'ambient', cover?:DOMRect, card?:DOMRect, anchor?:{x:number,y:number}}} o.scene
   */
  constructor(canvas, { settings, scene, reducedMotion = false }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getSettings = settings;
    this.getScene = scene;
    this.reducedMotion = reducedMotion;

    this.ac = null;
    this.available = false;
    this.playing = false;
    this.running = false;
    this._raf = 0;
    this._last = 0;

    this.energy = { low: 0, mid: 0, high: 0, overall: 0 };
    this.specBins = new Uint8Array(1024);
    this.waveBins = new Uint8Array(2048);
    this.fluxBins = new Uint8Array(1024);
    this.onset = new OnsetDetector();
    this.hit = 0;

    this.hue = 165;
    this.targetHue = 165;
    this.drift = 0;
    this.t = 0;          // scene time, seconds, scaled by `motion`
    this.gridPhase = 0;

    this.sparks = [];
    this.shocks = [];
    this.weave = [];

    this.tier = 2;
    this._frameAvg = 8;
    this._frameCount = 0;
    this.stats = { frames: 0, painted: 0 };
  }

  /* ------------------------------------------------------------ audio -- */

  /**
   * Tap an <audio> element. Must be called from inside a user gesture (a
   * suspended context created outside one stays suspended on iOS). Returns
   * false — and the music plays on regardless — when Web Audio is missing or
   * the source is cross-origin without CORS.
   */
  attach(audio) {
    if (this.ac) return this.available;
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return false;
      this.ac = new AC();
      const src = this.ac.createMediaElementSource(audio);
      this.spec = this.ac.createAnalyser();
      this.spec.fftSize = 2048;
      this.spec.smoothingTimeConstant = 0.8;
      this.raw = this.ac.createAnalyser();
      this.raw.fftSize = 2048;
      this.raw.smoothingTimeConstant = 0;
      src.connect(this.spec);
      src.connect(this.raw);
      this.spec.connect(this.ac.destination);
      this.specBins = new Uint8Array(this.spec.frequencyBinCount);
      this.fluxBins = new Uint8Array(this.raw.frequencyBinCount);
      this.waveBins = new Uint8Array(this.raw.fftSize);
      this.available = true;
    } catch (err) {
      console.warn('[stage] no audio graph — visuals will idle', err);
      this.available = false;
    }
    return this.available;
  }

  resume() { return this.ac?.state === 'suspended' ? this.ac.resume().catch(() => {}) : Promise.resolve(); }

  setTrack(track) {
    if (Number.isFinite(track?.genreAccent)) this.targetHue = track.genreAccent;
  }

  setPlaying(on) { this.playing = Boolean(on); }

  /* -------------------------------------------------------------- loop -- */

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    const loop = (ts) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this._frame(ts);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _resize() {
    const cap = TIERS[this.tier].dpr;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, cap);
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h, dpr };
  }

  /** Real energies when music plays; a slow carrier otherwise, so the room is never dead. */
  _readAudio(dt, nowMs, sens) {
    let target;
    if (this.available && this.playing) {
      this.spec.getByteFrequencyData(this.specBins);
      this.raw.getByteFrequencyData(this.fluxBins);
      this.raw.getByteTimeDomainData(this.waveBins);
      const b = bands(this.specBins);
      target = { low: clamp(b.low * sens, 0, 1), mid: clamp(b.mid * sens * 1.25, 0, 1), high: clamp(b.high * sens * 2.2, 0, 1), overall: clamp(b.overall * sens, 0, 1) };
      const o = this.onset.push(this.fluxBins, nowMs);
      this.hit = o.hit ? Math.max(0.35, o.strength) : 0;
    } else {
      // The idle carrier: two incommensurate sines, low amplitude.
      const t = nowMs / 1000;
      target = {
        low: 0.18 + 0.1 * Math.sin(t * 0.7),
        mid: 0.12 + 0.07 * Math.sin(t * 1.13 + 1),
        high: 0.05 + 0.04 * Math.sin(t * 2.3 + 2),
        overall: 0.1,
      };
      this.hit = Math.random() < dt * 0.35 ? 0.4 : 0;
      for (let i = 0; i < this.specBins.length; i++) {
        const f = i / this.specBins.length;
        this.specBins[i] = 255 * clamp((0.32 - f * 0.4) * (0.6 + 0.4 * Math.sin(t * 1.4 + i * 0.09)), 0, 1);
      }
      for (let i = 0; i < this.waveBins.length; i++) {
        this.waveBins[i] = 128 + 18 * Math.sin(i * 0.02 + t * 3) * Math.sin(t * 0.6);
      }
    }
    const e = this.energy;
    e.low = follow(e.low, target.low, dt);
    e.mid = follow(e.mid, target.mid, dt);
    e.high = follow(e.high, target.high, dt, 30, 7);
    e.overall = follow(e.overall, target.overall, dt);
  }

  _frame(ts) {
    const dt = Math.min(0.05, Math.max(0.001, (ts - this._last) / 1000));
    this._last = ts;
    const s = this.getSettings();
    const scene = this.getScene() || { mode: 'ambient' };
    const { w, h, dpr } = this._resize();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    // Things that move leave trails; things that are redrawn in place every
    // frame must not (fading-and-repainting a static bar accumulates it to
    // full opacity within a second). So moving layers paint onto their own
    // canvas, which fades; the rest paint fresh; the two are composited.
    const trail = this._trailCanvas(w, h, dpr);
    const tctx = trail.getContext('2d');
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = 'destination-out';
    tctx.fillStyle = `rgba(0,0,0,${clamp(1 - Math.pow(1 - 0.26, dt * 60), 0.05, 1)})`;
    tctx.fillRect(0, 0, trail.width, trail.height);
    tctx.globalCompositeOperation = 'source-over';
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const master = s.intensity * (scene.mode === 'radio' ? 1 : s.ambient);
    const t0 = performance.now();
    this.stats.frames++;
    if (master <= 0.001) return;

    this._readAudio(dt, ts, s.sensitivity);
    const motion = this.reducedMotion ? Math.min(s.motion, 0.25) : s.motion;
    this.t += dt * motion;
    this.drift = 13 * Math.sin(this.t * 0.21) + 6 * Math.sin(this.t * 0.077);
    const want = Number.isFinite(s.hue) ? s.hue : this.targetHue;
    const diff = ((want - this.hue + 540) % 360) - 180;
    this.hue = (this.hue + diff * (1 - Math.exp(-1.6 * dt)) + 360) % 360;
    const pal = palette(this.hue, this.drift);
    const tier = TIERS[this.tier];
    const L = s.layers;

    ctx.save();
    ctx.globalAlpha = clamp(master, 0, 1);
    const anchor = this._anchor(scene, w, h);

    if (L.bloom) this._bloom(ctx, w, h, pal);
    if (L.horizon) this._horizon(ctx, w, h, pal, dt * motion);
    if (L.harmonic) this._harmonic(ctx, w, h, pal);
    if (L.lattice) this._lattice(ctx, w, h, pal, scene);
    if (L.weave) this._weave(tctx, w, h, pal);
    if (L.ring && anchor.rect) this._ring(tctx, anchor, pal, tier);
    if (L.shock) this._shocks(tctx, anchor, pal, dt, tier);
    if (L.dispersal) this._sparks(tctx, anchor, pal, dt, tier);
    if (L.ribbon) this._ribbon(tctx, w, h, pal, scene);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(trail, 0, 0);
    ctx.restore();
    this.stats.painted++;

    // Quality: shed detail rather than frames.
    const cost = performance.now() - t0;
    this._frameAvg = this._frameAvg * 0.95 + cost * 0.05;
    this._frameCount++;
    const next = nextTier(this.tier, this._frameAvg * 1.6, this._frameCount);
    if (next !== this.tier) { this.tier = next; this._frameCount = 0; }
  }

  _trailCanvas(w, h, dpr) {
    if (!this._trail) this._trail = document.createElement('canvas');
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (this._trail.width !== W || this._trail.height !== H) { this._trail.width = W; this._trail.height = H; }
    return this._trail;
  }

  /** Where the figure hangs: the cover on the radio page, the play button elsewhere. */
  _anchor(scene, w, h) {
    const r = scene.cover;
    if (r && r.width > 10 && r.bottom > 0 && r.top < h) {
      return { rect: r, cx: r.left + r.width / 2, cy: r.top + r.height / 2, hw: r.width / 2, hh: r.height / 2, radius: 18 };
    }
    const a = scene.anchor || { x: 40, y: h - 40 };
    return { rect: null, cx: a.x, cy: a.y, hw: 22, hh: 22, radius: 22 };
  }

  /* ------------------------------------------------------------ layers -- */

  _bloom(ctx, w, h, pal) {
    const e = this.energy;
    const base = Math.max(w, h);
    const spots = [
      [0.22 + 0.08 * Math.sin(this.t * 0.11), 0.28 + 0.06 * Math.cos(this.t * 0.07), 0.34 + e.low * 0.22, pal.bloomA(0.2 + e.low * 0.25)],
      [0.8 + 0.07 * Math.cos(this.t * 0.09), 0.7 + 0.08 * Math.sin(this.t * 0.13), 0.3 + e.mid * 0.2, pal.bloomB(0.18 + e.mid * 0.22)],
      [0.55 + 0.2 * Math.sin(this.t * 0.05 + 2), 1.02, 0.4 + e.low * 0.15, pal.bloomA(0.12 + e.overall * 0.2)],
    ];
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r, col] of spots) {
      const cx = x * w, cy = y * h, R = r * base;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** A vaporwave horizon: a striped sun and a grid rolling toward you on the bass. */
  _horizon(ctx, w, h, pal, dt) {
    const e = this.energy;
    const horizon = h * 0.6;
    const vx = w / 2;
    this.gridPhase = (this.gridPhase + dt * (0.18 + e.low * 1.4)) % 1;

    // Sun
    const R = Math.min(w, h) * (0.16 + e.low * 0.025);
    const sy = horizon - R * 0.45;
    const g = ctx.createLinearGradient(0, sy - R, 0, sy + R);
    g.addColorStop(0, `hsla(${(this.hue + 40) % 360} 90% 72% / 0.55)`);
    g.addColorStop(1, `hsla(${(this.hue - 20 + 360) % 360} 85% 55% / 0.35)`);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, horizon);
    ctx.clip();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(vx, sy, R, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const y = sy + R * (0.1 + i * 0.13) + ((this.t * 8) % (R * 0.13));
      ctx.fillRect(vx - R, y, R * 2, 1.5 + i * 1.1);
    }
    ctx.restore();

    // Grid
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, w, h - horizon);
    ctx.clip();
    ctx.lineWidth = 1;
    const depth = h - horizon;
    for (let i = 0; i < 16; i++) {
      const z = (i + this.gridPhase) / 16; // 0 at horizon → 1 at viewer
      const y = horizon + depth * z * z;
      ctx.strokeStyle = pal.sweep(z, 70, 62, 0.08 + z * 0.4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const cols = 22;
    for (let i = -cols; i <= cols; i++) {
      const xb = vx + (i / cols) * w * 1.6;
      ctx.strokeStyle = pal.sweep(0.5 + i / (2 * cols), 70, 62, 0.22);
      ctx.beginPath();
      ctx.moveTo(vx + (i / cols) * w * 0.04, horizon);
      ctx.lineTo(xb, h);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = pal.ring(0.35 + e.low * 0.4);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.stroke();
  }

  /** Three sines at fixed ratios, each driven by one band, and their sum. */
  _harmonic(ctx, w, h, pal) {
    const e = this.energy;
    const y0 = h * 0.2;
    const amp = Math.min(60, h * 0.06);
    const waves = [
      { f: 0.006, a: 0.3 + e.low * 1.8, sp: 1.0 },
      { f: 0.0145, a: 0.2 + e.mid * 1.6, sp: 1.7 },
      { f: 0.029, a: 0.12 + e.high * 1.6, sp: 2.9 },
    ];
    const step = 6;
    waves.forEach((wv, k) => {
      ctx.strokeStyle = pal.sweep(0.2 + k * 0.3, 60, 70, 0.28 - k * 0.05);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += step) {
        const y = y0 + Math.sin(x * wv.f + this.t * wv.sp) * amp * wv.a;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.strokeStyle = pal.ring(0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= w; x += step) {
      let y = y0;
      for (const wv of waves) y += Math.sin(x * wv.f + this.t * wv.sp) * amp * wv.a * 0.45;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /** Mirrored spectrum bars along the bottom, above the mini-player. */
  _lattice(ctx, w, h, pal, scene) {
    const bars = w < 600 ? 32 : 64;
    const floor = h - (scene.bottomInset ?? 80);
    const gap = w / bars;
    const n = this.specBins.length;
    const maxH = Math.min(140, h * 0.18);
    for (let i = 0; i < bars; i++) {
      const m = Math.abs(i - (bars - 1) / 2) / (bars / 2); // 0 centre → 1 edges
      const idx = Math.floor(Math.pow(m, 1.7) * n * 0.55);
      const v = magAt(this.specBins, idx);
      const bh = 3 + v * maxH;
      ctx.fillStyle = pal.sweep(m, 64, 62, 0.25 + v * 0.55);
      const x = i * gap + gap * 0.18;
      const bw = gap * 0.64;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, floor - bh, bw, bh, Math.min(3, bw / 2));
      else ctx.rect(x, floor - bh, bw, bh);
      ctx.fill();
    }
  }

  /** Low band against mid band, as a Lissajous trail. */
  _weave(ctx, w, h, pal) {
    const e = this.energy;
    this.weave.push([e.low, e.mid, e.high]);
    if (this.weave.length > 140) this.weave.shift();
    const wide = w > 900;
    const cx = wide ? w * 0.87 : w * 0.5;
    const cy = wide ? h * 0.42 : h * 0.3;
    const sc = Math.min(w, h) * (wide ? 0.12 : 0.18);
    ctx.lineWidth = 1.3;
    for (let i = 1; i < this.weave.length; i++) {
      const [l0, m0] = this.weave[i - 1];
      const [l1, m1, h1] = this.weave[i];
      const a0 = this.t * 0.4 + (i - 1) * 0.045;
      const a1 = this.t * 0.4 + i * 0.045;
      const x0 = cx + Math.cos(a0 * 1.0) * sc * (0.4 + l0 * 1.6);
      const y0 = cy + Math.sin(a0 * 1.5) * sc * (0.4 + m0 * 1.8);
      const x1 = cx + Math.cos(a1 * 1.0) * sc * (0.4 + l1 * 1.6);
      const y1 = cy + Math.sin(a1 * 1.5) * sc * (0.4 + m1 * 1.8);
      ctx.strokeStyle = pal.sweep(i / this.weave.length, 70, 70, (i / this.weave.length) * (0.35 + h1));
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  /** The spectrum wrapped around the cover's own outline. */
  _ring(ctx, a, pal, tier) {
    const seg = tier.segments;
    const n = this.specBins.length;
    const gap = 12;
    const room = Math.min(56, Math.max(a.hw, a.hh) * 0.4);
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * TAU;
        const mir = t < Math.PI ? t / Math.PI : (TAU - t) / Math.PI;
        const v = magAt(this.specBins, Math.floor(Math.pow(mir, 1.7) * n * 0.6));
        const off = gap + v * room * (pass === 0 ? 1 : 0.55) + Math.sin(t * 6 + this.t * 2) * 2 * this.energy.mid;
        const p = squirclePoint(t - Math.PI / 2, a.hw + off, a.hh + off);
        const x = a.cx + p.x, y = a.cy + p.y;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      if (pass === 0) {
        ctx.strokeStyle = pal.ringGlow(0.35);
        ctx.lineWidth = 7;
      } else {
        ctx.strokeStyle = pal.ring(0.9);
        ctx.lineWidth = 1.6;
      }
      ctx.stroke();
    }
  }

  _shocks(ctx, a, pal, dt, tier) {
    if (this.hit > 0.3 && this.shocks.length < Math.max(2, tier.shocks)) this.shocks.push({ r: 0, life: 1, s: this.hit });
    this.shocks = this.shocks.filter((s) => s.life > 0);
    for (const s of this.shocks) {
      s.r += dt * (260 + s.s * 240);
      s.life -= dt * 0.9;
      ctx.strokeStyle = pal.shock(Math.max(0, s.life) * 0.6);
      ctx.lineWidth = 1.2 + s.s * 1.5;
      ctx.beginPath();
      const seg = 72;
      for (let i = 0; i <= seg; i++) {
        const p = squirclePoint((i / seg) * TAU, a.hw + 10 + s.r, a.hh + 10 + s.r);
        const x = a.cx + p.x, y = a.cy + p.y;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  _sparks(ctx, a, pal, dt, tier) {
    const cap = Math.max(24, tier.sparks * 3);
    const want = this.hit ? 10 + this.hit * 26 : this.energy.high > 0.3 ? dt * 60 * this.energy.high : 0;
    for (let i = 0; i < want && this.sparks.length < cap; i++) {
      const t = Math.random() * TAU;
      const p = squirclePoint(t, a.hw + 12, a.hh + 12);
      const speed = 60 + Math.random() * 120 + this.energy.high * 160;
      this.sparks.push({ x: a.cx + p.x, y: a.cy + p.y, vx: Math.cos(t) * speed, vy: Math.sin(t) * speed, life: 1, r: 1 + Math.random() * 1.6 });
    }
    ctx.globalCompositeOperation = 'lighter';
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.985;
      s.vy *= 0.985;
      s.life -= dt * 0.7;
      ctx.fillStyle = pal.spark(Math.max(0, s.life));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The literal waveform, edge to edge. */
  _ribbon(ctx, w, h, pal, scene) {
    const y0 = h - (scene.bottomInset ?? 80) - Math.min(170, h * 0.2);
    const n = this.waveBins.length;
    const step = Math.max(1, Math.floor(n / Math.max(200, w / 3)));
    const amp = Math.min(46, h * 0.06) * (0.6 + this.energy.overall * 1.4);
    ctx.strokeStyle = pal.ribbon(0.7);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    let k = 0;
    for (let i = 0; i < n; i += step, k++) {
      const x = (i / (n - 1)) * w;
      const y = y0 + ((this.waveBins[i] - 128) / 128) * amp;
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /* ------------------------------------------------------------ extras -- */

  /** The mini-player's little spectrum: 24 bars, same data. */
  drawMini(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const bars = 24;
    const gap = w / bars;
    const n = this.specBins.length;
    const pal = palette(this.hue, this.drift);
    for (let i = 0; i < bars; i++) {
      const v = magAt(this.specBins, Math.floor(Math.pow(i / bars, 1.6) * n * 0.5));
      const bh = 2 + v * (h - 2);
      ctx.fillStyle = pal.sweep(i / bars, 64, 62, 0.45 + v * 0.5);
      ctx.fillRect(i * gap + 1, h - bh, gap - 2, bh);
    }
  }

  /** Fraction of sampled pixels carrying paint outside `exclude` — the failable goal of #28. */
  coverage(exclude = null, samples = 400) {
    const { width: W, height: H } = this.canvas;
    if (!W || !H) return 0;
    const img = this.ctx.getImageData(0, 0, W, H).data;
    const dpr = W / (this.canvas.clientWidth || W);
    let hits = 0, total = 0;
    for (let i = 0; i < samples; i++) {
      const x = Math.floor(((i * 7919) % 997) / 997 * W);
      const y = Math.floor(((i * 104729) % 991) / 991 * H);
      if (exclude && x / dpr >= exclude.left && x / dpr <= exclude.right && y / dpr >= exclude.top && y / dpr <= exclude.bottom) continue;
      total++;
      if (img[(y * W + x) * 4 + 3] > 2) hits++;
    }
    return total ? hits / total : 0;
  }
}

export default Stage;
