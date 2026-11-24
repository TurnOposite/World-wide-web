/**
 * The boat (docs/BACKLOG.md F1): a parallel front for the same site, live behind a toggle and not the default
 * (Ortis, 2026-11-18: « have it live and not the default for now, should be a toggle to activate the initial cutscene
 * into the boat situation — remember first person and interactive windows as part of a 3D decor plane »).
 *
 * ?boat=1 turns it on for the tab (remembered, like ?world=1), ?boat=0 goes back to the map. The first time in a tab it
 * plays the arrival: the boat alone on the lake, then the camera swooping aboard onto the laptop. First person from the
 * hammock. Each page opens on the screen of its thing — the laptop is Radio, the little phone Playlists, the machines on
 * the side Antenna, the scroll Ondes, the lantern the Booth, the desk behind you Echo — lifted flat over it, so its text
 * is crisp and every control works. Stop time (Esc) freezes the scene mid-motion and offers every place; choosing one
 * flies there and the scene carries on from the frame it stopped on. The music is outside all of it and never stops.
 *
 * The router does not know: it asks show(match) for a box, as it asks the map (world.js).
 */
import { PLACES, ORDER, FRONT, placeOf, routeOf, anchorOf, quadOf, quadMatrix, project, poseFor, buildBoat, depthOf, Lake, norm, D2R, skyAt, skyMinutes, LEVER, leverIndex } from './scene.js';

/** The nearest the camera stands to a place's screen, and the nearest a plane may come to the eye, as parts of P. */
export const MIN_D = 0.16;
export const NEAR = 0.05;

const SEEN = 'gt.boat.seen';
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The hammock you sit in while time is stopped, seen from inside it: one rim of cloth sagging across the bottom of the
 * screen, its rope, a fringe of tassels (2026-11-24: the two striped wedges up the sides read as glitches, not cloth).
 */
const RIM = [[-20, 205], [260, 282], [940, 282], [1220, 205]];
const RIM_D = `M${RIM[0]} C ${RIM[1]}, ${RIM[2]}, ${RIM[3]}`;
const rimAt = (t) => { const u = 1 - t, k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]; return [0, 1].map((j) => k.reduce((s, c, i) => s + c * RIM[i][j], 0)); };
const TASSELS = Array.from({ length: 36 }, (_, i) => {
  const [x, y] = rimAt((i + 0.5) / 36).map((v) => Math.round(v)), l = 12 + (i % 3) * 2;
  return `<path d="M${x} ${y + 2} v7" stroke="#6f5c40" stroke-width="1.4"/><path d="M${x - 2} ${y + 9} h4 l2 ${l} h-8z" fill="#c9bfa6" fill-opacity=".9"/>`;
}).join('');

