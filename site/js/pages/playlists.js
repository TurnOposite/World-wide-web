/**
 * /playlists — the Spotify playlists Ortis has made, playable here.
 *
 * The deck (ui/spotify-deck.js) is one Spotify player and every playlist of
 * the ZoNeKo profile as a card: a card loads its playlist into the player
 * (Arthur, 2026-10-20 — docs/DECISIONS.md). The Zone page carries the same
 * deck in its compact form. He adds a playlist by editing
 * site/data/playlists.json.
 *
 * Under the deck, his Bandcamp (2026-11-22): the Bandcamp logo, a link to his
 * profile, and one sentence — « make it much simpler ». The address and the
 * sentence are the `bandcamp` block of playlists.json.
 */
import { esc } from '../ui/util.js';
import { bandcampLinks, loadPlaylists, mountDeck } from '../ui/spotify-deck.js';

export const title = 'Playlists';

/** The Bandcamp section's markup, or '' when playlists.json has none. */
export function bandcampSection(data) {
  const bc = bandcampLinks(data);
  if (!bc) return '';
  return `
    <aside class="bc-links">
      <a class="bc-link" href="${esc(bc.profile)}" target="_blank" rel="noopener noreferrer">
        <img class="bc-logo" src="assets/bandcamp-logo.png" alt="Bandcamp" width="230" height="38" loading="lazy" decoding="async">
        <span class="bc-text">${esc(bc.text)}</span>
      </a>
    </aside>`;
}

export async function mount(root, ctx) {
  let data = {};
  try { data = await loadPlaylists(); } catch { /* no intro, no Bandcamp */ }
  root.innerHTML = `
    <div class="page-head">
      <h1>Playlists</h1>
      <p>${esc(data.intro || '')}</p>
    </div>
    <div id="plDeck"></div>
    ${bandcampSection(data)}`;
  return mountDeck(root.querySelector('#plDeck'), { player: ctx?.player });
}
