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
 *
 * Phase 4: the Echo skin. Echo's pages open as the bare Gazette column
 * (echo-front.js frame()), the window being the sheet; the night sides of
 * the classic Une become Echo's ground — the silhouettes stand in the
 * gutters, the ash falls on the paper behind the windows while the camera
 * is on Echo — and the seam is a torn edge of paper over Zone's night.
 *
 * Phase 5: the phone. A swipe across the screen goes to the other half, as
 * the switch does; a phone on its side is a phone too, its header and tags
 * on one line.
 *
 * Public and private (Ortis, 2026-11-01): what is for building the site —
 * « Écran », the minimap, the versions of the past and their band — shows
 * only in the private view (the Atelier, ?atelier=1), which can switch to an
 * « aperçu public » of exactly what everyone else sees (setPrivate). And every
 * window shows its page whole: a page taller than its window is drawn smaller
 * until it fits (fitPage), unless its district scrolls (layout.js `scroll`).
 *
 * The Atelier (docs/ATELIER.md): the map is site/data/layout.json, applied
 * to DISTRICTS before this mounts. The versions of the past stand in a band
 * under both halves, each a window of its own; every door carries its
 * short link (go/<code>); and what the Atelier moves, relayout() redraws.
 */
import { BASE_H, DISTRICTS, FIGURES, FIT_MIN, PHONE_MEDIA, SHORT_MAX, WORLD, byId, districtFor, fitFactor, frameFor, pageZoom, swipeHalf } from './layout.js';
import { Camera } from './camera.js';
import { mountTags } from './tags.js';
import { mountMinimap } from './minimap.js';
import { Bubbles } from './bubbles.js';
import { bubbleCount, mountScreen } from './screen.js';
import { ZONE_LABEL, ECHO_LABEL } from '../labels.js';
import { ash, ensureSprite } from '../ui/echo-front.js';

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
 * open from the Une.
 */
function door(d) {
  const rest = el('div', 'w-rest');
  rest.append(el('p', 'w-hosts', d.hosts));
  const p = el('p', 'w-door');
  const a = d.route !== null ? el('a', '', `Ouvrir ${d.title} →`) : el('a', '', 'Les articles s’ouvrent depuis la Une →');
  a.href = d.route ?? 'echo';
  // The short link to give out (refs.js): it finds the page wherever the Atelier puts it.
  const copy = el('button', 'w-copy', `⧉ go/${d.code}`);
  copy.type = 'button';
  copy.dataset.copy = d.code;
  copy.setAttribute('aria-label', `Copier le lien court vers ${d.title} (go/${d.code})`);
  p.append(a, copy);
  rest.append(p);
  return rest;
}

const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Echo's ground: the Gazette's silhouettes, in the gutters between the windows (layout.js FIGURES).
 * A window the Atelier moved onto one hides it: they stand between windows, never over one.
 */
function figures() {
  ensureSprite();
  const g = el('div', 'w-figures');
  g.setAttribute('aria-hidden', 'true');
  g.innerHTML = FIGURES.map((f) => `<svg class="w-fig" data-k="${f.kind}" style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px" focusable="false"><use href="#s-${f.kind}"/></svg>`).join('');
  // None since 2026-11-07 (layout.js FIGURES): plain paper, the layer kept for when one comes back.
  g.hidden = FIGURES.length === 0;
  return g;
}
function hideCovered(g) {
  for (const f of FIGURES) {
    const svg = g.querySelector(`[data-k="${f.kind}"]`);
    if (svg) svg.style.display = DISTRICTS.some((d) => meets(f, d)) ? 'none' : '';
  }
}

/** The band under both halves where the versions of the past stand. Only drawn when one is on the map. */
function strata() {
  const s = el('div', 'w-strata');
  s.setAttribute('aria-hidden', 'true');
  s.append(el('span', 'w-strata-l', 'Archives · les versions passées du site'), el('span', 'w-strata-r', 'Archives · les versions passées du site'));
  return s;
}