export function mountBoat({ router, player = null }) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('../../css/boat.css', import.meta.url).href;
  document.head.append(css);
  css.addEventListener('load', () => { size(); if (place && !tween) { Object.assign(cv, pose(place)); applyCam(); } });
  document.documentElement.classList.add('boat-on');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let session = null;
  try { session = sessionStorage; } catch { /* storage blocked: the arrival plays every time */ }

  const root = document.createElement('div');
  root.className = 'b-root';
  root.innerHTML = `
    <div class="b-world">
      <canvas class="b-env" aria-hidden="true"></canvas>
      <div class="b-view" aria-hidden="true"><div class="b-cam"></div></div>
      <div class="b-hamfg" aria-hidden="true"><svg viewBox="0 0 1200 360" preserveAspectRatio="xMidYMax slice"><defs>
        <pattern id="bHst" width="44" height="26" patternUnits="userSpaceOnUse"><rect width="44" height="26" fill="#38445a"/><rect y="7" width="44" height="6" fill="#d2c9b2"/><rect y="18" width="44" height="2" fill="#8fa1b4"/></pattern>
        <linearGradient id="bHsh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0f14" stop-opacity=".05"/><stop offset="1" stop-color="#0b0f14" stop-opacity=".6"/></linearGradient></defs>
        <g class="b-rock anim"><path d="${RIM_D} L1220 380 L-20 380 Z" fill="url(#bHst)"/><path d="${RIM_D} L1220 380 L-20 380 Z" fill="url(#bHsh)"/>
        <path d="${RIM_D}" fill="none" stroke="#8b7350" stroke-width="7" stroke-linecap="round"/><path d="${RIM_D}" fill="none" stroke="#c8ab78" stroke-width="2" stroke-dasharray="8 6"/>${TASSELS}</g></svg></div>
    </div>
    <div class="b-labels"></div>
    <section class="b-panel" hidden><div class="b-box" tabindex="-1"></div></section>
    <div class="b-banner" aria-hidden="true"><svg class="b-brush" viewBox="0 0 1000 160" preserveAspectRatio="none"><defs><filter id="bRough" x="-5%" y="-30%" width="110%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.22" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="22"/></filter></defs><path d="M10 74 C 160 34, 420 46, 990 52 L 994 112 C 640 128, 330 140, 18 126 Z" fill="#141b1c" fill-opacity=".9" filter="url(#bRough)"/></svg>
      <span class="b-seal b-bseal"></span><span><span class="b-bname"></span><span class="b-bsub"></span></span></div>
    <header class="b-hud">
      <a class="b-brand" href="?boat=0" data-external><span class="b-seal">船</span><span>Radio Tower<small>Back to the map</small></span></a>
      <div class="b-pill" role="status"><i></i><span class="b-pillT">Time flows</span><span class="b-clk"></span></div>
    </header>
    <div class="b-intro" hidden><span class="b-seal">船台</span><h1>A radio on a boat, on a still lake</h1>
      <p>Everyone who tunes in hears the same second. The laptop on the table is the radio; the phone holds the playlists; the machines on the side carry the streams and the line.</p>
      <div class="b-row"><button type="button" class="b-btn b-aboard">Step aboard</button><button type="button" class="b-btn ghost b-skip">Skip the arrival</button></div></div>
    <nav class="b-dock" aria-label="Places on the boat"></nav>
    <p class="b-say" aria-live="polite"></p>`;
  document.getElementById('minibar').before(root);
  const $ = (s) => root.querySelector(s);
  const world = $('.b-world'), view = $('.b-view'), cam = $('.b-cam'), panel = $('.b-panel'), box = $('.b-box');
  const labels = $('.b-labels'), banner = $('.b-banner'), intro = $('.b-intro'), dock = $('.b-dock'), say = $('.b-say');
  const planes = buildBoat(cam);
  const lake = new Lake($('.b-env'), { reduced });

  let W = 0, H = 0, P = 1000, phone = false;
  const cv = { x: 0, y: 0, z: 0, yaw: 0, pd: 0, roll: 0 };
  let tween = null, worldT = 3.1, frozen = false, dirty = true;
  let place = null, mode = 'room', busy = false, prev = 'radio', queued = null, arriving = false;

  const proj = (p, pose = cv) => project(pose, p, W, H, P);
  const pose = (k) => {
    if (k === 'lake') return lakePose();
    // As big as the screen allows between the header and the dock (Ortis, 2026-11-24), the scene still round it.
    return poseFor(k, { W, H, P, fitW: phone ? 0.72 : 0.86, fitH: phone ? 0.46 : 0.78, minD: MIN_D * P, shift: !phone });
  };
  function lakePose() {
    const ctr = [0, -120, 40], dir = norm([0.92, 0.17, -0.36]);
    const d = P * (phone ? 1250 : 1150) / ((phone ? 0.98 : 0.5) * W);
    const yaw = Math.atan2(dir[0], -dir[2]), right = [Math.cos(yaw), 0, Math.sin(yaw)];
    const shift = phone ? 0 : -0.2 * W * d / P, lift = phone ? -0.2 * H * d / P : -0.06 * H * d / P;
    const aim = [ctr[0] + right[0] * shift, ctr[1] + lift, ctr[2] + right[2] * shift];
    return { x: aim[0] - dir[0] * d, y: aim[1] - dir[1] * d, z: aim[2] - dir[2] * d, yaw: yaw / D2R, pd: Math.asin(dir[1]) / D2R, roll: 0 };
  }
  function choosePose() {
    let p;
    for (let s = 0; s <= 300; s += 10) {
      p = { x: -22, y: -172 - s * 0.32, z: 330 + s, yaw: 6, pd: 0, roll: -4 };
      let lo = 1e9, hi = -1e9;
      for (const k of FRONT) { const a = anchorOf(k); const e = Math.atan2(a[1] - p.y, Math.hypot(p.z - a[2], a[0] - p.x)) / D2R; lo = Math.min(lo, e); hi = Math.max(hi, e); }
      p.pd = (lo + hi) / 2 + 2;
      if (FRONT.every((k) => { const q = proj(anchorOf(k), p); return q && q.x > W * 0.1 && q.x < W * 0.9 && q.y > H * 0.2 && q.y < H * 0.78; })) break;
    }
    return p;
  }

  function applyCam() {
    cam.style.transform = `translateZ(${P}px) rotateZ(${cv.roll}deg) rotateX(${-cv.pd}deg) rotateY(${cv.yaw}deg) translate3d(${-cv.x}px,${-cv.y}px,${-cv.z}px)`;
    clip();
  }
  // The near clipping CSS 3D lacks (2026-11-22): a plane with a corner nearer the eye than NEAR × P, or behind it, is
  // left out until the camera moves away. Drawn, it would be tens of thousands of pixels wide and fill the view anyway.
  let clipped = 0;
  function clip() {
    const near = NEAR * P;
    clipped = 0;
    for (const pl of planes) {
      let min = Infinity;
      for (const p of pl.pts) min = Math.min(min, depthOf(cv, p));
      const out = min < near;
      if (out) clipped++;
      if (out !== pl.out) { pl.out = out; pl.el.style.visibility = out ? 'hidden' : ''; }
    }
  }
  function fly(to, dur, straight = false) {
    return new Promise((res) => {
      if (reduced || dur <= 0) {
        world.style.opacity = '0';
        setTimeout(() => { Object.assign(cv, to); applyCam(); world.style.opacity = '1'; dirty = true; res(); }, reduced ? 140 : 0);
        return;
      }
      const from = { ...cv }, mid = [(from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2];
      const S = { x: 0, y: -205, z: 440 }, k = 0.62;
      const c = straight ? mid : [mid[0] + (S.x - mid[0]) * k, mid[1] + (S.y - mid[1]) * k - 20, mid[2] + (S.z - mid[2]) * k];
      const dyaw = ((to.yaw - from.yaw + 540) % 360) - 180;
      tween = { from, to, c, dyaw, bank: Math.max(-6, Math.min(6, dyaw * 0.08)), t0: performance.now(), dur, res };
    });
  }
  // A device that cannot draw the flight gets a cut instead of a stutter: three frames in a row slower than 150 ms, or
  // one gap of a quarter of a second, and the camera is where it was going. (Software rendering showed frames seconds
  // apart: three of them took twenty seconds, 2026-11-18.)
  let slow = 0, lastStep = 0;
  function stepTween(now) {
    if (!tween) return;
    slow = lastStep && now - lastStep > 150 ? slow + (now - lastStep > 250 ? 3 : 1) : 0;
    lastStep = now;
    const { from, to, c, dyaw, bank, t0, dur, res } = tween;
    const t = slow >= 3 ? 1 : Math.min(1, (now - t0) / dur), e = ease(t), u = 1 - e;
    cv.x = u * u * from.x + 2 * u * e * c[0] + e * e * to.x;
    cv.y = u * u * from.y + 2 * u * e * c[1] + e * e * to.y;
    cv.z = u * u * from.z + 2 * u * e * c[2] + e * e * to.z;
    cv.yaw = from.yaw + dyaw * e;
    cv.pd = from.pd + (to.pd - from.pd) * e;
    cv.roll = from.roll + (to.roll - from.roll) * e + bank * Math.sin(Math.PI * e);
    if (t >= 1) { Object.assign(cv, to); tween = null; lastStep = 0; slow = 0; res(); }
  }
  const flightMs = (a, b) => Math.round(Math.min(2100, 900 + Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * 1.1));

  /* ---- the stop in time */
  function freeze(on) {
    frozen = on;
    root.classList.toggle('frozen', on);
    $('.b-pillT').textContent = on ? 'Time stopped' : 'Time flows';
    const t = $('.b-stopT');
    if (t) t.textContent = on ? 'Resume' : 'Stop time';
  }
  function showBanner(k) {
    if (reduced) return;
    const s = PLACES[k];
    $('.b-bseal').textContent = s.glyph; $('.b-bname').textContent = s.name; $('.b-bsub').textContent = s.obj;
    banner.classList.remove('off'); void banner.offsetWidth; banner.classList.add('on');
  }
  const hideBanner = () => { banner.classList.remove('on'); banner.classList.add('off'); setTimeout(() => { if (!banner.classList.contains('on')) banner.classList.remove('off'); }, 320); };
  function bloomAt(k) {
    if (reduced || !PLACES[k].c) return;
    const p = proj(anchorOf(k)); if (!p) return;
    const b = document.createElement('div'); b.className = 'b-bloom'; b.style.left = `${p.x}px`; b.style.top = `${p.y}px`;
    root.insertBefore(b, labels); requestAnimationFrame(() => b.classList.add('go'));
    setTimeout(() => b.remove(), 1000);
  }

  /* ---- the page's panel: flat over its thing's screen, never smaller than a page can be read in */
  function screenRect(k) {
    const s = PLACES[k]; if (!s.w) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const a of [-0.5, 0.5]) for (const b of [-0.5, 0.5]) {
      const p = proj([s.c[0] + s.r[0] * s.w * a + s.u[0] * s.h * b, s.c[1] + s.r[1] * s.w * a + s.u[1] * s.h * b, s.c[2] + s.r[2] * s.w * a + s.u[2] * s.h * b]);
      if (!p) return null;
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function panelRect(from, k = openOn) {
    if (phone) return { x: 10, y: 56, w: W - 20, h: H - 56 - 70 };
    const w = Math.min(W - 48, Math.max(620, from.w)), h = Math.min(H - 150, Math.max(H * 0.66, from.h));
    // The Antenna's page stands beside its machines, not over them: the stream lever on the rack stays in reach.
    const beside = k === 'antenna' ? from.x + from.w + 24 + w / 2 : from.x + from.w / 2;
    const cx = Math.min(W - 24 - w / 2, Math.max(24 + w / 2, beside));
    const cy = Math.min(H - 84 - h / 2, Math.max(64 + h / 2, from.y + from.h / 2));
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  const setRect = (el, r) => Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  /**
   * The page drawn ON its thing (Ortis, 2026-11-24: « angle the windows to make it seem the object they emanate from
   * are really in this world »): the window's four corners projected, and the page box laid onto them by one matrix3d.
   * The box is laid out larger than it is drawn (SCALE), so more of a page fits; flat things (the paper, the drawer)
   * keep their own proportions and are read foreshortened, as a paper on a desk is.
   */
  const SCALE = 0.82;
  const onThing = (k) => !phone && !PLACES[k].flat && Boolean(PLACES[k].w);
  function windowQuad(k) {
    const q = quadOf(PLACES[k]).map((c) => proj(c));
    return q.every(Boolean) ? q : null;
  }
  function placeOnThing(k) {
    const q = windowQuad(k); if (!q) return false;
    const len = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const w = Math.round((len(q[0], q[1]) + len(q[2], q[3])) / 2 / SCALE), h = Math.round(w * PLACES[k].h / PLACES[k].w);
    Object.assign(panel.style, { left: '0px', top: '0px', width: `${w}px`, height: `${h}px`, transformOrigin: '0 0', transform: quadMatrix(w, h, q) });
    panel.classList.add('on-thing');
    return true;
  }
  function replacePanel() {
    if (!openOn) return;
    if (onThing(openOn) && placeOnThing(openOn)) return;
    const f = screenRect(openOn); if (f) setRect(panel, panelRect(f));
  }
  let openOn = null;
  function openPanel(k) {
    const from = screenRect(k); if (!from) return;
    panel.dataset.place = k;
    panel.hidden = false; openOn = k;
    panel.style.transition = 'none'; panel.style.opacity = '0';
    if (onThing(k) && placeOnThing(k)) {
      // A screen coming on: the page opens from its middle line, on the thing itself.
      panel.style.clipPath = reduced ? 'none' : 'inset(48% 0 48% 0)';
      void panel.offsetWidth;
      panel.style.transition = reduced ? 'opacity .15s linear' : 'clip-path .5s cubic-bezier(.2,.85,.25,1) .05s, opacity .2s ease';
      panel.style.clipPath = 'inset(0 0 0 0)'; panel.style.opacity = '1';
      return;
    }
    panel.classList.remove('on-thing'); panel.style.clipPath = 'none';
    const to = panelRect(from, k);
    setRect(panel, to); panel.style.transformOrigin = '0 0';
    panel.style.transform = `translate(${from.x - to.x}px,${from.y - to.y}px) scale(${from.w / to.w},${from.h / to.h})`;
    void panel.offsetWidth;
    panel.style.transition = reduced ? 'opacity .15s linear' : 'transform .46s cubic-bezier(.2,.85,.25,1), opacity .22s ease';
    panel.style.transform = 'none'; panel.style.opacity = '1';
  }
  function closePanel() {
    if (!openOn) return;
    openOn = null;
    if (panel.classList.contains('on-thing')) { panel.style.transition = 'opacity .18s ease-in'; panel.style.opacity = '0'; }
    else {
      panel.style.transition = 'transform .18s ease-in, opacity .18s ease-in';
      panel.style.transformOrigin = '50% 50%'; panel.style.transform = 'scale(.97)'; panel.style.opacity = '0';
    }
    setTimeout(() => { if (!openOn) panel.hidden = true; }, 190);
  }

  /* ---- moving between places */
  /** Where the camera is, for boat.css: the hammock stands aside when you face the desk; a thing with its page open holds still. */
  const markPlace = (k) => { root.dataset.at = k || ''; root.classList.toggle('aft', k === 'echo' || k === 'drawer'); };
  async function goTo(k, { route = true } = {}) {
    if (busy) { queued = k; return; }
    if (k === place && mode === 'room' && !frozen && openOn) return;
    busy = true; labels.replaceChildren(); closePanel(); intro.hidden = true;
    markPlace(k);
    root.classList.remove('seated');
    if (!frozen) freeze(true);
    showBanner(k);
    say.textContent = `Going to ${PLACES[k].name}.`;
    const to = pose(k);
    await fly(to, flightMs(cv, to));
    hideBanner();
    place = k; mode = 'room';
    bloomAt(k);
    setTimeout(() => freeze(false), reduced ? 0 : 120);
    if (k === 'lake') { intro.hidden = false; intro.querySelector('.b-aboard').focus({ preventScroll: true }); } else openPanel(k);
    paintDock();
    busy = false;
    if (queued) { const q = queued; queued = null; pick(q); }
    void route;
  }
  /** A place chosen by hand: its page through the router (a real address), or the lake, which is no page. */
  function pick(k) {
    if (k === 'lake') { goTo('lake'); return; }
    const r = routeOf(k);
    if (r && router.currentRoute() !== r) router.go(r); else goTo(k);
  }
  async function choose() {
    if (busy || arriving) return;
    if (mode === 'choosing') { pick(prev); return; }
    busy = true; prev = place === 'lake' || !place ? 'radio' : place;
    closePanel(); intro.hidden = true; freeze(true); markPlace(null);
    say.textContent = 'Time stopped. Choose where to go.';
    const to = choosePose();
    await fly(to, flightMs(cv, to) * 0.9);
    root.classList.add('seated');
    mode = 'choosing'; busy = false;
    showLabels();
  }
  function showLabels() {
    labels.replaceChildren();
    const placed = [];
    const hits = (a) => placed.some((q) => a.x < q.x + q.w + 6 && a.x + a.w + 6 > q.x && a.y < q.y + q.h + 6 && a.y + a.h + 6 > q.y);
    const pts = FRONT.map((k) => ({ k, p: proj(anchorOf(k)) })).filter((o) => o.p).sort((a, b) => a.p.y - b.p.y);
    for (const { k, p } of pts) {
      const s = PLACES[k];
      const dot = document.createElement('i'); dot.className = 'b-dot'; dot.style.left = `${p.x}px`; dot.style.top = `${p.y}px`;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'b-lb'; b.dataset.go = k;
      b.innerHTML = `<span class="b-lg">${s.glyph}</span><span><b>${s.name}</b>${phone ? '' : `<small>${s.obj}</small>`}</span>`;
      b.style.visibility = 'hidden';
      labels.append(dot, b);
      const w = b.offsetWidth, h = b.offsetHeight;
      const fit = ([x, y]) => ({ w, h, x: Math.max(8, Math.min(W - 8 - w, x)), y: Math.max(56, Math.min(H - 150 - h, y)) });
      const tries = [[p.x - w / 2, p.y - 16 - h], [p.x + 14, p.y - h / 2], [p.x - 14 - w, p.y - h / 2], [p.x - w / 2, p.y + 16], [p.x - w / 2, p.y - 28 - 2 * h]].map(fit);
      const at = tries.find((t) => !hits(t)) || tries[0];
      placed.push(at);
      b.style.left = `${at.x}px`; b.style.top = `${at.y}px`; b.style.visibility = '';
    }
    for (const [k, side, title, sub] of [['echo', 'left', 'Turn around', 'Echo, on the desk behind you'], ['lake', 'right', 'The lake', 'Step off the boat']]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = `b-lb edge ${side}`; b.dataset.go = k;
      b.innerHTML = `<span class="b-lg">${PLACES[k].glyph}</span><span><b>${title}</b><small>${sub}</small></span>`;
      labels.append(b);
    }
    labels.querySelector('.b-lb')?.focus({ preventScroll: true });
  }
  labels.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) pick(b.dataset.go); });
  // The things themselves (Ortis, 2026-11-22: « the boat button still doesn't work »): the laptop, the phone, the
  // machines, the scroll, the lantern and the desk are what a visitor clicks, so each goes to its place. The lever is a
  // control of its own; the place already open stays as it is; the arrival keeps its own two buttons.
  cam.addEventListener('click', (e) => {
    if (arriving || e.target.closest('button, a, input')) return;
    const o = e.target.closest('[data-go]');
    if (o && !(o.dataset.go === place && mode === 'room')) pick(o.dataset.go);
  });

  /* ---- the dock and the keys */
  dock.innerHTML = ORDER.map((k, i) => `<button class="b-dk" type="button" data-go="${k}" aria-keyshortcuts="${i + 1}" aria-label="${PLACES[k].name}: ${PLACES[k].obj}"><span class="g" aria-hidden="true">${PLACES[k].glyph}</span><span class="t">${PLACES[k].name}</span></button>`).join('')
    + '<button class="b-stop" type="button" aria-keyshortcuts="Escape"><span class="b-seal" aria-hidden="true">停</span><span class="b-stopT">Stop time</span></button>';
  dock.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) pick(b.dataset.go); });
  $('.b-stop').addEventListener('click', choose);
  // The drawer is part of Echo's desk: Echo is lit while the Crates are open.
  function paintDock() { const at = place === 'drawer' ? 'echo' : place; dock.querySelectorAll('.b-dk').forEach((b) => b.setAttribute('aria-current', String(b.dataset.go === at && mode === 'room'))); }
  const typing = (t) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { e.preventDefault(); choose(); return; }
    if (box.contains(e.target)) return; // inside a page, its own keys
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= ORDER.length) pick(ORDER[n - 1]);
  });

  /* ---- the laptop shows what is on air */
  const nowEl = cam.querySelector('.b-now');
  const paintNow = () => { if (nowEl) nowEl.textContent = player?.onAir?.title || ''; };
  player?.addEventListener?.('track', paintNow);

  /* ---- clock, size, frames */
  const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const tick = () => { $('.b-clk').textContent = `${fmt.format(new Date())} Paris`; };
  setInterval(tick, 1000); tick();
  function size() {
    // Measured before boat.css has arrived, the root has no size yet: the window's, less the mini-player, until it does.
    W = root.clientWidth || innerWidth;
    H = (root.clientHeight > 100 ? root.clientHeight : innerHeight - (document.getElementById('minibar')?.offsetHeight || 64));
    phone = W < 720;
    // The boat stops where the mini-player starts, measured, so nothing of the mini-player sits over the moving lake.
    const mb = document.getElementById('minibar');
    if (mb?.offsetHeight) root.style.bottom = `${mb.offsetHeight}px`;
    P = Math.round(Math.hypot(W, H) / (2 * Math.tan(40 * D2R)));
    view.style.perspective = `${P}px`;
    lake.size(W, H, P, Math.min(2, window.devicePixelRatio || 1));
    dirty = true;
  }
  let rz = 0;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      size();
      if (!tween && place) {
        Object.assign(cv, mode === 'choosing' ? choosePose() : pose(place)); applyCam();
        replacePanel();
        if (mode === 'choosing') showLabels();
      }
    }, 160);
  });
  let last = performance.now(), visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
  let frames = 0, lastError = null;
  function frame(now) {
    frames++;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!frozen && !reduced) worldT += dt;
    // The loop must outlive any one bad frame: an error here used to stop the camera for good, the page still open.
    try {
      const moving = !!tween;
      stepTween(now);
      // The music's shape from the visualiser, which rests behind the boat but still listens (viz/stage.js listen()).
      const sound = visible && !frozen ? player?.stage?.listen?.(now) || null : null;
      if (visible && (moving || !frozen || dirty)) { applyCam(); lake.draw(cv, worldT, frozen, sound); dirty = false; }
    } catch (e) { lastError = String(e?.stack || e); }
    requestAnimationFrame(frame);
  }

  /* ---- the light of the hour: the lake and the boat on the station's clock (Paris), `?sky=HH:MM` to see another */
  const hamfg = $('.b-hamfg');
  let skyNow = null;
  function paintSky() {
    skyNow = skyAt(skyMinutes(new Date(), location.search));
    lake.setSky(skyNow);
    // The boat's planes are lit by day; at night they sink with the karsts (one filter on the whole view, not seventy).
    const lit = skyNow.dark > 0.02 ? `brightness(${(1 - 0.6 * skyNow.dark).toFixed(3)}) saturate(${(1 - 0.3 * skyNow.dark).toFixed(3)})` : '';
    view.style.filter = lit; hamfg.style.filter = lit;
    root.classList.toggle('night', skyNow.star > 0.5);
    dirty = true;
  }
  setInterval(paintSky, 60_000);

  /* ---- the Antenna's lever: three positions, three streams; pulled, it turns to the next and the cables light up */
  const client = player?.client || null;
  const pull = cam.querySelector('.rk-pull'), arm = cam.querySelector('.rk-lever');
  let streams = [], onAir = null;
  const nameOf = (slug) => streams.find((c) => c.slug === slug)?.label || slug;
  function paintLever() {
    if (!pull || !arm) return;
    const slugs = streams.map((c) => c.slug), cur = client?.channel ?? onAir ?? slugs[0];
    const i = leverIndex(slugs, cur);
    arm.style.transform = `rotate(${LEVER[Math.max(0, i)]}deg)`;
    pull.hidden = slugs.length < 2;
    const next = slugs.length ? slugs[(Math.max(0, i) + 1) % Math.min(LEVER.length, slugs.length)] : null;
    pull.setAttribute('aria-label', next ? `Streams lever, on ${nameOf(cur)}: pull for ${nameOf(next)}` : 'Streams lever');
    pull.dataset.on = cur || '';
  }
  let pulse = 0;
  function lightCables() {
    root.classList.add('live');
    clearTimeout(pulse);
    pulse = setTimeout(() => root.classList.remove('live'), 1800);
  }
  async function readStreams() {
    if (typeof client?.channels !== 'function') return;
    try {
      const out = await client.channels();
      streams = (out.channels || []).filter((c) => !c.empty).slice(0, LEVER.length);
      onAir = out.current ?? null;
    } catch { /* no tower: the lever stays where it is */ }
    paintLever();
  }
  pull?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const slugs = streams.map((c) => c.slug);
    if (slugs.length < 2) return;
    const i = Math.max(0, leverIndex(slugs, client?.channel ?? onAir ?? slugs[0]));
    const next = slugs[(i + 1) % Math.min(LEVER.length, slugs.length)];
    lightCables();
    try { await client.setChannel(next); } catch { say.textContent = 'The stream could not be changed.'; }
  });
  client?.on?.('channel', ({ slug } = {}) => {
    onAir = slug ?? onAir;
    paintLever(); lightCables();
    if (slug) say.textContent = `Now on ${nameOf(slug)}.`;
  });
  readStreams();

  /* ---- the arrival: the lake, then aboard. Once per tab, unless skipped. */
  size();
  paintSky();
  let seen = false;
  try { seen = session?.getItem(SEEN) === '1'; } catch { /* same */ }
  let firstPlace = null;
  async function arrive() {
    arriving = true;
    try { session?.setItem(SEEN, '1'); } catch { /* same */ }
    intro.hidden = true;
    const k = firstPlace || 'radio';
    showBanner(k);
    await fly(pose(k), reduced ? 0 : 2400);
    hideBanner();
    place = k; mode = 'room'; arriving = false; markPlace(k);
    openPanel(k); paintDock();
  }
  if (seen) Object.assign(cv, pose('radio'));
  else {
    Object.assign(cv, lakePose());
    arriving = true;
    intro.hidden = false;
    const go = () => { if (arriving && !intro.hidden) arrive(); };
    intro.querySelector('.b-aboard').addEventListener('click', go);
    intro.querySelector('.b-skip').addEventListener('click', () => { if (!arriving) return; tween = null; intro.hidden = true; Object.assign(cv, pose(firstPlace || 'radio')); place = firstPlace || 'radio'; arriving = false; markPlace(place); openPanel(place); paintDock(); });
    setTimeout(go, reduced ? 0 : 1800);
  }
  intro.querySelector('.b-aboard').addEventListener('click', () => { if (!arriving && place === 'lake') pick(prev || 'radio'); });
  applyCam();
  paintNow();
  requestAnimationFrame(frame);

  const api = {
    root,
    get current() { return place; },
    get frozen() { return frozen; },
    get frames() { return frames; },
    get clipped() { return clipped; },
    get sky() { return skyNow; },
    get ripples() { return lake.ripples.length; },
    get lastError() { return lastError; },
    /** The router's question: where does this page go? Into the panel; the camera goes to its thing. */
    show(match) {
      const k = placeOf(match.name, match.params);
      if (arriving) firstPlace = k;
      else if (seen && place === null) { place = k; markPlace(k); Object.assign(cv, pose(k)); applyCam(); requestAnimationFrame(() => { openPanel(k); paintDock(); }); }
      else goTo(k);
      return { box, focus: () => box.focus({ preventScroll: true }) };
    },
    mounted() {},
    choose,
  };
  return api;
}
