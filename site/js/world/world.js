/**
 * The world shell (docs/WORLD.md): one plane — Zone on the left, Echo on
 * the right — a camera that flies to the district a route belongs to, the
 * tags, the Zone ⇄ Echo switch and the minimap.
 *
 * Phase 2: the districts host the pages. The router's render asks show()
 * for the box of the route's district and mounts the page there instead of
 * in <main> (which stays in the document, empty, hidden and inert). One
 * page is live at a time, as in the classic shell: the page the camera
 * leaves is cleaned up by the router, goes to sleep in its frame while the
 * camera flies away, and once the camera has landed its frame goes back to
 * a door — a real link to its address, so Tab still finds it, and focusing
 * it flies the camera there. The mini-player and the one <audio> are
 * outside the plane, so the radio plays through every flight.
 *
 * Phase 3: the Zone skin. The station's visualiser glows through Zone's
 * ground, glass bubbles drift in front of it, and « Écran » (screen.js) lets
 * the reader pick what is behind the windows, the bubbles, the menu's shape
 * and the scan lines.
 */
import { DISTRICTS, PHONE_MAX, byId, districtFor, frameFor, pageZoom } from './layout.js';
import { Camera } from './camera.js';
import { mountTags } from './tags.js';
import { mountMinimap } from './minimap.js';
import { Bubbles } from './bubbles.js';
import { bubbleCount, mountScreen } from './screen.js';
import { ZONE_LABEL, ECHO_LABEL } from '../labels.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * What a district shows while its page is not open: what it hosts, and a
 * door — the page's own address, so the router opens it in place. Articles
 * open from the Une; Archives has no page before phase 4.
 */
function door(d) {
  const rest = el('div', 'w-rest');
  rest.append(el('p', 'w-hosts', d.hosts));
  const p = el('p', 'w-door');
  if (d.route !== null) {
    const a = el('a', '', `Ouvrir ${d.title} →`);
    a.href = d.route;
    p.append(a);
  } else if (d.id === 'articles') {
    const a = el('a', '', 'Les articles s’ouvrent depuis la Une →');
    a.href = 'echo';
    p.append(a);
  } else {
    p.className = 'w-soon';
    p.textContent = 'Phase 4 : la presse, l’index des tags, le flux.';
  }
  rest.append(p);
  return rest;
}

