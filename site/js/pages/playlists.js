/**
 * /playlists — the Spotify playlists Ortis has made, playable here.
 *
 * The deck (ui/spotify-deck.js) is one Spotify player and every playlist of
 * the ZoNeKo profile as a card: a card loads its playlist into the player
 * (Arthur, 2026-10-20 — docs/DECISIONS.md). The Zone page carries the same
 * deck in its compact form. He adds a playlist by editing
 * site/data/playlists.json.
 *
 * Under the deck, his Bandcamp (2026-11-22): plain links out, no player —
 * Bandcamp's embeds are per album, and the radio already plays what he buys
 * there. The words and links are the `bandcamp` block of playlists.json.
 */
import { esc } from '../ui/util.js';
import { bandcampLinks, loadPlaylists, mountDeck } from '../ui/spotify-deck.js';

export const title = 'Playlists';

/** The Bandcamp section's markup, or '' when playlists.json has none. */
export function bandcampSection(data) {
  const bc = bandcampLinks(data);
  if (!bc) return '';
  const out = 'target="_blank" rel="noopener noreferrer"';
  return `
    <section class="bc-links" aria-labelledby="bcHead">
      <h2 id="bcHead"><span class="bc-mark" aria-hidden="true">bc</span>${esc(bc.title)}</h2>
      ${bc.intro ? `<p class="bc-intro">${esc(bc.intro)}</p>` : ''}
      ${bc.links.length ? `<ul class="bc-list" role="list">${bc.links.map((l) => `
        <li><a class="bc-link" href="${esc(l.url)}" ${out}><b>${esc(l.title)} <span aria-hidden="true">↗</span></b>${l.note ? `<span>${esc(l.note)}</span>` : ''}</a></li>`).join('')}</ul>` : ''}
      ${bc.profile ? `<p class="pl-profile bc-profile"><a href="${esc(bc.profile)}" ${out}>Tout le profil ${esc(bc.name || 'Bandcamp')} sur Bandcamp ↗</a></p>` : ''}
    </section>`;
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
