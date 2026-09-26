/**
 * / — the threshold ("Seuil"). Layout A of the 2026-09-09 hub mock: the radio
 * and the atlas side by side, the writing below, the rooms after that. The
 * on-air card here is the same live station as /radio, not a teaser.
 */
import { esc, fmt, coverSvg } from '../ui/util.js';
import { mapSvg, wirePins } from './atlas.js';

export const title = '';

export async function mount(root, ctx) {
  const { player, client } = ctx;
  root.innerHTML = `
    <section class="seuil">
      <div class="seuil-hero">
        <h1>Des écrits, des lieux,<br><em>une radio</em> à la même seconde.</h1>
        <div class="meters"><span class="pill"><span class="dot"></span> Radio Tower à l'antenne</span></div>
      </div>

      <section class="onair" aria-live="polite">
        <div class="cover" id="hCover">${coverSvg(40)}</div>
        <div class="onair-text">
          <p class="badge idle" id="hBadge"><span class="pulse"></span><span>LIVE</span></p>
          <h1 id="hTitle">Tuning in…</h1>
          <p class="artist" id="hArtist">—</p>
          <div class="progress"><i id="hBar"></i></div>
          <div class="controls">
            <button class="tune" id="hTune" type="button"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path class="i-play" d="M7 5l12 7-12 7z" fill="currentColor"/><path class="i-pause" d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg><span id="hTuneLabel">Tune in</span></button>
            <a class="btn" href="radio" data-link>La radio →</a>
          </div>
        </div>
      </section>

      <section class="mapbox" aria-label="Atlas">
        <div class="panel-head" style="margin-bottom:6px"><span class="eyebrow">Atlas — survole une ville</span><a class="btn small" href="atlas" data-link>Ouvrir</a></div>
        <div id="hMap"></div>
        <p class="hint" id="hPlace" style="min-height:1.4em">Chaque point est un endroit où quelque chose a été fait.</p>
      </section>

      <section class="textstrip">
        <div class="panel-head"><span class="eyebrow">Écrits</span><a class="btn small" href="ecrits" data-link>Tous les textes</a></div>
        <p class="intro" id="hIntro"></p>
        <div class="tcards" id="hTexts" style="margin-top:14px"></div>
      </section>

      <section class="textstrip">
        <div class="panel-head"><span class="eyebrow">Portfolio</span><a class="btn small" href="portfolio" data-link>Entrer</a></div>
        <div class="tcards" id="hRooms"></div>
      </section>
    </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const card = root.querySelector('.onair');
  const cover = $('hCover');
  ctx.setScene(() => ({ mode: 'radio', cover: cover.getBoundingClientRect(), card: card.getBoundingClientRect(), bottomInset: document.getElementById('minibar')?.offsetHeight ?? 70 }));

  $('hTune').addEventListener('click', () => player.toggle());
  let lastArt;
  const paint = () => {
    const t = player.onAir;
    if (!t) return;
    $('hTitle').textContent = t.title;
    $('hArtist').textContent = t.artist;
    if (t.artUrl !== lastArt) { lastArt = t.artUrl; cover.innerHTML = t.artUrl ? `<img src="${esc(t.artUrl)}" alt="">` : coverSvg(40); }
  };
  const onTick = (e) => { $('hBar').style.width = `${e.detail.pct * 100}%`; };
  const onPlaying = (e) => {
    card.classList.toggle('playing', e.detail);
    $('hTuneLabel').textContent = e.detail ? 'Mute' : 'Tune in';
    $('hBadge').classList.toggle('idle', !e.detail);
    $('hBadge').lastElementChild.textContent = e.detail ? 'ON AIR' : 'LIVE';
  };
  player.addEventListener('station', paint);
  player.addEventListener('tick', onTick);
  player.addEventListener('playing', onPlaying);
  onPlaying({ detail: player.playing });
  paint();

  const base = document.baseURI;
  const [world, places, texts, rooms] = await Promise.all([
    fetch(new URL('data/world.json', base)).then((r) => r.json()),
    fetch(new URL('data/places.json', base)).then((r) => r.json()),
    fetch(new URL('data/texts.json', base)).then((r) => r.json()),
    client.get('/api/collections').catch(() => null),
  ]).catch(() => [null, null, null, null]);

  if (world && places) {
    const m = $('hMap');
    m.innerHTML = mapSvg(world, places.places, ctx.config.station?.origin, { compact: true });
    wirePins(m, places.places, (p) => { $('hPlace').innerHTML = `<b>${esc(p.city)}</b> — ${esc(p.projects.map((x) => x.name).join(' · '))}`; });
  }
  if (texts) {
    $('hIntro').textContent = texts.intro;
    $('hTexts').innerHTML = texts.texts.map((t) => `<a class="tcard" href="ecrits/${esc(t.slug)}" data-link><b>${esc(t.title)}</b><span>${esc(t.category)}${t.scoredBy ? ' · <span class="scored">♦ scoré</span>' : ''}</span></a>`).join('');
  }
  const u = rooms?.university; const ph = rooms?.photos; const mu = rooms?.music;
  const works = (u?.shelves || []).reduce((s, sh) => s + (sh.books || []).length, 0) + (u?.thesis ? 1 : 0);
  const photos = (ph?.albums || []).reduce((s, a) => s + (a.photos || []).length, 0);
  $('hRooms').innerHTML = `
    <a class="tcard" href="portfolio/library" data-link><b>La bibliothèque</b><span>${works ? `${works} travaux · ` : ''}essais, mémoire, cartes</span></a>
    <a class="tcard" href="portfolio/photos" data-link><b>Photos</b><span>${photos ? `${photos} images · ` : ''}Kruger, voyages</span></a>
    <a class="tcard" href="portfolio/crates" data-link><b>Crates</b><span>${(mu?.crates || []).length || 'les'} bacs · ce que joue la tour</span></a>`;

  return () => {
    player.removeEventListener('station', paint);
    player.removeEventListener('tick', onTick);
    player.removeEventListener('playing', onPlaying);
  };
}
