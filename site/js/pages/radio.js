/**
 * /radio — the station.
 *
 * On air: cover, title, progress, Tune in. What just played and the
 * programme for the next hours moved to /ondes (pages/ondes.js, 2026-10-19);
 * the queue below the card went on 2026-11-01 (Ortis: a window shows its
 * page whole, no scrolling inside) — what is next is Ondes', and rearranging
 * it is the Booth's. The dial went to the Antenna on 2026-11-10
 * (pages/antenna.js), where the streams live with what each is playing; since
 * 2026-11-17 (Ortis: « from radio we can also change the stream ») this page
 * has a switch of the streams' names too, the shape of ZONE | ECHO. The full-page visualiser is the backdrop of this
 * whole page; this module only tells it where the cover is.
 *
 * On a phone (Ortis, 2026-11-10: « people have to scroll down to see the
 * music name ») the tagline, the loop and sync figures and Resync are not
 * shown, and the cover sits beside the title instead of above it: site.css,
 * `.radio-extra`.
 */
import { esc, fmt, fmtSpan, coverSvg } from '../ui/util.js';
import { PHONE_MEDIA } from '../world/layout.js';

export const title = 'Radio';

export function mount(root, ctx) {
  const { player, client, stage, setScene } = ctx;
  root.innerHTML = `
    <div class="radio-head">
      <span class="eyebrow radio-extra">Radio Tower · ${esc(player.station?.tagline || 'One signal. Everyone on the same second.')}</span>
      <div class="meters">
        <span class="pill" id="rMode"></span>
        <div class="seg seg-sm" id="rStream" role="group" aria-label="Streams" hidden></div>
        <span class="pill radio-extra" id="rLoop" title="Where the station is in its loop">loop –</span>
        <span class="pill radio-extra" id="rSync" title="How closely your playback matches the station">sync –</span>
      </div>
    </div>

    <section class="onair" aria-live="polite">
      <div class="cover" id="rCover">${coverSvg(72)}</div>
      <div class="onair-text">
        <p class="badge idle" id="rBadge"><span class="pulse"></span><span>LIVE</span></p>
        <h1 id="rTitle">Tuning in…</h1>
        <p class="artist" id="rArtist">—</p>
        <p class="album" id="rAlbum"></p>
        <a class="score" id="rScore" hidden data-link></a>
        <div class="progress" role="progressbar" aria-label="Track progress" aria-valuemin="0" aria-valuemax="100"><i id="rBar"></i></div>
        <div class="times"><span id="rElapsed">0:00</span><span id="rRemaining">-0:00</span></div>
        <div class="controls">
          <button class="tune" id="rTune" type="button">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path class="i-play" d="M7 5l12 7-12 7z" fill="currentColor"/><path class="i-pause" d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>
            <span id="rTuneLabel">Tune in</span>
          </button>
          <label class="vol"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 010 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <input type="range" id="rVol" min="0" max="100" aria-label="Volume"></label>
          <button class="btn radio-extra" id="rResync" type="button" title="Jump back to the live position">Resync</button>
          <button class="btn" id="rVisuals" type="button" aria-expanded="false">Visuals</button>
        </div>
        <p class="status-line" id="rStatus">Playback starts where the tower is — you can't rewind a radio.</p>
      </div>
    </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const cover = $('rCover');
  const theatreRect = () => {
    const side = Math.min(innerWidth, innerHeight) * 0.34;
    const left = (innerWidth - side) / 2;
    const top = (innerHeight - side) / 2 - 30;
    return { left, top, width: side, height: side, right: left + side, bottom: top + side };
  };
  const onairCard = root.querySelector('.onair');
  document.body.classList.add('on-radio');

  setScene(() => ({
    mode: 'radio',
    // In full screen the card fades out; the figure moves to the middle of the room.
    cover: document.body.classList.contains('theatre') ? theatreRect() : cover.getBoundingClientRect(),
    card: onairCard.getBoundingClientRect(),
    bottomInset: document.getElementById('minibar')?.offsetHeight ?? 70,
  }));

  // ---- controls
  const tune = $('rTune');
  tune.addEventListener('click', () => player.toggle());
  $('rResync').addEventListener('click', () => player.resync());
  const vol = $('rVol');
  vol.value = String(Math.round(player.audio.volume * 100));
  vol.addEventListener('input', () => player.setVolume(Number(vol.value) / 100));
  const visBtn = $('rVisuals');
  visBtn.addEventListener('click', () => ctx.visuals.toggle());

  const setPlaying = (on) => {
    onairCard.classList.toggle('playing', on);
    $('rTuneLabel').textContent = on ? 'Mute' : 'Tune in';
    const b = $('rBadge');
    b.classList.toggle('idle', !on);
    b.lastElementChild.textContent = on ? 'ON AIR' : 'LIVE';
  };

  // ---- station
  let lastArt = null;
  const paintStation = () => {
    const d = player.data;
    const t = d?.onAir;
    $('rMode').innerHTML = client.mode === 'cloud'
      ? '<span class="dot"></span> no server'
      : `<span class="dot"></span><b>${d?.listeners ?? '–'}</b> listening`;
    $('rMode').title = client.mode === 'cloud'
      ? 'Every browser computes the same programme from the same clock — there is no server to count listeners.'
      : 'Listeners tuned in right now';
    if (!t) {
      $('rTitle').textContent = d?.warmingUp ? 'Warming up' : 'Dead air';
      $('rArtist').textContent = d?.message || 'No tracks in the library yet.';
      return;
    }
    $('rTitle').textContent = t.title;
    $('rArtist').textContent = t.artist;
    $('rAlbum').textContent = [t.album, t.genreLabel].filter(Boolean).join(' · ');
    const chLabel = d.station?.channelLabel;
    $('rLoop').title = chLabel ? `Where the ${chLabel} channel is in its loop` : 'Where the station is in its loop';
    document.title = `${t.title} — Radio Tower`;
    const score = client.mode === 'cloud' ? client.engine.station.get(t.id)?.scores : null;
    const sc = $('rScore');
    if (score) {
      sc.hidden = false;
      sc.href = `echo/lectures/${score}`;
      sc.textContent = `♦ the score of « ${ctx.textTitle?.(score) || score} » — read it while it plays`;
    } else sc.hidden = true;
    if (t.artUrl !== lastArt) {
      lastArt = t.artUrl;
      cover.innerHTML = t.artUrl ? `<img src="${esc(t.artUrl)}" alt="">` : coverSvg(72);
    }
    const cyc = d.station?.cycleSeconds;
    if (cyc && client.mode === 'cloud') {
      const into = ((client.now() - Date.parse(client.engine.library.epoch)) / 1000) % cyc;
      $('rLoop').innerHTML = `loop <b>${fmt(into)}</b> / ${fmtSpan(cyc)}`;
    } else if (cyc) {
      $('rLoop').innerHTML = `${d.station.trackCount} tracks · ${fmtSpan(cyc)} loop`;
    }
  };

  const onTick = (e) => {
    const { pos, dur, pct } = e.detail;
    $('rBar').style.width = `${pct * 100}%`;
    $('rElapsed').textContent = fmt(pos);
    $('rRemaining').textContent = `-${fmt(dur - pos)}`;
    root.querySelector('.progress').setAttribute('aria-valuenow', String(Math.round(pct * 100)));
  };
  const onDrift = (e) => {
    const dr = e.detail;
    $('rSync').innerHTML = `sync <b>${dr >= 0 ? '+' : ''}${dr.toFixed(1)}s</b>`;
    $('rSync').classList.toggle('warn', Math.abs(dr) > 2);
  };
  const onStatus = (e) => {
    const s = $('rStatus');
    s.textContent = e.detail.text;
    s.classList.toggle('bad', e.detail.tone === 'bad');
  };
  const onPlaying = (e) => setPlaying(e.detail);

  player.addEventListener('station', paintStation);
  player.addEventListener('tick', onTick);
  player.addEventListener('drift', onDrift);
  player.addEventListener('status', onStatus);
  player.addEventListener('playing', onPlaying);

  // Up next, Just played and the guide for the next hours live on /ondes; the queue's editor in the Booth;
  // the streams, with what each is playing, in the Antenna. Here, with more than one, a switch of their names:
  // a stream still waiting for its music is shown, and cannot be chosen.
  let alive = true;
  let busy = false;
  const paintStream = async () => {
    if (typeof client.channels !== 'function') return;
    const { channels = [], current } = await client.channels();
    if (!alive) return;
    const el = $('rStream');
    const on = client.channel ?? current;
    el.hidden = channels.length < 2;
    if (el.hidden) return;
    el.innerHTML = channels.map((c) => `<button type="button" data-ch="${esc(c.slug)}" aria-pressed="${c.slug === on}"${c.empty ? ' aria-disabled="true"' : ''}
      title="${esc(c.empty ? `${c.label}: no music yet` : c.blurb || c.label)}">${esc(c.label)}</button>`).join('');
  };
  $('rStream').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-ch]');
    if (!b || busy || b.getAttribute('aria-disabled') === 'true' || b.dataset.ch === client.channel) return;
    busy = true;
    try { await client.setChannel(b.dataset.ch); } finally { busy = false; paintStream(); }
  });
  const offCh = client.on?.('channel', paintStream);
  paintStream();

  // On a phone (Ortis, 2026-11-17: Tune in back on the first screen) the listener count moves up beside LIVE, which
  // has the room, so the stream switch has the head's line to itself: one row less above the title. Desktop unchanged.
  const phone = matchMedia(PHONE_MEDIA);
  const placeCount = () => {
    const pill = $('rMode');
    if (phone.matches) $('rBadge').after(pill);
    else root.querySelector('.meters')?.prepend(pill);
    pill.classList.toggle('r-count-live', phone.matches);
  };
  phone.addEventListener?.('change', placeCount);
  placeCount();

  setPlaying(player.playing);
  paintStation();
  if (player.drift !== null) onDrift({ detail: player.drift });

  return () => {
    document.body.classList.remove('on-radio');
    alive = false;
    offCh?.();
    phone.removeEventListener?.('change', placeCount);
    player.removeEventListener('station', paintStation);
    player.removeEventListener('tick', onTick);
    player.removeEventListener('drift', onDrift);
    player.removeEventListener('status', onStatus);
    player.removeEventListener('playing', onPlaying);
  };
}
