/**
 * The boat's scene (docs/BACKLOG.md F1; the proposal of 2026-11-18): an old Chinese boat on a karst lake, built from
 * about seventy flat planes in CSS 3D, and the lake and mountains painted on a canvas as three panoramic layers that
 * the camera redraws every frame. No WebGL, no library. This file holds the geometry, the places, the projection
 * (the same pinhole as the CSS camera) and the lake; boat.js is the shell that flies between them.
 *
 * World units: y points down, the deck is at 0, the water at 40. A place is the screen of the thing that holds a page:
 * its centre `c`, its right and up vectors `r` and `u`, its size `w` × `h`.
 */
export const D2R = Math.PI / 180;
export const WATER = 40;

export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const ry = (deg) => [Math.cos(deg * D2R), 0, -Math.sin(deg * D2R)];
const c15 = Math.cos(15 * D2R), s15 = Math.sin(15 * D2R), c8 = Math.cos(8 * D2R), s8 = Math.sin(8 * D2R);

/**
 * The places, and the routes each one holds. Zone's five face you from the hammock; Echo is the desk behind you; the
 * lake is the way out. `glyph` is the seal's text, `jp` nothing more than a second line.
 */
export const PLACES = {
  radio: { name: 'Radio', glyph: '電台', obj: 'The laptop on the table', routes: ['radio', 'home'], c: [-30, -115.4, -109.4], r: [1, 0, 0], u: [0, -c15, -s15], w: 140, h: 92 },
  playlists: { name: 'Playlists', glyph: '歌單', obj: 'The little phone', routes: ['playlists'], c: [52, -71 - 48 * c8, -62 - 48 * s8], r: [1, 0, 0], u: [0, -c8, -s8], w: 28, h: 36 },
  antenna: { name: 'Antenna', glyph: '天線', obj: 'The machines on the side', routes: ['antenna', 'zone'], c: [191.9, -62, 54.1], r: ry(-36), u: [0, -1, 0], w: 70, h: 120 },
  ondes: { name: 'Ondes', glyph: '電波', obj: 'The hanging scroll', routes: ['ondes'], c: [-128, -209, 58], r: ry(30), u: [0, -1, 0], w: 46, h: 118 },
  booth: { name: 'Booth', glyph: '燈', obj: 'The lantern', routes: ['booth'], c: [8, -334 + 30 * Math.cos(26.6 * D2R), -20 + 30 * Math.sin(26.6 * D2R)], r: [1, 0, 0], u: [0, -Math.cos(26.6 * D2R), Math.sin(26.6 * D2R)], w: 40, h: 56 },
  echo: { name: 'Echo', glyph: '回聲', obj: 'The desk behind you', routes: ['echo', 'articles', 'presse', 'lectures', 'ecrits', 'portfolio', 'archives', 'atlas'], c: [-20, -49 - 29 * Math.cos(18 * D2R), 455 + 29 * Math.sin(18 * D2R)], r: [-1, 0, 0], u: [0, -Math.cos(18 * D2R), Math.sin(18 * D2R)], w: 84, h: 58 },
  lake: { name: 'The lake', glyph: '湖', obj: 'Step off the boat', routes: [] },
};
export const ORDER = ['radio', 'playlists', 'antenna', 'ondes', 'booth', 'echo', 'lake'];
export const FRONT = ['radio', 'playlists', 'antenna', 'ondes', 'booth'];
/** The place that holds a route; a route no place names opens on the laptop. */
export const placeOf = (route) => ORDER.find((k) => PLACES[k].routes.includes(route)) || 'radio';
/** The page a place opens, by its first route. */
export const routeOf = (place) => ({ radio: 'radio', playlists: 'playlists', antenna: 'antenna', ondes: 'ondes', booth: 'booth', echo: 'echo' }[place] ?? null);

