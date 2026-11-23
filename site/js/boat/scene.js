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

/* --------------------------------------------------------------------------------- the sky on the station's clock */
/**
 * The lake's light through a broadcast day, Paris time (Ortis, 2026-11-22: « have the lake follow the station's clock
 * with dawn at 6 a.m. and a lot of stars at night … the stars are the main focus »). Keyframes in minutes after
 * midnight; between two, every colour and amount is mixed. `star` is how much of the night sky shows, `dark` how far
 * the karsts sink into the night, `lant` the far lanterns in the mountains, `sunA`/`sunEl` the glow low on the sky.
 */
const SKY = [
  [0, { top: '#03050f', mid: '#0a1230', hor: '#1b2550', wHor: '#141d3c', wMid: '#09112a', wNear: '#03060f', star: 1, dark: 0.84, lant: 1, sun: '#9fb4ff', sunA: 0.12, sunEl: 0.42, mist: '#7f90c0', rip: '#c9dbff' }],
  [270, { top: '#03050f', mid: '#0b1432', hor: '#1e2a56', wHor: '#151f40', wMid: '#09112a', wNear: '#03060f', star: 0.95, dark: 0.82, lant: 0.9, sun: '#9fb4ff', sunA: 0.1, sunEl: 0.42, mist: '#7f90c0', rip: '#c9dbff' }],
  [330, { top: '#0e1a3e', mid: '#2c3d70', hor: '#8f7590', wHor: '#5f5b7c', wMid: '#2b3454', wNear: '#10172a', star: 0.45, dark: 0.6, lant: 0.45, sun: '#ffb48a', sunA: 0.35, sunEl: -0.02, mist: '#a59cb8', rip: '#e8dcf0' }],
  [360, { top: '#3b5c8e', mid: '#c48ca2', hor: '#ffc59a', wHor: '#f1b99a', wMid: '#8c8aa8', wNear: '#3e4a5e', star: 0.08, dark: 0.28, lant: 0.08, sun: '#ffd0a0', sunA: 0.85, sunEl: 0.03, mist: '#f3d6cf', rip: '#fff0e4' }],
  [420, { top: '#8fb0c4', mid: '#c6d4d2', hor: '#f1e6d6', wHor: '#e2dfd4', wMid: '#a9b8b4', wNear: '#5f7672', star: 0, dark: 0.04, lant: 0, sun: '#fff4e0', sunA: 0.7, sunEl: 0.1, mist: '#eaefeb', rip: '#f4f8f4' }],
  [600, { top: '#9cafad', mid: '#c9d3cf', hor: '#dfe5e0', wHor: '#d2dbd6', wMid: '#aebdb8', wNear: '#5f7672', star: 0, dark: 0, lant: 0, sun: '#fffaec', sunA: 0.75, sunEl: 0.15, mist: '#eaefeb', rip: '#f4f8f4' }],
  [960, { top: '#9cafad', mid: '#c9d3cf', hor: '#dfe5e0', wHor: '#d2dbd6', wMid: '#aebdb8', wNear: '#5f7672', star: 0, dark: 0, lant: 0, sun: '#fffaec', sunA: 0.75, sunEl: 0.15, mist: '#eaefeb', rip: '#f4f8f4' }],
  [1050, { top: '#94aab0', mid: '#d0d2c4', hor: '#eadcc0', wHor: '#ddd5c0', wMid: '#aab3a8', wNear: '#5c6b66', star: 0, dark: 0.05, lant: 0, sun: '#ffe2b0', sunA: 0.8, sunEl: 0.08, mist: '#efe6d6', rip: '#f8f2e6' }],
  [1110, { top: '#6f7fa8', mid: '#d39a8a', hor: '#f6b47a', wHor: '#e4a88a', wMid: '#8f8394', wNear: '#3b4152', star: 0.05, dark: 0.26, lant: 0.2, sun: '#ffb070', sunA: 0.9, sunEl: 0.01, mist: '#f0c8b4', rip: '#ffe6d6' }],
  [1170, { top: '#1f2c5a', mid: '#4a4f86', hor: '#b07a90', wHor: '#6d5f80', wMid: '#333b62', wNear: '#141a30', star: 0.4, dark: 0.6, lant: 0.7, sun: '#ff9a7a', sunA: 0.3, sunEl: -0.02, mist: '#a99ab8', rip: '#e6dcf4' }],
  [1230, { top: '#060a1c', mid: '#0f193c', hor: '#25305c', wHor: '#1a2446', wMid: '#0c1430', wNear: '#050812', star: 0.9, dark: 0.8, lant: 1, sun: '#9fb4ff', sunA: 0.12, sunEl: 0.42, mist: '#7f90c0', rip: '#c9dbff' }],
  [1440, { top: '#03050f', mid: '#0a1230', hor: '#1b2550', wHor: '#141d3c', wMid: '#09112a', wNear: '#03060f', star: 1, dark: 0.84, lant: 1, sun: '#9fb4ff', sunA: 0.12, sunEl: 0.42, mist: '#7f90c0', rip: '#c9dbff' }],
];
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mixHex = (a, b, f) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * f).toString(16).padStart(2, '0')).join('');

