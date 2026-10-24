/**
 * The map of the world (docs/WORLD.md): one 5200 × 2600 plane, Zone — the
 * radio, dark — on the left half and Echo — the journal, light — on the
 * right. Each district is a place a route lands on; the camera is a
 * translate + scale of the whole plane. Pure data and arithmetic, no DOM,
 * so node:test can check every number here.
 */
import { ONDES_LABEL } from '../labels.js';

export const WORLD = { w: 5200, h: 2600, seam: 2600 };

/** The camera never zooms out further than this: below it a window's text stops being text. */
export const MIN_SCALE = 0.3;

/**
 * x, y, w, h in world pixels. `route` is where the district's tag goes;
 * null means the tag only moves the camera (Articles is reached through an
 * article's own address). `tag` places
 * the tag on a desktop: a % of the screen, from the left edge for Zone and
 * from the right edge for Echo, and a tilt in degrees.
 */
export const DISTRICTS = [
  { id: 'radio', code: 'Z-01', title: 'Radio', half: 'zone', x: 150, y: 170, w: 1040, h: 760, rot: -0.6, route: 'radio',
    hosts: 'On air: the cover, the channels dial, the queue', tag: [3, 15, -4] },
  { id: 'ondes', code: 'Z-02', title: ONDES_LABEL, half: 'zone', x: 1400, y: 300, w: 960, h: 640, rot: 0.8, route: 'ondes',
    hosts: 'Just played, up next behind the lock fence, the next hours', tag: [11, 23, 3] },
  { id: 'zone', code: 'Z-03', title: 'Zone', half: 'zone', x: 110, y: 1150, w: 800, h: 620, rot: 0.5, route: 'zone',
    hosts: 'Where the tower broadcasts from: the map, the local time', tag: [2, 33, -7] },
  { id: 'atlas', code: 'Z-04', title: 'Atlas', half: 'zone', x: 1010, y: 1080, w: 640, h: 700, rot: -1.2, route: 'atlas',
    hosts: 'Postcards, the Europe inset, the press', tag: [8, 44, 5] },
  { id: 'portfolio', code: 'Z-05', title: 'Portfolio', half: 'zone', x: 1760, y: 1180, w: 700, h: 560, rot: 0.9, route: 'portfolio',
    hosts: 'Three doors: Library, Photos, Crates', tag: [3, 55, -2] },
  { id: 'playlists', code: 'Z-06', title: 'Playlists', half: 'zone', x: 260, y: 1880, w: 1240, h: 560, rot: -0.4, route: 'playlists',
    hosts: 'The featured playlist and every card', tag: [10, 65, 6] },
  { id: 'booth', code: 'Z-07', title: 'Booth', half: 'zone', x: 1700, y: 1960, w: 620, h: 420, rot: 1.4, route: 'booth',
    hosts: 'The DJ booth, still behind its key', tag: [4, 76, -5], faint: true },
  { id: 'une', code: 'E-01', title: 'Une', half: 'echo', x: 2820, y: 190, w: 1150, h: 980, rot: 0, route: 'echo',
    hosts: 'La une : le titre, l’article de tête, ce qui passe à l’antenne', tag: [4, 18, 4] },
  { id: 'articles', code: 'E-02', title: 'Articles', half: 'echo', x: 4080, y: 120, w: 900, h: 1100, rot: 0, route: null,
    hosts: 'La page de lecture : titre, photo, texte, notes', tag: [12, 29, -3] },
  { id: 'lectures', code: 'E-03', title: 'Lectures', half: 'echo', x: 2860, y: 1330, w: 900, h: 920, rot: 0, route: 'echo/lectures',
    hosts: 'Les textes, et la musique qui les accompagne', tag: [3, 41, 6] },
  { id: 'archives', code: 'E-04', title: 'Archives', half: 'echo', x: 4000, y: 1480, w: 980, h: 800, rot: 0, route: 'echo/archives',
    hosts: 'La presse, les articles par thème, les collections, le fil', tag: [10, 53, -6] },
];

/**
 * Echo's backdrop (phase 4): the Gazette's silhouettes — ui/echo-front.js's
 * symbols, shapes and not people — stand on the paper in the gutters between
 * Echo's windows, never over one. x, y, w, h in world pixels.
 */
export const FIGURES = [
  { kind: 'fist', x: 2660, y: 560, w: 104, h: 228 },
  { kind: 'flag', x: 2650, y: 1190, w: 118, h: 258 },
  { kind: 'horn', x: 3985, y: 1250, w: 182, h: 130 },
  { kind: 'drum', x: 3800, y: 1600, w: 150, h: 250 },
  { kind: 'crowd', x: 2900, y: 2330, w: 392, h: 236 },
  { kind: 'statue', x: 4500, y: 2290, w: 150, h: 300 },
];

const BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]));
export const byId = (id) => BY_ID.get(id) || null;

/**
 * The district a matched route lives in (main.js's route names), or null to
 * leave the camera where it is (a page that does not exist).
 * The home lands on Radio: the world is the home (docs/WORLD.md, open question 2).
 */
