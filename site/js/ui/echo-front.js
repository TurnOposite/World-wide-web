/**
 * Decor for Echo's front page: black silhouettes on the sides and a slow
 * drift of ash behind them. All drawn here (no images, no dependency), so the
 * page stays light on a phone; motion stops under prefers-reduced-motion.
 */

// Each silhouette is a hand-drawn path on a 100×160 box: shapes, not people.
const SHAPES = {
  fist: '<path d="M38 160V92c-8-4-12-12-10-22l2-24c1-6 8-8 12-4l2 4V22c0-6 8-8 11-3l3 8c1-5 9-5 11 0l2 8c3-3 10-2 11 4l1 36c0 10-2 18-6 24v53z"/>',
  flag: '<path d="M30 160V12h4v6c14-8 24 6 40 0 8-3 14-3 20 0v54c-6-3-12-3-20 0-16 6-26-8-40 0v88z"/>',
  drum: '<path d="M14 70h72v50c0 8-16 14-36 14S14 128 14 120z"/><ellipse cx="50" cy="70" rx="36" ry="10"/><path d="M26 20l24 44-4 2L22 22zM74 20L54 64l4 2 22-44z"/><path d="M20 134l-8 26h8l8-24zM80 134l8 26h-8l-8-24z"/>',
  statue: '<path d="M36 160V132h28v28zM40 132l2-56c-6-4-8-12-4-18l8-14c-3-3-4-8-1-12l8-12c3-4 9-4 12 0l6 10c2 4 1 9-2 12l8 14c4 7 1 15-5 19l1 57z"/><path d="M62 62l22-40 6 3-18 42z"/>',
  crowd: '<g><circle cx="16" cy="108" r="9"/><path d="M4 160v-38c0-10 24-10 24 0v38z"/><circle cx="42" cy="92" r="10"/><path d="M28 160v-46c0-12 28-12 28 0v46z"/><circle cx="70" cy="104" r="9"/><path d="M58 160v-38c0-10 24-10 24 0v38z"/><circle cx="90" cy="112" r="8"/><path d="M80 160v-32c0-9 20-9 20 0v32z"/></g>',
};
const LEFT = ['flag', 'fist', 'crowd'];
const RIGHT = ['drum', 'statue', 'flag'];

const svg = (k, cls) => `<svg class="${cls}" viewBox="0 0 100 160" aria-hidden="true" focusable="false" fill="currentColor">${SHAPES[k]}</svg>`;

export function side(which) {
  const keys = which === 'left' ? LEFT : RIGHT;
  return `<div class="echo-side echo-side-${which}" aria-hidden="true">${keys.map((k) => svg(k, 'sil')).join('')}</div>`;
}

/** Slow ash on a canvas; returns a stop() function. */
export function ash(canvas, { count = 46, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  let w = 0, h = 0, raf = 0;
  const flakes = [];
  const size = () => {
    const r = canvas.getBoundingClientRect();
    w = canvas.width = Math.max(1, Math.round(r.width));
    h = canvas.height = Math.max(1, Math.round(r.height));
  };
  const spawn = (top) => ({ x: Math.random() * w, y: top ? -4 : Math.random() * h, r: 0.6 + Math.random() * 1.8, vy: 0.12 + Math.random() * 0.35, vx: (Math.random() - 0.4) * 0.18, a: 0.15 + Math.random() * 0.4 });
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      ctx.globalAlpha = f.a;
      ctx.fillStyle = '#d9cfc8';
      ctx.fillRect(f.x, f.y, f.r, f.r);
    }
  };
  const step = () => {
    for (const f of flakes) {
      f.y += f.vy; f.x += f.vx + Math.sin(f.y / 40) * 0.08;
      if (f.y > h || f.x < -4 || f.x > w + 4) Object.assign(f, spawn(true));
    }
    draw();
    raf = requestAnimationFrame(step);
  };
  size();
  for (let i = 0; i < count; i++) flakes.push(spawn(false));
  draw();
  if (!reduced) raf = requestAnimationFrame(step);
  const onResize = () => { size(); draw(); };
  addEventListener('resize', onResize);
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', onResize); };
}
