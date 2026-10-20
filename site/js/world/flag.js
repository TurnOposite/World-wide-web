/**
 * Is the world shell on for this visit? (docs/WORLD.md)
 *
 * Off unless config.json says `"world": true` or the address carries
 * `?world=1`. The query is remembered for the tab (sessionStorage), because
 * the site's own links are relative and drop it on the first click;
 * `?world=0` or `?classic=1` turns it off again and forgets it. With the
 * flag off, main.js never loads anything under world/ but this file.
 */
const KEY = 'gt.world';

/** 'on', 'off', or null when the address says nothing. */
export function worldChoice(search = '') {
  const q = new URLSearchParams(search);
  if (q.get('classic') === '1' || q.get('world') === '0') return 'off';
  if (q.get('world') === '1') return 'on';
  return null;
}

/**
 * @param {object} o
 * @param {object} [o.config]   config.json
 * @param {string} [o.search]   location.search
 * @param {Storage|null} [o.storage]  sessionStorage, or null where it throws
 */
export function worldWanted({ config = {}, search = '', storage = null } = {}) {
  const choice = worldChoice(search);
  try {
    if (choice === 'on') storage?.setItem(KEY, '1');
    if (choice === 'off') storage?.removeItem(KEY);
  } catch { /* private mode: the choice lasts this page only */ }
  if (choice) return choice === 'on';
  let remembered = null;
  try { remembered = storage?.getItem(KEY) ?? null; } catch { /* same */ }
  if (remembered === '1') return true;
  return config.world === true;
}
