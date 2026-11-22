/**
 * Whether this tab wants the boat (site/js/boat/boat.js): ?boat=1 turns it on, ?boat=0 off, and the choice is kept for
 * the tab as the world's is (site/js/world/flag.js). Never on by default: the map stays the front (Ortis, 2026-11-18).
 *
 * Never on a phone (Ortis, 2026-11-22: « remove the boat option from the phone version only »): a phone that opens a
 * ?boat=1 link gets the map, and the choice is not remembered there, so the same tab widened to a desktop still can.
 */
const KEY = 'gt.boat';

export function boatWanted({ search = '', storage = null, phone = false } = {}) {
  if (phone) return false;
  const v = new URLSearchParams(search).get('boat');
  try { if (v === '1' || v === '0') storage?.setItem(KEY, v); } catch { /* private mode: this page only */ }
  if (v === '1' || v === '0') return v === '1';
  try { return storage?.getItem(KEY) === '1'; } catch { return false; }
}
