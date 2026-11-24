/**
 * Genre backdrops.
 *
 * `server/lib/genre.js` is the single source of truth for genre
 * *classification* — a track's `genreSlug` comes from the API, already
 * computed there, same as `genreAccent` (see docs/DECISIONS.md 2026-08-19,
 * "Genre hue is carried on the track, not duplicated in the browser"). What
 * lives here is a *presentation* choice on top of that slug — which of the
 * three curated backdrop images (if any) suits the mood — the same kind of
 * client-side skinning decision `PRESETS` makes in viz.js. Nothing about
 * classification is duplicated here, only "how to decorate it".
 *
 * Only three of `GENRES`' fourteen slugs are mapped. That is deliberate, not
 * incomplete: `public/assets/backdrops/` holds three images total (see
 * docs/DECISIONS.md for which nine of the twelve Portfolio source images were
 * dropped, and why), and forcing a weak visual match on every remaining
 * genre would be worse than the sober default they already fall back to.
 */

const BACKDROP_DIR = '/assets/backdrops';

/**
 * genreSlug -> backdrop base name (server/lib/genre.js GENRES[].slug).
 *
 * barber-beats: the library's dominant genre (63% of the real library at
 *   time of writing — `npm run scan -- --list`), and genre.js's own header
 *   comment characterises it by example as moody downtempo/idm (Macroblank,
 *   undersaken, slowerpace) — the quiet, monochrome, contemplative mood
 *   `birdup.webp` was made for.
 * vaporwave: thatbirdominous.webp's posterised, saturated, oversaturated-
 *   poster palette is close to vaporwave's own visual language.
 * dnb-jungle: whattheelephantbluer.webp is, literally, an elephant in a
 *   jungle — and its cool blue tone matches the genre's atmospheric,
 *   electronic-not-organic character.
 */
const GENRE_BACKDROPS = {
  'barber-beats': 'birdup',
  vaporwave: 'thatbirdominous',
  'dnb-jungle': 'whattheelephantbluer',
};

/** The full set, for placeholder use where no genre is in play. */
const ALL_BACKDROPS = ['birdup', 'thatbirdominous', 'whattheelephantbluer'];

/** @param {string|null|undefined} genreSlug @returns {string|null} */
export function backdropUrlForGenre(genreSlug) {
  const name = genreSlug && GENRE_BACKDROPS[genreSlug];
  return name ? `${BACKDROP_DIR}/${name}.webp` : null;
}

/** @param {string} name one of ALL_BACKDROPS */
export function backdropUrl(name) {
  return ALL_BACKDROPS.includes(name) ? `${BACKDROP_DIR}/${name}.webp` : null;
}

export { GENRE_BACKDROPS, ALL_BACKDROPS };

/**
 * A two-layer cross-fader, shared by app.js (player) and schedule.js (guide)
 * so the crossfade/cut logic exists exactly once.
 *
 * Whether a change animates or cuts is entirely CSS's decision (see
 * `.backdrop-layer`'s transition and the project-wide
 * `@media (prefers-reduced-motion:reduce)` rule in styles.css, which already
 * zeroes every transition) — this only ever toggles a class, on purpose, so
 * "respect prefers-reduced-motion" needed no special-casing here at all.
 *
 * @param {HTMLElement} layerA
 * @param {HTMLElement} layerB
 * @returns {(url: string|null) => void} setBackdrop
 */
export function createBackdropSwitcher(layerA, layerB) {
  let front = layerA;
  let back = layerB;
  let current = undefined;   // undefined, not null, so the very first call always runs

  return function setBackdrop(url) {
    if (url === current) return;
    current = url;
    if (url) back.style.backgroundImage = `url("${url}")`;
    back.classList.toggle('visible', Boolean(url));
    front.classList.remove('visible');
    [front, back] = [back, front];
  };
}
