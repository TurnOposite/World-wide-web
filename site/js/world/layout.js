/**
 * The map of the world (docs/WORLD.md): one 5200 × 2600 plane, Zone — the
 * radio, dark — on the left half and Echo — the journal, light — on the
 * right. Each district is a place a route lands on; the camera is a
 * translate + scale of the whole plane. Pure data and arithmetic, no DOM,
 * so node:test can check every number here.
 */
import { ONDES_LABEL } from '../labels.js';

/** The world as designed: Zone and Echo. A map with the past band under them is taller (model.js worldHeight sets h). */
export const BASE_H = 2600;
export const WORLD = { w: 5200, h: BASE_H, seam: 2600 };

/** The camera never zooms out further than this: below it a window's text stops being text. */
export const MIN_SCALE = 0.3;
/**
 * …and never in further than this. Above 1 a window fills a big screen instead of floating small in it;
 * its page is zoomed back (pageZoom), so the text is still 1:1 and the page simply has more room.
 */
export const MAX_SCALE = 2.4;
/**
 * A window shows its page whole (Ortis, 2026-11-01: « each window linked to the menu should be self-contained
 * in its entirety and fit in the screen »): a page taller than its window is drawn smaller until it fits —
 * never below this, where it would stop being readable; past it the window scrolls after all. A district
 * marked `scroll` (Ondes, Playlists, the Booth, the reading pages) scrolls instead, at 1:1.
 */
export const FIT_MIN = 0.62;
/** The room the camera leaves around a window on a desktop: the tag columns, the HUD, the mini-player. */
export const sideOf = (vw) => clamp(vw * 0.16, 190, 250);
export const TOP = 70;
export const BOTTOM = 68;

/**
 * x, y, w, h in world pixels. `route` is where the district's tag goes;
 * null would mean the tag only moves the camera (Articles was, until it got
 * its own list on 2026-11-03). `tag` places
 * the tag on a desktop: a % of the screen, from the left edge for Zone and
 * from the right edge for Echo, and a tilt in degrees.
 *
 * These are the places as designed. Where the windows actually stand is
 * site/data/layout.json (docs/ATELIER.md): main.js reads it before the world
 * is mounted and model.js refills this array in place — so every module
 * that reads DISTRICTS sees the arranged map, and the versions of the past
 * the file adds to it.
 */
export const DISTRICTS = [
  { id: 'radio', code: 'Z-01', title: 'Radio', half: 'zone', x: 60, y: 140, w: 1180, h: 650, rot: -0.6, route: 'radio',
    hosts: 'On air: the cover, the channels dial', tag: [2, 15, -4] },
  // Ortis, 2026-11-01 (evening): Ondes and Playlists may scroll inside their windows — the only Zone
  // pages that do, with the Booth's music desk under its lights; every other window shows its page
  // whole (world.js fitPage).
  { id: 'ondes', code: 'Z-02', title: ONDES_LABEL, half: 'zone', x: 1320, y: 180, w: 1160, h: 670, rot: 0.8, route: 'ondes',
    hosts: 'Just played, up next behind the lock fence, the next hours', tag: [4.5, 24, 3], scroll: true },
  { id: 'playlists', code: 'Z-06', title: 'Playlists', half: 'zone', x: 60, y: 960, w: 1180, h: 670, rot: -0.4, route: 'playlists',
    hosts: 'Every playlist, a few words each, playable here', tag: [1.5, 33, -7], scroll: true },
  // Two Atlases (Ortis, 2026-11-01): Zone's says where the tower broadcasts from (one day, a playlist
  // per place); Echo's is the map of the places, the work and the press. Z-03 is Zone's again; Z-04,
  // the merged Atlas of that afternoon, is retired onto Echo's (refs.js RETIRED).
  { id: 'zone', code: 'Z-03', title: 'Atlas', half: 'zone', x: 380, y: 1780, w: 1180, h: 650, rot: -0.8, route: 'zone',
    hosts: 'Where the tower broadcasts from, and what time it is there', tag: [4, 42, 5] },
  // The Booth: the lights first, for everyone, shown whole; the music desk a scroll under them, behind the key.
  { id: 'booth', code: 'Z-07', title: 'Booth', half: 'zone', x: 1320, y: 1000, w: 1160, h: 670, rot: 1, route: 'booth',
    hosts: 'The lights, for everyone; the music booth, behind its key', tag: [2, 51, -5] },
  { id: 'une', code: 'E-01', title: 'Une', half: 'echo', x: 2760, y: 140, w: 1180, h: 680, rot: 0, route: 'echo',
    hosts: 'La une : le titre, l’article de tête, les séries, ce qui passe à l’antenne', tag: [3, 18, 4] },
  // Articles has an address since 2026-11-03 (Ortis: « let it open any article »): the list of every article,
  // the press series under their names; an article, a clipping or a text opens here too.
  { id: 'articles', code: 'E-02', title: 'Articles', half: 'echo', x: 3990, y: 180, w: 1180, h: 680, rot: 0, route: 'echo/articles',
    hosts: 'Tous les articles, et les séries de presse ; la page de lecture', tag: [5, 27, -3], scroll: true },
  // The Archive (Ortis, 2026-11-03, later): the Bibliothèque's window, renamed, takes the place of Archives
  // and of Lectures — E-04, Archives' code, so a short link handed out for Archives lands here; E-03
  // (Lectures) and E-06 (the Bibliothèque's code that morning) are retired onto it (refs.js RETIRED).
  // It opens on the Bibliothèque: the bookcase, the map table under it; the Crates are its other room.
  { id: 'portfolio', code: 'E-04', title: 'Archive', half: 'echo', x: 3990, y: 1000, w: 1180, h: 680, rot: 0, route: 'portfolio',
    hosts: 'La Bibliothèque : les travaux sur leur étagère, les cartes sur la table ; les bacs de disques', tag: [4.5, 36, 6], scroll: true },
  { id: 'atlas', code: 'E-05', title: 'Atlas', half: 'echo', x: 2760, y: 960, w: 1180, h: 680, rot: 0, route: 'atlas',
    hosts: 'Les villes où j’ai vécu, ce qui s’y est fait : projets, presse, cartes postales', tag: [2.5, 45, -6] },
];

