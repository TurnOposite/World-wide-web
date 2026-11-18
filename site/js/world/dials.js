/**
 * The two dials behind the side menus. The half discs came on 2026-11-17, holding a cassette reel and an engraved
 * globe. Ortis, 2026-11-18: « a little soulless and without character — having them as realist photo objects in such
 * a graphically pared-back background did not work … keep the shapes and spaces … a design with more straightforward
 * and clear-cut shapes (within the semi-circles they occupy, which have been really well established) ».
 *
 * So the same half discs, drawn flat. Zone's is a tuning scale: a night disc, a teal rim, a ring of ticks, a flat band.
 * Echo's is a paper sunburst: alternating wedges, an ink rim, a red band, its ticks outside. Each has a needle, a flat
 * wedge with a hard offset copy (the mood board's double offset, docs/design/MOODBOARD-globe-trotter.md §4), that
 * snaps to the tag being pointed at: the one under the pointer or the keyboard, else the page you are on.
 *
 * Decoration only: aria-hidden, no pointer events, not on a phone (the tags are a strip there), and the needle jumps
 * instead of swinging when the visitor asks for less motion. The top of this file is pure (no DOM) so node:test can
 * check it.
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

/** The needle's angle in degrees, from a dial's centre to the middle of a tag's box: 0 points right, 90 down. */
export function aimAt(box, cx, cy) {
  return Math.atan2((box.top + box.bottom) / 2 - cy, (box.left + box.right) / 2 - cx) / RAD;
}

/** The angle to turn to, the short way round: a needle at 170° sent to -170° goes on to 190°, not back through 0. */
export function turnTo(from, to) {
  return from + ((((to - from) % 360) + 540) % 360) - 180;
}

/**
 * A dial's tick marks between radii r1 and r2 over the half that shows (Zone's: -90° to 90°, Echo's: 90° to 270°),
 * one every `step` degrees, the majors (every `major`) reaching out to r3.
 */
export function ticks(side, r1, r2, r3, { step = 5, major = 30 } = {}) {
  const from = side === 'left' ? -90 : 90;
  const out = [];
  for (let a = from; a <= from + 180; a += step) {
    const big = (a - from) % major === 0;
    const c = Math.cos(a * RAD), s = Math.sin(a * RAD), r = big ? r3 : r2;
    out.push({ a, big, x1: r1 * c, y1: r1 * s, x2: r * c, y2: r * s });
  }
  return out;
}

/** The needle: a flat wedge from the hub to `len`, `w` wide at its root, pointing right (it is turned as a whole). */
export function needlePath(len, w) {
  const r = (v) => +v.toFixed(1);
  return `M0,${r(-w)}L${r(len)},0L0,${r(w)}L${r(-w * 1.2)},0Z`;
}

const s = (tag, attrs = {}, parent = null) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
};