/** Pinhole projection, identical to the CSS camera: translateZ(P) rotateZ(roll) rotateX(-pitch) rotateY(yaw) translate(-C). */
export function project(pose, p, W, H, P, withRoll = true) {
  const vx = p[0] - pose.x, vy = p[1] - pose.y, vz = p[2] - pose.z;
  const yw = pose.yaw * D2R, a = -pose.pd * D2R, r = withRoll ? pose.roll * D2R : 0;
  const x1 = vx * Math.cos(yw) + vz * Math.sin(yw), z1 = -vx * Math.sin(yw) + vz * Math.cos(yw);
  const y2 = vy * Math.cos(a) - z1 * Math.sin(a), z2 = vy * Math.sin(a) + z1 * Math.cos(a);
  const x3 = x1 * Math.cos(r) - y2 * Math.sin(r), y3 = x1 * Math.sin(r) + y2 * Math.cos(r);
  const d = -z2;
  if (d < 2) return null;
  return { x: W / 2 + x3 * P / d, y: H / 2 + y3 * P / d, d };
}

/** The camera pose that frames a place's screen: looking straight at it, from the distance that fits it to `fit`. */
export function poseFor(place, { W, H, P, fitW = 0.8, fitH = 0.76 }) {
  const s = PLACES[place], dir = cross(s.r, s.u);
  const d = P * Math.max(s.w / (fitW * W), s.h / (fitH * H));
  return { x: s.c[0] - dir[0] * d, y: s.c[1] - dir[1] * d, z: s.c[2] - dir[2] * d, yaw: Math.atan2(dir[0], -dir[2]) / D2R, pd: Math.asin(dir[1]) / D2R, roll: 0 };
}

