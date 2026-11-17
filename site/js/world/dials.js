/**
 * The two dials behind the side menus (Ortis, 2026-11-17): « on the sides … if
 * we made that the background behind those menus … on the radio side it's like
 * a cassette tape … a half circle that stops at the edge of the screen … and
 * maybe have it rotating when we're changing. And then for the echo side …
 * have a half earth in like a very 1920 style. A globe would be great. »
 *
 * Zone's: a cassette reel, half of it showing at the left edge — the tape
 * wound on it, the hub's six teeth, the flange's windows. Echo's: an engraved
 * globe of the twenties, half of it at the right edge — paper, ink coasts
 * (Natural Earth 1:110m, data/world.json), hatching, a red equator. Each sits
 * behind its own tags, sized and placed from where the tags actually stand
 * (the Atelier can move them), and turns a little at every change of page:
 * the reel by one tooth, the globe by thirty degrees of longitude.
 *
 * Decoration only: aria-hidden, no pointer events, not on a phone (the tags
 * are a strip there), and still when the visitor asks for less motion.
 *
 * The top of this file is pure (no DOM) so node:test can check it.
 */

const NS = 'http://www.w3.org/2000/svg';
const RAD = Math.PI / 180;

/**
 * Where a half's dial stands, from the boxes of its tags (screen pixels): centred on the screen edge, level with
 * the middle of the tags, wide enough to hold the farthest corner of any of them, with a margin.
 */
export function dialFor(boxes, { side, width, margin = 34, min = 170, max = 420 }) {
  if (!boxes.length) return null;
  const top = Math.min(...boxes.map((b) => b.top));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  const cy = (top + bottom) / 2;
  const cx = side === 'left' ? 0 : width;
  let r = 0;
  for (const b of boxes) {
    for (const [x, y] of [[b.left, b.top], [b.right, b.top], [b.left, b.bottom], [b.right, b.bottom]]) r = Math.max(r, Math.hypot(x - cx, y - cy));
  }
  return { cx, cy, r: Math.round(Math.min(max, Math.max(min, r + margin))) };
}

/** Orthographic projection, the globe turned to `lon0`: [x, y, seen]. A point behind the globe is pushed onto its rim. */
export function ortho(lon, lat, lon0, r) {
  const l = (lon - lon0) * RAD;
  const p = lat * RAD;
  const x = Math.cos(p) * Math.sin(l);
  const y = -Math.sin(p);
  const seen = Math.cos(p) * Math.cos(l) > 0;
  if (seen) return [x * r, y * r, true];
  const n = Math.hypot(x, y) || 1;
  return [(x / n) * r, (y / n) * r, false];
}

/** The world map's paths (x = lon + 180, y = 90 − lat; M, L and Z only) as rings of [lon, lat]. */
export function ringsOf(paths) {
  const rings = [];
  for (const d of paths) {
    let ring = null;
    for (const m of String(d).matchAll(/([MLZ])([^MLZ]*)/gi)) {
      const cmd = m[1].toUpperCase();
      if (cmd === 'Z') { if (ring?.length > 2) rings.push(ring); ring = null; continue; }
      const nums = m[2].split(/[\s,]+/).filter(Boolean).map(Number);
      if (cmd === 'M') { if (ring?.length > 2) rings.push(ring); ring = []; }
      for (let i = 0; i + 1 < nums.length; i += 2) ring?.push([nums[i] - 180, 90 - nums[i + 1]]);
    }
    if (ring?.length > 2) rings.push(ring);
  }
  return rings;
}