function district(d) {
  const s = el('section', `w-district w-${d.half}-d`);
  s.id = `w-${d.id}`;
  s.dataset.d = d.id;
  s.tabIndex = -1;
  s.setAttribute('aria-labelledby', `w-${d.id}-h`);
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
  // The page's box: it scrolls inside the window, and carries the zoom that keeps its text at 1:1.
  const box = el('div', 'w-box');
  box.append(door(d));
  inner.append(bar, box);
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
  const bubbleCanvas = el('canvas', 'w-bubbles');
  bubbleCanvas.setAttribute('aria-hidden', 'true');
  const bubbles = new Bubbles(bubbleCanvas);
  const scan = el('div', 'w-scan');
  scan.setAttribute('aria-hidden', 'true');

  const viewport = el('div', 'w-viewport');
  const plane = el('div', 'w-plane');
  const ground = el('div', 'w-ground');
  ground.setAttribute('aria-hidden', 'true');
  const seam = el('div', 'w-seam');
  seam.setAttribute('aria-hidden', 'true');
  const sections = new Map(DISTRICTS.map((d) => [d.id, district(d)]));
  plane.append(ground, seam, ...sections.values());
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
  const phone = matchMedia(`(max-width: ${PHONE_MAX}px)`);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const count = (bub) => bubbles.setCount(bubbleCount(bub, { phone: phone.matches, reduced: reduced.matches }));
  const screen = mountScreen({ root, onChange: (p) => count(p.bub) });
  phone.addEventListener?.('change', () => count(screen.prefs.bub));
  reduced.addEventListener?.('change', () => count(screen.prefs.bub));
  hud.append(title, brand, sw, screen.button, minimap.svg);

  // The motion blur: one SVG filter the camera turns up while it moves.
  const defs = document.createElementNS(NS, 'svg');
  defs.setAttribute('width', '0');
  defs.setAttribute('height', '0');
  defs.setAttribute('aria-hidden', 'true');
  defs.style.position = 'absolute';
  defs.innerHTML = '<filter id="wBlur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0 0"/></filter>';

  // A route that is no page of the map (the "missing" page) opens in a window over the world.
  const lost = el('section', 'w-lost');
  lost.setAttribute('aria-labelledby', 'w-lost-h');
  lost.tabIndex = -1;
  lost.hidden = true;
  const lostH = el('h2', 'w-sr', 'Hors carte');
  lostH.id = 'w-lost-h';
  const lostBox = el('div', 'w-box');
  lost.append(lostH, lostBox);

  root.append(far, bubbleCanvas, hud, screen.panel, tags.nav, viewport, scan, lost, defs);
  document.getElementById('minibar').before(root);

  const camera = new Camera(plane, {
    blur: defs.querySelector('feGaussianBlur'),
    onPaint: (cam, mix) => {
      root.style.setProperty('--w-mix', mix.toFixed(3));
      root.style.setProperty('--w-px', `${(cam.tx * 0.22).toFixed(1)}px`);
      root.style.setProperty('--w-py', `${(cam.ty * 0.22).toFixed(1)}px`);
      root.classList.toggle('w-at-echo', mix > 0.5);
      bubbles.follow(mix, cam.tx);
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

  // ← → walk the districts in map order: from the page itself, the HUD, the
  // tags or a frame — never from inside a page's box, whose own arrows (the
  // lightbox, the atlas, the dial) are the page's.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
    const t = e.target;
    const free = t === document.body || t === html || (t instanceof Element && t.closest('.w-root') && !t.closest('.w-box'));
    if (!free || (t instanceof Element && t.closest('input, textarea, select, [contenteditable]'))) return;
    const i = Math.max(0, DISTRICTS.findIndex((d) => d.id === current));
    const next = DISTRICTS[(i + (e.key === 'ArrowRight' ? 1 : DISTRICTS.length - 1)) % DISTRICTS.length];
    e.preventDefault();
    pick(next.id, { replace: true });
  });

  // Each frame's size on this screen (a phone's frame is the screen), and the zoom
  // that brings its page back to 1:1 once the camera has scaled the plane.
  function placeAll() {
    for (const d of DISTRICTS) {
      const s = sections.get(d.id);
      const f = frameFor(d, innerWidth, innerHeight, { phone: phone.matches });
      Object.assign(s.style, { left: `${d.x}px`, top: `${d.y}px`, width: `${f.w}px`, height: `${f.h}px` });
      s.style.setProperty('--rot', phone.matches ? '0deg' : `${d.rot}deg`);
      const z = pageZoom(camera.target(d).s);
      s.querySelector('.w-box').style.zoom = z === 1 ? '' : String(z);
    }
  }
  placeAll();
  addEventListener('resize', () => { placeAll(); camera.refit(); });

  // The one live page. The page the camera leaves sleeps in its frame (inert,
  // its players silenced) until the camera lands, then its frame is a door again.
  let live = null;
  function sleep(prev, flight) {
    if (prev.id === null) { prev.box.replaceChildren(); lost.hidden = true; return; }
    const { id, box } = prev;
    box.inert = true;
    box.setAttribute('aria-hidden', 'true');
    // Cleanup stopped the page; a frame or a <video> would still play on its own.
    box.querySelectorAll('iframe, video, audio, object, embed').forEach((n) => n.remove());
    const asleep = box.firstElementChild;
    flight.then(() => {
      if (live?.id === id || box.firstElementChild !== asleep) return;
      box.replaceChildren(door(byId(id)));
      box.inert = false;
      box.removeAttribute('aria-hidden');
      box.scrollTop = 0;
    });
  }

  html.classList.add('world-on');
  for (const c of document.querySelectorAll('body > .masthead, body > main, body > .sitefoot')) c.inert = true;
  await loaded;

  return {
    camera,
    bubbles,
    screen,
    get current() { return current; },
    pick,
    /**
     * Called by the router's render with the route it matched: flies there
     * (instantly on the first landing) and hands back the box to mount the
     * page in, and how to give it focus.
     */
    show(match) {
      const id = districtFor(match.name, match.params);
      const prev = live;
      let flight;
      let box;
      let focus;
      if (id) {
        const d = byId(id);
        flight = arrive(d, { instant: current === null });
        box = sections.get(id).querySelector('.w-box');
        box.inert = false;
        box.removeAttribute('aria-hidden');
        focus = () => sections.get(id).focus({ preventScroll: true });
        lost.hidden = true;
      } else {
        // Off the map: the camera stays (or lands on Radio on a cold link) and the page opens over it.
        flight = current === null ? arrive(byId('radio'), { instant: true }) : Promise.resolve();
        box = lostBox;
        lost.hidden = false;
        focus = () => lost.focus({ preventScroll: true });
      }
      live = { id: id || null, box };
      if (prev && prev.box !== box) sleep(prev, flight);
      box.scrollTop = 0;
      return { box, focus, flight };
    },
  };
}