/** The sky at `min` minutes after midnight, Paris time. */
export function skyAt(min) {
  const m = ((min % 1440) + 1440) % 1440;
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1][0] <= m) i++;
  const [m0, a] = SKY[i], [m1, b] = SKY[i + 1], f = m1 > m0 ? (m - m0) / (m1 - m0) : 0;
  const out = {};
  for (const k of Object.keys(a)) out[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * f : mixHex(a[k], b[k], f);
  return out;
}

/** Minutes after midnight in Paris, from `?sky=HH:MM` when the address gives one (to see the night by day). */
export function skyMinutes(now = new Date(), search = '') {
  const m = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(search).get('sky') || '');
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return Number(m[1]) * 60 + Number(m[2]);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  return get('hour') * 60 + get('minute');
}

/* ------------------------------------------------------------------------- the Antenna's lever for the streams */
/** The lever's three positions (2026-11-18, his correction): straight up, 45° right, 90° right — one per stream. */
export const LEVER = [0, 45, 90];
/** Which position stands for the stream on now, among the streams on air in their order; -1 when it is none of them. */
export function leverIndex(slugs, current) {
  const i = slugs.indexOf(current);
  return i >= 0 && i < LEVER.length ? i : -1;
}

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

/** How far in front of the eye a point is (the camera's depth), behind it negative: the projection's own math. */
export function depthOf(pose, p) {
  const vx = p[0] - pose.x, vy = p[1] - pose.y, vz = p[2] - pose.z;
  const yw = pose.yaw * D2R, a = -pose.pd * D2R;
  const z1 = -vx * Math.sin(yw) + vz * Math.cos(yw);
  return -(vy * Math.sin(a) + z1 * Math.cos(a));
}

/**
 * The camera pose that frames a place's screen: looking straight at it, from the distance that fits it to `fit`, and
 * never nearer than `minD` (2026-11-22): framing the little phone to 80 % of the screen put the camera 70 units from it,
 * everything around it magnified twenty times and more, and an ordinary laptop GPU drew one frame a second. The page is
 * lifted onto its own 620 px panel anyway, so the thing can stay smaller than the panel.
 */
