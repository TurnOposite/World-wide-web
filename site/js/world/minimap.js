/**
 * The whole world at 1/30: both halves, every district, and a frame where
 * the camera is. A pointer shortcut only — aria-hidden, because the tags
 * already say everything it shows — and not drawn on a phone.
 */
import { DISTRICTS, WORLD, nearest } from './layout.js';

const NS = 'http://www.w3.org/2000/svg';

/** @param {(id: string) => void} onPick */
export function mountMinimap(onPick) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'w-minimap');
  svg.setAttribute('viewBox', `0 0 ${WORLD.w} ${WORLD.h}`);
  svg.setAttribute('aria-hidden', 'true');
  const rect = (cls, x, y, w, h, id) => {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('class', cls);
    for (const [k, v] of Object.entries({ x, y, width: w, height: h })) r.setAttribute(k, String(v));
    if (id) r.dataset.d = id;
    svg.append(r);
    return r;
  };
  rect('z', 0, 0, WORLD.seam, WORLD.h);
  rect('e', WORLD.seam, 0, WORLD.w - WORLD.seam, WORLD.h);
  for (const d of DISTRICTS) rect('d', d.x, d.y, d.w, d.h, d.id);
  const cam = rect('cam', 0, 0, 0, 0);

  svg.addEventListener('click', (e) => {
    const box = svg.getBoundingClientRect();
    if (!box.width) return;
    const x = ((e.clientX - box.left) / box.width) * WORLD.w;
    const y = ((e.clientY - box.top) / box.height) * WORLD.h;
    onPick(nearest(x, y).id);
  });

  return {
    svg,
    draw(c, here) {
      cam.setAttribute('x', (-c.tx / c.s).toFixed(0));
      cam.setAttribute('y', (-c.ty / c.s).toFixed(0));
      cam.setAttribute('width', (innerWidth / c.s).toFixed(0));
      cam.setAttribute('height', (innerHeight / c.s).toFixed(0));
      svg.querySelectorAll('.d').forEach((r) => r.classList.toggle('here', r.dataset.d === here));
    },
  };
}
