/**
 * A version of the past, in its window (docs/ATELIER.md) — /versions/<id>.
 * A frozen copy of the site (scripts/site-past.mjs) opens inside a frame,
 * silent (site/past/bar.js: the world's mini-player stays the one radio),
 * with a way out to the copy on its own and its short link. Another site
 * (kind « external », Wix) opens in a new tab: it is not ours to frame.
 * A version that is offline says so — only the Atelier puts it on the map.
 */
import { esc } from '../ui/util.js';

export const title = 'Archives du site';

function when(p) {
  const d = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  if (p.since && p.until) return `en ligne du ${d(p.since)} au ${d(p.until)}`;
  if (p.since) return `en ligne depuis le ${d(p.since)}`;
  return '';
}

export function mount(root, ctx) {
  const id = ctx.params.id;
  const p = (ctx.sitePages || []).find((x) => x.era === 'past' && x.id === id);
  const link = `go/${p?.code || id}`;
  if (!p) {
    root.innerHTML = `<div class="page-head"><h1>Aucune version « ${esc(id)} ».</h1>
      <p>Les versions passées du site sont dans le monde, sous les deux moitiés. <a href="radio">Retour à l’antenne</a>.</p></div>`;
    return null;
  }
  const meta = `<p class="v-meta"><span class="v-code">${esc(p.code)}</span>${when(p) ? ` · ${esc(when(p))}` : ''}${p.source ? ` · <code>${esc(p.source)}</code>` : ''}</p>`;
  if (p.status !== 'online') {
    root.innerHTML = `<div class="page-head"><h1>${esc(p.title)} est hors ligne.</h1>${meta}
      <p>Cette version n’est pas publiée en ce moment. Elle revient quand on la remet en ligne dans l’Atelier (<code>?atelier=1</code>), puis <code>fire</code>.</p></div>`;
    return null;
  }
  if (p.kind === 'external') {
    root.innerHTML = `<div class="v-wrap"><div class="page-head"><h1>${esc(p.title)}</h1>${meta}<p>${esc(p.hosts)}</p>
      <p><a class="btn primary" href="${esc(p.url)}" target="_blank" rel="noopener">Ouvrir ${esc(p.title)} ↗</a></p></div></div>`;
    return null;
  }
  // The copy runs its own router inside the frame; ?embed=1 tells bar.js to keep it silent and bar-less.
  root.innerHTML = `<div class="v-wrap">
    <div class="v-head">${meta}
      <p class="v-links"><a href="past/${esc(p.id)}/" data-external>Ouvrir ${esc(p.title)} en plein écran ↗</a>
        <a href="${esc(link)}" class="v-short" data-external title="Le lien court : il trouve cette version où qu’elle soit">${esc(link)}</a></p></div>
    <iframe class="v-frame" src="past/${esc(p.id)}/?embed=1" title="${esc(p.title)} — le site tel qu’il était" loading="eager"></iframe>
  </div>`;
  return null;
}
