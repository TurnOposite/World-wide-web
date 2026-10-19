/**
 * /echo and /echo/<slug> — the online media room.
 *
 * Articles are built by scripts/site-echo.mjs into data/echo.json (body
 * already typeset); this page only lays them out: an index of cards with a
 * tag filter, and a reading page.
 */
import { esc } from '../ui/util.js';

export const title = 'Echo';

let DATA = null;
async function load() {
  if (!DATA) DATA = await (await fetch(new URL('data/echo.json', document.baseURI))).json();
  return DATA;
}

const dateFr = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function card(a) {
  return `<a class="echo-card" href="echo/${esc(a.slug)}" data-link data-tags="${esc(a.tags.join('|'))}">
      ${a.hero ? `<img src="${esc(a.hero.src)}" alt="" loading="lazy">` : ''}
      <span class="echo-kicker">${esc(a.tags[0] || 'Echo')}</span>
      <b>${esc(a.title)}</b>
      <span class="echo-dek">${esc(a.standfirst)}</span>
      <span class="echo-meta">${esc(a.author)} · ${esc(dateFr(a.date))} · ${a.readingTime} min</span>
    </a>`;
}

export async function mount(root, ctx) {
  const data = await load();
  const slug = ctx.params.slug;
  if (!slug) {
    document.title = 'Echo';
    const tags = [...new Set(data.articles.flatMap((a) => a.tags))].sort((x, y) => x.localeCompare(y, 'fr'));
    root.innerHTML = `<div class="page-head"><h1>Echo</h1><p class="echo-lede">Reportages et analyses. <a href="echo/lectures" data-link>Lectures →</a></p></div>
      <div class="echo-filter" role="group" aria-label="Filtrer par thème">
        <button type="button" class="chip" data-tag="" aria-pressed="true">Tout</button>
        ${tags.map((t) => `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}
      </div>
      <div class="echo-grid">${data.articles.map(card).join('')}</div>`;
    const apply = (tag) => {
      root.querySelectorAll('.echo-filter .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tag === tag)));
      root.querySelectorAll('.echo-card').forEach((c) => { c.hidden = Boolean(tag) && !c.dataset.tags.split('|').includes(tag); });
    };
    root.querySelector('.echo-filter').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (b) apply(b.dataset.tag);
    });
    return;
  }
  const a = data.articles.find((x) => x.slug === slug);
  if (!a) {
    root.innerHTML = `<div class="reading"><a class="back" href="echo" data-link>← Echo</a><h1>Introuvable</h1><p>Cet article n'existe pas (ou plus).</p></div>`;
    return;
  }
  document.title = `${a.title} — Echo`;
  root.innerHTML = `<article class="reading echo-article" lang="${esc(a.lang)}">
      <a class="back" href="echo" data-link>← Echo</a>
      <p class="echo-kicker">${esc(a.tags.join(' · '))}</p>
      <h1>${esc(a.title)}</h1>
      <p class="echo-standfirst">${esc(a.standfirst)}</p>
      <p class="meta">Par ${esc(a.author)} · ${a.place ? `${esc(a.place)}, ` : ''}<time datetime="${esc(a.date)}">${esc(dateFr(a.date))}</time> · ${a.readingTime} min de lecture</p>
      ${a.hero ? `<figure class="echo-hero"><img src="${esc(a.hero.src)}" alt="${esc(a.hero.alt)}"><figcaption>${esc(a.hero.caption)}${a.hero.credit ? ` <span class="credit">${esc(a.hero.credit)}</span>` : ''}</figcaption></figure>` : ''}
      ${a.video ? `<figure class="echo-video"><video controls preload="none" playsinline src="${esc(a.video.src)}"${a.video.poster ? ` poster="${esc(a.video.poster)}"` : ''}></video>${a.video.caption ? `<figcaption>${esc(a.video.caption)}</figcaption>` : ''}</figure>` : ''}
      <div class="body echo-body">${a.html}</div>
      ${a.notes ? `<aside class="echo-notes"><h2>${esc(a.notes.title)}</h2><ol>${a.notes.items.map((i) => `<li>${i}</li>`).join('')}</ol></aside>` : ''}
      <p><a class="back" href="echo" data-link>← Retour à Echo</a></p>
    </article>`;
}
