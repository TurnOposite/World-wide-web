/**
 * /echo/articles and /echo/presse/<id> — Articles (E-02) since 2026-11-03 (evening). Until then its
 * window only said « les articles s'ouvrent depuis la Une ». Ortis: let it open any article, and keep
 * most of what Archives held here — the press series, the metro walk first, then the Olympics, each
 * clipping on its own, grouped under its series' name. The Une shows each series once, as a group
 * (echo.js); here every clipping has its card, and its own reading page.
 *
 * A clipping is a page of the Jornal NH, kept as a PDF (site/press/nh/): its reading page lays the PDF
 * in the paper's column — a reader without a PDF viewer (most phones) gets the page's picture and a
 * link to the file instead.
 */
import { esc } from '../ui/util.js';
import { frame, ash } from '../ui/echo-front.js';
import { clipping, dateFr, pressGroups } from '../ui/press.js';

export const title = 'Articles';

let DATA = null;
async function load() {
  if (!DATA) {
    const get = async (f) => (await fetch(new URL(f, document.baseURI))).json();
    const [echo, places] = await Promise.all([get('data/echo.json'), get('data/places.json').catch(() => ({ places: [] }))]);
    DATA = { articles: echo.articles || [], groups: pressGroups(places.places || []) };
  }
  return DATA;
}

const LANG = { pt: 'en portugais', 'pt-BR': 'en portugais', en: 'en anglais', fr: 'en français' };
const count = (g) => `${g.items.length} ${g.kind === 'series' ? 'épisodes' : 'chroniques'}`;
const span = (g) => `${dateFr(g.from)} – ${dateFr(g.to)}`;

function card(a) {
  return `<a class="echo-card" href="echo/${esc(a.slug)}" data-link>
      ${a.hero ? `<img src="${esc(a.hero.src)}" alt="" loading="lazy"${a.hero.focus ? ` style="object-position:${esc(a.hero.focus)}"` : ''}>` : ''}
      <span class="echo-kicker">${esc(a.tags[0] || 'Echo')}</span>
      <b>${esc(a.title)}</b>
      <span class="echo-dek">${esc(a.standfirst)}</span>
      <span class="echo-meta">${esc(a.author)} · ${esc(dateFr(a.date))} · ${a.readingTime} min</span>
    </a>`;
}

function clipCard(i, g) {
  return `<li><a class="echo-clip" href="echo/presse/${esc(i.id)}" data-link lang="${esc(g.lang || 'pt')}">
      ${i.thumb ? `<img src="${esc(i.thumb)}" alt="" loading="lazy" width="240" height="330">` : ''}
      <b>${esc(i.title)}</b>
      ${i.stop ? `<span class="echo-dek">${esc(i.stop)}</span>` : ''}
      <span class="echo-meta" lang="fr"><time datetime="${esc(i.date)}">${esc(dateFr(i.date))}</time></span>
    </a></li>`;
}

/** A series, boxed: its name above, then every clipping of it. */
function groupHtml(g) {
  const sub = g.name !== g.title ? `<p class="echo-sub" lang="${esc(g.lang || 'pt')}">${esc(g.title)}</p>` : '';
  return `<section class="echo-series" id="${esc(g.key)}" aria-labelledby="series-${esc(g.key)}">
      <header class="echo-series-head">
        <p class="echo-kicker">${g.kind === 'series' ? 'Série' : 'Chronique'} · ${esc(g.outlet)}</p>
        <h2 id="series-${esc(g.key)}" lang="${esc(g.lang || 'pt')}">${esc(g.name)}</h2>
        ${sub}
        <p class="echo-meta">${esc(count(g))} · ${esc(g.city)} · ${esc(span(g))}${LANG[g.lang] ? ` · ${LANG[g.lang]}` : ''}</p>
      </header>
      <ol class="echo-clips">${g.items.map((i) => clipCard(i, g)).join('')}</ol>
    </section>`;
}

