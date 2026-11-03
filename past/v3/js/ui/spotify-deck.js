/**
 * The Spotify deck — every ZoNeKo playlist, playable in one Spotify player
 * (Arthur, 2026-10-20 — docs/DECISIONS.md « Playlists play on the site »).
 *
 * One iframe, whatever the number of playlists: choosing one swaps the
 * frame's src. Sixty-five frames would load sixty-five copies of Spotify's
 * player on a page the Pi also serves.
 *
 * The frame loads eagerly. `loading="lazy"` never fired here: the router
 * builds the page before it is laid out, and on 85c46c1 the featured player
 * stayed a blank box until something reloaded it.
 *
 * Choosing a playlist does not stop the radio — reading the list is not
 * listening. Pressing anything inside the Spotify player does: the frame
 * takes focus, the window blurs, and the station is muted so the two never
 * play over each other. The radio's own play button brings it back on the
 * clock.
 */
import { esc } from './util.js';

const ID = /^[A-Za-z0-9]{10,40}$/;

/** The playlist id in an open.spotify.com playlist or embed URL, else null. */
export function playlistId(url) {
  const m = /^https:\/\/open\.spotify\.com\/(?:embed\/)?playlist\/([A-Za-z0-9]+)(?:[?#].*)?$/.exec(String(url || ''));
  return m && ID.test(m[1]) ? m[1] : null;
}

/** Spotify's own player for a playlist id (the URL its « Embed » button gives). */
export const embedUrl = (id) => `https://open.spotify.com/embed/playlist/${id}?utm_source=generator`;

/** A cover is one of Ortis's own photos on Spotify's image CDN, or nothing. */
const COVER = /^https:\/\/image-cdn-[a-z]+\.spotifycdn\.com\/image\/[0-9a-f]{40}$/;

/**
 * The playlists worth showing, each once, in the order playlists.json gives
 * them — most saved first since 2026-11-03 (Ortis: « the ones with most
 * likes/saved to library first »). The featured playlist is the one the
 * player opens on, wherever it sits in that order; when it is not in the list
 * at all it leads it. [{ id, title, url, vibe, years, cover, featured }].
 * `vibe` is the few words under a card's name that help a listener choose
 * beyond its cryptic title (Ortis, 2026-11-01); `description` in
 * playlists.json is read as the same thing.
 */
export function deckList(data) {
  const seen = new Set();
  const out = [];
  const fid = playlistId(data?.featured?.url) || playlistId(data?.featured?.embed);
  const add = (p, front = false) => {
    const id = playlistId(p?.url) || playlistId(p?.embed);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const keep = (v) => (typeof v === 'string' && v !== 'à compléter' ? v : '');
    const cover = COVER.test(String(p.cover || '')) ? p.cover : '';
    const item = { id, title: String(p.title || 'Playlist'), url: `https://open.spotify.com/playlist/${id}`, vibe: keep(p.description) || keep(p.vibe), years: keep(p.years), cover, featured: id === fid };
    if (front) out.unshift(item); else out.push(item);
  };
  for (const p of data?.playlists || []) add(p);
  if (data?.featured) add(data.featured, true);
  return out;
}

let DATA = null;
/** site/data/playlists.json, fetched once per visit. */
export async function loadPlaylists() {
  if (!DATA) DATA = await (await fetch(new URL('data/playlists.json', document.baseURI))).json();
  return DATA;
}

/**
 * A card's vignette: the playlist's cover — Ortis's own photo — straight from
 * Spotify's CDN, which already serves the player. A playlist without one
 * (Spotify's mosaic of other people's album art does not count) gets its
 * initial on a plain tile, and so does a cover that fails to load.
 */
function cover(p) {
  const initial = esc((p.title.match(/[\p{L}\p{N}]/u) || ['♪'])[0].toUpperCase());
  return `<span class="pl-cover" aria-hidden="true" data-initial="${initial}">${p.cover
    ? `<img src="${esc(p.cover)}" alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : ''}</span>`;
}

/**
 * Builds the deck inside `root` and returns a cleanup function.
 * `compact`: the list as small chips (the Zone page), else as cards.
 */
export async function mountDeck(root, { player = null, compact = false } = {}) {
  let data = { playlists: [] };
  try { data = await loadPlaylists(); } catch { /* the empty state below */ }
  const list = deckList(data);
  if (!list.length) {
    root.innerHTML = '<p class="hint">Aucune playlist pour l\'instant.</p>';
    return () => {};
  }
  const first = list.find((p) => p.featured) || list[0];
  root.innerHTML = `
    <section class="sp-deck${compact ? ' compact' : ''}" aria-label="Playlists Spotify">
      <div class="sp-player">
        <iframe class="sp-frame" title="${esc(first.title)} — lecteur Spotify" src="${esc(embedUrl(first.id))}" width="100%" height="${compact ? 152 : 352}"
          style="border-radius:12px;border:0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
        <p class="sp-now" aria-live="polite">Dans le lecteur : <b class="sp-title">${esc(first.title)}</b>
          · <a class="sp-open" href="${esc(first.url)}" target="_blank" rel="noopener noreferrer">Ouvrir dans Spotify ↗</a></p>
      </div>
      <ul class="sp-list" role="list">${list.map((p) => `
        <li><button type="button" class="sp-pick" data-id="${esc(p.id)}" aria-pressed="${p.id === first.id}">
          ${compact ? '' : cover(p)}<span class="pl-text">${p.years ? `<span class="pl-years">${esc(p.years)}</span>` : ''}<b>${esc(p.title)}</b>${compact ? (p.vibe ? `<span class="pl-vibe">${esc(p.vibe)}</span>` : '') : `<span class="pl-vibe pl-desc">${esc(p.vibe)}</span>`}</span>
        </button></li>`).join('')}</ul>
      ${/^https:\/\/open\.spotify\.com\/user\/[A-Za-z0-9]+$/.test(String(data.profile || '')) ? `<p class="pl-profile"><a href="${esc(data.profile)}" target="_blank" rel="noopener noreferrer">Tout le profil ZoNeKo sur Spotify ↗</a></p>` : ''}
    </section>`;

  const frame = root.querySelector('.sp-frame');
  const byId = new Map(list.map((p) => [p.id, p]));
  const pick = (id) => {
    const p = byId.get(id);
    if (!p) return;
    frame.src = embedUrl(p.id);
    frame.title = `${p.title} — lecteur Spotify`;
    root.querySelector('.sp-title').textContent = p.title;
    root.querySelector('.sp-open').href = p.url;
    for (const b of root.querySelectorAll('.sp-pick')) b.setAttribute('aria-pressed', String(b.dataset.id === id));
    frame.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const onClick = (e) => {
    const b = e.target.closest('.sp-pick');
    if (b && root.contains(b)) pick(b.dataset.id);
  };
  // A click inside a cross-origin frame is invisible to the page, but it
  // moves focus into the frame and blurs the window: that is the cue.
  const onBlur = () => setTimeout(() => {
    if (document.activeElement === frame && player?.playing) player.mute();
  }, 0);
  // A cover that does not load leaves its tile and the initial under it.
  const onError = (e) => { if (e.target instanceof HTMLImageElement && e.target.closest('.pl-cover')) e.target.remove(); };
  root.addEventListener('click', onClick);
  root.addEventListener('error', onError, true);
  window.addEventListener('blur', onBlur);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('error', onError, true);
    window.removeEventListener('blur', onBlur);
  };
}
