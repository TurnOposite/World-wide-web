/**
 * The site's map as data (docs/ATELIER.md). `site/data/layout.json` says
 * where every page's window sits on the world and where its tag sits in the
 * menu — today's pages and the versions of the past, each of those online
 * or offline. layout.js keeps what a page *is* (its code, title, half,
 * route); the file says where it *is*, so moving a window is an edit to one
 * JSON file — by hand, from the Atelier, or with `npm run layout` — never
 * to code. Pure, like layout.js: tests/atelier.test.js checks all of it.
 */
import { DESIGNED, DISTRICTS, WORLD, BASE_H, PHONE_MAX_W, PHONE_MAX_H, reindex } from './layout.js';

export const LAYOUT_VERSION = 1;

/** The smallest window the Atelier lets you make: below it a page is a few lines tall. */
export const MIN_W = 360;
export const MIN_H = 240;
/** Two windows closer than this read as one. */
export const GAP = 20;
/** Space kept under the lowest window, so the camera has ground to land on. */
const FLOOR = 160;

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (v) => Math.round(v * 10) / 10;

/** A page's place: what the file stores for one of today's pages. */
export function placementOf(d) {
  return { id: d.id, x: d.x, y: d.y, w: d.w, h: d.h, rot: d.rot, tag: [...d.tag] };
}

/**
 * A version of the past as the file describes it. Everything a past page is
 * lives in the file (there is no code for it): its code (P-01…), title,
 * half (which side of the world, hence its skin), kind — `version` (a frozen
 * copy of the site under past/<id>/) or `external` (another site, at url) —
 * and status. Returns the page, or a string saying what is wrong.
 */
function pastPage(p) {
  if (!/^[a-z][a-z0-9-]{0,23}$/.test(p.id || '')) return `"${p.id}" is not a usable id (a-z, 0-9, -)`;
  if (!/^P-\d{2}$/.test(p.code || '')) return `${p.id}: code must look like P-01`;
  if (!p.title) return `${p.id}: no title`;
  if (p.half !== 'zone' && p.half !== 'echo') return `${p.id}: half must be zone or echo`;
  if (p.kind !== 'version' && p.kind !== 'external') return `${p.id}: kind must be version or external`;
  if (p.kind === 'external' && !/^https:\/\//.test(p.url || '')) return `${p.id}: an external page needs an https url`;
  return {
    id: p.id, code: p.code, title: p.title, half: p.half, era: 'past', kind: p.kind,
    status: p.status === 'online' ? 'online' : 'offline',
    route: `versions/${p.id}`,
    hosts: p.hosts || '',
    since: p.since || null, until: p.until || null, source: p.source || null,
    routes: Array.isArray(p.routes) ? p.routes.map(String) : [''],
    url: p.url || null,
    x: p.x, y: p.y, w: p.w, h: p.h, rot: num(p.rot) ? p.rot : 0,
    tag: Array.isArray(p.tag) && p.tag.length === 3 ? p.tag.map(Number) : [4, 88, 0],
  };
}

/**
 * The map the site shows. layout.js's pages are placed where the file says
 * (a page the file does not mention keeps its designed place), in the
 * file's order; then the past pages the file lists. Offline pages are left
 * out unless `all` — the Atelier shows them, greyed, so they can be put
 * back online. Nothing here throws: a bad entry is reported in `problems`
 * and the rest of the map still stands.
 *
 * @returns {{ pages: object[], problems: string[] }}
 */
export function resolveLayout(file, { all = false, designed = DESIGNED } = {}) {
  const problems = [];
  const known = new Map(designed.map((d) => [d.id, d]));
  const entries = Array.isArray(file?.pages) ? file.pages : [];
  if (file && !Array.isArray(file.pages)) problems.push('layout.json has no "pages" list');
  const seen = new Set();
  const pages = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object' || seen.has(e.id)) { problems.push(`skipped a repeated or empty entry (${e?.id})`); continue; }
    seen.add(e.id);
    const base = known.get(e.id);
    let page;
    if (base) {
      page = { ...base, era: 'current', status: 'online', tag: [...base.tag] };
      for (const k of ['x', 'y', 'w', 'h', 'rot']) if (num(e[k])) page[k] = e[k];
      if (Array.isArray(e.tag) && e.tag.length === 3 && e.tag.every(num)) page.tag = [...e.tag];
    } else if (e.era === 'past' || e.kind) {
      page = pastPage(e);
      if (typeof page === 'string') { problems.push(page); continue; }
      if (![page.x, page.y, page.w, page.h].every(num)) { problems.push(`${e.id}: x, y, w and h must be numbers`); continue; }
    } else {
      problems.push(`"${e.id}" is no page of the site and no past version — left out`);
      continue;
    }
    if (page.status === 'online' || all) pages.push(page);
  }
  // A page of today the file forgot still has a window: where it was designed, after the others.
  for (const d of designed) if (!seen.has(d.id)) pages.push({ ...d, era: 'current', status: 'online', tag: [...d.tag] });
  return { pages, problems };
}

/** How tall the world is with these windows on it: the designed 2600, or more when the past band is lower. */
export function worldHeight(pages) {
  const bottom = Math.max(0, ...pages.map((d) => d.y + d.h));
  return Math.max(BASE_H, Math.ceil((bottom + FLOOR) / 100) * 100);
}

/**
 * Put a resolved map on the world: DISTRICTS (the array every world module
 * reads) is refilled in place and re-indexed, and the world grows to hold
 * its lowest window. Called once at boot, before the world is mounted —
 * and by the Atelier as you drag.
 */
export function applyPages(pages) {
  DISTRICTS.splice(0, DISTRICTS.length, ...pages);
  reindex();
  WORLD.h = worldHeight(pages);
  return DISTRICTS;
}

