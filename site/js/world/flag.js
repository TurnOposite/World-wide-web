/**
 * Is the world shell on for this visit? (docs/WORLD.md)
 *
 * On when config.json says `"world": true` — what the site ships since the
 * switch-over (phase 5b). The classic shell stays one release behind
 * `?classic=1` (or `?world=0`), and `?world=1` asks for the world on a
 * build that ships it off. Either choice is remembered for the tab
 * (sessionStorage), because the site's own links are relative and drop the
 * query on the first click; a new tab starts again from config.json. With
 * the flag off, main.js never loads anything under world/ but this file.
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
    if (choice) storage?.setItem(KEY, choice === 'on' ? '1' : '0');
  } catch { /* private mode: the choice lasts this page only */ }
  if (choice) return choice === 'on';
  let remembered = null;
  try { remembered = storage?.getItem(KEY) ?? null; } catch { /* same */ }
  if (remembered === '1') return true;
  if (remembered === '0') return false;
  return config.world === true;
}
