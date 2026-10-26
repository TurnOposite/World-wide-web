/**
 * The whole world at 1/30: both halves, every district, and a frame where
 * the camera is. A pointer shortcut only — aria-hidden, because the tags
 * already say everything it shows — and not drawn on a phone. With the
 * versions of the past on the map, it grows their band under both halves.
 */
import { BASE_H, DISTRICTS, WORLD, nearest } from './layout.js';

const NS = 'http://www.w3.org/2000/svg';

/** @param {(id: string) => void} onPick */
export function mountMinimap(onPick) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'w-minimap');
  svg.setAttribute('aria-hidden', 'true');
  const set = (r, x, y, w, h) => { for (const [k, v] of Object.entries({ x, y, width: w, height: h })) r.setAttribute(k, String(v)); };
  const rect = (cls, x, y, w, h, id) => {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('class', cls);
    set(r, x, y, w, h);
    if (id) r.dataset.d = id;
    svg.append(r);
    return r;
  };
  const zone = rect('z', 0, 0, WORLD.seam, BASE_H);
  const echo = rect('e', WORLD.seam, 0, WORLD.w - WORLD.seam, BASE_H);
  const past = rect('p', 0, BASE_H, WORLD.w, 0);
  for (const d of DISTRICTS) rect(`d${d.era === 'past' ? ' dp' : ''}`, d.x, d.y, d.w, d.h, d.id);
  const cam = rect('cam', 0, 0, 0, 0);

  // Each rect where DISTRICTS says, and the frame of the whole world (taller with the past band).
  function update() {
    svg.setAttribute('viewBox', `0 0 ${WORLD.w} ${WORLD.h}`);
    // Same width, taller with the past band: the map is never letterboxed.
    svg.style.height = `${Math.round((176 * WORLD.h) / WORLD.w)}px`;
    set(zone, 0, 0, WORLD.seam, BASE_H);
    set(echo, WORLD.seam, 0, WORLD.w - WORLD.seam, BASE_H);
    set(past, 0, BASE_H, WORLD.w, Math.max(0, WORLD.h - BASE_H));
    for (const d of DISTRICTS) {
      const r = svg.querySelector(`.d[data-d="${d.id}"]`);
      if (r) { set(r, d.x, d.y, d.w, d.h); r.classList.toggle('off', d.status === 'offline'); }
    }
  }
  update();

  svg.addEventListener('click', (e) => {
    const box = svg.getBoundingClientRect();
    if (!box.width) return;
    const x = ((e.clientX - box.left) / box.width) * WORLD.w;
    const y = ((e.clientY - box.top) / box.height) * WORLD.h;
    onPick(nearest(x, y).id);
  });

  return {
    svg,
    update,
    draw(c, here) {
      cam.setAttribute('x', (-c.tx / c.s).toFixed(0));
      cam.setAttribute('y', (-c.ty / c.s).toFixed(0));
      cam.setAttribute('width', (innerWidth / c.s).toFixed(0));
      cam.setAttribute('height', (innerHeight / c.s).toFixed(0));
      svg.querySelectorAll('.d').forEach((r) => r.classList.toggle('here', r.dataset.d === here));
    },
  };
}