export function poseFor(place, { W, H, P, fitW = 0.8, fitH = 0.76, minD = 0 }) {
  const s = PLACES[place], dir = cross(s.r, s.u);
  const d = Math.max(minD, P * Math.max(s.w / (fitW * W), s.h / (fitH * H)));
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
  add({ go: 'radio', cls: 'lt-base', w: 140, h: 95, x: -30, y: -71, z: -50, t: 'rotateX(90deg)' });
  add({ go: 'radio', cls: '', w: 140, h: 92, x: -30, y: -71, z: -97.5, origin: 'bottom', t: 'rotateX(15deg)',
    html: '<div class="lid"><div class="disp"><b>RADIO TOWER</b><div class="eq anim">' + Array.from({ length: 14 }, (_, i) => `<i style="animation-delay:-${((i * 0.37) % 1.1).toFixed(2)}s;animation-duration:${(0.7 + (i % 5) * 0.13).toFixed(2)}s"></i>`).join('') + '</div><span class="b-now"></span></div></div>' });
  add({ go: 'playlists', cls: 'ph', w: 34, h: 74, x: 52, y: -71, z: -62, origin: 'bottom', t: 'rotateX(8deg)',
    html: '<div class="ph-ant"></div><div class="ph-led anim"></div><div class="ph-scr"><b>Playlists</b><i></i><i style="width:70%"></i><i></i><i style="width:55%"></i></div><div class="ph-keys"></div>' });
  add({ cls: '', w: 26, h: 34, x: 98, y: -71, z: -28, origin: 'bottom',
    html: '<svg viewBox="0 0 26 34" width="26" height="34"><g class="steam anim" stroke="#fff" stroke-opacity=".7" fill="none" stroke-width="1.2"><path d="M10 15 q-3 -4 0 -8 q3 -4 0 -7"/><path d="M16 15 q3 -4 0 -8 q-3 -4 0 -7"/></g><path d="M3 19 h20 q-1 12 -10 14 q-9 -2 -10 -14z" fill="#9cc2b0"/><ellipse cx="13" cy="19" rx="10" ry="2.4" fill="#5d4532"/></svg>' });
  // the Antenna: machines on the starboard side, on their own platform
  const R = -36;
  add({ cls: 'deck', w: 150, h: 110, x: 230.9, y: -4, z: 51.6, t: `rotateY(${R}deg) rotateX(90deg)`,
    html: '<svg viewBox="0 0 150 110" width="150" height="110" preserveAspectRatio="none"><g fill="none" stroke="#141414" stroke-width="2.2" stroke-linecap="round"><path d="M44 84 C 40 60, 18 46, 14 0"/><path d="M50 86 C 52 58, 34 34, 36 0"/><path d="M56 86 C 64 60, 66 30, 60 0"/></g><g class="cab" fill="none" stroke="#3fd3c6" stroke-width=".8" opacity=".55"><path d="M44 84 C 40 60, 18 46, 14 0"/><path d="M56 86 C 64 60, 66 30, 60 0"/></g></svg>' });
  add({ go: 'antenna', cls: 'rack', w: 70, h: 120, x: 191.9, y: -62, z: 54.1, t: `rotateY(${R}deg)`,
    html: `<div class="rk-scr"><b>TX</b><span>天線</span><i class="anim"></i></div>
    <button class="rk-pull" type="button" aria-label="Streams lever"><svg class="rk-sel" viewBox="0 0 70 52" width="70" height="52" aria-hidden="true">
    <g stroke="#e9e3d2" stroke-width="1.4"><line x1="14" y1="16" x2="14" y2="10"/><line x1="32.4" y1="25.6" x2="36.6" y2="21.4"/><line x1="40" y1="44" x2="46" y2="44"/></g>
    <g fill="#e9e3d2" font-size="4.6" font-family="sans-serif" font-weight="700" letter-spacing=".3"><text x="18" y="9">ALL</text><text x="38" y="19">CHILL</text><text x="48" y="40">ENERGY</text></g>
    <g class="rk-lever"><line x1="14" y1="44" x2="14" y2="19" stroke="#c2432d" stroke-width="3" stroke-linecap="round"/><circle cx="14" cy="19" r="3.4" fill="#c2432d"/></g><circle cx="14" cy="44" r="5" fill="#2b2b2b" stroke="#777" stroke-width="1"/></svg></button>
    <div class="rk-vu anim">${'<i></i>'.repeat(9)}</div><div class="rk-sock"><i></i><i></i><i></i></div>` });
  add({ go: 'antenna', cls: 'rack side', w: 40, h: 120, x: 232, y: -62, z: 58.5, t: 'rotateY(54deg)' });
  add({ go: 'antenna', cls: 'rack top', w: 70, h: 40, x: 203.7, y: -122, z: 37.9, t: `rotateY(${R}deg) rotateX(90deg)` });
  add({ go: 'antenna', cls: 'rack mon', w: 40, h: 26, x: 195.4, y: -135, z: 49.2, t: `rotateY(${R}deg)`, html: '<div class="mon-scr"><b>ANTENNA</b><span>streams on air</span></div>' });
  add({ go: 'antenna', cls: 'rack', w: 46, h: 84, x: 250.3, y: -44, z: 79.3, t: `rotateY(${R}deg)`,
    html: `<div class="srv">${Array.from({ length: 7 }, (_, i) => `<div class="blade"><i class="anim" style="animation-delay:-${((i * 0.53) % 1.7).toFixed(2)}s"></i><i class="anim g" style="animation-delay:-${((i * 0.31) % 1.3).toFixed(2)}s"></i><span></span></div>`).join('')}</div>` });
  add({ go: 'antenna', cls: 'rack side', w: 36, h: 84, x: 279.5, y: -44, z: 78.2, t: 'rotateY(54deg)' });
  add({ cls: '', w: 70, h: 125, x: 262.1, y: -172, z: 68, t: `rotateY(${R}deg)`,
    html: '<svg viewBox="0 0 70 125" width="70" height="125"><g fill="none" stroke="#141414" stroke-width="1.6"><path d="M2 123 Q 30 110 68 8"/><path d="M8 124 Q 40 118 68 22"/></g><g class="cab" fill="none" stroke="#3fd3c6" stroke-width=".9" opacity=".0"><path d="M2 123 Q 30 110 68 8"/><path d="M8 124 Q 40 118 68 22"/></g></svg>' });
  add({ cls: 'mast', w: 4, h: 300, x: 292.3, y: -152, z: 77.6 });
  add({ cls: 'mast', w: 4, h: 300, x: 292.3, y: -152, z: 77.6, t: 'rotateY(90deg)' });
  for (const [y, w] of [[-282, 44], [-258, 30], [-236, 20]]) add({ cls: 'mast', w, h: 3, x: 292.3, y, z: 77.6, t: `rotateY(${R}deg)` });
  add({ cls: '', w: 220, h: 220, x: 292.3, y: -300, z: 77.6, t: `rotateY(${R}deg)`, html: '<div class="rings anim"><i></i><i></i><i></i></div>' });
  // the hanging scroll (Ondes) and the lantern (Booth) swing from pivots
  add({ cls: 'string', w: 1.5, h: 42, x: -128, y: -289, z: 58 });
  add({ pivot: true, x: -128, y: -268, z: 58, t: 'rotateY(30deg)', child: { go: 'ondes', cls: 'sway anim', w: 46, h: 118, origin: 'top',
    html: `<svg viewBox="0 0 46 118" width="46" height="118"><path d="M23 0 L9 7 M23 0 L37 7" stroke="#2a2018" stroke-width=".8"/><rect x="3" y="6" width="40" height="4" rx="2" fill="#3b2a1d"/><rect x="5" y="10" width="36" height="97" fill="#4b7d6d"/><rect x="9" y="17" width="28" height="83" fill="#ece4cf"/>
    <text x="23" y="37" font-family="Ma Shan Zheng, KaiTi, serif" font-size="14" text-anchor="middle" fill="#1d1a16">電</text><text x="23" y="54" font-family="Ma Shan Zheng, KaiTi, serif" font-size="14" text-anchor="middle" fill="#1d1a16">波</text>
    <g stroke="#5a5247" stroke-width=".7"><line x1="14" y1="62" x2="14" y2="94"/><line x1="18" y1="62" x2="18" y2="88"/><line x1="23" y1="62" x2="23" y2="92"/><line x1="28" y1="62" x2="28" y2="84"/></g><rect x="29" y="88" width="6" height="6" fill="#c2432d"/>
    <rect x="2" y="105" width="42" height="6" rx="3" fill="#3b2a1d"/></svg>` } });
  add({ pivot: true, x: 8, y: -334, z: -20, t: 'rotateX(-26.6deg)', child: { go: 'booth', cls: 'swing anim', w: 40, h: 64, origin: 'top',
    html: `<div class="lamp-glow"></div><svg viewBox="0 0 40 64" width="40" height="64" style="position:relative"><defs><radialGradient id="bLg" cx=".45" cy=".45" r=".6"><stop offset="0" stop-color="#ffd79a"/><stop offset=".45" stop-color="#e2553a"/><stop offset="1" stop-color="#8e2318"/></radialGradient></defs>
    <line x1="20" y1="0" x2="20" y2="10" stroke="#2a2018" stroke-width=".8"/><rect x="13" y="9" width="14" height="4" rx="1" fill="#c9a24a"/><ellipse cx="20" cy="30" rx="16" ry="18" fill="url(#bLg)"/>
    <rect x="13" y="46" width="14" height="4" rx="1" fill="#c9a24a"/><path d="M20 50 v12" stroke="#c2432d" stroke-width="2"/></svg>` } });
  // the hammock across the stern posts, and the writing desk behind it (Echo)
  add({ cls: 'hm', w: 173, h: 60, x: -74, y: -155, z: 380, t: 'rotateZ(31.3deg) rotateX(90deg)' });
  add({ cls: 'hm', w: 173, h: 60, x: 74, y: -155, z: 380, t: 'rotateZ(-31.3deg) rotateX(90deg)' });
  add({ go: 'echo', cls: 'tabletop', w: 170, h: 70, x: 0, y: -48, z: 440, t: 'rotateX(90deg)' });
  add({ go: 'echo', cls: 'tedge', w: 170, h: 48, x: 0, y: -24, z: 405, t: 'rotateY(180deg)' });
  add({ go: 'echo', cls: '', w: 84, h: 58, x: -20, y: -49, z: 455, origin: 'bottom', t: 'rotateY(180deg) rotateX(18deg)',
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
  if (o.go) el.dataset.go = o.go;
  return el;
}

/** A point placed the way CSS places it: `translate3d(x,y,z) rotate…(…)`, the rotations applied right to left. */
function placed(p, o) {
  let [x, y, z] = p;
  const ops = [...String(o.t || '').matchAll(/rotate([XYZ])\((-?[\d.]+)deg\)/g)];
  for (let i = ops.length - 1; i >= 0; i--) {
    const a = Number(ops[i][2]) * D2R, c = Math.cos(a), s = Math.sin(a);
    if (ops[i][1] === 'X') [y, z] = [y * c - z * s, y * s + z * c];
    else if (ops[i][1] === 'Y') [x, z] = [x * c + z * s, -x * s + z * c];
    else [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [x + (o.x || 0), y + (o.y || 0), z + (o.z || 0)];
}

/** A plane's four corners in world units, from the numbers its CSS is made of (its origin, size, place, turn). */
export function cornersOf(o, parent = null) {
  const hw = o.w / 2;
  const [y0, y1] = o.origin === 'bottom' ? [-o.h, 0] : o.origin === 'top' ? [0, o.h] : [-o.h / 2, o.h / 2];
  return [[-hw, y0, 0], [hw, y0, 0], [-hw, y1, 0], [hw, y1, 0]].map((p) => {
    const q = placed(p, o);
    return parent ? placed(q, parent) : q;
  });
}

/**
 * Puts the boat's planes into the camera element; returns each with its corners, so the shell can leave out a plane
 * that comes too near the eye (CSS 3D has no near clipping: a plane across the eye is drawn tens of thousands of pixels
 * wide, which on 2026-11-22 held Ortis's laptop at one frame a second).
 */
export function buildBoat(cam) {
  const planes = [];
  for (const o of parts()) {
    if (o.pivot) {
      const pv = document.createElement('div');
      pv.className = 'pv';
      pv.style.transform = `translate3d(${o.x}px,${o.y}px,${o.z}px) ${o.t || ''}`;
      pv.appendChild(mk(o.child));
      cam.appendChild(pv);
      planes.push({ el: pv, pts: cornersOf(o.child, o) });
    } else {
      const el = mk(o);
      cam.appendChild(el);
      planes.push({ el, pts: cornersOf(o) });
    }
  }
  return planes;
}

/* ------------------------------------------------------------------------------------------- the lake, on a canvas */
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const LAYERS = [
  { seed: 11, R: 2800, w: [0.16, 0.40], h: [0.06, 0.19], gap: 0.1, top: '#a8b7b4', mid: '#bac6c2', base: '#cdd6d2', refl: 0.26, mist: 0.07, mistA: 0.9 },
  { seed: 23, R: 1900, w: [0.12, 0.30], h: [0.09, 0.24], gap: 0.3, top: '#738c86', mid: '#91a69f', base: '#b9c6c1', refl: 0.36, mist: 0.1, mistA: 0.85, ink: '#4a625e' },
  { seed: 37, R: 1200, w: [0.14, 0.32], h: [0.15, 0.37], gap: 0.52, top: '#38504c', mid: '#556e67', base: '#8fa29c', refl: 0.48, mist: 0.12, mistA: 0.72, veg: '#203430', ink: '#1d2e2b' },
];
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

/** A karst's height across its width, t from -1 to 1 (0 at the summit). */
const karstProfile = (t, q) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.3)), q);

function karst(g, cx, base, pk, L, r) {
  const { w, h, q, ph } = pk, n = 40;
  g.beginPath(); g.moveTo(cx - w / 2, base);
  for (let i = 0; i <= n; i++) {
    const t = -1 + 2 * i / n, prof = karstProfile(t, q);
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
  return { c, Wp, hY, Hp, R: L.R, peaks };
}

/** A layer's shape in one dark colour, laid over it as the night falls (the karsts sink into the dark, the sky stays). */
function silhouette(Ly) {
  const s = document.createElement('canvas'); s.width = Ly.Wp; s.height = Ly.Hp;
  const g = s.getContext('2d');
  g.drawImage(Ly.c, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = '#04070f'; g.fillRect(0, 0, Ly.Wp, Ly.Hp);
  return s;
}

/** A few warm lights deep in a range of mountains: too small and too far to tell what they are (Ortis, 2026-11-22). */
function farLights(Ly, seed, n) {
  const s = document.createElement('canvas'); s.width = Ly.Wp; s.height = Ly.Hp;
  const g = s.getContext('2d'), r = rng(seed);
  // Inside the rock, near its foot: asked of the peaks' own shapes, not read back from the painting. Reading the
  // painting (getImageData on 11,781 × 1,200 px) took 55 s in headless Chrome and froze the boat's start at night
  // (2026-11-22: the site smoke failed only after dark).
  const inside = (x, y) => Ly.peaks.some((pk) => [-Ly.Wp, 0, Ly.Wp].some((off) => {
    const t = (x - pk.cx - off) / (pk.w / 2);
    return Math.abs(t) < 1 && y >= Ly.hY - pk.h * karstProfile(t, pk.q) * (1 + 0.035 * Math.sin(t * 9 + pk.ph)) + 2;
  }));
  for (let tries = 0, put = 0; put < n && tries < n * 60; tries++) {
    const x = Math.floor(r() * Ly.Wp), y = Math.floor(Ly.hY * (0.7 + r() * 0.28));
    if (!inside(x, y)) continue;
    const rad = 1.3 + r() * 1.5, gr = g.createRadialGradient(x, y, 0, x, y, rad * 2.4);
    gr.addColorStop(0, 'rgba(255,214,150,.7)'); gr.addColorStop(0.3, 'rgba(255,170,90,.22)'); gr.addColorStop(1, 'rgba(255,150,80,0)');
    g.fillStyle = gr; g.fillRect(x - rad * 2.4, y - rad * 2.4, rad * 4.8, rad * 4.8);
    put++;
  }
  return s;
}

/**
 * The Milky Way, painted once at half size along the whole panorama and drawn twice as large, which keeps its light
 * soft: a band arching from the horizon to over half the sky, a brighter warm core, dark lanes of dust down its middle,
 * and thousands of faint stars crowded into it. Its stars are not the sky's other stars (Lake.starsAt draws those crisp).
 */
function milkyWay(k) {
  const Wp = Math.round(2 * Math.PI * k), Hm = Math.round(1.05 * k);
  const c = document.createElement('canvas'); c.width = Wp; c.height = Hm;
  const g = c.getContext('2d'), r = rng(97);
  const elAt = (az) => 0.78 * Math.sin(az - 0.55) + 0.12; // radians above the horizon
  const yAt = (az) => Hm - elAt(az) * k;                     // k px per radian at half size
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 520; i++) {
      const az = r() * 2 * Math.PI, y = yAt(az) + (r() - 0.5) * k * 0.16; if (y > Hm || y < 0) continue;
      const x = az / (2 * Math.PI) * Wp, core = Math.exp(-Math.pow(wrap(az - 2.2) / 0.55, 2));
      const rad = k * (0.05 + r() * 0.09) * (1 + core * 0.8);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const col = core > 0.3 ? `rgba(255,${226 + Math.round(r() * 20)},${196 + Math.round(r() * 30)},` : `rgba(${196 + Math.round(r() * 30)},${210 + Math.round(r() * 30)},255,`;
      gr.addColorStop(0, col + (pass ? 0.05 : 0.07) * (1 + core * 1.6) + ')'); gr.addColorStop(1, col + '0)');
      g.fillStyle = gr;
      for (const off of [-Wp, 0, Wp]) if (x + off + rad > 0 && x + off - rad < Wp) g.fillRect(x + off - rad, y - rad, rad * 2, rad * 2);
    }
  }
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    const az = r() * 2 * Math.PI, y = yAt(az) + (r() - 0.5) * k * 0.035, x = az / (2 * Math.PI) * Wp;
    const rx = k * (0.02 + r() * 0.06), ry = k * (0.006 + r() * 0.012);
    g.globalAlpha = 0.18 + r() * 0.25; g.beginPath(); g.ellipse(x, y, rx, ry, Math.cos(az - 0.55) * 0.7, 0, 6.283); g.fill();
  }
  g.restore();
  for (let i = 0; i < 5200; i++) {
    const az = r() * 2 * Math.PI, spread = (r() + r() + r() - 1.5) * k * 0.12, y = yAt(az) + spread; if (y > Hm || y < 0) continue;
    g.globalAlpha = 0.25 + r() * 0.55; g.fillStyle = r() < 0.2 ? '#ffe9cf' : r() < 0.4 ? '#d9e6ff' : '#ffffff';
    g.fillRect(az / (2 * Math.PI) * Wp, y, 0.6, 0.6);
  }
  g.globalAlpha = 1;
  return { c, Wp, Hm };
}

