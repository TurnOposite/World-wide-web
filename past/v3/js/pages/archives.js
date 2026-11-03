/**
 * /echo/archives — what the journal keeps (docs/WORLD.md, phase 4; R9's E-04):
 * the press (the Jornal NH columns, also on the Atlas card of the town that
 * printed them), every Echo article by tag, the collections — which live on
 * Zone's side, in the Portfolio — and the Atom feed.
 *
 * Nothing new is stored: it reads echo.json and places.json, as the Une and
 * the Atlas do.
 */
import { esc } from '../ui/util.js';
import { frame, ash } from '../ui/echo-front.js';

export const title = 'Archives';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** 2024-06-06 → « 6 juin 2024 », without the browser's locale tables (the tests run it in Node). */
export const dateFr = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`;
};

/** Tags in French order, each with its articles newest first (echo.json is already newest first). */
export function byTag(articles) {
  const m = new Map();
  for (const a of articles) for (const t of a.tags || []) (m.get(t) || m.set(t, []).get(t)).push(a);
  return [...m.keys()].sort((x, y) => x.localeCompare(y, 'fr')).map((tag) => ({ tag, articles: m.get(tag) }));
}

/** Every place whose card carries press, with its columns and series in date order. */
export function pressOf(places) {
  return places.filter((p) => p.press && (p.press.column?.items?.length || p.press.series?.items?.length)).map((p) => {
    const sort = (items = []) => [...items].sort((x, y) => x.date.localeCompare(y.date));
    const column = p.press.column ? { title: p.press.column.title, items: sort(p.press.column.items) } : null;
    const series = p.press.series ? { title: p.press.series.title, items: sort(p.press.series.items) } : null;
    const all = [...(column?.items || []), ...(series?.items || [])].map((i) => i.date).sort();
    return { slug: p.slug, city: p.city, outlet: p.press.outlet, lang: p.press.lang || null, column, series, from: all[0], to: all.at(-1) };
  });
}

const LANG = { pt: 'en portugais', 'pt-BR': 'en portugais', en: 'en anglais', fr: 'en français' };

function pressHtml(p) {
  const item = (i, extra = '') => `<li><a href="${esc(i.pages[0])}" target="_blank" rel="noopener"><b>${esc(i.title)}</b>${extra}</a>
      <span class="echo-meta"><time datetime="${esc(i.date)}">${esc(dateFr(i.date))}</time></span></li>`;
  return `<section class="echo-press">
      <h3>${esc(p.outlet)}</h3>
      <p class="echo-meta">${esc(p.city)} · ${esc(dateFr(p.from))} – ${esc(dateFr(p.to))}${LANG[p.lang] ? ` · ${LANG[p.lang]}` : ''}</p>
      ${p.column ? `<p class="echo-sub">${esc(p.column.title)} — ${p.column.items.length} chroniques</p>
        <ol class="echo-list echo-press-list">${p.column.items.map((i) => item(i)).join('')}</ol>` : ''}
      ${p.series ? `<p class="echo-sub">${esc(p.series.title)} — ${p.series.items.length} épisodes</p>
        <ol class="echo-list echo-press-list">${p.series.items.map((i) => item(i, i.stop ? ` <span class="echo-dek">${esc(i.stop.split(',')[0])}</span>` : '')).join('')}</ol>` : ''}
      <p><a class="echo-go" href="atlas#${esc(p.slug)}" data-link>Sur l'Atlas, à ${esc(p.city)} →</a></p>
    </section>`;
}

export async function mount(root) {
  const get = async (f) => (await fetch(new URL(f, document.baseURI))).json();
  const [echo, places] = await Promise.all([get('data/echo.json'), get('data/places.json').catch(() => ({ places: [] }))]);
  document.title = 'Archives — Echo';
  const tags = byTag(echo.articles);
  const press = pressOf(places.places || []);
  root.innerHTML = frame(`<section class="echo-archives">
      <p class="echo-kicker">Archives</p>
      <h1>Archives</h1>
      <p class="echo-standfirst">Ce que le journal garde&nbsp;: la presse, les articles par thème, les collections et le fil.</p>
      <div class="echo-cols">
        <div class="echo-arch-main">
          <h2>Presse</h2>
          ${press.length ? press.map(pressHtml).join('') : '<p>Rien encore.</p>'}
        </div>
        <div class="echo-aside">
          <section>
            <h2>Par thème</h2>
            ${tags.map(({ tag, articles }) => `<h3 class="echo-kicker">${esc(tag)}</h3>
              <ul class="echo-list echo-tag-list">${articles.map((a) => `<li><a href="echo/${esc(a.slug)}" data-link><b>${esc(a.title)}</b></a>
                <span class="echo-meta"><time datetime="${esc(a.date)}">${esc(dateFr(a.date))}</time></span></li>`).join('')}</ul>`).join('') || '<p>Aucun article publié.</p>'}
          </section>
          <section>
            <h2>Collections</h2>
            <p>Les essais, la thèse, les photos et les caisses de disques vivent de l'autre côté, dans le Portfolio de Zone.</p>
            <p><a class="echo-go" href="portfolio" data-link>← Ouvrir le Portfolio</a></p>
          </section>
          <section>
            <h2>Fil</h2>
            <p>Echo en flux Atom, pour un lecteur de flux&nbsp;: <a class="echo-go" href="echo/feed.xml" type="application/atom+xml">echo/feed.xml</a></p>
          </section>
        </div>
      </div>
      <p class="echo-foot"><a class="back" href="echo" data-link>← Retour à Echo</a><a href="echo/lectures" data-link>Lectures →</a></p>
    </section>`, { current: 'archives', sides: 2 });
  return ash(root.querySelector('.echo-ash'), { slow: true });
}
