/**
 * /echo and /echo/<slug> — the online media room.
 *
 * Articles are built by scripts/site-echo.mjs into data/echo.json (body
 * already typeset); this page only lays them out: an index of cards with a
 * tag filter, and a reading page.
 */
import { esc } from '../ui/util.js';
import { frame, ash, inWorld } from '../ui/echo-front.js';

export const title = 'Echo';

let DATA = null;
async function load() {
  if (!DATA) DATA = await (await fetch(new URL('data/echo.json', document.baseURI))).json();
  return DATA;
}

const dateFr = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function card(a) {
  return `<a class="echo-card" href="echo/${esc(a.slug)}" data-link data-tags="${esc(a.tags.join('|'))}">
      ${a.hero ? `<img src="${esc(a.hero.src)}" alt="" loading="lazy"${a.hero.focus ? ` style="object-position:${esc(a.hero.focus)}"` : ''}>` : ''}
      <span class="echo-kicker">${esc(a.tags[0] || 'Echo')}</span>
      <b>${esc(a.title)}</b>
      <span class="echo-dek">${esc(a.standfirst)}</span>
      <span class="echo-meta">${esc(a.author)} · ${esc(dateFr(a.date))} · ${a.readingTime} min</span>
    </a>`;
}

function lead(a) {
  const media = a.video
    ? `<video controls preload="none" playsinline muted${a.video.poster ? ` poster="${esc(a.video.poster)}"` : ''} src="${esc(a.video.src)}"></video>`
    : '';
  const pic = !a.video && a.hero ? `<a class="echo-lead-pic" href="echo/${esc(a.slug)}" data-link tabindex="-1" aria-hidden="true"><img src="${esc(a.hero.src)}" alt=""${a.hero.focus ? ` style="object-position:${esc(a.hero.focus)}"` : ''}></a>` : '';
  return `<article class="echo-lead echo-card" data-tags="${esc(a.tags.join('|'))}">
      ${media || pic}
      <div class="echo-lead-txt">
        <p class="echo-kicker">${esc(a.tags[0] || 'Echo')}</p>
        <h2><a href="echo/${esc(a.slug)}" data-link>${esc(a.title)}</a></h2>
        <p class="echo-dek">${esc(a.standfirst)}</p>
        <p class="echo-meta">${esc(a.author)} · ${esc(dateFr(a.date))} · ${a.readingTime} min</p>
      </div>
    </article>`;
}

/**
 * In the world, the Une's side column (R9, E-01): what Zone is playing right now — the way back across
 * the seam. (Its teaser for Lectures went with the Lectures window, 2026-11-03: the texts are found in
 * the Livre miroir now, on purpose a little harder to come upon.)
 */
function aside() {
  return `<div class="echo-aside">
      <section class="echo-onair">
        <h2>À l'antenne</h2>
        <p class="echo-meta">Zone · en direct</p>
        <p class="echo-onair-t" aria-live="polite"><b data-onair-title>—</b> <span data-onair-artist></span></p>
        <p><a class="echo-go" href="radio" data-link>← Aller à la radio</a></p>
      </section>
    </div>`;
}

/**
 * The press series, once each (Ortis, 2026-11-03): the metro walk, then the Olympics — a group with its
 * name, how many pieces, and three of its pages fanned out; every piece opens from Articles.
 */
function seriesCard(g) {
  const pics = g.items.filter((i) => i.thumb).slice(0, 3);
  const n = `${g.items.length} ${g.kind === 'series' ? 'épisodes' : 'chroniques'}`;
  return `<a class="echo-group" href="echo/articles#${esc(g.key)}" data-link>
      <span class="echo-fan" aria-hidden="true">${pics.map((i) => `<img src="${esc(i.thumb)}" alt="" loading="lazy" width="240" height="330">`).join('')}</span>
      <span class="echo-kicker">${g.kind === 'series' ? 'Série' : 'Chronique'} · ${esc(g.outlet)}</span>
      <b lang="${esc(g.lang || 'pt')}">${esc(g.name)}</b>
      <span class="echo-meta">${esc(n)} · ${esc(g.city)} · ${esc(dateFr(g.from))} – ${esc(dateFr(g.to))}</span>
    </a>`;
}

async function loadGroups() {
  try {
    const { pressGroups } = await import('../ui/press.js');
    return pressGroups((await (await fetch(new URL('data/places.json', document.baseURI))).json()).places || []);
  } catch { return []; }
}