const GLOWS = new Map();
/** A star's glow, painted once for its colour. */
function glowOf(col) {
  if (!GLOWS.has(col)) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, col); gr.addColorStop(0.22, col + 'aa'); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    GLOWS.set(col, c);
  }
  return GLOWS.get(col);
}

/** The sky's own stars: seeded, so everyone on the boat sees the same night. Brighter ones are rarer and twinkle. */
function starfield(n = 2800) {
  const r = rng(53), out = [];
  for (let i = 0; i < n; i++) {
    const m = Math.pow(r(), 2.6), el = Math.asin(r() * 0.97) * 1.05;
    out.push({ az: r() * 2 * Math.PI, el, m, ph: r() * 6.283, f: 0.6 + r() * 2.2, col: r() < 0.16 ? '#ffe2c2' : r() < 0.34 ? '#d2e1ff' : '#ffffff' });
  }
  return out.sort((a, b) => a.m - b.m);
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
    this.stars = starfield();
    this.sky = skyAt(720);
    this.ripples = [];
    this.lastHit = -9;
  }

  /** The light of the hour (skyAt); the night's paintings are made the first time it is needed. */
  setSky(sky) {
    this.sky = sky;
    if (sky.dark > 0.01 || sky.star > 0.01 || sky.lant > 0.01) this.night();
  }

  night() {
    if (this.mw || !this.layers.length) return;
    this.mw = milkyWay(this.k);
    this.layers.forEach((Ly, i) => { Ly.sil = silhouette(Ly); if (i < 2) Ly.lights = farLights(Ly, 71 + i * 13, i === 0 ? 9 : 6); });
  }

  size(W, H, P, dpr) {
    Object.assign(this, { W, H, P, dpr });
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    // A panorama is painted mountain by mountain along its width: with no width there is nothing to paint, and the
    // painter would never get to the end of it (2026-11-18, a boat measured before its CSS).
    const k = Math.max(40, Math.round(P / 2));
    if (k !== this.k || !this.layers.length) { this.k = k; this.layers = LAYERS.map((L) => paintLayer(L, k)); this.mw = null; this.setSky(this.sky); }
  }

  /**
   * One frame for camera `cv` at world time `t`; `frozen` draws what was moving with the trails of a stopped instant.
   * `sound` is the music's shape, read by the visualiser ({ low, hit }): the mist breathes with the bass and each beat
   * rings the water. The rings stay where they fell, in the world, so they carry on as the camera moves between places.
   */
  draw(cv, t, frozen, sound = null) {
    const { ctx: g, W, H, P, k, sky: S } = this;
    const low = sound ? Math.max(0, Math.min(1, sound.low || 0)) : 0;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sway = this.reduced ? 0 : Math.sin(t * 0.7) * 0.45 + Math.sin(t * 0.31) * 0.25;
    const yaw = cv.yaw * D2R, pd = cv.pd * D2R;
    const l = Math.hypot(cv.x, cv.z), f = l > 320 ? 320 / l : 1, C = { x: cv.x * f, y: cv.y, z: cv.z * f };
    const pose = { ...cv, roll: 0 };
    g.save(); g.translate(W / 2, H / 2); g.rotate((cv.roll + sway) * D2R); g.translate(-W / 2, -H / 2);
    const hz = (R) => H / 2 + P * Math.tan(Math.atan((WATER - C.y) / R) - pd);
    const hFar = hz(4200);
    const sky = g.createLinearGradient(0, hFar - P * 0.9, 0, hFar);
    sky.addColorStop(0, S.top); sky.addColorStop(0.65, S.mid); sky.addColorStop(1, S.hor);
    g.fillStyle = sky; g.fillRect(-W, -H * 2, W * 3, hFar + H * 2);
    if (S.star > 0.01 && this.mw) this.starsAt(g, yaw, hFar, t, S.star);
    // The sun low on the sky by day, at dawn and dusk; at night a moon's pale light, higher and further round.
    const sx = W / 2 + wrap((S.star > 0.5 ? 4.1 : 2.25) - yaw) * P, sy = hFar - S.sunEl * P;
    const [sr, sgc, sb] = [1, 3, 5].map((i) => parseInt(S.sun.slice(i, i + 2), 16));
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, P * 0.55);
    sg.addColorStop(0, `rgba(${sr},${sgc},${sb},${S.sunA})`); sg.addColorStop(1, `rgba(${sr},${sgc},${sb},0)`);
    g.fillStyle = sg; g.fillRect(sx - P * 0.6, sy - P * 0.6, P * 1.2, P * 1.2);
    const wg = g.createLinearGradient(0, hFar, 0, H + P * 0.3);
    wg.addColorStop(0, S.wHor); wg.addColorStop(0.3, S.wMid); wg.addColorStop(1, S.wNear);
    g.fillStyle = wg; g.fillRect(-W, hFar, W * 3, H * 3);
    if (S.star > 0.01 && this.mw) this.reflectAt(g, yaw, hFar, t, S.star);
    const right = [Math.cos(yaw), Math.sin(yaw)], fwd = [Math.sin(yaw), -Math.cos(yaw)];
    const lat = C.x * right[0] + C.z * right[1], fw = C.x * fwd[0] + C.z * fwd[1];
    this.layers.forEach((Ly, i) => {
      const sc = Ly.R / Math.max(Ly.R * 0.5, Ly.R - fw), k2 = P * sc / k, imgW = Ly.Wp * k2, hy = hz(Ly.R);
      let x0 = W / 2 - yaw * k * k2 - P * lat / Ly.R;
      x0 = ((x0 % imgW) + imgW) % imgW - imgW;
      const shine = S.lant * 0.75 * (0.8 + 0.2 * Math.sin(t * 1.3 + i * 2.1));
      for (let x = x0 - imgW; x < W * 1.4; x += imgW) {
        const y = hy - Ly.hY * k2, h = Ly.Hp * k2;
        g.drawImage(Ly.c, x, y, imgW, h);
        if (S.dark > 0.01 && Ly.sil) { g.globalAlpha = S.dark; g.drawImage(Ly.sil, x, y, imgW, h); g.globalAlpha = 1; }
        if (shine > 0.02 && Ly.lights) { g.globalAlpha = shine; g.drawImage(Ly.lights, x, y, imgW, h); g.globalAlpha = 1; }
      }
      if (i === 0 && S.star < 0.6) { g.globalAlpha = 1 - S.star / 0.6; this.birdsAt(g, yaw, hFar, t, frozen); g.globalAlpha = 1; }
      if (i === 1) this.mistAt(g, yaw, hy, t, S.mist, low);
    });
    this.glintsAt(g, pose, t, (1 - 0.75 * S.star) * (0.75 + 0.6 * low), S.rip);
    this.dropAt(g, pose, t, frozen);
    this.ripplesAt(g, pose, cv, t, frozen, sound, S.rip);
    g.restore();
  }

  /** The night sky: the Milky Way, then the stars, the brightest with a glow and a slow twinkle. */
  starsAt(g, yaw, hFar, t, amount) {
    const { W, P, k } = this, mw = this.mw, k2 = P / k, imgW = mw.Wp * k2;
    g.globalAlpha = amount;
    let x0 = W / 2 - yaw * k * k2;
    x0 = ((x0 % imgW) + imgW) % imgW - imgW;
    for (let x = x0 - imgW; x < W * 1.4; x += imgW) g.drawImage(mw.c, x, hFar - mw.Hm * k2, imgW, mw.Hm * k2);
    for (const s of this.stars) {
      const dx = wrap(s.az - yaw) * P; if (Math.abs(dx) > W * 0.8) continue;
      const x = W / 2 + dx, y = hFar - s.el * P; if (y > hFar - 2 || y < -40) continue;
      const tw = s.m > 0.35 ? 0.72 + 0.28 * Math.sin(t * s.f + s.ph) : 1;
      g.globalAlpha = amount * Math.min(1, 0.22 + s.m * 1.3) * tw * Math.min(1, (hFar - y) / 40);
      g.fillStyle = s.col;
      if (s.m > 0.55) {
        // A glow painted once per colour (glowOf) and stamped: a gradient per star per frame would cost too much.
        const rr = 2 + s.m * 4.5;
        g.drawImage(glowOf(s.col), x - rr, y - rr, rr * 2, rr * 2);
      } else { const z = s.m > 0.2 ? 1.6 : s.m > 0.06 ? 1.15 : 0.8; g.fillRect(x - z / 2, y - z / 2, z, z); }
    }
    g.globalAlpha = 1;
  }

  /** The still lake gives the night back: the Milky Way's glow below the horizon, the bright stars as trembling lines. */
  reflectAt(g, yaw, hFar, t, amount) {
    const { W, P, k } = this, mw = this.mw, k2 = P / k, imgW = mw.Wp * k2;
    g.save(); g.globalAlpha = amount * 0.3;
    g.translate(0, hFar); g.scale(1, -0.75); g.translate(0, -hFar);
    let x0 = W / 2 - yaw * k * k2;
    x0 = ((x0 % imgW) + imgW) % imgW - imgW;
    for (let x = x0 - imgW; x < W * 1.4; x += imgW) g.drawImage(mw.c, x, hFar - mw.Hm * k2, imgW, mw.Hm * k2);
    g.restore();
    for (const s of this.stars) {
      if (s.m < 0.3) continue;
      const dx = wrap(s.az - yaw) * P; if (Math.abs(dx) > W * 0.8) continue;
      const y = hFar + s.el * P * 0.75, x = W / 2 + dx + Math.sin(t * 1.7 + s.ph) * 1.5;
      g.globalAlpha = amount * s.m * 0.35; g.fillStyle = s.col;
      g.fillRect(x - 0.6, y - 2.5, 1.2, 5 + s.m * 4);
    }
    g.globalAlpha = 1;
  }

  /** A ring on the water at each beat (the visualiser's onsets), where it fell; the bass sets how wide it spreads. */
  ripplesAt(g, pose, cv, t, frozen, sound, col) {
    const { W, H, P } = this;
    if (!frozen && sound && sound.hit > 0 && t - this.lastHit > 0.22) {
      this.lastHit = t;
      const az = cv.yaw * D2R + (Math.random() - 0.5) * 1.5, dist = 220 + Math.random() * 760;
      this.ripples.push({ x: cv.x + Math.sin(az) * dist, z: cv.z - Math.cos(az) * dist, t0: t, s: Math.min(1, 0.45 + sound.hit * 0.6 + (sound.low || 0) * 0.4) });
      if (this.ripples.length > 14) this.ripples.shift();
    }
    this.ripples = this.ripples.filter((rp) => t - rp.t0 < 3.4 && t >= rp.t0);
    g.strokeStyle = col; g.lineWidth = 1.2;
    for (const rp of this.ripples) {
      for (let j = 0; j < 2; j++) {
        const age = t - rp.t0 - j * 0.4; if (age <= 0) continue;
        const rad = 6 + age * (36 + 52 * rp.s), al = Math.max(0, 1 - age / 3) * 0.6 * rp.s; if (al <= 0.01) continue;
        g.globalAlpha = al; g.beginPath();
        let started = false;
        for (let a = 0; a <= 28; a++) {
          const th = a / 28 * 6.283, p = project(pose, [rp.x + Math.cos(th) * rad, WATER, rp.z + Math.sin(th) * rad], W, H, P, false);
          if (!p) { started = false; continue; }
          if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
        }
        g.stroke();
      }
    }
    g.globalAlpha = 1;
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

  /** Mist banks on the water at the foot of the middle range; they swell and brighten with the bass. */
  mistAt(g, yaw, hy, t, col = '#eaefeb', low = 0) {
    const { W, P } = this;
    const [r, gg, b] = [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16)), a = (0.3 + 0.38 * low).toFixed(3);
    for (let i = 0; i < 7; i++) {
      const dx = wrap(i * 0.9 + t * 0.006 - yaw) * P; if (Math.abs(dx) > W) continue;
      const x = W / 2 + dx, y = hy - 6 - (i % 3) * 12 - low * 6, rx = P * 0.5 * (1 + 0.18 * low);
      const gr = g.createRadialGradient(x, y, 0, x, y, rx);
      gr.addColorStop(0, `rgba(${r},${gg},${b},${a})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.save(); g.translate(x, y); g.scale(1, 0.07); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rx, 0, 6.283); g.fill(); g.restore();
    }
  }

  glintsAt(g, pose, t, amount = 1, col = '#f2f6f2') {
    const { W, H, P } = this;
    g.strokeStyle = col; g.lineWidth = 1;
    for (const gl of this.glints) {
      const p = project(pose, [gl.x + Math.sin(t * 0.3 + gl.ph) * 6, WATER, gl.z], W, H, P, false); if (!p) continue;
      const a = Math.sin(t * 1.2 + gl.ph); if (a < 0.08) continue;
      const L = gl.l * P / p.d; if (L < 0.8) continue;
      g.globalAlpha = Math.min(1, a * 0.5 * amount); g.beginPath(); g.moveTo(p.x - L, p.y); g.lineTo(p.x + L, p.y); g.stroke();
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