/* ------------------------------------------------------------------------------------------------ the boat's planes */
function parts() {
  const out = [];
  const add = (o) => out.push(o);
  const hullPlan = [[-470, 28, -98], [-235, 150, -42], [290, 156, -46], [492, 82, -84]];
  for (const sign of [-1, 1]) {
    for (let i = 0; i < hullPlan.length - 1; i++) {
      const [z1, x1, s1] = hullPlan[i], [z2, x2, s2] = hullPlan[i + 1];
      const X1 = sign * x1, X2 = sign * x2, dx = X2 - X1, dz = z2 - z1, L = Math.hypot(dx, dz);
      const a = Math.atan2(-dz, dx) / D2R, top = Math.min(s1, s2), h = WATER - top;
      const p1 = ((s1 - top) / h * 100).toFixed(1), p2 = ((s2 - top) / h * 100).toFixed(1);
      add({ cls: 'hull', w: L, h, x: (X1 + X2) / 2, y: (top + WATER) / 2, z: (z1 + z2) / 2, t: `rotateY(${a}deg)`, clip: `polygon(0 ${p1}%,100% ${p2}%,100% 100%,0 100%)` });
      add({ cls: 'hull refl', w: L, h: h * 0.85, x: (X1 + X2) / 2, y: WATER + h * 0.85 / 2, z: (z1 + z2) / 2, t: `rotateY(${a}deg)`, clip: `polygon(0 0,100% 0,100% ${100 - p2}%,0 ${100 - p1}%)` });
    }
  }
  add({ cls: 'hull', w: 56, h: 138, x: 0, y: -29, z: -470 });
  add({ cls: 'hull', w: 164, h: 124, x: 0, y: -22, z: 492 });
  add({ cls: 'deck', w: 300, h: 525, x: 0, y: -1, z: 27.5, t: 'rotateX(90deg)' });
  add({ cls: 'deck', w: 300, h: 235, x: 0, y: -1, z: -352.5, t: 'rotateX(90deg)', clip: 'polygon(40% 0,60% 0,100% 100%,0 100%)' });
  add({ cls: 'deck', w: 312, h: 202, x: 0, y: -1, z: 391, t: 'rotateX(90deg)', clip: 'polygon(0 0,100% 0,76% 100%,24% 100%)' });
  for (const z of [-150, 60, 400]) for (const x of [-148, 148]) {
    add({ cls: 'post', w: 9, h: 290, x, y: -145, z });
    add({ cls: 'post', w: 9, h: 290, x, y: -145, z, t: 'rotateY(90deg)' });
  }
  add({ cls: 'canopy', w: 150, h: 590, x: 0, y: -335, z: 125, t: 'rotateX(90deg)' });
  add({ cls: 'canopy', w: 103.3, h: 590, x: 121.5, y: -312.5, z: 125, t: 'rotateZ(25.8deg) rotateX(90deg)' });
  add({ cls: 'canopy', w: 103.3, h: 590, x: -121.5, y: -312.5, z: 125, t: 'rotateZ(-25.8deg) rotateX(90deg)' });
  for (const x of [-168, 168]) add({ cls: 'beam', w: 590, h: 7, x, y: -287, z: 125, t: 'rotateY(90deg)' });
  add({ cls: 'mast', w: 3, h: 170, x: 40, y: -420, z: 330 });
  add({ cls: 'mast', w: 26, h: 2, x: 40, y: -470, z: 330 });
  add({ cls: '', w: 30, h: 15, x: 56, y: -497, z: 330, html: '<svg viewBox="0 0 30 15" width="30" height="15"><path d="M0 0 L30 7 L0 15Z" fill="#c2432d"/></svg>' });
  // the table, the laptop (Radio), the phone (Playlists), a cup
  add({ cls: 'tabletop', w: 270, h: 150, x: 0, y: -70, z: -40, t: 'rotateX(90deg)' });
  add({ cls: 'tedge', w: 270, h: 12, x: 0, y: -64, z: 35 });
  for (const x of [-120, 120]) for (const z of [28, -108]) add({ cls: 'leg', w: 10, h: 64, x, y: -32, z });
  add({ cls: 'lt-base', w: 140, h: 95, x: -30, y: -71, z: -50, t: 'rotateX(90deg)' });
  add({ cls: '', w: 140, h: 92, x: -30, y: -71, z: -97.5, origin: 'bottom', t: 'rotateX(15deg)',
    html: '<div class="lid"><div class="disp"><b>RADIO TOWER</b><div class="eq anim">' + Array.from({ length: 14 }, (_, i) => `<i style="animation-delay:-${((i * 0.37) % 1.1).toFixed(2)}s;animation-duration:${(0.7 + (i % 5) * 0.13).toFixed(2)}s"></i>`).join('') + '</div><span class="b-now"></span></div></div>' });
  add({ cls: 'ph', w: 34, h: 74, x: 52, y: -71, z: -62, origin: 'bottom', t: 'rotateX(8deg)',
    html: '<div class="ph-ant"></div><div class="ph-led anim"></div><div class="ph-scr"><b>Playlists</b><i></i><i style="width:70%"></i><i></i><i style="width:55%"></i></div><div class="ph-keys"></div>' });
  add({ cls: '', w: 26, h: 34, x: 98, y: -71, z: -28, origin: 'bottom',
    html: '<svg viewBox="0 0 26 34" width="26" height="34"><g class="steam anim" stroke="#fff" stroke-opacity=".7" fill="none" stroke-width="1.2"><path d="M10 15 q-3 -4 0 -8 q3 -4 0 -7"/><path d="M16 15 q3 -4 0 -8 q-3 -4 0 -7"/></g><path d="M3 19 h20 q-1 12 -10 14 q-9 -2 -10 -14z" fill="#9cc2b0"/><ellipse cx="13" cy="19" rx="10" ry="2.4" fill="#5d4532"/></svg>' });
  // the Antenna: machines on the starboard side, on their own platform
  const R = -36;
  add({ cls: 'deck', w: 150, h: 110, x: 230.9, y: -4, z: 51.6, t: `rotateY(${R}deg) rotateX(90deg)`,
    html: '<svg viewBox="0 0 150 110" width="150" height="110" preserveAspectRatio="none"><g fill="none" stroke="#141414" stroke-width="2.2" stroke-linecap="round"><path d="M44 84 C 40 60, 18 46, 14 0"/><path d="M50 86 C 52 58, 34 34, 36 0"/><path d="M56 86 C 64 60, 66 30, 60 0"/></g><g fill="none" stroke="#3fd3c6" stroke-width=".8" opacity=".55"><path d="M44 84 C 40 60, 18 46, 14 0"/><path d="M56 86 C 64 60, 66 30, 60 0"/></g></svg>' });
  add({ cls: 'rack', w: 70, h: 120, x: 191.9, y: -62, z: 54.1, t: `rotateY(${R}deg)`,
    html: `<div class="rk-scr"><b>TX</b><span>天線</span><i class="anim"></i></div>
    <svg class="rk-sel" viewBox="0 0 70 52" width="70" height="52"><path d="M14 44 A 26 26 0 0 1 40 18" fill="none" stroke="#e9e3d2" stroke-width="1.2" opacity=".6"/>
    <g stroke="#e9e3d2" stroke-width="1.4"><line x1="14" y1="16" x2="14" y2="10"/><line x1="32.4" y1="25.6" x2="36.6" y2="21.4"/><line x1="40" y1="44" x2="46" y2="44"/></g>
    <g class="rk-lever"><line x1="14" y1="44" x2="14" y2="19" stroke="#c2432d" stroke-width="3" stroke-linecap="round"/><circle cx="14" cy="19" r="3.4" fill="#c2432d"/></g><circle cx="14" cy="44" r="5" fill="#2b2b2b" stroke="#777" stroke-width="1"/></svg>
    <div class="rk-vu anim">${'<i></i>'.repeat(9)}</div><div class="rk-sock"><i></i><i></i><i></i></div>` });
  add({ cls: 'rack side', w: 40, h: 120, x: 232, y: -62, z: 58.5, t: 'rotateY(54deg)' });
  add({ cls: 'rack top', w: 70, h: 40, x: 203.7, y: -122, z: 37.9, t: `rotateY(${R}deg) rotateX(90deg)` });
  add({ cls: 'rack mon', w: 40, h: 26, x: 195.4, y: -135, z: 49.2, t: `rotateY(${R}deg)`, html: '<div class="mon-scr"><b>ANTENNA</b><span>streams on air</span></div>' });
  add({ cls: 'rack', w: 46, h: 84, x: 250.3, y: -44, z: 79.3, t: `rotateY(${R}deg)`,
    html: `<div class="srv">${Array.from({ length: 7 }, (_, i) => `<div class="blade"><i class="anim" style="animation-delay:-${((i * 0.53) % 1.7).toFixed(2)}s"></i><i class="anim g" style="animation-delay:-${((i * 0.31) % 1.3).toFixed(2)}s"></i><span></span></div>`).join('')}</div>` });
  add({ cls: 'rack side', w: 36, h: 84, x: 279.5, y: -44, z: 78.2, t: 'rotateY(54deg)' });
  add({ cls: '', w: 70, h: 125, x: 262.1, y: -172, z: 68, t: `rotateY(${R}deg)`,
    html: '<svg viewBox="0 0 70 125" width="70" height="125"><g fill="none" stroke="#141414" stroke-width="1.6"><path d="M2 123 Q 30 110 68 8"/><path d="M8 124 Q 40 118 68 22"/></g></svg>' });
  add({ cls: 'mast', w: 4, h: 300, x: 292.3, y: -152, z: 77.6 });
  add({ cls: 'mast', w: 4, h: 300, x: 292.3, y: -152, z: 77.6, t: 'rotateY(90deg)' });
  for (const [y, w] of [[-282, 44], [-258, 30], [-236, 20]]) add({ cls: 'mast', w, h: 3, x: 292.3, y, z: 77.6, t: `rotateY(${R}deg)` });
  add({ cls: '', w: 220, h: 220, x: 292.3, y: -300, z: 77.6, t: `rotateY(${R}deg)`, html: '<div class="rings anim"><i></i><i></i><i></i></div>' });
  // the hanging scroll (Ondes) and the lantern (Booth) swing from pivots
  add({ cls: 'string', w: 1.5, h: 42, x: -128, y: -289, z: 58 });
  add({ pivot: true, x: -128, y: -268, z: 58, t: 'rotateY(30deg)', child: { cls: 'sway anim', w: 46, h: 118, origin: 'top',
    html: `<svg viewBox="0 0 46 118" width="46" height="118"><path d="M23 0 L9 7 M23 0 L37 7" stroke="#2a2018" stroke-width=".8"/><rect x="3" y="6" width="40" height="4" rx="2" fill="#3b2a1d"/><rect x="5" y="10" width="36" height="97" fill="#4b7d6d"/><rect x="9" y="17" width="28" height="83" fill="#ece4cf"/>
    <text x="23" y="37" font-family="Ma Shan Zheng, KaiTi, serif" font-size="14" text-anchor="middle" fill="#1d1a16">電</text><text x="23" y="54" font-family="Ma Shan Zheng, KaiTi, serif" font-size="14" text-anchor="middle" fill="#1d1a16">波</text>
    <g stroke="#5a5247" stroke-width=".7"><line x1="14" y1="62" x2="14" y2="94"/><line x1="18" y1="62" x2="18" y2="88"/><line x1="23" y1="62" x2="23" y2="92"/><line x1="28" y1="62" x2="28" y2="84"/></g><rect x="29" y="88" width="6" height="6" fill="#c2432d"/>
    <rect x="2" y="105" width="42" height="6" rx="3" fill="#3b2a1d"/></svg>` } });
  add({ pivot: true, x: 8, y: -334, z: -20, t: 'rotateX(-26.6deg)', child: { cls: 'swing anim', w: 40, h: 64, origin: 'top',
    html: `<div class="lamp-glow"></div><svg viewBox="0 0 40 64" width="40" height="64" style="position:relative"><defs><radialGradient id="bLg" cx=".45" cy=".45" r=".6"><stop offset="0" stop-color="#ffd79a"/><stop offset=".45" stop-color="#e2553a"/><stop offset="1" stop-color="#8e2318"/></radialGradient></defs>
    <line x1="20" y1="0" x2="20" y2="10" stroke="#2a2018" stroke-width=".8"/><rect x="13" y="9" width="14" height="4" rx="1" fill="#c9a24a"/><ellipse cx="20" cy="30" rx="16" ry="18" fill="url(#bLg)"/>
    <rect x="13" y="46" width="14" height="4" rx="1" fill="#c9a24a"/><path d="M20 50 v12" stroke="#c2432d" stroke-width="2"/></svg>` } });
  // the hammock across the stern posts, and the writing desk behind it (Echo)
  add({ cls: 'hm', w: 173, h: 60, x: -74, y: -155, z: 380, t: 'rotateZ(31.3deg) rotateX(90deg)' });
  add({ cls: 'hm', w: 173, h: 60, x: 74, y: -155, z: 380, t: 'rotateZ(-31.3deg) rotateX(90deg)' });
  add({ cls: 'tabletop', w: 170, h: 70, x: 0, y: -48, z: 440, t: 'rotateX(90deg)' });
  add({ cls: 'tedge', w: 170, h: 48, x: 0, y: -24, z: 405, t: 'rotateY(180deg)' });
  add({ cls: '', w: 84, h: 58, x: -20, y: -49, z: 455, origin: 'bottom', t: 'rotateY(180deg) rotateX(18deg)',
    html: '<div class="np"><b>Echo</b><strong>La une</strong><span></span><span></span><span></span></div>' });
  add({ cls: '', w: 64, h: 46, x: 112, y: -1, z: 430, origin: 'bottom', t: 'rotateY(205deg)',
    html: '<svg viewBox="0 0 64 46" width="64" height="46"><g fill="#2a2a2a"><rect x="8" y="2" width="3" height="20"/><rect x="12" y="4" width="3" height="18"/><rect x="16" y="1" width="3" height="21"/></g><g fill="#7b2d26"><rect x="34" y="5" width="6" height="17"/></g><g fill="#c9a24a"><rect x="47" y="3" width="6" height="19"/></g><rect x="2" y="16" width="60" height="30" fill="#8a6440"/></svg>' });
  return out;
}