/** One land ring on the globe, as an SVG path — or '' when none of it faces us. */
export function ringPath(ring, lon0, r) {
  const pts = ring.map(([lon, lat]) => ortho(lon, lat, lon0, r));
  if (!pts.some((p) => p[2])) return '';
  return `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;
}

/** The graticule: meridians every 30°, parallels every 30°, as polylines on the face we see. */
export function graticule(lon0, r) {
  const lines = [];
  const line = (pts) => {
    let d = '';
    let pen = false;
    for (const [lon, lat] of pts) {
      const [x, y, seen] = ortho(lon, lat, lon0, r);
      if (!seen) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      pen = true;
    }
    if (d) lines.push(d);
  };
  for (let lon = -180; lon < 180; lon += 30) line(Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]));
  for (const lat of [-60, -30, 30, 60]) line(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]));
  return lines;
}

/* ------------------------------------------------------------------ DOM -- */
const s = (tag, attrs = {}, parent = null) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
};

/** The reel, drawn once at radius 100 and scaled: tape, flange windows, the hub and its teeth, a label arc. */
function reel() {
  const g = s('g', { class: 'w-reel-turn' });
  const defs = s('defs', {}, g);
  const tape = s('radialGradient', { id: 'wReelTape' }, defs);
  s('stop', { offset: '0.34', 'stop-color': '#1a120d' }, tape);
  s('stop', { offset: '0.78', 'stop-color': '#2a1b13' }, tape);
  s('stop', { offset: '1', 'stop-color': '#120c09' }, tape);
  // The flange: a clear plastic disc, its rim lit by the station's teal.
  s('circle', { r: 100, class: 'w-reel-flange' }, g);
  // The wound tape, with its sheen rings.
  s('circle', { r: 84, fill: 'url(#wReelTape)' }, g);
  for (let i = 0; i < 9; i++) s('circle', { r: 40 + i * 5, class: 'w-reel-groove' }, g);
  // Three windows cut in the flange, over the tape: the classic C-60 look.
  for (let k = 0; k < 3; k++) {
    const a0 = (k * 120 + 18) * RAD;
    const a1 = (k * 120 + 102) * RAD;
    const arc = (r, a) => `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
    s('path', { d: `M${arc(46, a0)}A46,46 0 0 1 ${arc(46, a1)}L${arc(92, a1)}A92,92 0 0 0 ${arc(92, a0)}Z`, class: 'w-reel-window' }, g);
  }
  // The hub, white plastic, with its six teeth.
  s('circle', { r: 30, class: 'w-reel-hub' }, g);
  s('circle', { r: 17, class: 'w-reel-bore' }, g);
  for (let k = 0; k < 6; k++) {
    const a = k * 60;
    s('rect', { x: 13, y: -3, width: 8, height: 6, rx: 1, class: 'w-reel-tooth', transform: `rotate(${a})` }, g);
  }
  for (let k = 0; k < 3; k++) s('circle', { cx: 24 * Math.cos((k * 120 + 60) * RAD), cy: 24 * Math.sin((k * 120 + 60) * RAD), r: 1.8, class: 'w-reel-screw' }, g);
  // A strip of the cassette's label running round the rim: Zone's own words.
  const path = s('path', { id: 'wReelRim', d: 'M -94,0 A94,94 0 1 1 94,0 A94,94 0 1 1 -94,0', fill: 'none' }, defs);
  void path;
  const t = s('text', { class: 'w-reel-text' }, g);
  const tp = s('textPath', { href: '#wReelRim', startOffset: '0' }, t);
  tp.textContent = 'RADIO TOWER · SIDE A · ONE SIGNAL · EVERYONE ON THE SAME SECOND · SIDE B · ';
  return g;
}

