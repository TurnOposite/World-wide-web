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
 * article's own address, Archives has no page before phase 4). `tag` places
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
    hosts: 'The front page: masthead, lead story, the live box', tag: [4, 18, 4] },
  { id: 'articles', code: 'E-02', title: 'Articles', half: 'echo', x: 4080, y: 120, w: 900, h: 1100, rot: 0, route: null,
    hosts: 'The reading page: headline, hero, body, notes', tag: [12, 29, -3] },
  { id: 'lectures', code: 'E-03', title: 'Lectures', half: 'echo', x: 2860, y: 1330, w: 900, h: 920, rot: 0, route: 'echo/lectures',
    hosts: 'The texts, with what plays next on air', tag: [3, 41, 6] },
  { id: 'archives', code: 'E-04', title: 'Archives', half: 'echo', x: 4000, y: 1480, w: 980, h: 800, rot: 0, route: null,
    hosts: 'The press, the tag index, the feed', tag: [10, 53, -6] },
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
    default: return null;
  }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** At or under this width the world is laid out for a phone (world.css's breakpoint). */
export const PHONE_MAX = 760;
/** On a phone the frame leaves this much screen at each side, and starts under the header and the tag strip. */
const PHONE_SIDE = 12;
const PHONE_TOP = 116;
/** A phone frame is never taller than the map's tightest stack (Zone over Playlists: 730 apart), so two never overlap. */
const PHONE_MAX_H = 700;

/**
 * The size a district's frame takes on this screen. On a desktop it is the
 * map's. On a phone it is the screen itself — the free area under the tag
 * strip — because a landscape frame scaled down to a portrait screen would
 * leave a page a few lines tall; the camera then shows it at 1:1.
 */
export function frameFor(d, vw, vh, { phone = vw <= PHONE_MAX, bottom = 64 } = {}) {
  if (!phone) return { w: d.w, h: d.h };
  return { w: Math.max(240, vw - 2 * PHONE_SIDE), h: clamp(vh - PHONE_TOP - bottom, 240, PHONE_MAX_H) };
}

/**
 * Where the camera sits to show a district: centred in the screen's free
 * area and scaled down until the whole frame fits. On a desktop the tags
 * own a column on each side; on a phone they are a strip under the header
 * and the frame is the screen (frameFor), so the scale is 1.
 */
export function cameraFor(d, vw, vh, { phone = vw <= PHONE_MAX, bottom = 64 } = {}) {
  if (phone) return { tx: PHONE_SIDE - d.x, ty: PHONE_TOP - d.y, s: 1 };
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