function mk(o, el = document.createElement('div')) {
  el.className = 'o ' + (o.cls || '');
  el.style.width = o.w + 'px'; el.style.height = o.h + 'px';
  el.style.marginLeft = (-o.w / 2) + 'px';
  el.style.marginTop = (o.origin === 'bottom' ? -o.h : o.origin === 'top' ? 0 : -o.h / 2) + 'px';
  el.style.transformOrigin = o.origin === 'bottom' ? '50% 100%' : o.origin === 'top' ? '50% 0' : '50% 50%';
  if (o.x !== undefined) el.style.transform = `translate3d(${o.x}px,${o.y}px,${o.z}px) ${o.t || ''}`;
  if (o.clip) { el.style.clipPath = o.clip; el.style.webkitClipPath = o.clip; }
  if (o.html) el.innerHTML = o.html;
  return el;
}

/** Puts the boat's planes into the camera element. */
export function buildBoat(cam) {
  for (const o of parts()) {
    if (o.pivot) {
      const pv = document.createElement('div');
      pv.className = 'pv';
      pv.style.transform = `translate3d(${o.x}px,${o.y}px,${o.z}px) ${o.t || ''}`;
      pv.appendChild(mk(o.child));
      cam.appendChild(pv);
    } else cam.appendChild(mk(o));
  }
}

