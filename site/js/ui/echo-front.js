/**
 * Decor and frame shared by every Echo page (front, article, Lectures).
 *
 * The page is a "Gazette": a white paper column with thin ink rules, standing
 * in the dark between black silhouettes. Everything is drawn here (inline SVG
 * and one canvas, no image, no dependency), so it stays light on a phone. The
 * ash stops under prefers-reduced-motion and whenever it is off-screen.
 *
 * The silhouettes are shapes (a flag, a fist, a crowd, a drum, a horn, a
 * statue), not people.
 *
 * In the world (docs/WORLD.md) the window is the sheet and the world draws
 * the night, the figures and the ash itself, on Echo's ground: frame() then
 * gives the paper column alone.
 */
import { esc } from './util.js';

const SPRITE = `<symbol id="s-flag" viewBox="0 0 100 220"><rect x="10" y="6" width="5" height="214" rx="2"/><path d="M15 12C34 2 52 24 72 14C82 9 92 10 98 14V74C90 68 80 70 70 76C50 88 34 64 15 74Z"/></symbol>
<symbol id="s-fist" viewBox="0 0 100 220"><path d="M38 220L40 132C34 126 28 116 28 102V70C28 62 33 58 39 58H41C41 48 46 43 53 43C59 43 63 47 64 52C67 48 71 46 75 46C82 46 86 51 86 57C90 56 95 60 95 67V98C95 113 87 124 76 130L74 220Z"/></symbol>
<symbol id="s-crowd" viewBox="0 0 200 120"><circle cx="22" cy="64" r="12"/><path d="M4 120C4 88 12 80 22 80S40 88 40 120Z"/><circle cx="60" cy="56" r="13"/><path d="M40 120C40 84 50 74 60 74S80 84 80 120Z"/><circle cx="100" cy="66" r="11"/><path d="M84 120C84 92 92 82 100 82S116 92 116 120Z"/><circle cx="142" cy="54" r="13"/><path d="M120 120C120 82 132 72 142 72S164 82 164 120Z"/><circle cx="182" cy="66" r="11"/><path d="M166 120C166 92 174 82 182 82S198 92 198 120Z"/><rect x="128" y="6" width="46" height="27"/><rect x="149" y="33" width="4" height="40"/></symbol>
<symbol id="s-drum" viewBox="0 0 120 200"><rect x="20" y="18" width="6" height="96" rx="3" transform="rotate(-28 23 66)"/><rect x="94" y="18" width="6" height="96" rx="3" transform="rotate(28 97 66)"/><ellipse cx="60" cy="104" rx="50" ry="14"/><rect x="10" y="104" width="100" height="70"/><ellipse cx="60" cy="174" rx="50" ry="14"/></symbol>
<symbol id="s-horn" viewBox="0 0 140 100"><path d="M6 46H74C86 46 96 30 118 16C126 11 134 10 136 12V88C134 90 126 89 118 84C96 70 86 56 74 56H6Z"/><rect x="38" y="28" width="6" height="18"/><rect x="48" y="28" width="6" height="18"/><rect x="58" y="28" width="6" height="18"/><path d="M34 56C28 72 38 80 50 80H66C78 80 80 68 74 56H66C70 64 68 72 62 72H52C44 72 40 66 42 56Z"/></symbol>
<symbol id="s-statue" viewBox="0 0 120 240"><path d="M22 206H98V240H22ZM30 194H90V206H30Z"/><path d="M44 194L48 128C44 120 44 108 52 102H68C76 108 76 120 72 128L76 194Z"/><circle cx="60" cy="90" r="10"/><path d="M49 88C48 72 66 68 74 80C66 80 58 82 49 88Z"/><path d="M68 108L92 46L99 49L76 112Z"/><path d="M92 46C86 32 92 20 102 14C104 26 100 38 96 47Z"/><path d="M48 110L36 150L42 152L54 114Z"/></symbol>`;

const SIDES = {
  left: [['flag', 118, 258], ['fist', 104, 228], ['crowd', 196, 118]],
  right: [['drum', 150, 250], ['horn', 182, 130], ['statue', 150, 300]],
};

/** Is the page opening in a window of the world rather than in the classic shell? */
export const inWorld = () => document.documentElement.classList.contains('world-on');

export function ensureSprite() {
  if (document.getElementById('echoSprite')) return;
  const d = document.createElement('div');
  d.id = 'echoSprite';
  d.setAttribute('aria-hidden', 'true');
  d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  d.innerHTML = `<svg width="0" height="0" focusable="false"><defs>${SPRITE}</defs></svg>`;
  document.body.append(d);
}

/** One side of silhouettes; `n` limits how many (the article page uses fewer). */
export function side(which, n = 3) {
  return `<div class="echo-side echo-side-${which}" aria-hidden="true">${SIDES[which].slice(0, n).map(([k, w, h]) =>
    `<svg class="sil sil-${k}" style="width:${w}px;height:${h}px" focusable="false"><use href="#s-${k}"/></svg>`).join('')}</div>`;
}

