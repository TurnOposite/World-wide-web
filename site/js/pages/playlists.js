/**
 * /playlists — the Spotify playlists Ortis has made, playable here.
 *
 * The deck (ui/spotify-deck.js) is one Spotify player and every playlist of
 * the ZoNeKo profile as a card: a card loads its playlist into the player
 * (Arthur, 2026-10-20 — docs/DECISIONS.md). The Zone page carries the same
 * deck in its compact form. He adds a playlist by editing
 * site/data/playlists.json.
 */
import { esc } from '../ui/util.js';
import { loadPlaylists, mountDeck } from '../ui/spotify-deck.js';

export const title = 'Playlists';

export async function mount(root, ctx) {
  let intro = '';
  try { intro = (await loadPlaylists()).intro || ''; } catch { /* no intro */ }
  root.innerHTML = `
    <div class="page-head">
      <h1>Playlists</h1>
      <p>${esc(intro)}</p>
    </div>
    <div id="plDeck"></div>`;
  return mountDeck(root.querySelector('#plDeck'), { player: ctx?.player });
}