/* ------------------------------------------------------------------------------------------- the lake, on a canvas */
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const LAYERS = [
  { seed: 11, R: 2800, w: [0.16, 0.40], h: [0.06, 0.19], gap: 0.1, top: '#a8b7b4', mid: '#bac6c2', base: '#cdd6d2', refl: 0.26, mist: 0.07, mistA: 0.9 },
  { seed: 23, R: 1900, w: [0.12, 0.30], h: [0.09, 0.24], gap: 0.3, top: '#738c86', mid: '#91a69f', base: '#b9c6c1', refl: 0.36, mist: 0.1, mistA: 0.85, ink: '#4a625e' },
  { seed: 37, R: 1200, w: [0.14, 0.32], h: [0.15, 0.37], gap: 0.52, top: '#38504c', mid: '#556e67', base: '#8fa29c', refl: 0.48, mist: 0.12, mistA: 0.72, veg: '#203430', ink: '#1d2e2b' },
];
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

function karst(g, cx, base, pk, L, r) {
  const { w, h, q, ph } = pk, n = 40;
  g.beginPath(); g.moveTo(cx - w / 2, base);
  for (let i = 0; i <= n; i++) {
    const t = -1 + 2 * i / n, prof = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.3)), q);
    g.lineTo(cx + t * w / 2, base - h * prof * (1 + 0.035 * Math.sin(t * 9 + ph)));
  }
  g.lineTo(cx + w / 2, base); g.closePath();
  const gr = g.createLinearGradient(0, base - h, 0, base);
  gr.addColorStop(0, L.top); gr.addColorStop(0.68, L.mid); gr.addColorStop(1, L.base);
  g.fillStyle = gr; g.fill();
  const sg = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  sg.addColorStop(0, 'rgba(255,255,255,.12)'); sg.addColorStop(0.55, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(0,24,24,.14)');
  g.fillStyle = sg; g.fill();
  if (L.veg) {
    g.save(); g.clip(); g.fillStyle = L.veg;
    for (let i = 0; i < w * h / 80; i++) { const x = cx + (r() - 0.5) * w, y = base - r() * h * 0.95; g.globalAlpha = 0.05 + r() * 0.13; g.beginPath(); g.arc(x, y, 0.5 + r() * 1.5, 0, 6.3); g.fill(); }
    g.restore();
  }
  if (L.ink) { g.save(); g.strokeStyle = L.ink; g.globalAlpha = 0.4; g.lineWidth = 1; g.stroke(); g.restore(); }
}

