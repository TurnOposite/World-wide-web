/**
 * /playlists — the Spotify playlists Ortis has made, as cards that link out.
 *
 * No embedded player on purpose: Spotify's embed plays 30-second previews to
 * visitors who are not signed in (docs/DECISIONS.md, 2026-08-17 and
 * 2026-10-20). A card is a title, the vibe in a line, the years, and a link.
 * He adds a playlist by editing site/data/playlists.json.
 */
import { esc } from '../ui/util.js';

export const title = 'Playlists';

/** Only https links to Spotify are rendered as links; anything else is dropped. */
export const isSpotifyUrl = (u) => /^https:\/\/open\.spotify\.com\//.test(String(u || ''));

export async function mount(root) {
  let data = { intro: '', playlists: [] };
  try { data = await (await fetch(new URL('data/playlists.json', document.baseURI))).json(); } catch { /* shows the empty state */ }
  const list = (data.playlists || []).filter((p) => isSpotifyUrl(p.url));
  root.innerHTML = `
    <div class="page-head">
      <h1>Playlists</h1>
      <p>${esc(data.intro || '')}</p>
    </div>
    ${list.length ? `<div class="playlists">${list.map((p) => `
      <a class="pl-card" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
        <span class="pl-years">${esc(p.years || '')}</span>
        <b>${esc(p.title || 'Playlist')}</b>
        <p class="pl-vibe">${esc(p.vibe || '')}</p>
        <span class="pl-out">Écouter sur Spotify ↗</span>
      </a>`).join('')}</div>` : '<p class="hint">Aucune playlist pour l\'instant.</p>'}`;
}
