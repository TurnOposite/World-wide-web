/**
 * The world shell, phase 1 (docs/WORLD.md): one plane — Zone on the left,
 * Echo on the right — a camera that flies to the district a route belongs
 * to, the tags, the Zone ⇄ Echo switch and the minimap.
 *
 * Mounted beside the classic shell, never instead of it. The router still
 * mounts each page into <main>, which stays in the document, hidden and
 * inert, until phase 2 moves the pages into their districts; the districts
 * are empty frames for now. The mini-player and the one <audio> are not
 * touched, so the radio plays through every flight.
 */
import { DISTRICTS, byId, districtFor } from './layout.js';
import { Camera } from './camera.js';
import { mountTags } from './tags.js';
import { mountMinimap } from './minimap.js';
import { ZONE_LABEL, ECHO_LABEL } from '../labels.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function district(d, classicHref) {
  const s = el('section', `w-district w-${d.half}-d`);
  s.id = `w-${d.id}`;
  s.dataset.d = d.id;
  s.tabIndex = -1;
  s.setAttribute('aria-labelledby', `w-${d.id}-h`);
  Object.assign(s.style, { left: `${d.x}px`, top: `${d.y}px`, width: `${d.w}px`, height: `${d.h}px` });
  s.style.setProperty('--rot', `${d.rot}deg`);
  const code = el('span', 'w-code', `${d.code} · ${d.title}`);
  code.setAttribute('aria-hidden', 'true');
  s.append(code);
  for (const c of ['c1', 'c2', 'c3', 'c4']) {
    const k = el('i', `w-corner ${c}`);
    k.setAttribute('aria-hidden', 'true');
    s.append(k);
  }
  const win = el('div', 'w-win');
  const inner = el('div', 'w-in');
  const bar = el('div', 'w-bar');
  const h = el('h2', 'w-wt');
  h.id = `w-${d.id}-h`;
  h.append(el('span', '', d.title));
  bar.append(h, el('span', 'w-cd', d.code));
  inner.append(bar, el('p', 'w-hosts', d.hosts));
  // Until phase 2 the frame is empty: the page itself opens in the classic shell.
  const soon = el('p', 'w-soon', 'Empty frame for now — ');
  const a = el('a', '', 'open this page in the classic view');
  a.href = classicHref(d.route ?? 'echo');
  a.dataset.external = '';
  soon.append(a);
  inner.append(soon);
  win.append(inner);
  s.append(win);
  return s;
}

/**
 * @param {object} o
 * @param {import('../router.js').Router} o.router
 * @param {object} [o.site]  config.site
 */