function paintLayer(L, k) {
  const Wp = Math.round(2 * Math.PI * k), hY = Math.round(0.64 * k), Hp = Math.round(1.16 * k);
  const c = document.createElement('canvas'); c.width = Wp; c.height = Hp;
  const g = c.getContext('2d'), r = rng(L.seed), peaks = [];
  let u = r() * k * 0.2;
  while (u < Wp) {
    const w = k * (L.w[0] + r() * (L.w[1] - L.w[0]));
    if (r() < L.gap) { u += w * 0.9; continue; }
    peaks.push({ cx: u + w / 2, w, h: k * (L.h[0] + r() * (L.h[1] - L.h[0])), q: 0.42 + r() * 0.36, ph: r() * 6 });
    u += w * (0.36 + r() * 0.44);
  }
  for (const pk of peaks) for (const off of [-Wp, 0, Wp]) if (pk.cx + off + pk.w > 0 && pk.cx + off - pk.w < Wp) karst(g, pk.cx + off, hY, pk, L, r);
  const mg = g.createLinearGradient(0, hY - k * L.mist, 0, hY);
  mg.addColorStop(0, 'rgba(216,224,220,0)'); mg.addColorStop(1, `rgba(216,224,220,${L.mistA})`);
  g.fillStyle = mg; g.fillRect(0, hY - k * L.mist, Wp, k * L.mist);
  const tmp = document.createElement('canvas'); tmp.width = Wp; tmp.height = hY; tmp.getContext('2d').drawImage(c, 0, 0);
  g.save(); g.globalAlpha = L.refl; g.setTransform(1, 0, 0, -0.8, 0, hY * 1.8); g.drawImage(tmp, 0, 0); g.restore();
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 320; i++) { const y = hY + 2 + Math.pow(r(), 1.5) * (Hp - hY), x = r() * Wp; g.globalAlpha = 0.2 + r() * 0.55; g.fillRect(x, y, k * (0.02 + r() * 0.14), 1 + r() * 1.6); }
  g.restore();
  return { c, Wp, hY, Hp, R: L.R };
}

