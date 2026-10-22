/**
 * The camera: one transform on the world plane, animated between districts.
 *
 * A flight is easeInOutQuart, 380–820 ms by distance, with a short pull-back
 * mid-way and — on a desktop, only while moving — a motion blur sized to the
 * speed (an SVG blur with separate x/y deviations). Reduced motion gets a
 * 160 ms fade instead of the pan. Only the plane moves: the HUD, the tags,
 * the mini-player and the <audio> are outside it. The plane is promoted to
 * its own layer (will-change) only while it moves: a layer kept after
 * landing is drawn from a bitmap and the scaled windows' text goes soft.
 */
import { PHONE_MAX, cameraFor, centreOf, ease, flightMs, pullBack, seamMix } from './layout.js';

export class Camera {
  /**
   * @param {HTMLElement} plane  the element that carries the transform
   * @param {object} o
   * @param {SVGElement|null} o.blur  the feGaussianBlur the flight drives
   * @param {(cam: object, mix: number) => void} [o.onPaint]
   */
  constructor(plane, { blur = null, onPaint = () => {} } = {}) {
    this.plane = plane;
    this.blur = blur;
    this.onPaint = onPaint;
    this.cam = { tx: 0, ty: 0, s: 1 };
    this.district = null;
    this.moving = false;
    this._raf = 0;
    this._done = null;
    this.phone = matchMedia(`(max-width: ${PHONE_MAX}px)`);
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
  }

  target(d) {
    return cameraFor(d, innerWidth, innerHeight, { phone: this.phone.matches });
  }

  paint(prev) {
    const { tx, ty, s } = this.cam;
    this.plane.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) scale(${s.toFixed(4)})`;
    if (prev && this.blur && !this.phone.matches) {
      const vx = Math.abs(tx - prev.tx);
      const vy = Math.abs(ty - prev.ty);
      this.blur.setAttribute('stdDeviation', `${Math.min(14, vx * 0.22).toFixed(1)} ${Math.min(9, vy * 0.22).toFixed(1)}`);
    }
    this.onPaint(this.cam, seamMix(centreOf(this.cam, innerWidth, innerHeight).x));
  }

  _settle() {
    this.moving = false;
    this.plane.style.filter = '';
    this.plane.style.willChange = '';
    this.blur?.setAttribute('stdDeviation', '0 0');
    const done = this._done;
    this._done = null;
    done?.();
  }

  /** Fly to a district (layout.js). Resolves on arrival, or when a newer flight takes over. */
  fly(d, { instant = false } = {}) {
    cancelAnimationFrame(this._raf);
    this._done?.();
    this.district = d;
    const to = this.target(d);
    const from = { ...this.cam };
    const dist = Math.hypot(to.tx - from.tx, to.ty - from.ty);
    // Already there (a door focused with Tab, then opened): nothing to fly.
    const still = dist < 0.5 && Math.abs(to.s - from.s) < 1e-4;
    return new Promise((resolve) => {
      this._done = resolve;
      if (instant || still || this.reduced.matches) {
        this.cam = to;
        this.paint();
        if (!instant && !still) this.plane.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160 });
        this._settle();
        return;
      }
      const dur = flightMs(dist);
      const pull = this.phone.matches ? 0 : 1;
      this.moving = true;
      this.plane.style.willChange = 'transform';
      if (this.blur && !this.phone.matches) this.plane.style.filter = 'url(#wBlur)';
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = ease(k);
        const prev = { ...this.cam };
        this.cam = {
          tx: from.tx + (to.tx - from.tx) * e,
          ty: from.ty + (to.ty - from.ty) * e,
          s: (from.s + (to.s - from.s) * e) * (1 - pull * pullBack(k, dist)),
        };
        this.paint(prev);
        if (k < 1) { this._raf = requestAnimationFrame(step); return; }
        this.cam = to;
        this.paint();
        this._settle();
      };
      this._raf = requestAnimationFrame(step);
    });
  }

  /** After a resize the same district needs a different transform. */
  refit() {
    if (this.district) this.fly(this.district, { instant: true });
  }
}
