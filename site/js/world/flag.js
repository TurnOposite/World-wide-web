/**
 * The world's switches (docs/WORLD.md).
 *
 * Until 2026-11-25 this file also decided whether the world was on at all: config.json's `"world": true`, with the
 * classic shell one release behind `?classic=1` (or `?world=0`), remembered for the tab. That shell is retired
 * (docs/plans/LIGHTER-2026-11-24.md, step 3): the world is the site, and only the boat (`?boat=1`, boat/flag.js)
 * stands instead of it. An old `?classic=1` link opens the world like any other.
 */
/**
 * The Atelier (docs/ATELIER.md) — the map's editor, on top of the world:
 * `?atelier=1` turns it on for the tab, `?atelier=0` off (remembered in
 * sessionStorage, as the boat's choice is). It edits a draft in this browser only; nobody else sees it until
 * the map is saved into the repository and published.
 */
export function atelierWanted({ search = '', storage = null } = {}) {
  return tabSwitch('atelier', { search, storage });
}

/**
 * The pulse (lib/pulse.js, Lighter step 5): the sky of the hour and the bass, shared by the whole site — a proposal
 * Ortis looks at behind `?pulse=1` (`?pulse=0` off), remembered for the tab like the Atelier.
 */
export function pulseWanted({ search = '', storage = null } = {}) {
  return tabSwitch('pulse', { search, storage });
}

/** `?name=1` on, `?name=0` off, kept in sessionStorage for the tab; off by default. */
function tabSwitch(name, { search, storage }) {
  const v = new URLSearchParams(search).get(name);
  try {
    if (v === '1' || v === '0') storage?.setItem(`gt.${name}`, v);
  } catch { /* private mode: this page only */ }
  if (v === '1' || v === '0') return v === '1';
  try { return storage?.getItem(`gt.${name}`) === '1'; } catch { return false; }
}