function scrollToHash(root) {
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id && root.querySelector(`[id="${CSS.escape(id)}"]`);
  // after the router's own scroll to the top of a new page (main.js), which comes once mount() has returned
  if (target) requestAnimationFrame(() => requestAnimationFrame(() => target.scrollIntoView({ block: 'start' })));
}

async function index(root) {
  const { articles, groups } = await load();
  document.title = 'Articles — Echo';
  root.innerHTML = frame(`<section class="echo-articles">
      <h1 class="echo-quiet">Articles</h1>
      ${articles.length ? `<div class="echo-grid">${articles.map(card).join('')}</div>` : ''}
      ${groups.map(groupHtml).join('')}
      <p class="echo-foot"><a class="back" href="echo" data-link>← Retour à la une</a><a href="echo/feed.xml" type="application/atom+xml">Le fil Atom</a></p>
    </section>`, { current: 'articles', sides: 2 });
  scrollToHash(root);
  return ash(root.querySelector('.echo-ash'), { slow: true });
}

async function clip(root, id) {
  const { groups } = await load();
  const hit = clipping(groups, id);
  if (!hit) {
    root.innerHTML = frame(`<div class="echo-article"><h1>Introuvable</h1><p>Cette page de presse n'existe pas (ou plus).</p><p><a class="back" href="echo/articles" data-link>← Articles</a></p></div>`, { current: 'articles', sides: 1 });
    return ash(root.querySelector('.echo-ash'), { slow: true });
  }
  const { item: i, group: g, prev, next } = hit;
  document.title = `${i.title} — Echo`;
  const n = g.items.indexOf(i) + 1;
  const pages = i.pages.map((src, k) => `<figure class="echo-scan">
      <object data="${esc(src)}#toolbar=0&amp;navpanes=0&amp;view=FitH" type="application/pdf" aria-label="${esc(i.title)}, page ${k + 1} sur ${i.pages.length}">
        <a class="echo-scan-alt" href="${esc(src)}" target="_blank" rel="noopener">${i.thumb && k === 0 ? `<img src="${esc(i.thumb)}" alt="La page du journal, en petit" width="240" height="330">` : ''}<span>Ouvrir la page${i.pages.length > 1 ? ` ${k + 1}` : ''} (PDF)</span></a>
      </object>
    </figure>`).join('');
  const step = (x, dir) => (x ? `<a href="echo/presse/${esc(x.id)}" data-link rel="${dir === '←' ? 'prev' : 'next'}" lang="${esc(g.lang || 'pt')}">${dir === '←' ? `← ${esc(x.title)}` : `${esc(x.title)} →`}</a>` : '<span></span>');
  root.innerHTML = frame(`<article class="reading echo-article echo-presse" lang="${esc(g.lang || 'pt')}">
      <header class="echo-head">
        <p class="echo-kicker" lang="fr"><a href="echo/articles#${esc(g.key)}" data-link>${esc(g.name)}</a> · ${g.kind === 'series' ? 'épisode' : 'chronique'} ${n} sur ${g.items.length}</p>
        <h1>${esc(i.title)}</h1>
        ${i.stop ? `<p class="echo-standfirst">${esc(i.stop)}</p>` : ''}
        <p class="meta" lang="fr">${esc(g.outlet)} · ${esc(g.city)}, <time datetime="${esc(i.date)}">${esc(dateFr(i.date))}</time>${LANG[g.lang] ? ` · ${LANG[g.lang]}` : ''}</p>
      </header>
      ${pages}
      <nav class="echo-steps" aria-label="Dans la série" lang="fr">${step(prev, '←')}${step(next, '→')}</nav>
      <p class="echo-foot" lang="fr"><a class="back" href="echo/articles#${esc(g.key)}" data-link>← ${esc(g.name)}, dans Articles</a><a href="${esc(i.pages[0])}" download>Télécharger la page</a></p>
    </article>`, { current: 'articles', sides: 2 });
  return ash(root.querySelector('.echo-ash'), { slow: true });
}

export async function mount(root, ctx) {
  if (ctx.params.id) return clip(root, ctx.params.id);
  return index(root);
}