/** The lake: sky, three ranges of karsts with their reflections, mist, birds, glints, and a drop that rings the water. */
export class Lake {
  constructor(canvas, { reduced = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reduced;
    this.layers = [];
    this.k = 500;
    this.birds = Array.from({ length: 8 }, (_, i) => ({ b: -0.55 + i * 0.3 + Math.random() * 0.1, e: 0.09 + Math.random() * 0.13, v: 0.01 + Math.random() * 0.01, ph: Math.random() * 6, s: 0.8 + Math.random() * 0.5 }));
    this.glints = Array.from({ length: 90 }, () => { const a = Math.random() * 6.283, rr = 240 + Math.pow(Math.random(), 0.7) * 950; return { x: Math.sin(a) * rr, z: -Math.cos(a) * rr * 1.15 - 80, ph: Math.random() * 6, l: 8 + Math.random() * 16 }; });
  }

  size(W, H, P, dpr) {
    Object.assign(this, { W, H, P, dpr });
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    // A panorama is painted mountain by mountain along its width: with no width there is nothing to paint, and the
    // painter would never get to the end of it (2026-11-18, a boat measured before its CSS).
    const k = Math.max(40, Math.round(P / 2));
    if (k !== this.k || !this.layers.length) { this.k = k; this.layers = LAYERS.map((L) => paintLayer(L, k)); }
  }

  /** One frame for camera `cv` at world time `t`; `frozen` draws what was moving with the trails of a stopped instant. */
  draw(cv, t, frozen) {
    const { ctx: g, W, H, P, k } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sway = this.reduced ? 0 : Math.sin(t * 0.7) * 0.45 + Math.sin(t * 0.31) * 0.25;
    const yaw = cv.yaw * D2R, pd = cv.pd * D2R;
    const l = Math.hypot(cv.x, cv.z), f = l > 320 ? 320 / l : 1, C = { x: cv.x * f, y: cv.y, z: cv.z * f };
    const pose = { ...cv, roll: 0 };
    g.save(); g.translate(W / 2, H / 2); g.rotate((cv.roll + sway) * D2R); g.translate(-W / 2, -H / 2);
    const hz = (R) => H / 2 + P * Math.tan(Math.atan((WATER - C.y) / R) - pd);
    const hFar = hz(4200);
    const sky = g.createLinearGradient(0, hFar - P * 0.9, 0, hFar);
    sky.addColorStop(0, '#9cafad'); sky.addColorStop(0.65, '#c9d3cf'); sky.addColorStop(1, '#dfe5e0');
    g.fillStyle = sky; g.fillRect(-W, -H * 2, W * 3, hFar + H * 2);
    const sx = W / 2 + wrap(2.25 - yaw) * P, sy = hFar - 0.15 * P;
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, P * 0.55);
    sg.addColorStop(0, 'rgba(255,250,236,.75)'); sg.addColorStop(1, 'rgba(255,250,236,0)');
    g.fillStyle = sg; g.fillRect(sx - P * 0.6, sy - P * 0.6, P * 1.2, P * 1.2);
    const wg = g.createLinearGradient(0, hFar, 0, H + P * 0.3);
    wg.addColorStop(0, '#d2dbd6'); wg.addColorStop(0.3, '#aebdb8'); wg.addColorStop(1, '#5f7672');
    g.fillStyle = wg; g.fillRect(-W, hFar, W * 3, H * 3);
    const right = [Math.cos(yaw), Math.sin(yaw)], fwd = [Math.sin(yaw), -Math.cos(yaw)];
    const lat = C.x * right[0] + C.z * right[1], fw = C.x * fwd[0] + C.z * fwd[1];
    this.layers.forEach((Ly, i) => {
      const sc = Ly.R / Math.max(Ly.R * 0.5, Ly.R - fw), k2 = P * sc / k, imgW = Ly.Wp * k2, hy = hz(Ly.R);
      let x0 = W / 2 - yaw * k * k2 - P * lat / Ly.R;
      x0 = ((x0 % imgW) + imgW) % imgW - imgW;
      for (let x = x0 - imgW; x < W * 1.4; x += imgW) g.drawImage(Ly.c, x, hy - Ly.hY * k2, imgW, Ly.Hp * k2);
      if (i === 0) this.birdsAt(g, yaw, hFar, t, frozen);
      if (i === 1) this.mistAt(g, yaw, hy, t);
    });
    this.glintsAt(g, pose, t);
    this.dropAt(g, pose, t, frozen);
    g.restore();
  }

