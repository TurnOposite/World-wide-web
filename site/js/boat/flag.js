/**
 * Whether this tab wants the boat (site/js/boat/boat.js): ?boat=1 turns it on, ?boat=0 off, and the choice is kept for
 * the tab as the world's is (site/js/world/flag.js). Never on by default: the map stays the front (Ortis, 2026-11-18).
 */
const KEY = 'gt.boat';

export function boatWanted({ search = '', storage = null } = {}) {
  const v = new URLSearchParams(search).get('boat');
  try { if (v === '1' || v === '0') storage?.setItem(KEY, v); } catch { /* private mode: this page only */ }
  if (v === '1' || v === '0') return v === '1';
  try { return storage?.getItem(KEY) === '1'; } catch { return false; }
}
