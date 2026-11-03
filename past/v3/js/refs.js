/**
 * Short, stable names for every page, today's and the past's, so one page
 * can point at another without knowing where it lives (docs/ATELIER.md):
 *
 *   E-05 · atlas          the Atlas of the places, wherever its window is on the map
 *   Z-03 · zone           Zone's Atlas: where the tower broadcasts from
 *   E-02/<slug>           an Echo article        E-03/<slug>  a text in Lectures
 *   Z-05/photos           a Portfolio room (Z-05 left the map: RETIRED)
 *   P-01 · v1             the v1 version, in its window on the world
 *   v1/atlas              the v1 site itself, at its own /atlas
 *
 * In a page or an article, `gt:E-05` as a link's address becomes `go/Z-04`
 * (linkTo); `/go/<ref>` is also the form to share. It is resolved when it is
 * followed, against the map of that day — so a link handed out before the
 * Atelier moved things, or before a version went offline, still lands, or
 * says plainly why it cannot. Pure: no DOM, tested in node.
 */

/** Old names of today's pages, and the reverse: what a route was called in an older version. */
export const RENAMED = [
  ['echoes', 'ondes'],
  ['ecrits', 'echo/lectures'],
];

/**
 * Codes whose window left the map, and the address they lead to now — a short link handed
 * out before keeps landing (2026-11-01: the Portfolio left Zone's side; that evening the map's
 * Atlas, Z-04, moved to Echo as E-05, and Z-03 became Zone's Atlas again).
 */
export const RETIRED = new Map([
  ['z-04', 'atlas'],
  ['z-05', 'portfolio'],
]);

const SAFE = /^[\w-]+(?:\/[\w-]+)*$/;

/** `gt:Z-04` → `Z-04`; anything else as it was, trimmed of slashes. */
export function refOf(href) {
  return String(href || '').trim().replace(/^gt:/i, '').replace(/^\/+|\/+$/g, '');
}

/** The address a `gt:` link is given: relative to the site's root, like every link here. */
export const linkTo = (ref) => `go/${refOf(ref)}`;

function find(pages, head) {
  const h = head.toLowerCase();
  return pages.find((p) => p.id === h || String(p.code || '').toLowerCase() === h) || null;
}

/**
 * Where a ref leads, against a map (model.js resolveLayout with `all`, so an
 * offline version is known as offline rather than unknown):
 *
 *   { kind: 'route', to }     an address of this site — router.go(to)
 *   { kind: 'load', to }      another app on this host (a past version) — a full page load
 *   { kind: 'external', to }  another site
 *   { kind: 'offline', page } a past version that is switched off
 *   null                      not a ref
 */
export function resolveRef(ref, pages) {
  const r = refOf(ref);
  if (r === '') return { kind: 'route', to: '' };
  if (!SAFE.test(r)) return null;
  const [head, ...restParts] = r.split('/');
  const rest = restParts.join('/');
  const page = find(pages, head);
  const retired = page ? null : RETIRED.get(head.toLowerCase());
  if (retired) return { kind: 'route', to: rest ? `${retired}/${rest}` : retired };
  // Not a page's name: an address of the site (go/ecrits/voyages) passes through; anything else is no ref.
  if (!page) return HEADS.has(head) ? { kind: 'route', to: r } : null;
  if (page.era === 'past') {
    if (page.status !== 'online') return { kind: 'offline', page };
    if (page.kind === 'external') return { kind: 'external', to: page.url, page };
    if (restParts.length === 0) return { kind: 'route', to: page.route, page };
    return { kind: 'load', to: `past/${page.id}/${rest}`, page };
  }
  if (rest) {
    if (page.id === 'articles' || page.id === 'une') return { kind: 'route', to: `echo/${rest}`, page };
    if (page.id === 'lectures') return { kind: 'route', to: `echo/lectures/${rest}`, page };
    if (page.id === 'portfolio') return { kind: 'route', to: `portfolio/${rest}`, page };
  }
  return { kind: 'route', to: page.route ?? 'echo', page };
}

/**
 * The same page in another version: `route` as one version calls it, turned
 * into what `routes` (the other version's list of first segments, '' for its
 * home) calls it, or null when the other version never had it. Renames go
 * both ways (RENAMED): v1's « echoes » is today's « ondes ».
 */
export function sameRoute(route, routes) {
  const r = refOf(route);
  // Lectures and Archives are pages of their own under Echo's address: a version has them only if it lists them.
  const has = (x) => {
    const under = PAGES_UNDER.find((p) => x === p || x.startsWith(`${p}/`));
    return under ? routes.includes(under) : routes.includes(x.split('/')[0]);
  };
  if (r === '') return routes.includes('') ? '' : null;
  if (has(r)) return r;
  for (const [a, b] of RENAMED) {
    for (const [from, to] of [[a, b], [b, a]]) {
      if (r === from || r.startsWith(`${from}/`)) {
        const moved = to + r.slice(from.length);
        if (has(moved) || routes.includes(to)) return moved;
      }
    }
  }
  return null;
}

const PAGES_UNDER = ['echo/lectures', 'echo/archives'];

/**
 * The heavy files every version shares with today (33 MB): never copied under
 * past/<id>/. A version's frozen data names them relative to its own address
 * (`collections/u/x.jpg`); pointHome points such a name at today's copy,
 * ../../collections/u/x.jpg from past/<id>/ (scripts/site-past.mjs, at build
 * time). In tower mode nothing needs doing: the tower names them from the
 * root (`/collections/…`, server/lib/collections.js), which is today's copy.
 */
export const FAR = ['collections', 'press'];
export function pointHome(value, own = () => false) {
  if (typeof value === 'string') return FAR.some((d) => value.startsWith(`${d}/`)) && !own(value) ? `../../${value}` : value;
  if (Array.isArray(value)) return value.map((v) => pointHome(v, own));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pointHome(v, own)]));
  return value;
}

/** Today's pages, by first segment (and the two under Echo), for sameRoute. The old names (RENAMED) are not here: they only redirect. */
export const TODAY = ['', 'radio', 'ondes', 'zone', 'atlas', 'portfolio', 'playlists', 'booth', 'echo', 'echo/lectures', 'echo/archives'];

/** The first segments of the site's own addresses, old names included, and the past's windows. */
const HEADS = new Set([...TODAY, ...RENAMED.map(([old]) => old), 'versions'].map((r) => r.split('/')[0]).filter(Boolean));