  birdsAt(g, yaw, hFar, t, frozen) {
    const { W, P } = this;
    g.strokeStyle = '#2a3838'; g.lineWidth = 1.4; g.lineCap = 'round';
    for (const bd of this.birds) {
      for (const j of frozen ? [2, 1, 0] : [0]) {
        const tt = t - j * 0.1, b = bd.b + tt * bd.v, flap = Math.sin(tt * 9 * bd.s + bd.ph);
        const dx = wrap(b - yaw); if (Math.abs(dx) > 1.3) continue;
        const x = W / 2 + dx * P, y = hFar - bd.e * P - Math.sin(tt * 0.6 + bd.ph) * 5, sz = 4 + 6 * bd.s * P / 1000;
        g.globalAlpha = j === 0 ? 0.85 : j === 1 ? 0.3 : 0.14;
        g.beginPath(); g.moveTo(x - sz, y - flap * sz * 0.55); g.quadraticCurveTo(x - sz * 0.4, y - sz * 0.2, x, y); g.quadraticCurveTo(x + sz * 0.4, y - sz * 0.2, x + sz, y - flap * sz * 0.55); g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  mistAt(g, yaw, hy, t) {
    const { W, P } = this;
    for (let i = 0; i < 7; i++) {
      const dx = wrap(i * 0.9 + t * 0.006 - yaw) * P; if (Math.abs(dx) > W) continue;
      const x = W / 2 + dx, y = hy - 6 - (i % 3) * 12, rx = P * 0.5;
      const gr = g.createRadialGradient(x, y, 0, x, y, rx);
      gr.addColorStop(0, 'rgba(234,239,235,.42)'); gr.addColorStop(1, 'rgba(234,239,235,0)');
      g.save(); g.translate(x, y); g.scale(1, 0.07); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rx, 0, 6.283); g.fill(); g.restore();
    }
  }

  glintsAt(g, pose, t) {
    const { W, H, P } = this;
    g.strokeStyle = '#f2f6f2'; g.lineWidth = 1;
    for (const gl of this.glints) {
      const p = project(pose, [gl.x + Math.sin(t * 0.3 + gl.ph) * 6, WATER, gl.z], W, H, P, false); if (!p) continue;
      const a = Math.sin(t * 1.2 + gl.ph); if (a < 0.08) continue;
      const L = gl.l * P / p.d; if (L < 0.8) continue;
      g.globalAlpha = a * 0.5; g.beginPath(); g.moveTo(p.x - L, p.y); g.lineTo(p.x + L, p.y); g.stroke();
    }
    g.globalAlpha = 1;
  }

  dropAt(g, pose, t, frozen) {
    const { W, H, P } = this, D = [70, WATER, -560], T = 4.2, tt0 = t % T;
    if (tt0 < 0.55) {
      for (const j of frozen ? [2, 1, 0] : [0]) {
        const tt = Math.max(0, tt0 - j * 0.06), y = WATER - 95 + 95 * Math.pow(tt / 0.55, 2);
        const p = project(pose, [D[0], y, D[2]], W, H, P, false); if (!p) continue;
        const s = Math.max(1.2, 5 * P / p.d);
        g.globalAlpha = j ? 0.25 / j : 0.9; g.fillStyle = '#eef4f0';
        g.beginPath(); g.ellipse(p.x, p.y, s * 0.6, s, 0, 0, 6.283); g.fill();
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const age = tt0 - 0.55 - i * 0.35; if (age < 0) continue;
        const rad = 8 + age * 55, al = Math.max(0, 1 - age / 2.6) * 0.65; if (al <= 0) continue;
        g.globalAlpha = al; g.strokeStyle = '#f4f8f4'; g.lineWidth = 1.2; g.beginPath();
        let started = false;
        for (let a = 0; a <= 24; a++) {
          const th = a / 24 * 6.283, p = project(pose, [D[0] + Math.cos(th) * rad, WATER, D[2] + Math.sin(th) * rad], W, H, P, false);
          if (!p) { started = false; continue; }
          if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
        }
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
}