export function mountDials({ root, nav, getRings, reduced = matchMedia('(prefers-reduced-motion: reduce)') }) {
  const el = document.createElement('div');
  el.className = 'w-dials';
  el.setAttribute('aria-hidden', 'true');
  const svg = s('svg', { class: 'w-dials-svg' });
  el.append(svg);

  // Zone: the reel.
  const zone = s('g', { class: 'w-dial w-dial-zone' }, svg);
  const zoneScale = s('g', {}, zone);
  const reelG = reel();
  zoneScale.append(reelG);
  let reelAngle = 0;

  // Echo: the globe of the twenties.
  const echo = s('g', { class: 'w-dial w-dial-echo' }, svg);
  const hatch = s('pattern', { id: 'wGlobeHatch', width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)' }, s('defs', {}, echo));
  s('line', { x1: 0, y1: 0, x2: 0, y2: 4, class: 'w-globe-hatch' }, hatch);
  const sea = s('circle', { class: 'w-globe-sea' }, echo);
  const gratG = s('g', { class: 'w-globe-grat' }, echo);
  const landG = s('g', { class: 'w-globe-land' }, echo);
  const equator = s('path', { class: 'w-globe-equator' }, echo);
  const rim = s('circle', { class: 'w-globe-rim' }, echo);
  const ring2 = s('circle', { class: 'w-globe-ring' }, echo);
  const ticks = s('g', { class: 'w-globe-ticks' }, echo);
  let lon0 = -20; // Europe and Africa facing the reader, Paris near the middle
  let shown = lon0;
  let globeR = 0;
  let frame = 0;

  function drawGlobe(at) {
    const rings = getRings();
    const r = globeR;
    sea.setAttribute('r', r);
    rim.setAttribute('r', r);
    ring2.setAttribute('r', r + 9);
    gratG.replaceChildren(...graticule(at, r).map((d) => s('path', { d })));
    landG.replaceChildren(...rings.map((ring) => ringPath(ring, at, r)).filter(Boolean).map((d) => s('path', { d })));
    const eq = Array.from({ length: 73 }, (_, i) => ortho(-180 + i * 5, 0, at, r)).filter((p) => p[2]);
    equator.setAttribute('d', eq.length ? `M${eq.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}` : '');
    if (!ticks.childNodes.length || ticks.dataset.r !== String(r)) {
      ticks.dataset.r = String(r);
      ticks.replaceChildren(...Array.from({ length: 72 }, (_, i) => {
        const a = i * 5 * RAD;
        const l = i % 6 ? 4 : 9;
        return s('line', { x1: (r + 9) * Math.cos(a), y1: (r + 9) * Math.sin(a), x2: (r + 9 + l) * Math.cos(a), y2: (r + 9 + l) * Math.sin(a) });
      }));
    }
  }

  function turnGlobeTo(target) {
    cancelAnimationFrame(frame);
    if (reduced.matches) { shown = target; drawGlobe(shown); return; }
    const from = shown;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 900);
      const e = 1 - (1 - k) ** 3;
      shown = from + (target - from) * e;
      drawGlobe(shown);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  /**
   * Where the tags are now decides where the dials go. Measured once, at the wrong instant — the first seconds of a
   * slow load, while the page is still laying itself out — both dials sat 400 px low on the live site (2026-11-17).
   * So: at every arrival (world.js), and a few times over the two seconds after the map arrives or the window changes.
   */
  let settling = 0;
  function settle() {
    clearTimeout(settling);
    let n = 0;
    const tick = () => { place(); if (++n < 5) settling = setTimeout(tick, 450); };
    tick();
  }

  let placedFor = '';
  function place() {
    const w = innerWidth;
    svg.setAttribute('width', w);
    svg.setAttribute('height', innerHeight);
    svg.setAttribute('viewBox', `0 0 ${w} ${innerHeight}`);
    for (const [half, side, g] of [['zone', 'left', zone], ['echo', 'right', echo]]) {
      const boxes = [...nav.querySelectorAll(`.w-tag[data-half="${half}"]:not(.w-tag-past):not(.w-off)`)]
        .map((b) => b.getBoundingClientRect()).filter((b) => b.width > 0);
      const d = dialFor(boxes, { side, width: w });
      g.style.display = d ? '' : 'none';
      if (!d) continue;
      g.setAttribute('transform', `translate(${d.cx} ${d.cy})`);
      if (half === 'zone') zoneScale.setAttribute('transform', `scale(${d.r / 100})`);
      else {
        // The globe is redrawn only when its size changed, or its coasts arrived: a move costs one attribute.
        const key = `${d.r}:${getRings().length}`;
        if (key !== placedFor) { placedFor = key; globeR = d.r - 14; drawGlobe(shown); }
      }
    }
  }

  return {
    el,
    place,
    settle,
    /** A change of page: the reel turns one tooth, the globe thirty degrees — each toward the half arrived on. */
    turn(half) {
      if (half === 'echo') { lon0 += 30; turnGlobeTo(lon0); } else { reelAngle += 60; reelG.style.transform = `rotate(${reelAngle}deg)`; }
    },
  };
}
