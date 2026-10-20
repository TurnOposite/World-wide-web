/**
 * /playlists — the Spotify playlists Ortis has made, as cards that link out.
 *
 * One embed only, the featured playlist at the top (Arthur's explicit choice,
 * 2026-10-20 — docs/DECISIONS.md): logged-out visitors hear 30-second previews.
 * Every other playlist is a card that links out. A card is a title, the vibe in a line, the years, and a link.
 * He adds a playlist by editing site/data/playlists.json.
 */
import { esc } from '../ui/util.js';

export const title = 'Playlists';

/** Only https links to Spotify are rendered as links; anything else is dropped. */
export const isSpotifyEmbed = (u) => /^https:\/\/open\.spotify\.com\/embed\/playlist\/[A-Za-z0-9]+(\?[\w=&.-]*)?$/.test(String(u || ''));
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
    ${data.featured && isSpotifyEmbed(data.featured.embed) ? `
    <section class="pl-featured" aria-label="${esc(data.featured.title || 'Playlist à la une')}">
      <iframe title="${esc(data.featured.title || 'Playlist')} — Spotify" src="${esc(data.featured.embed)}" width="100%" height="352"
        style="border-radius:12px;border:0" loading="lazy" allowfullscreen
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
    </section>` : ''}
    ${list.length ? `<div class="playlists">${list.map((p) => `
      <a class="pl-card" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
        ${p.years && p.years !== 'à compléter' ? `<span class="pl-years">${esc(p.years)}</span>` : ''}
        <b>${esc(p.title || 'Playlist')}</b>
        ${p.vibe && p.vibe !== 'à compléter' ? `<p class="pl-vibe">${esc(p.vibe)}</p>` : ''}
        <span class="pl-out">Écouter sur Spotify ↗</span>
      </a>`).join('')}</div>` : '<p class="hint">Aucune playlist pour l\'instant.</p>'}
    ${isSpotifyUrl(data.profile) ? `<p class="pl-profile"><a href="${esc(data.profile)}" target="_blank" rel="noopener noreferrer">Tout le profil ZoNeKo sur Spotify ↗</a></p>` : ''}`;
}