const dateFr = (d = new Date()) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** The Zone / Média navigation line at the top of the paper. */
export function znav(current = 'echo') {
  const on = (k) => (current === k ? ' class="on" aria-current="page"' : '');
  return `<nav class="echo-znav" aria-label="Rubriques"><span class="zl">Zone</span><a href="radio" data-link>Radio</a><a href="atlas" data-link>Atlas</a><a href="portfolio" data-link>Portfolio</a><span class="sep" aria-hidden="true"></span><span class="zl">Média</span><a href="echo" data-link${on('echo')}>Echo</a><a href="echo/lectures" data-link${on('lectures')}>Lectures</a><a href="echo/archives" data-link${on('archives')}>Archives</a></nav>`;
}

/** Nameplate: the full masthead on the front page, a small link back on the others. */
export function nameplate({ full = false, tag = 'Reportages et analyses' } = {}) {
  if (!full) return `<header class="echo-mast echo-mast-small"><a class="echo-name" href="echo" data-link aria-label="Echo — retour à la une">Echo</a></header>`;
  return `<header class="echo-mast"><p class="echo-dateline">${esc(dateFr())}</p><h1 class="echo-name">Echo</h1><p class="echo-tag">${esc(tag)}</p></header>`;
}

/**
 * Wrap page content in the night stage + white paper.
 * @param {string} inner   HTML for the paper column (after the nav)
 * @param {{current?:string, full?:boolean, sides?:number, slow?:boolean, tag?:string}} o
 */
export function frame(inner, { current = 'echo', full = false, sides = 3, tag } = {}) {
  // The world's tags are the navigation, and its Echo ground carries the figures and the ash.
  if (inWorld()) return `<div class="echo-stage echo-in-world"><div class="echo-col">${nameplate({ full, tag })}${inner}</div></div>`;
  ensureSprite();
  return `<div class="echo-stage${sides < 3 ? ' echo-calm' : ''}">
    <canvas class="echo-ash" aria-hidden="true"></canvas>
    <div class="echo-layout">
      ${side('left', sides)}
      <div class="echo-col">${znav(current)}${nameplate({ full, tag })}${inner}</div>
      ${side('right', sides)}
    </div>
  </div>`;
}

/**
 * Ash drifting down and a few embers rising, on a canvas. Returns stop().
 * `slow` halves the speed (article pages). Paused while off-screen or hidden.
 * `ink` is the world's paper ground: dark flakes, fewer, Gazette-red embers.
 * No canvas (a page in the world's window) is nothing to run.
 */
export function ash(canvas, { slow = false, ink = false, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches } = {}) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return () => {};
  const ASH = ink ? 'rgba(40,37,34,.42)' : 'rgba(200,196,190,.55)';
  const EMBER = ink ? 'rgba(168,18,28,.8)' : 'rgba(255,72,40,.9)';
  const k = slow ? 0.5 : 1;
  let W = 0, H = 0, raf = 0, visible = true, ps = [];
  const spawn = (init, ember) => {
    const e = ember ?? Math.random() < 0.14;
    return {
      x: Math.random() * W, y: init ? Math.random() * H : (e ? H + 12 : -12),
      r: e ? 1 + Math.random() * 1.6 : 0.9 + Math.random() * 2.4,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (e ? -1 : 1) * (0.18 + Math.random() * 0.45) * (e ? 1.4 : 1) * k,
      rot: Math.random() * 6.283, vr: (Math.random() - 0.5) * 0.03, a: 0.25 + Math.random() * 0.55, e, t: Math.random() * 100,
    };
  };
  const draw = (still) => {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < ps.length; i++) {
      let p = ps[i];
      if (!still) {
        p.t += 0.01; p.x += p.vx + Math.sin(p.t * 2 + p.y * 0.01) * 0.18; p.y += p.vy; p.rot += p.vr;
        if (p.y > H + 14 || p.y < -14 || p.x < -14 || p.x > W + 14) ps[i] = p = spawn(false, p.e);
      }
      if (p.e) {
        ctx.globalAlpha = p.a * 0.25; ctx.fillStyle = EMBER;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, 6.283); ctx.fill();
        ctx.globalAlpha = p.a * (0.65 + 0.35 * Math.sin(p.t * 9));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      } else {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = p.a; ctx.fillStyle = ASH; ctx.fillRect(-p.r, -p.r * 0.42, p.r * 2, p.r * 0.84);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  };
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(110, Math.round(W * H / (ink ? 14000 : 9000)));
    ps = Array.from({ length: n }, () => spawn(true));
    draw(true);
  };
  const loop = () => {
    raf = 0;
    if (!visible || document.hidden) return;
    draw(false);
    raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!reduced && !raf && visible && !document.hidden) raf = requestAnimationFrame(loop); };
  size();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((en) => { visible = en[0].isIntersecting; kick(); }) : null;
  io?.observe(canvas);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(size) : null;
  ro?.observe(canvas);
  document.addEventListener('visibilitychange', kick);
  kick();
  return () => { cancelAnimationFrame(raf); raf = 0; visible = false; io?.disconnect(); ro?.disconnect(); document.removeEventListener('visibilitychange', kick); };
}