export async function mount(root, ctx) {
  const data = await load();
  const slug = ctx.params.slug;
  if (!slug) {
    document.title = 'Echo';
    const tags = [...new Set(data.articles.flatMap((a) => a.tags))].sort((x, y) => x.localeCompare(y, 'fr'));
    const [first, ...rest] = data.articles;
    const world = inWorld();
    const top = first ? lead(first) : '';
    const groups = await loadGroups();
    root.innerHTML = frame(`
        <div class="echo-filter" role="group" aria-label="Filtrer par thème">
          <button type="button" class="chip" data-tag="" aria-pressed="true">Tout</button>
          ${tags.map((t) => `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}
        </div>
        ${world ? `<div class="echo-cols">${top}${aside()}</div>` : top}
        ${groups.length ? `<section class="echo-groups" aria-label="Les séries de presse">${groups.map(seriesCard).join('')}</section>` : ''}
        <div class="echo-grid" id="articles">${rest.map(card).join('')}</div>
        <p class="echo-foot"><a href="echo/articles" data-link>Tous les articles →</a><a href="portfolio" data-link>L’Archive →</a><a href="radio" data-link>Zone · la radio en direct</a></p>`,
    { current: 'echo', full: true });
    root.firstElementChild.classList.add('echo-front');
    const stopAsh = ash(root.querySelector('.echo-ash'));
    let stopAir = () => {};
    if (world) {
      const t = root.querySelector('[data-onair-title]');
      const by = root.querySelector('[data-onair-artist]');
      const paint = () => {
        const on = ctx.player.onAir;
        const ch = ctx.player.station?.channelLabel;
        t.textContent = on ? on.title : 'Silence';
        by.textContent = on ? `— ${on.artist}${ch ? ` · ${ch}` : ''}` : '';
      };
      paint();
      ctx.player.addEventListener('station', paint);
      ctx.player.addEventListener('track', paint);
      stopAir = () => { ctx.player.removeEventListener('station', paint); ctx.player.removeEventListener('track', paint); };
    }
    const apply = (tag) => {
      root.querySelectorAll('.echo-filter .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tag === tag)));
      root.querySelectorAll('.echo-card').forEach((c) => { c.hidden = Boolean(tag) && !c.dataset.tags.split('|').includes(tag); });
    };
    root.querySelector('.echo-filter').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (b) apply(b.dataset.tag);
    });
    return () => { stopAsh(); stopAir(); };
  }
  const a = data.articles.find((x) => x.slug === slug);
  if (!a) {
    root.innerHTML = frame(`<div class="echo-article"><h1>Introuvable</h1><p>Cet article n'existe pas (ou plus).</p><p><a class="back" href="echo/articles" data-link>← Articles</a></p></div>`, { current: 'articles', sides: 1 });
    return ash(root.querySelector('.echo-ash'), { slow: true });
  }
  document.title = `${a.title} — Echo`;
  root.innerHTML = frame(`<article class="reading echo-article" lang="${esc(a.lang)}">
      <header class="echo-head">
        <p class="echo-kicker">${esc(a.tags.join(' · '))}</p>
        <h1>${esc(a.title)}</h1>
        <p class="echo-standfirst">${esc(a.standfirst)}</p>
        <p class="meta">Par ${esc(a.author)} · ${a.place ? `${esc(a.place)}, ` : ''}<time datetime="${esc(a.date)}">${esc(dateFr(a.date))}</time> · ${a.readingTime} min de lecture</p>
      </header>
      ${a.hero ? `<figure class="echo-hero"><img src="${esc(a.hero.src)}" alt="${esc(a.hero.alt)}"><figcaption>${esc(a.hero.caption)}${a.hero.credit ? ` <span class="credit">${esc(a.hero.credit)}</span>` : ''}</figcaption></figure>` : ''}
      ${a.video ? `<figure class="echo-video"><video controls preload="none" playsinline src="${esc(a.video.src)}"${a.video.poster ? ` poster="${esc(a.video.poster)}"` : ''}></video>${a.video.caption ? `<figcaption>${esc(a.video.caption)}</figcaption>` : ''}</figure>` : ''}
      <div class="body echo-body">${a.html}</div>
      ${a.notes ? `<aside class="echo-notes"><h2>${esc(a.notes.title)}</h2><ol>${a.notes.items.map((i) => `<li>${i}</li>`).join('')}</ol></aside>` : ''}
      <p class="echo-foot"><a class="back" href="echo" data-link>← Retour à Echo</a><a href="echo/articles" data-link>Tous les articles →</a></p>
    </article>`, { current: 'articles', sides: 2 });
  return ash(root.querySelector('.echo-ash'), { slow: true });
}