function district(d) {
  const s = el('section', `w-district w-${d.half}-d${d.era === 'past' ? ' w-past-d' : ''}${d.status === 'offline' ? ' w-off' : ''}`);
  s.id = `w-${d.id}`;
  s.dataset.d = d.id;
  s.tabIndex = -1;
  // Named as a window, not after its page: the pages name their own sections (Ondes' « Ondes », Zone's
  // « Playlists »), and two landmarks of one name leave a screen reader two of the same (axe landmark-unique).
  // …and by its code too: two windows may share a title (the two Atlases, 2026-11-01), never a code.
  s.setAttribute('aria-label', `Fenêtre ${d.title} · ${d.code}`);
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
export async function mountWorld({ router, site = {}, private: priv = false }) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('../../css/world.css', import.meta.url).href;
  const loaded = new Promise((r) => { css.onload = r; css.onerror = r; });
  document.head.append(css);

  const html = document.documentElement;
  const root = el('div', 'w-root');
  root.id = 'world';
  // The private view (the Atelier's tab): « Écran », the minimap and the past are shown; the public never sees them.
  let isPrivate = Boolean(priv);
  root.classList.toggle('w-private', isPrivate);
  const shown = (d) => isPrivate || d.era !== 'past';

  const far = el('div', 'w-far');
  far.setAttribute('aria-hidden', 'true');
  // Echo's ash falls on the paper, behind the windows: on the far layer, under the plane, whose paper fades out over Echo.
  const ashCanvas = el('canvas', 'w-ash');
  far.append(el('i', 'w-dark'), el('i', 'w-light'), ashCanvas);
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
  // The paper's torn edge, over a thin red rim (the silhouettes' own).
  seam.append(el('i', 'w-tear w-rim'), el('i', 'w-tear'));
  const sections = new Map(DISTRICTS.map((d) => [d.id, district(d)]));
  const figs = figures();
  const band = strata();
  plane.append(ground, seam, band, figs, ...sections.values());
  // A door's short link: copied whole (this site's address + go/<code>), and the button says so for a moment.
  plane.addEventListener('click', (e) => {
    const b = e.target.closest?.('.w-copy');
    if (!b) return;
    const url = new URL(`go/${b.dataset.copy}`, document.baseURI).href;
    const said = b.textContent;
    const done = (ok) => { b.textContent = ok ? 'Lien copié ✓' : url; setTimeout(() => { b.textContent = said; }, 1800); };
    (navigator.clipboard?.writeText(url) ?? Promise.reject()).then(() => done(true), () => done(false));
  });
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
  const phone = matchMedia(PHONE_MEDIA);
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

  // The ash runs while the camera is on Echo, as the classic Une's did while it was on screen.
  let stopAsh = null;
  function ashOn(on) {
    if (on && !stopAsh) stopAsh = ash(ashCanvas, { ink: true });
    else if (!on && stopAsh) {
      stopAsh();
      stopAsh = null;
      ashCanvas.getContext('2d')?.clearRect(0, 0, ashCanvas.width, ashCanvas.height);
    }
  }

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
    const flight = camera.fly(d, { instant });
    // Leaving Echo, the ash stops once the paper is out of sight, not while it still fills the screen.
    if (echo) ashOn(true);
    else flight.then(() => { if (byId(current)?.half !== 'echo') ashOn(false); });
    return flight;
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

  // A click on a window beside the open one — its edge shows on screen, the plane being one board — opens
  // that window's page, as its tag does (Ortis, 2026-11-03). Until then the click only focused the window and
  // the camera followed the focus: it landed on the window's door, which asked to open what was in view.
  // The door's own link and its short-link button keep their jobs.
  let aimed = null;
  plane.addEventListener('pointerdown', (e) => {
    const s = e.target.closest?.('.w-district');
    aimed = s && s.dataset.d !== current && (e.pointerType !== 'mouse' || e.button === 0) ? s.dataset.d : null;
  }, true);
  plane.addEventListener('click', (e) => {
    const id = aimed;
    aimed = null;
    const s = e.target.closest?.('.w-district');
    if (!id || s?.dataset.d !== id || e.defaultPrevented) return;
    if (e.target.closest('.w-door a[href], .w-copy')) return;
    e.preventDefault();
    pick(id);
  });

  // Tab into a district that is off camera: the camera follows the focus. (A click is handled above.)
  plane.addEventListener('focusin', (e) => {
    const s = e.target.closest?.('.w-district');
    if (s && s.dataset.d !== current && s.dataset.d !== aimed) arrive(byId(s.dataset.d));
  });

  // Phone: a swipe across the screen goes to the other half — Radio or the Une, as the switch does.
  // Never from something that takes the gesture itself (ownsSwipe), nor a pinch, nor a scroll that
  // drifted sideways: the page under the finger must not have moved.
  let touch = null;
  viewport.addEventListener('touchstart', (e) => {
    touch = null;
    if (!phone.matches || e.touches.length !== 1 || (globalThis.visualViewport?.scale ?? 1) > 1.01 || ownsSwipe(e.target)) return;
    const t = e.touches[0];
    const scroller = scrollerOf(e.target);
    // The events' own time, not the handler's: on a busy phone both ends of a quick swipe can be handled late, together.
    touch = { x: t.clientX, y: t.clientY, ts: e.timeStamp, t: performance.now(), scroller, top: scroller?.scrollTop ?? 0 };
  }, { passive: true });
  viewport.addEventListener('touchmove', (e) => { if (e.touches.length > 1) touch = null; }, { passive: true });
  viewport.addEventListener('touchcancel', () => { touch = null; }, { passive: true });
  viewport.addEventListener('touchend', (e) => {
    const s = touch;
    touch = null;
    if (!s || e.touches.length || Math.abs((s.scroller?.scrollTop ?? 0) - s.top) > 12) return;
    const t = e.changedTouches[0];
    const ms = e.timeStamp > s.ts && s.ts > 0 ? e.timeStamp - s.ts : performance.now() - s.t;
    const half = swipeHalf(byId(current)?.half, { x0: s.x, dx: t.clientX - s.x, dy: t.clientY - s.y, ms, vw: innerWidth });
    if (half) pick(half === 'echo' ? 'une' : 'radio');
  }, { passive: true });
  /**
   * Something in the page under the finger that takes a sideways gesture itself: a strip that scrolls
   * across, a slider, a drag (its own touch-action), a dialog. The box's own pan-y is the world's (world.css).
   */
  function ownsSwipe(target) {
    if (document.querySelector('dialog[open]')) return true;
    for (let n = target instanceof Element ? target : target?.parentElement; n && n !== viewport && !n.classList.contains('w-box'); n = n.parentElement) {
      if (n.matches('input, textarea, select, [contenteditable], video, audio')) return true;
      const cs = getComputedStyle(n);
      if (cs.touchAction !== 'auto' && cs.touchAction !== 'manipulation' && !cs.touchAction.includes('pan-x')) return true;
      if (/auto|scroll/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
    }
    return false;
  }
  /** The box (or a list inside it) the finger would scroll up and down. */
  function scrollerOf(target) {
    for (let n = target instanceof Element ? target : target?.parentElement; n && n !== viewport; n = n.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return null;
  }

  // ← → walk the districts in map order: from the page itself, the HUD, the
  // tags or a frame — never from inside a page's box, whose own arrows (the
  // lightbox, the atlas, the dial) are the page's.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
    const t = e.target;
    const free = t === document.body || t === html || (t instanceof Element && t.closest('.w-root') && !t.closest('.w-box'));
    if (!free || (t instanceof Element && t.closest('input, textarea, select, [contenteditable]'))) return;
    const walk = DISTRICTS.filter(shown);
    const i = Math.max(0, walk.findIndex((d) => d.id === current));
    const next = walk[(i + (e.key === 'ArrowRight' ? 1 : walk.length - 1)) % walk.length];
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
      s.classList.toggle('w-off', d.status === 'offline');
      setZoom(s.querySelector('.w-box'), pageZoom(camera.target(d).s));
    }
    // The world is as tall as its lowest window needs (model.js worldHeight): the past band, when there is one.
    plane.style.height = `${WORLD.h}px`;
    seam.style.height = `${WORLD.h}px`;
    band.hidden = WORLD.h <= BASE_H;
    Object.assign(band.style, { top: `${BASE_H}px`, height: `${WORLD.h - BASE_H}px` });
    hideCovered(figs);
  }
  const FOCUSABLE = 'a[href], button, input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])';
  function setZoom(box, z) {
    const v = Math.abs(z - 1) < 0.0005 ? '' : String(Number(z.toFixed(4)));
    if (box.style.zoom !== v) box.style.zoom = v;
  }

  /**
   * The live page, whole in its window: drawn at 1:1 if it fits, else smaller until it does
   * (layout.js fitFactor, never below FIT_MIN). Phones scroll instead — their frame is the screen —
   * and so do the districts marked `scroll`. Measured, not guessed: the page lays out again at each
   * zoom tried (a narrower page wraps into more lines), so it settles in a few steps.
   */
  function fitPage() {
    if (!live?.id) return;
    const d = byId(live.id);
    const box = live.box;
    if (!d || !box.isConnected) return;
    const base = pageZoom(camera.target(d).s);
    let f = 1;
    setZoom(box, base);
    // The window's height, for a page to size what grows with its width (a map, a cover) to it: --w-room.
    const room = `${box.clientHeight}px`;
    if (box.style.getPropertyValue('--w-room') !== room) box.style.setProperty('--w-room', room);
    // What has to show: the whole page, or down to the end of its first part ([data-fit-end] — the
    // Booth's lights, with the music booth a scroll below them).
    const need = () => {
      const end = box.querySelector('[data-fit-end]');
      if (!end) return [box.scrollHeight, box.clientHeight];
      const b = box.getBoundingClientRect();
      const k = b.height / (box.clientHeight || 1);
      return [end.getBoundingClientRect().bottom - b.top + box.scrollTop * k, b.height];
    };
    if (!phone.matches && !d.scroll) {
      for (let i = 0; i < 5; i++) {
        const next = fitFactor(...need(), f);
        if (Math.abs(next - f) < 0.004) break;
        f = next;
        setZoom(box, base * f);
      }
      // The last few pixels: a page that settled just over its window gets one small step more.
      const [over, under] = need();
      if (over > under && f > FIT_MIN) {
        f = Math.max(FIT_MIN, f * (under / over) * 0.985);
        setZoom(box, base * f);
      }
    }
    box.dataset.fit = f.toFixed(3);
    // Shown whole, the box has nothing to scroll (not even the pixel a rounding leaves); shown down to a part
    // ([data-fit-end]), the rest is still a scroll away; a `scroll` district or a phone scrolls as ever.
    const [shown, space] = need();
    box.classList.toggle('w-fitted', !phone.matches && !d.scroll && !box.querySelector('[data-fit-end]') && shown <= space + 2);
    // A box that still scrolls must be reachable by keyboard: when nothing in it takes focus, the box does.
    const scrolls = !box.classList.contains('w-fitted') && box.scrollHeight > box.clientHeight;
    if (scrolls && !box.querySelector(FOCUSABLE)) box.tabIndex = 0;
    else box.removeAttribute('tabindex');
  }
  // The page grows after it mounts (data arriving, a cover loading, the booth unlocking): fit again, once a frame.
  let fitQueued = 0;
  const refit = () => { if (!fitQueued) fitQueued = requestAnimationFrame(() => { fitQueued = 0; fitPage(); }); };
  const fitWatch = globalThis.ResizeObserver ? new ResizeObserver(refit) : null;

  placeAll();
  // A phone on its side: the tag strip shares the header's line, between the switch and « Écran » (or the edge, when « Écran » is private).
  function fitStrip() {
    if (innerHeight > SHORT_MAX) return;
    root.style.setProperty('--w-strip-l', `${Math.round(sw.getBoundingClientRect().right + 8)}px`);
    const end = screen.button.offsetParent ? screen.button.getBoundingClientRect().left : innerWidth - 8;
    root.style.setProperty('--w-strip-r', `${Math.round(innerWidth - end + 8)}px`);
  }
  addEventListener('resize', () => { placeAll(); camera.refit(); fitStrip(); refit(); });

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
      // A door is drawn at 1:1, whatever its page was fitted to.
      setZoom(box, pageZoom(camera.target(byId(id)).s));
      box.classList.remove('w-fitted');
      box.removeAttribute('tabindex');
      box.inert = false;
      box.removeAttribute('aria-hidden');
      box.scrollTop = 0;
    });
  }

  html.classList.add('world-on');
  for (const c of document.querySelectorAll('body > .masthead, body > main, body > .sitefoot')) c.inert = true;
  await loaded;
  fitStrip();
  // Zone's faces swap in when first used, after the sheet, and change the switch's width: measure again when it does.
  if (globalThis.ResizeObserver) {
    const ro = new ResizeObserver(() => fitStrip());
    ro.observe(sw);
    ro.observe(screen.button);
  }

  return {
    camera,
    bubbles,
    screen,
    root,
    plane,
    sections,
    get ash() { return Boolean(stopAsh); },
    get current() { return current; },
    pick,
    /** After the Atelier changed the map: every window, tag and the minimap where DISTRICTS now says. */
    relayout() {
      placeAll();
      tags.placeAll();
      minimap.update();
      minimap.draw(camera.cam, current);
      refit();
    },
    /** The private view (the Atelier) or the public one — the Atelier's « aperçu public » switches to it and back. */
    get private() { return isPrivate; },
    setPrivate(on) {
      isPrivate = Boolean(on);
      root.classList.toggle('w-private', isPrivate);
      fitStrip();
      if (!isPrivate && byId(current)?.era === 'past') pick('radio');
    },
    /** Called by the router's render once a page has mounted in its box: watch it, and show it whole. */
    mounted(box) {
      if (live?.box !== box) return;
      fitWatch?.disconnect();
      if (box.firstElementChild) fitWatch?.observe(box.firstElementChild);
      fitPage();
    },
    fitPage,
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