export async function mountWorld({ router, site = {} }) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('../../css/world.css', import.meta.url).href;
  const loaded = new Promise((r) => { css.onload = r; css.onerror = r; });
  document.head.append(css);

  const html = document.documentElement;
  const root = el('div', 'w-root');
  root.id = 'world';

  const far = el('div', 'w-far');
  far.setAttribute('aria-hidden', 'true');
  far.append(el('i', 'w-dark'), el('i', 'w-light'));

  const viewport = el('div', 'w-viewport');
  const plane = el('div', 'w-plane');
  const ground = el('div', 'w-ground');
  ground.setAttribute('aria-hidden', 'true');
  const seam = el('div', 'w-seam');
  seam.setAttribute('aria-hidden', 'true');
  const classicHref = (route) => (router.mode === 'hash' ? `${location.pathname}?world=0#/${route}` : `${route}?world=0`);
  plane.append(ground, seam, ...DISTRICTS.map((d) => district(d, classicHref)));
  viewport.append(plane);
  // overflow:clip where supported; otherwise undo the browser's own scroll to a focused link.
  viewport.addEventListener('scroll', () => { viewport.scrollLeft = 0; viewport.scrollTop = 0; });

  const hud = el('header', 'w-hud');
  const title = el('h1', 'w-sr', `${site.title || 'Globe Trotter'} — le monde`);
  const brand = el('a', 'w-brand');
  brand.href = './';
  brand.dataset.link = '';
  brand.setAttribute('aria-label', `${site.title || 'Globe Trotter'} — accueil`);
  const mark = document.createElementNS(NS, 'svg');
  mark.setAttribute('viewBox', '0 0 32 32');
  mark.setAttribute('width', '28');
  mark.setAttribute('height', '28');
  mark.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', '#mark');
  mark.append(use);
  brand.append(mark, el('b', '', site.title || 'Globe Trotter'));

  const sw = el('div', 'w-switch');
  sw.setAttribute('role', 'group');
  sw.setAttribute('aria-label', 'Moitié du monde');
  const zoneBtn = el('button', '', ZONE_LABEL);
  const echoBtn = el('button', '', ECHO_LABEL);
  for (const b of [zoneBtn, echoBtn]) { b.type = 'button'; b.setAttribute('aria-pressed', 'false'); }
  const ind = el('i', 'w-ind');
  ind.setAttribute('aria-hidden', 'true');
  sw.append(ind, zoneBtn, echoBtn);

  let current = null;
  const minimap = mountMinimap((id) => pick(id));
  const tags = mountTags((id) => pick(id));
  hud.append(title, brand, sw, minimap.svg);

  // The motion blur: one SVG filter the camera turns up while it moves.
  const defs = document.createElementNS(NS, 'svg');
  defs.setAttribute('width', '0');
  defs.setAttribute('height', '0');
  defs.setAttribute('aria-hidden', 'true');
  defs.style.position = 'absolute';
  defs.innerHTML = '<filter id="wBlur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0 0"/></filter>';

  root.append(far, hud, tags.nav, viewport, defs);
  document.getElementById('minibar').before(root);

  const camera = new Camera(plane, {
    blur: defs.querySelector('feGaussianBlur'),
    onPaint: (cam, mix) => {
      root.style.setProperty('--w-mix', mix.toFixed(3));
      root.style.setProperty('--w-px', `${(cam.tx * 0.22).toFixed(1)}px`);
      root.style.setProperty('--w-py', `${(cam.ty * 0.22).toFixed(1)}px`);
      root.classList.toggle('w-at-echo', mix > 0.5);
      minimap.draw(cam, current);
    },
  });

  const skip = document.querySelector('.skip');
  function arrive(d, { instant = false } = {}) {
    current = d.id;
    tags.mark(d.id);
    plane.querySelectorAll('.w-district').forEach((s) => s.classList.toggle('here', s.dataset.d === d.id));
    skip?.setAttribute('href', `#w-${d.id}`);
    const echo = d.half === 'echo';
    // A district reached without a route change (Articles, Archives, Tab) still sets the half.
    document.body.classList.toggle('on-echo', echo);
    globalThis.__echoStage?.(echo);
    zoneBtn.setAttribute('aria-pressed', String(!echo));
    echoBtn.setAttribute('aria-pressed', String(echo));
    return camera.fly(d, { instant });
  }

  // A tag with a page goes through the router (a real URL, back/forward
  // work); the router's render then calls show(). A tag without one, or one
  // for the page already open, only moves the camera.
  function pick(id, { replace = false } = {}) {
    const d = byId(id);
    if (!d) return;
    if (d.route !== null && router.currentRoute() !== d.route) router.go(d.route, { replace });
    else arrive(d);
  }

  zoneBtn.addEventListener('click', () => pick('radio'));
  echoBtn.addEventListener('click', () => pick('une'));

  // Tab into a district that is off camera: the camera follows the focus.
  plane.addEventListener('focusin', (e) => {
    const s = e.target.closest?.('.w-district');
    if (s && s.dataset.d !== current) arrive(byId(s.dataset.d));
  });

  // ← → walk the districts in map order. Not while typing, and not inside
  // the hidden classic page (nothing there can hold focus anyway).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
    const t = e.target;
    const free = t === document.body || t === html || (t instanceof Element && t.closest('.w-root'));
    if (!free || (t instanceof Element && t.closest('input, textarea, select, [contenteditable]'))) return;
    const i = Math.max(0, DISTRICTS.findIndex((d) => d.id === current));
    const next = DISTRICTS[(i + (e.key === 'ArrowRight' ? 1 : DISTRICTS.length - 1)) % DISTRICTS.length];
    e.preventDefault();
    pick(next.id, { replace: true });
  });

  addEventListener('resize', () => camera.refit());

  html.classList.add('world-on');
  for (const c of document.querySelectorAll('body > .masthead, body > main, body > .sitefoot')) c.inert = true;
  await loaded;

  return {
    camera,
    get current() { return current; },
    pick,
    /** Called by the router's render with the route it matched. The first landing is instant. */
    show(match) {
      const id = districtFor(match.name, match.params);
      if (!id) return null;
      return arrive(byId(id), { instant: current === null });
    },
  };
}