/**
 * Echo's backdrop (phase 4): the Gazette's silhouettes — ui/echo-front.js's
 * symbols, shapes and not people — stand on the paper in the gutters between
 * Echo's windows, never over one. x, y, w, h in world pixels.
 */
export const FIGURES = [
  { kind: 'fist', x: 2640, y: 300, w: 104, h: 228 },
  { kind: 'flag', x: 2635, y: 1000, w: 118, h: 258 },
  { kind: 'horn', x: 4400, y: 865, w: 182, h: 130 },
  // Echo is two rows since 2026-11-03 (Lectures and Archives went; the Archive took Lectures' place):
  // the band under them is the figures' again.
  { kind: 'drum', x: 2700, y: 1800, w: 150, h: 250 },
  { kind: 'crowd', x: 3300, y: 2120, w: 392, h: 236 },
  { kind: 'statue', x: 4560, y: 1830, w: 150, h: 300 },
];

/** The map as designed, untouched by layout.json: the Atelier's « as designed » and the tests' reference. */
export const DESIGNED = Object.freeze(DISTRICTS.map((d) => Object.freeze({ ...d, tag: Object.freeze([...d.tag]) })));

let BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]));
export const byId = (id) => BY_ID.get(id) || null;
/** After DISTRICTS was refilled (model.js applyPages). */
export function reindex() { BY_ID = new Map(DISTRICTS.map((d) => [d.id, d])); }

/**
 * The district a matched route lives in (main.js's route names), or null to
 * leave the camera where it is (a page that does not exist).
 * The home lands on Radio: the world is the home (docs/WORLD.md, open question 2).
 */
export function districtFor(name, params = {}) {
  switch (name) {
    case 'home': case 'radio': return 'radio';
    case 'ondes': case 'atlas': case 'playlists': case 'booth': case 'zone': return name;
    // Off the map from 11-01 to 11-03; then its window on Echo, the Archive since that evening, whichever room is open.
    // The old Archives' address leads there too.
    case 'portfolio': case 'archives': return 'portfolio';
    // Every reading page opens in Articles: an article, a clipping of the press, a text of the Livre miroir.
    case 'echo': return params.slug ? 'articles' : 'une';
    case 'articles': case 'presse': return 'articles';
    // The texts' list went into the Livre miroir (2026-11-03): /echo/lectures leads to the Archive, a text to Articles.
    case 'lectures': case 'ecrits': return params.slug ? 'articles' : 'portfolio';
    // A version of the past, in its own window — only while it is on the map (online, or in the Atelier).
    case 'version': return BY_ID.has(params.id) ? params.id : null;
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
 * A phone frame is never wider than the map's tightest gap side by side, nor
 * taller than its tightest stack (Atlas under Playlists: 720 apart), so two
 * never overlap — a phone on its side is wider than any phone upright.
 * tests/site-world.test.js measures it on the map as published.
 */
export const PHONE_MAX_W = 736;
export const PHONE_MAX_H = 700;

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
  const side = sideOf(vw);
  const top = TOP;
  const aw = Math.max(120, vw - 2 * side);
  const ah = Math.max(120, vh - top - Math.max(bottom, BOTTOM));
  const s = clamp(Math.min(aw / (d.w + 40), ah / (d.h + 36)), MIN_SCALE, MAX_SCALE);
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
export const pageZoom = (s) => (Math.abs(s - 1) < 0.001 ? 1 : Number((1 / s).toFixed(4)));

/**
 * How much smaller than 1:1 a page must be drawn to show whole in its window: `inner` is the page's
 * height at the zoom tried, `room` the window's. 1 when it fits; never below FIT_MIN.
 */
export const fitFactor = (inner, room, f = 1) => (inner <= room + 1 ? f : clamp(f * (room / inner), FIT_MIN, 1));

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