export function districtFor(name, params = {}) {
  switch (name) {
    case 'home': case 'radio': return 'radio';
    case 'ondes': case 'zone': case 'atlas': case 'portfolio': case 'playlists': case 'booth': return name;
    case 'echo': return params.slug ? 'articles' : 'une';
    case 'lectures': case 'ecrits': return 'lectures';
    case 'archives': return 'archives';
    default: return null;
  }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** At or under this width the world is laid out for a phone (world.css's breakpoint). */
export const PHONE_MAX = 760;
/**
 * …and at or under this height too: a phone held sideways. Its brand, switch,
 * tags and « Écran » then share one line, because height is what it lacks.
 */
export const SHORT_MAX = 500;
/** The same two breakpoints as one media query (world.js, camera.js; world.css spells it out). */
export const PHONE_MEDIA = `(max-width: ${PHONE_MAX}px), (max-height: ${SHORT_MAX}px)`;
export const isPhone = (vw, vh) => vw <= PHONE_MAX || vh <= SHORT_MAX;
/** On a phone the frame leaves this much screen at each side, and starts under the header and the tag strip. */
const PHONE_SIDE = 12;
const PHONE_TOP = 116;
/** On its side, under the one line that holds the header and the strip. */
const SHORT_TOP = 64;
export const phoneTop = (vh) => (vh <= SHORT_MAX ? SHORT_TOP : PHONE_TOP);
/**
 * A phone frame is never wider than the map's tightest gap side by side
 * (Atlas → Portfolio: 750 apart), nor taller than its tightest stack (Zone
 * over Playlists: 730 apart), so two never overlap — a phone on its side is
 * wider than any phone upright.
 */
const PHONE_MAX_W = 736;
const PHONE_MAX_H = 700;

/**
 * The size a district's frame takes on this screen. On a desktop it is the
 * map's. On a phone it is the screen itself — the free area under the tag
 * strip — because a landscape frame scaled down to a portrait screen would
 * leave a page a few lines tall; the camera then shows it at 1:1.
 */
export function frameFor(d, vw, vh, { phone = isPhone(vw, vh), bottom = 64 } = {}) {
  if (!phone) return { w: d.w, h: d.h };
  return { w: Math.min(PHONE_MAX_W, Math.max(240, vw - 2 * PHONE_SIDE)), h: clamp(vh - phoneTop(vh) - bottom, 160, PHONE_MAX_H) };
}

/**
 * Where the camera sits to show a district: centred in the screen's free
 * area and scaled down until the whole frame fits. On a desktop the tags
 * own a column on each side; on a phone they are a strip under the header
 * and the frame is the screen (frameFor), so the scale is 1.
 */
export function cameraFor(d, vw, vh, { phone = isPhone(vw, vh), bottom = 64 } = {}) {
  if (phone) return { tx: (vw - frameFor(d, vw, vh, { phone, bottom }).w) / 2 - d.x, ty: phoneTop(vh) - d.y, s: 1 };
  const side = Math.min(260, vw * 0.18);
  const top = 96;
  const aw = Math.max(120, vw - 2 * side);
  const ah = Math.max(120, vh - top - bottom);
  const s = clamp(Math.min(aw / (d.w + 40), ah / (d.h + 60)), MIN_SCALE, 1);
  return {
    tx: side + aw / 2 - (d.x + d.w / 2) * s,
    ty: top + ah / 2 - (d.y + d.h / 2) * s,
    s,
  };
}

/** A swipe on a phone: at least this far across, this much more across than down, this quick, and not from the screen's edge. */
export const SWIPE = { min: 64, ratio: 1.6, ms: 650, edge: 24 };

/**
 * The half a swipe asks for, or null. The finger moving left brings Echo,
 * which lies to the right of Zone; moving right brings Zone back. A swipe
 * towards the half already in view asks for nothing, nor does a slow drag,
 * a mostly vertical one (a scroll), or one that starts at the screen's edge,
 * where the phone's own back gesture lives.
 */
export function swipeHalf(half, { x0, dx, dy, ms, vw }) {
  if (x0 < SWIPE.edge || x0 > vw - SWIPE.edge) return null;
  if (Math.abs(dx) < SWIPE.min || Math.abs(dx) < SWIPE.ratio * Math.abs(dy) || ms > SWIPE.ms) return null;
  const want = dx < 0 ? 'echo' : 'zone';
  return want === half ? null : want;
}

/**
 * The zoom a district's page is drawn at, so that once the camera has
 * scaled the plane by `s` its text is back at 1:1 on screen: the page lays
 * itself out in the frame's on-screen width, as it would in a window that
 * size. 1 needs no zoom at all ('' in the style).
 */
export const pageZoom = (s) => (s >= 0.999 ? 1 : Number((1 / s).toFixed(4)));

/** The world point under the middle of the screen. */
export const centreOf = (cam, vw, vh) => ({ x: (vw / 2 - cam.tx) / cam.s, y: (vh / 2 - cam.ty) / cam.s });

/** A flight scales with distance: quick hops stay quick, the long ones never drag. */
export const flightMs = (dist) => clamp(300 + dist * 0.16, 380, 820);

/** easeInOutQuart: leaves fast, settles gently. */
export const ease = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);

/** The whip-pan's pull-back at progress k: a small arc in scale, at most 12 %. */
export const pullBack = (k, dist) => Math.sin(Math.PI * clamp(k, 0, 1)) * Math.min(0.12, dist / 9000);

/** 0 deep in Zone, 1 deep in Echo, eased across the 520 px around the seam. */
export function seamMix(x) {
  const t = clamp((x - (WORLD.seam - 260)) / 520, 0, 1);
  return t * t * (3 - 2 * t);
}

/** The district whose centre is closest to a world point (the minimap's click). */
export function nearest(x, y) {
  let best = null;
  let bd = Infinity;
  for (const d of DISTRICTS) {
    const dd = Math.hypot(d.x + d.w / 2 - x, d.y + d.h / 2 - y);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}