const overlap = (a, b, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/**
 * What is wrong with a map, worst first. Errors would break the site (a
 * window off the world, two windows on top of each other, two phone frames
 * that would cover each other); warnings only look wrong (a Zone window on
 * Echo's paper, a tag off the screen). `npm run layout -- check`, the unit
 * tests and `fire` refuse a map with errors.
 *
 * @returns {{ level: 'error'|'warn', id: string, msg: string }[]}
 */
export function checkLayout(pages) {
  const out = [];
  const err = (id, msg) => out.push({ level: 'error', id, msg });
  const warn = (id, msg) => out.push({ level: 'warn', id, msg });
  for (const d of pages) {
    if (![d.x, d.y, d.w, d.h, d.rot].every(num)) { err(d.id, 'x, y, w, h and rot must be numbers'); continue; }
    if (d.w < MIN_W || d.h < MIN_H) err(d.id, `${d.w} × ${d.h} is too small (at least ${MIN_W} × ${MIN_H})`);
    if (d.x < 0 || d.y < 0 || d.x + d.w > WORLD.w) err(d.id, `off the world (it is ${WORLD.w} wide; x and y start at 0)`);
    if (Math.abs(d.rot) > 6) warn(d.id, `tilted ${d.rot}° — past 6° the text leans too much to read`);
    const zoneSide = d.x + d.w / 2 < WORLD.seam;
    if (d.half === 'zone' && d.x + d.w > WORLD.seam - 120) warn(d.id, 'a Zone window reaching onto Echo’s paper');
    if (d.half === 'echo' && d.x < WORLD.seam + 120) warn(d.id, 'an Echo window reaching into Zone’s night');
    if ((d.half === 'zone') !== zoneSide) warn(d.id, `stands on the ${zoneSide ? 'Zone' : 'Echo'} side but wears ${d.half === 'zone' ? 'Zone' : 'Echo'}’s skin`);
    const [tx, ty] = d.tag || [];
    if (!num(tx) || !num(ty) || tx < 0 || tx > 40 || ty < 6 || ty > 92) warn(d.id, 'its tag sits off the menu’s column (0–40 % from the side, 6–92 % from the top)');
  }
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const a = pages[i];
      const b = pages[j];
      if (overlap(a, b, GAP)) err(a.id, `on top of ${b.id} (keep ${GAP} px between windows)`);
      // On a phone each frame is the screen (layout.js frameFor), at most 736 × 700 from the window's corner.
      else if (overlap({ x: a.x, y: a.y, w: PHONE_MAX_W, h: PHONE_MAX_H }, { x: b.x, y: b.y, w: PHONE_MAX_W, h: PHONE_MAX_H })) {
        err(a.id, `too close to ${b.id} for a phone (corners at least ${PHONE_MAX_W} px apart across or ${PHONE_MAX_H} down)`);
      }
    }
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}

/**
 * The file for a map: today's pages by their place only (what they are stays
 * in layout.js), the past ones whole. `pages` must be the full map, offline
 * pages included (resolveLayout with all), or they would drop out of the file.
 */
export function layoutFile(pages, { readme = DEFAULT_README, updatedAt = new Date().toISOString() } = {}) {
  return {
    _readme: readme,
    version: LAYOUT_VERSION,
    updatedAt,
    pages: pages.map((d) => {
      const place = { x: round(d.x), y: round(d.y), w: round(d.w), h: round(d.h), rot: round(d.rot), tag: d.tag.map(round) };
      if (d.era !== 'past') return { id: d.id, ...place };
      const p = { id: d.id, code: d.code, title: d.title, era: 'past', kind: d.kind, half: d.half, status: d.status };
      for (const k of ['since', 'until', 'source', 'url']) if (d[k]) p[k] = d[k];
      if (d.hosts) p.hosts = d.hosts;
      if (d.kind === 'version') p.routes = d.routes;
      return { ...p, ...place };
    }),
  };
}

/** Where the Atelier keeps its draft: this browser only (localStorage), never anyone else's. */
export const DRAFT_KEY = 'gt.atelier.draft';

/**
 * The Atelier's draft over the published map. A version of the past the
 * draft names but the published map no longer has is dropped (its snapshot
 * may be gone); one published since the draft was made is added.
 */
export function mergeDraft(published, draft) {
  if (!Array.isArray(draft?.pages)) return published;
  const pub = new Map((published?.pages || []).map((p) => [p.id, p]));
  const pages = draft.pages.filter((p) => p && (pub.has(p.id) || p.era !== 'past'));
  for (const p of pub.values()) if (!pages.some((q) => q.id === p.id)) pages.push(p);
  return { ...(published || {}), pages };
}

/** The file's text: one page per line, so a hand edit or a diff reads as « Atlas moved », not forty lines of numbers. */
export function stringifyLayout(file) {
  const { pages = [], ...head } = file;
  const top = JSON.stringify(head, null, 2).slice(0, -2);
  return `${top},\n  "pages": [\n${pages.map((p) => `    ${JSON.stringify(p)}`).join(',\n')}\n  ]\n}\n`;
}

export const DEFAULT_README = 'The map of the site (docs/ATELIER.md). Every page that is or was part of Globe Trotter: where its window sits on the world (x, y, w, h in world pixels — the world is 5200 wide, Zone left of 2600, Echo right of it; rot in degrees) and where its tag sits in the menu (tag: % from its side, % from the top, tilt). The pages of today keep what they are in site/js/world/layout.js; the versions of the past (era "past") are described here whole, and each is online or offline. Change it in the Atelier (?atelier=1), with `npm run layout`, or by hand; `npm run layout -- check` says whether it holds; `fire` publishes it.';
