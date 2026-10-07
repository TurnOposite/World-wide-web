/**
 * /radio — the station.
 *
 * On air (cover, title, progress, Tune in), then Echoes: what just played and
 * what comes next, the programme for the next hours, and the queue. The
 * full-page visualiser is the backdrop of this whole page; this module only
 * tells it where the cover is.
 */
import { esc, fmt, fmtSpan, clock, coverSvg } from '../ui/util.js';
import { QueueEditor } from '../ui/queue.js';
import { ChannelDial } from '../ui/channels.js';

export const title = 'Radio';

export function mount(root, ctx) {
  const { player, client, stage, setScene } = ctx;
  root.innerHTML = `
    <div class="radio-head">
      <span class="eyebrow">Radio Tower · ${esc(player.station?.tagline || 'One signal. Everyone on the same second.')}</span>
      <div class="meters">
        <span class="pill" id="rMode"></span>
        <span class="pill" id="rLoop" title="Where the station is in its loop">loop –</span>
        <span class="pill" id="rSync" title="How closely your playback matches the station">sync –</span>
      </div>
    </div>

    <section class="channels" id="rChannels" aria-label="Channels" hidden></section>

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
          <button class="btn" id="rResync" type="button" title="Jump back to the live position">Resync</button>
          <button class="btn" id="rVisuals" type="button" aria-expanded="false">Visuals</button>
        </div>
        <p class="status-line" id="rStatus">Playback starts where the tower is — you can't rewind a radio.</p>
      </div>
    </section>

    <section class="echoes" aria-label="Echoes">
      <div class="panel"><h2>Up next</h2><ol class="tracklist" id="rNext"></ol></div>
      <div class="panel"><h2>Just played</h2><ol class="tracklist muted" id="rRecent"></ol></div>
    </section>

    <section class="radio-grid">
      <div class="panel" id="rQueue"></div>
      <div class="panel">
        <div class="panel-head"><h2>Echoes — the next hours</h2><span class="pill" id="rTz"></span></div>
        <ol class="tracklist guide" id="rGuide"></ol>
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
      sc.href = `ecrits/${score}`;
      sc.textContent = `♦ the score of « ${ctx.textTitle?.(score) || score} » — read it while it plays`;
    } else sc.hidden = true;
    if (t.artUrl !== lastArt) {
      lastArt = t.artUrl;
      cover.innerHTML = t.artUrl ? `<img src="${esc(t.artUrl)}" alt="">` : coverSvg(72);
    }
    list($('rNext'), d.upcoming || [], (x) => `<span class="idx">${clock(x.startsAt)}</span>`);
    list($('rRecent'), (d.recent || []).slice(0, 4), () => '<span class="idx">·</span>');
    const cyc = d.station?.cycleSeconds;
    if (cyc && client.mode === 'cloud') {
      const into = ((client.now() - Date.parse(client.engine.library.epoch)) / 1000) % cyc;
      $('rLoop').innerHTML = `loop <b>${fmt(into)}</b> / ${fmtSpan(cyc)}`;
    } else if (cyc) {
      $('rLoop').innerHTML = `${d.station.trackCount} tracks · ${fmtSpan(cyc)} loop`;
    }
  };

  const list = (node, items, idx) => {
    node.innerHTML = items.length
      ? items.map((x) => `<li>${idx(x)}<span class="ta"><span class="t">${esc(x.title)}</span><span class="a">${esc(x.artist)}</span></span><span class="d">${fmt(x.duration)}</span></li>`).join('')
      : '<li class="empty">nothing here yet</li>';
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

  // ---- guide: the next few hours, from the same clock
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  $('rTz').textContent = tzName.replace(/_/g, ' ');
  const paintGuide = async () => {
    try {
      const from = new Date(client.now()).toISOString();
      const to = new Date(client.now() + 4 * 3600e3).toISOString();
      const g = await client.get(`/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      $('rGuide').innerHTML = g.items.slice(1, 40).map((x) =>
        `<li><span class="at">${clock(x.startsAt)}</span><span class="ta"><span class="t">${esc(x.title)}</span><span class="a">${esc(x.artist)}</span></span><span class="d">${fmt(x.duration)}</span></li>`).join('');
    } catch {
      $('rGuide').innerHTML = '<li class="empty">the guide is not reachable right now</li>';
    }
  };
  paintGuide();
  const guideTimer = setInterval(paintGuide, 60_000);
  const offCtl = client.on?.('control', paintGuide);

  const queue = new QueueEditor({ root: $('rQueue'), client, player, title: "What's next — and what can move" });
  const dial = new ChannelDial({ root: $('rChannels'), client, label: 'Channels' });
  // A new channel means a new guide and a new queue, right away.
  const offCh = client.on?.('channel', () => { paintGuide(); queue.refresh?.({ force: true }); });

  setPlaying(player.playing);
  paintStation();
  if (player.drift !== null) onDrift({ detail: player.drift });

  return () => {
    document.body.classList.remove('on-radio');
    clearInterval(guideTimer);
    offCtl?.();
    offCh?.();
    dial.destroy();
    queue.destroy();
    player.removeEventListener('station', paintStation);
    player.removeEventListener('tick', onTick);
    player.removeEventListener('drift', onDrift);
    player.removeEventListener('status', onStatus);
    player.removeEventListener('playing', onPlaying);
  };
}