/** One flat dial: disc, bands, rim, ticks, the needle with its offset copy, the hub. Redrawn when its radius changes. */
function dial(half) {
  const g = s('g', { class: `w-dial w-dial-${half}` });
  const body = s('g', {}, g);
  const shadow = s('g', { class: 'w-needle-off' }, g);
  const shadowTurn = s('g', { class: 'w-needle-turn' }, shadow);
  const shadowPath = s('path', { class: 'w-needle w-needle-b' }, shadowTurn);
  const turn = s('g', { class: 'w-needle-turn' }, g);
  const path = s('path', { class: 'w-needle w-needle-a' }, turn);
  const hub = s('circle', { class: 'w-dial-hub' }, g);
  let drawnFor = 0;
  return {
    g,
    turns: [turn, shadowTurn],
    draw(r) {
      if (r === drawnFor) return;
      drawnFor = r;
      const side = half === 'zone' ? 'left' : 'right';
      const parts = [s('circle', { r, class: 'w-dial-disc' })];
      if (half === 'echo') {
        // The sunburst: wedges every 15°, every other one a shade darker, out to the red band.
        for (let a = 90; a < 270; a += 30) {
          const p = (deg, rr) => `${(rr * Math.cos(deg * RAD)).toFixed(1)},${(rr * Math.sin(deg * RAD)).toFixed(1)}`;
          const rr = r * 0.9;
          parts.push(s('path', { d: `M0,0L${p(a, rr)}A${rr},${rr} 0 0 1 ${p(a + 15, rr)}Z`, class: 'w-dial-ray' }));
        }
        parts.push(s('circle', { r: r * 0.62, class: 'w-dial-band' }));
      } else {
        parts.push(s('circle', { r: r * 0.79, class: 'w-dial-band' }));
      }
      parts.push(s('circle', { r, class: 'w-dial-rim' }));
      parts.push(s('circle', { r: half === 'zone' ? r - 7 : r + 9, class: 'w-dial-ring' }));
      const t = half === 'zone' ? ticks(side, r * 0.86, r * 0.9, r * 0.95) : ticks(side, r + 9, r + 13, r + 19);
      const tg = s('g', { class: 'w-dial-ticks' });
      for (const k of t) s('line', { x1: k.x1.toFixed(1), y1: k.y1.toFixed(1), x2: k.x2.toFixed(1), y2: k.y2.toFixed(1), class: k.big ? 'big' : '' }, tg);
      parts.push(tg);
      body.replaceChildren(...parts);
      const len = r * (half === 'zone' ? 0.6 : 0.56), w = Math.max(6, r * 0.045);
      path.setAttribute('d', needlePath(len, w));
      shadowPath.setAttribute('d', needlePath(len, w));
      hub.setAttribute('r', Math.max(7, r * 0.075));
    },
  };
}

export function mountDials({ nav, reduced = matchMedia('(prefers-reduced-motion: reduce)') }) {
  const el = document.createElement('div');
  el.className = 'w-dials';
  el.setAttribute('aria-hidden', 'true');
  const svg = s('svg', { class: 'w-dials-svg' });
  el.append(svg);
  const dials = { zone: dial('zone'), echo: dial('echo') };
  svg.append(dials.zone.g, dials.echo.g);
  const at = { zone: null, echo: null };
  const angle = { zone: 0, echo: 180 };

  /** The tag a half's needle points at: the one pointed at by hand or keyboard, else the page you are on, else none. */
  const targetOf = (half) => nav.querySelector(`.w-tag[data-half="${half}"].w-pointed:not(.w-tag-past)`)
    || nav.querySelector(`.w-tag[data-half="${half}"][aria-current="true"]:not(.w-tag-past)`);

  function aim() {
    for (const half of ['zone', 'echo']) {
      const t = targetOf(half), d = at[half];
      if (!t || !d) continue;
      const to = turnTo(angle[half], aimAt(t.getBoundingClientRect(), d.cx, d.cy));
      angle[half] = to;
      for (const g of dials[half].turns) {
        g.style.transition = reduced.matches ? 'none' : '';
        g.style.transform = `rotate(${to.toFixed(1)}deg)`;
      }
    }
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

  function place() {
    const w = innerWidth;
    svg.setAttribute('width', w);
    svg.setAttribute('height', innerHeight);
    svg.setAttribute('viewBox', `0 0 ${w} ${innerHeight}`);
    for (const [half, side] of [['zone', 'left'], ['echo', 'right']]) {
      const boxes = [...nav.querySelectorAll(`.w-tag[data-half="${half}"]:not(.w-tag-past):not(.w-off)`)]
        .map((b) => b.getBoundingClientRect()).filter((b) => b.width > 0);
      const d = dialFor(boxes, { side, width: w });
      at[half] = d;
      dials[half].g.style.display = d ? '' : 'none';
      if (!d) continue;
      dials[half].g.setAttribute('transform', `translate(${d.cx} ${d.cy})`);
      dials[half].draw(d.r);
    }
    aim();
  }

  return { el, place, settle, aim };
}
