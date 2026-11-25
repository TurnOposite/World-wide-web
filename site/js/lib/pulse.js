/**
 * One animation loop for the site (Lighter step 5, docs/plans/LIGHTER-2026-11-24.md): the boat's two ideas Ortis
 * picked for everywhere — the sky keeps the station's time (F2 ①), the bass moves the lake (F2 ⑤) — as one service.
 *
 * Every frame it reads the music's shape from the visualiser (viz/stage.js listen(), which keeps listening while it
 * rests) and hands each subscriber `{ t, dt, bass, hit, sky }`; it also writes them on the page as CSS variables,
 * so a rule can follow the music with no script of its own:
 *   --bass   0…1, the low end, smoothed so it breathes rather than flickers
 *   --hit    0…1, a beat's flash, falling off in about a third of a second
 *   --sky-top, --sky-hor, --sky-mist (colours), --sky-dark (0 day … 0.84 night): the sky of the hour, Paris time
 *
 * Idle is calm (the mood board): with reduced motion asked for, the bass and the beat stay at 0 and only the sky —
 * which changes over minutes — still moves. A hidden tab draws nothing (the browser pauses the frames).
 * Behind `?pulse=1` until Ortis says (main.js): nobody else loads this file.
 */
import { skyAt, skyMinutes } from './station-time.js';

/** One frame's arithmetic, pure: the smoothed bass and the decaying beat from what the visualiser heard. */
export function step(prev, sound, dt, reduced = false) {
  if (reduced) return { bass: 0, hit: 0 };
  const low = Math.min(1, Math.max(0, sound?.low ?? 0));
  const bass = prev.bass + (low - prev.bass) * Math.min(1, dt * 8);
  const hit = Math.max(Math.min(1, sound?.hit ?? 0), prev.hit - dt * 3);
  return { bass, hit: Math.max(0, hit) };
}

/** The sky's colours as the page reads them. */
export const skyVars = (sky) => ({ '--sky-top': sky.top, '--sky-hor': sky.hor, '--sky-mist': sky.mist, '--sky-dark': sky.dark.toFixed(3) });

export function createPulse({ listen = () => null, root = globalThis.document?.documentElement, now = () => Date.now(),
  search = globalThis.location?.search || '', reduced = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) } = {}) {
  const subs = new Set();
  let state = { t: 0, dt: 0, bass: 0, hit: 0, sky: null };
  let last = 0, skyAtMs = -Infinity, written = { bass: '', hit: '' }, frame = 0, running = false;

  const paintSky = (ms) => {
    state.sky = skyAt(skyMinutes(ms, search));
    skyAtMs = ms;
    for (const [k, v] of Object.entries(skyVars(state.sky))) root?.style.setProperty(k, v);
  };
  const tick = (ts) => {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.05, Math.max(0, (ts - last) / 1000)) : 0.016;
    last = ts;
    const ms = now();
    if (ms - skyAtMs > 30_000) paintSky(ms); // the sky moves over minutes: twice a minute is plenty
    let sound = null;
    try { sound = listen(ts); } catch { /* no visualiser yet: silence */ }
    state = { ...state, ...step(state, sound, dt, reduced()), t: state.t + dt, dt };
    // Written only when they change at the second decimal: a style write every frame would restyle the page for nothing.
    const bass = state.bass.toFixed(2), hit = state.hit.toFixed(2);
    if (bass !== written.bass) root?.style.setProperty('--bass', bass);
    if (hit !== written.hit) root?.style.setProperty('--hit', hit);
    written = { bass, hit };
    for (const fn of subs) { try { fn(state); } catch { /* a subscriber's trouble is its own */ } }
  };

  return {
    get state() { return state; },
    /** Told every frame; returns the way to stop. */
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    start() { if (running) return this; running = true; last = 0; paintSky(now()); frame = requestAnimationFrame(tick); return this; },
    stop() { running = false; cancelAnimationFrame(frame); },
  };
}
