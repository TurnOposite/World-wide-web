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
import { PLACES, ORDER, FRONT, placeOf, routeOf, project, poseFor, buildBoat, Lake, cross, norm, D2R } from './scene.js';

const SEEN = 'gt.boat.seen';
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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
        <pattern id="bHst" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)"><rect width="46" height="46" fill="#38445a"/><rect width="46" height="8" fill="#d2c9b2"/><rect y="24" width="46" height="3" fill="#8fa1b4"/></pattern>
        <pattern id="bHst2" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><rect width="46" height="46" fill="#38445a"/><rect width="46" height="8" fill="#d2c9b2"/><rect y="24" width="46" height="3" fill="#8fa1b4"/></pattern></defs>
        <g class="b-rock anim"><path d="M-20 110 C 110 160, 250 250, 430 380 L -20 380 Z" fill="url(#bHst)"/><path d="M-20 110 C 110 160, 250 250, 430 380" fill="none" stroke="#8b7350" stroke-width="7"/>
        <path d="M1220 190 C 1090 230, 960 300, 860 380 L 1220 380 Z" fill="url(#bHst2)"/><path d="M1220 190 C 1090 230, 960 300, 860 380" fill="none" stroke="#8b7350" stroke-width="7"/></g></svg></div>
    </div>
    <div class="b-labels"></div>
    <section class="b-panel" hidden><div class="b-box" tabindex="-1"></div></section>
    <div class="b-banner" aria-hidden="true"><svg class="b-brush" viewBox="0 0 1000 160" preserveAspectRatio="none"><defs><filter id="bRough" x="-5%" y="-30%" width="110%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.22" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="22"/></filter></defs><path d="M10 74 C 160 34, 420 46, 990 52 L 994 112 C 640 128, 330 140, 18 126 Z" fill="#141b1c" fill-opacity=".9" filter="url(#bRough)"/></svg>
      <span class="b-seal b-bseal"></span><span><span class="b-bname"></span><span class="b-bsub"></span></span></div>
    <header class="b-hud">
      <a class="b-brand" href="?boat=0"><span class="b-seal">船</span><span>Radio Tower<small>Back to the map</small></span></a>
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
  buildBoat(cam);
  const lake = new Lake($('.b-env'), { reduced });

  let W = 0, H = 0, P = 1000, phone = false;
  const cv = { x: 0, y: 0, z: 0, yaw: 0, pd: 0, roll: 0 };
  let tween = null, worldT = 3.1, frozen = false, dirty = true;
  let place = null, mode = 'room', busy = false, prev = 'radio', queued = null, arriving = false;

  const proj = (p, pose = cv) => project(pose, p, W, H, P);
  const pose = (k) => {
    if (k === 'lake') return lakePose();
    return poseFor(k, { W, H: H - 60, P, fitW: phone ? 0.72 : 0.8, fitH: phone ? 0.46 : 0.76 });
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
      for (const k of FRONT) { const a = PLACES[k].c; const e = Math.atan2(a[1] - p.y, Math.hypot(p.z - a[2], a[0] - p.x)) / D2R; lo = Math.min(lo, e); hi = Math.max(hi, e); }
      p.pd = (lo + hi) / 2 + 2;
      if (FRONT.every((k) => { const q = proj(PLACES[k].c, p); return q && q.x > W * 0.1 && q.x < W * 0.9 && q.y > H * 0.2 && q.y < H * 0.78; })) break;
    }
    return p;
  }

  function applyCam() {
    cam.style.transform = `translateZ(${P}px) rotateZ(${cv.roll}deg) rotateX(${-cv.pd}deg) rotateY(${cv.yaw}deg) translate3d(${-cv.x}px,${-cv.y}px,${-cv.z}px)`;
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
  // A device that cannot draw the flight (three frames in a row slower than 150 ms) gets a cut instead of a stutter.
  let slow = 0, lastStep = 0;
  function stepTween(now) {
    if (!tween) return;
    slow = lastStep && now - lastStep > 150 ? slow + 1 : 0;
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
    const p = proj(PLACES[k].c); if (!p) return;
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
  function panelRect(from) {
    if (phone) return { x: 10, y: 56, w: W - 20, h: H - 56 - 70 };
    const w = Math.min(W - 48, Math.max(620, from.w)), h = Math.min(H - 150, Math.max(H * 0.66, from.h));
    const cx = Math.min(W - 24 - w / 2, Math.max(24 + w / 2, from.x + from.w / 2));
    const cy = Math.min(H - 84 - h / 2, Math.max(64 + h / 2, from.y + from.h / 2));
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  const setRect = (el, r) => Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  let openOn = null;
  function openPanel(k) {
    const from = screenRect(k); if (!from) return;
    const to = panelRect(from);
    panel.dataset.place = k;
    setRect(panel, to); panel.hidden = false; openOn = k;
    panel.style.transition = 'none'; panel.style.opacity = '0'; panel.style.transformOrigin = '0 0';
    panel.style.transform = `translate(${from.x - to.x}px,${from.y - to.y}px) scale(${from.w / to.w},${from.h / to.h})`;
    void panel.offsetWidth;
    panel.style.transition = reduced ? 'opacity .15s linear' : 'transform .46s cubic-bezier(.2,.85,.25,1), opacity .22s ease';
    panel.style.transform = 'none'; panel.style.opacity = '1';
  }
  function closePanel() {
    if (!openOn) return;
    openOn = null;
    panel.style.transition = 'transform .18s ease-in, opacity .18s ease-in';
    panel.style.transformOrigin = '50% 50%'; panel.style.transform = 'scale(.97)'; panel.style.opacity = '0';
    setTimeout(() => { if (!openOn) panel.hidden = true; }, 190);
  }

  /* ---- moving between places */
  async function goTo(k, { route = true } = {}) {
    if (busy) { queued = k; return; }
    if (k === place && mode === 'room' && !frozen && openOn) return;
    busy = true; labels.replaceChildren(); closePanel(); intro.hidden = true;
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
    closePanel(); intro.hidden = true; freeze(true);
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
    const pts = FRONT.map((k) => ({ k, p: proj(PLACES[k].c) })).filter((o) => o.p).sort((a, b) => a.p.y - b.p.y);
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

  /* ---- the dock and the keys */
  dock.innerHTML = ORDER.map((k, i) => `<button class="b-dk" type="button" data-go="${k}" aria-keyshortcuts="${i + 1}" aria-label="${PLACES[k].name}: ${PLACES[k].obj}"><span class="g" aria-hidden="true">${PLACES[k].glyph}</span><span class="t">${PLACES[k].name}</span></button>`).join('')
    + '<button class="b-stop" type="button" aria-keyshortcuts="Escape"><span class="b-seal" aria-hidden="true">停</span><span class="b-stopT">Stop time</span></button>';
  dock.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) pick(b.dataset.go); });
  $('.b-stop').addEventListener('click', choose);
  function paintDock() { dock.querySelectorAll('.b-dk').forEach((b) => b.setAttribute('aria-current', String(b.dataset.go === place && mode === 'room'))); }
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
        if (openOn) { const f = screenRect(openOn); if (f) setRect(panel, panelRect(f)); }
        if (mode === 'choosing') showLabels();
      }
    }, 160);
  });
  let last = performance.now(), visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!frozen && !reduced) worldT += dt;
    const moving = !!tween;
    stepTween(now);
    if (visible && (moving || !frozen || dirty)) { applyCam(); lake.draw(cv, worldT, frozen); dirty = false; }
    requestAnimationFrame(frame);
  }

  /* ---- the arrival: the lake, then aboard. Once per tab, unless skipped. */
  size();
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
    place = k; mode = 'room'; arriving = false;
    openPanel(k); paintDock();
  }
  if (seen) Object.assign(cv, pose('radio'));
  else {
    Object.assign(cv, lakePose());
    arriving = true;
    intro.hidden = false;
    const go = () => { if (arriving && !intro.hidden) arrive(); };
    intro.querySelector('.b-aboard').addEventListener('click', go);
    intro.querySelector('.b-skip').addEventListener('click', () => { if (!arriving) return; tween = null; intro.hidden = true; Object.assign(cv, pose(firstPlace || 'radio')); place = firstPlace || 'radio'; arriving = false; openPanel(place); paintDock(); });
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
    /** The router's question: where does this page go? Into the panel; the camera goes to its thing. */
    show(match) {
      const k = placeOf(match.name);
      if (arriving) firstPlace = k;
      else if (seen && place === null) { place = k; Object.assign(cv, pose(k)); applyCam(); requestAnimationFrame(() => { openPanel(k); paintDock(); }); }
      else goTo(k);
      return { box, focus: () => box.focus({ preventScroll: true }) };
    },
    mounted() {},
    choose,
  };
  return api;
}
