/**
 * /echo/lectures/<slug> — the Globe Trotter texts, verbatim. (They lived at
 * /ecrits until 2026-10-19; those addresses still answer and move to the new
 * ones.) Since 2026-11-03 (evening) a text opens in the Articles window, and
 * the list that was /echo/lectures is the Livre miroir's: its first double
 * page is the introduction, the pond with the six stones behind the page
 * (ui/mirror-book.js). /echo/lectures alone leads to the Archive, the book
 * open. The list as it was is kept in past/v3/js/pages/ecrits.js.
 *
 * Three of them are "scored": a track in the rotation was chosen for them.
 * On Wix the score was a private player inside the post. Here the radio is a
 * shared clock, so a reader cannot summon the track — RADIO-TOWER-COMPAT.md
 * §1 is right that a poem page playing a random song would be wrong. What a
 * radio *can* do honestly is say when the score is next on air, and play it
 * then, for everyone. That is what the score box does.
 */
import { esc, fmt, clock } from '../ui/util.js';
import { frame, ash } from '../ui/echo-front.js';

export const title = 'Lectures';
const BASE = 'echo/lectures';
/** Where the texts are found now: the Livre miroir, on the Archive's top shelf, opened. */
const BOOK = 'portfolio#miroir';

let DATA = null;
async function load() {
  if (!DATA) DATA = await (await fetch(new URL('data/texts.json', document.baseURI))).json();
  return DATA;
}

/** When does this track next start, from now, on this station? */
async function nextAiring(client, trackId) {
  if (!trackId) return null;
  const now = client.now();
  const onAir = client.mode === 'cloud' ? client.engine.station.at(now) : null;
  if (onAir?.track.id === trackId) return { now: true, endsAt: onAir.endsAt };
  try {
    const span = client.mode === 'cloud' ? client.engine.station.cycleSeconds * 1000 + 60_000 : 24 * 3600e3;
    const g = await client.get(`/api/schedule?from=${encodeURIComponent(new Date(now).toISOString())}&to=${encodeURIComponent(new Date(now + Math.min(span, 48 * 3600e3)).toISOString())}`);
    const hit = g.items.find((x, i) => x.id === trackId && (i > 0 || x.startsAt > now));
    return hit ? { startsAt: hit.startsAt } : null;
  } catch { return null; }
}

/** One stone in the pond: what is engraved on it, and what a screen reader hears. */
function stone(t) {
  const meta = [t.category, t.readingTime].filter(Boolean).join(' · ');
  return {
    href: `${BASE}/${esc(t.slug)}`,
    title: t.title,
    meta,
    scored: Boolean(t.scoredBy),
    label: esc(`${t.title} — ${meta}${t.scoredBy ? ', scoré' : ''}. ${t.excerpt || ''}`),
  };
}

export async function mount(root, ctx) {
  const data = await load();
  const slug = ctx.params.slug;
  if (ctx.router.current?.name === 'ecrits') {
    ctx.router.go(slug ? `${BASE}/${slug}` : BASE, { replace: true });
    return;
  }
  if (!slug) {
    ctx.router.go('portfolio#miroir', { replace: true });
    return;
  }
  const t = data.texts.find((x) => x.slug === slug);
  if (!t) {
    root.innerHTML = frame(`<div class="reading"><a class="back" href="${BOOK}" data-link>← Livre miroir</a><h1>Introuvable</h1><p>Ce texte n'existe pas (ou plus).</p></div>`, { current: 'articles', sides: 1 });
    return ash(root.querySelector('.echo-ash'), { slow: true });
  }
  document.title = `${t.title} — Lectures`;
  const verse = /po[eè]me/i.test(t.category || '');
  root.innerHTML = frame(`<article class="reading">
      <a class="back" href="${BOOK}" data-link>← Livre miroir</a>
      <h1>${esc(t.title)}</h1>
      <p class="meta">${esc(t.category)} · ${esc(t.signature || '')} · ${esc(t.published || '')} · ${esc(t.readingTime || '')}</p>
      <div class="score-box" id="scoreBox" hidden></div>
      <div class="body${verse ? ' verse' : ''}">${t.html}</div>
      ${t.afterword ? `<p class="aveu"><span class="eyebrow" style="display:block;margin-bottom:8px;font-style:normal">Aveu de l'auteur</span>${esc(t.afterword)}</p>` : ''}
    </article>`, { current: 'articles', sides: 2 });
  const stopAsh = ash(root.querySelector('.echo-ash'), { slow: true });

  if (t.scoredBy) {
    const box = root.querySelector('#scoreBox');
    const paint = async () => {
      const when = await nextAiring(ctx.client, t.scoredBy.id);
      const name = `<b>${esc(t.scoredBy.title)}</b> · ${esc(t.scoredBy.artist)} (${fmt(t.scoredBy.duration)})`;
      box.hidden = false;
      if (when?.now) {
        box.innerHTML = `<span>♦ Sa partition, ${name}, <b>est à l'antenne en ce moment.</b></span>${ctx.player.playing ? '' : '<button class="btn small primary" type="button" data-tune>Écouter</button>'}`;
      } else if (when?.startsAt) {
        const mins = Math.round((when.startsAt - ctx.client.now()) / 60000);
        box.innerHTML = `<span>♦ Sa partition, ${name}, passe à <b>${clock(when.startsAt)}</b> (dans ${mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`}).</span>`;
      } else {
        box.innerHTML = `<span>♦ Sa partition : ${name}.</span>`;
      }
      box.querySelector('[data-tune]')?.addEventListener('click', () => { ctx.player.tuneIn(); paint(); });
    };
    paint();
    const timer = setInterval(paint, 30_000);
    ctx.player.addEventListener('track', paint);
    return () => { stopAsh(); clearInterval(timer); ctx.player.removeEventListener('track', paint); };
  }
  return stopAsh;
}
