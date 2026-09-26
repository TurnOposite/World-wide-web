/**
 * /ecrits and /ecrits/<slug> — the Globe Trotter texts, verbatim.
 *
 * Three of them are "scored": a track in the rotation was chosen for them.
 * On Wix the score was a private player inside the post. Here the radio is a
 * shared clock, so a reader cannot summon the track — RADIO-TOWER-COMPAT.md
 * §1 is right that a poem page playing a random song would be wrong. What a
 * radio *can* do honestly is say when the score is next on air, and play it
 * then, for everyone. That is what the score box does.
 */
import { esc, fmt, clock } from '../ui/util.js';

export const title = 'Écrits';

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

function card(t) {
  return `<a class="text-card" href="ecrits/${esc(t.slug)}" data-link>
    <h2>${esc(t.title)}</h2>
    <p>${esc(t.excerpt)}</p>
    <span class="meta">${esc(t.category)} · ${esc(t.readingTime || '')}${t.scoredBy ? ' · <span class="scored">♦ scoré</span>' : ''}</span></a>`;
}

export async function mount(root, ctx) {
  const data = await load();
  const slug = ctx.params.slug;
  if (!slug) {
    root.innerHTML = `<div class="page-head"><h1>Écrits</h1><p style="font-family:var(--serif);font-size:17px">${esc(data.intro)}</p></div>
      <div class="shelf-texts">${data.texts.map(card).join('')}</div>
      <p class="hint">♦ scoré — un morceau de la radio a été choisi pour ce texte. Il passe à l'antenne pour tout le monde, à son heure.</p>`;
    return;
  }
  const t = data.texts.find((x) => x.slug === slug);
  if (!t) {
    root.innerHTML = `<div class="reading"><a class="back" href="ecrits" data-link>← Écrits</a><h1>Introuvable</h1><p>Ce texte n'existe pas (ou plus).</p></div>`;
    return;
  }
  document.title = `${t.title} — Écrits`;
  const verse = /po[eè]me/i.test(t.category || '');
  root.innerHTML = `<article class="reading">
      <a class="back" href="ecrits" data-link>← Écrits</a>
      <h1>${esc(t.title)}</h1>
      <p class="meta">${esc(t.category)} · ${esc(t.signature || '')} · ${esc(t.published || '')} · ${esc(t.readingTime || '')}</p>
      <div class="score-box" id="scoreBox" hidden></div>
      <div class="body${verse ? ' verse' : ''}">${t.html}</div>
      ${t.afterword ? `<p class="aveu"><span class="eyebrow" style="display:block;margin-bottom:8px;font-style:normal">Aveu de l'auteur</span>${esc(t.afterword)}</p>` : ''}
    </article>`;

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
    return () => { clearInterval(timer); ctx.player.removeEventListener('track', paint); };
  }
}
