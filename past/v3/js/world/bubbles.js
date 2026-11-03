/**
 * The glass bubbles that drift up behind Zone's windows (docs/WORLD.md,
 * phase 3). Ambience, so it is cheap and easy to stop: at most 26, drawn at
 * ~30 fps, faded out across the seam, and the loop itself stops — not just
 * the drawing — on Echo, in a hidden tab, with none asked for, or under
 * reduced motion (screen.js bubbleCount gives 0 there).
 */
export class Bubbles {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.list = [];
    this.mix = 0;
    this.tx = 0;
    this.frames = 0; // for the smoke test: does the loop run?
    this._raf = 0;
    this._last = 0;
    this._frame = (t) => this.frame(t);
    document.addEventListener('visibilitychange', () => this.sync());
  }

  get running() { return this._raf !== 0; }

  setCount(n) {
    this.list = Array.from({ length: n }, () => ({
      x: Math.random(), y: Math.random(), r: 6 + Math.random() * 30, v: 0.00012 + Math.random() * 0.00025, p: Math.random() * 6.28,
    }));
    this.sync();
  }

  /** The camera's seam mix (0 Zone … 1 Echo) and its x, for a little parallax. */
  follow(mix, tx) {
    this.mix = mix;
    this.tx = tx;
    this.sync();
  }

  sync() {
    const on = this.list.length > 0 && this.mix < 0.98 && !document.hidden;
    if (on && !this._raf) {
      this._last = 0;
      this._raf = requestAnimationFrame(this._frame);
    } else if (!on && this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  frame(t) {
    this._raf = requestAnimationFrame(this._frame);
    if (t - this._last < 33) return;
    const dt = this._last ? Math.min(100, t - this._last) : 16;
    this._last = t;
    this.frames += 1;
    const c = this.canvas;
    const W = innerWidth;
    const H = innerHeight;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    const a = 1 - this.mix;
    for (const b of this.list) {
      b.y -= b.v * dt;
      b.p += dt * 0.0006;
      if (b.y < -0.1) { b.y = 1.1; b.x = Math.random(); }
      const x = ((b.x * W + this.tx * 0.35 + Math.sin(b.p) * 14) % W + W) % W;
      const y = b.y * H;
      const fill = g.createRadialGradient(x - b.r * 0.35, y - b.r * 0.4, b.r * 0.1, x, y, b.r);
      fill.addColorStop(0, `rgba(255,255,255,${0.16 * a})`);
      fill.addColorStop(0.7, `rgba(160,210,225,${0.05 * a})`);
      fill.addColorStop(1, `rgba(200,235,245,${0.22 * a})`);
      g.fillStyle = fill;
      g.beginPath();
      g.arc(x, y, b.r, 0, 6.283);
      g.fill();
      g.strokeStyle = '#5aaebf';
      g.globalAlpha = 0.45 * a;
      g.lineWidth = 1;
      g.stroke();
      g.strokeStyle = '#fff';
      g.globalAlpha = 0.55 * a;
      g.lineWidth = Math.max(1, b.r * 0.08);
      g.beginPath();
      g.arc(x, y, b.r * 0.72, 3.6, 4.6);
      g.stroke();
      g.globalAlpha = 1;
    }
  }
}
