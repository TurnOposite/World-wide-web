/**
 * /echoes — what the station just played, what it plays next, and the
 * programme for the next hours, in the listener's own time zone.
 *
 * Moved out of /radio on Ortis's request (2026-10-19): Radio is the on-air
 * card, the channels and the queue; Echoes is the programme around it. Same
 * sources as before — player.data (the /api/station body the one player
 * already polls, so this page adds no request for the lists) and
 * /api/schedule through the client, which answers in both modes: computed
 * in the browser (cloud) or fetched from the tower, on the channel this
 * listener is tuned to. The player is never touched here: the music keeps
 * playing across the navigation because the router only swaps <main>.
 */
import { esc, fmt, clock } from '../ui/util.js';

export const title = 'Echoes';

const GUIDE_HOURS = 4;
const GUIDE_ROWS = 40;
const dayFmt = new Intl.DateTimeFormat([], { weekday: 'long', day: 'numeric', month: 'long' });

export function mount(root, ctx) {
  const { player, client } = ctx;
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  root.innerHTML = `
    <div class="page-head">
      <h1>Echoes</h1>
      <p>What just played, what comes next, and the programme for the next hours — in your time zone.</p>
    </div>

    <p class="echo-now" id="eNow" aria-live="polite">
      <span class="badge"><span class="pulse"></span><span>ON AIR</span></span>
      <span class="echo-track"><b id="eTitle">Tuning in…</b> <span class="a" id="eArtist"></span></span>
      <span class="echo-left" id="eLeft"></span>
      <a class="btn small" href="radio" data-link>Radio →</a>
    </p>

    <section class="echoes" aria-label="Echoes">
      <div class="panel"><h2>Up next</h2><ol class="tracklist" id="eNext"></ol></div>
      <div class="panel"><h2>Just played</h2><ol class="tracklist muted" id="eRecent"></ol></div>
    </section>

    <section class="panel echoes-guide">
      <div class="panel-head"><h2>The next hours</h2><span class="pill" id="eTz" title="Times are shown in your own time zone"></span></div>
      <ol class="tracklist guide" id="eGuide"><li class="empty">reading the programme…</li></ol>
    </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  $('eTz').textContent = tzName.replace(/_/g, ' ');

  const row = (lead, x) =>
    `<li>${lead}<span class="ta"><span class="t">${esc(x.title)}</span><span class="a">${esc(x.artist)}</span></span><span class="d">${fmt(x.duration)}</span></li>`;
  const list = (node, items, lead) => {
    node.innerHTML = items.length ? items.map((x) => row(lead(x), x)).join('') : '<li class="empty">nothing here yet</li>';
  };

  // ---- on air, up next, just played: the player's own copy of /api/station
  const paintStation = () => {
    const d = player.data;
    const t = d?.onAir;
    if (!t) {
      $('eTitle').textContent = d?.warmingUp ? 'Warming up' : 'Dead air';
      $('eArtist').textContent = d?.message || '';
    } else {
      $('eTitle').textContent = t.title;
      const ch = d.station?.channelLabel;
      $('eArtist').textContent = [t.artist, ch && `on ${ch}`].filter(Boolean).join(' · ');
    }
    list($('eNext'), d?.upcoming || [], (x) => `<span class="idx">${clock(x.startsAt)}</span>`);
    list($('eRecent'), (d?.recent || []).slice(0, 4), () => '<span class="idx">·</span>');
  };
  const onTick = (e) => {
    const { pos, dur } = e.detail;
    $('eLeft').textContent = `-${fmt(dur - pos)}`;
  };

  // ---- the guide: the next few hours, from the same clock
  const paintGuide = async () => {
    try {
      const from = new Date(client.now()).toISOString();
      const to = new Date(client.now() + GUIDE_HOURS * 3600e3).toISOString();
      const g = await client.get(`/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      // items[0] is on air (the line above); the guide starts with what follows.
      // A day header only where the programme crosses midnight, here.
      let day = dayFmt.format(new Date(client.now()));
      const rows = g.items.slice(1, GUIDE_ROWS).map((x) => {
        const d = dayFmt.format(new Date(x.startsAt));
        const head = d !== day ? `<li class="guide-day">${esc(d)}</li>` : '';
        day = d;
        return head + row(`<span class="at">${clock(x.startsAt)}</span>`, x);
      });
      $('eGuide').innerHTML = rows.join('') || '<li class="empty">nothing scheduled yet</li>';
    } catch {
      $('eGuide').innerHTML = '<li class="empty">the guide is not reachable right now</li>';
    }
  };

  player.addEventListener('station', paintStation);
  player.addEventListener('tick', onTick);
  paintStation();
  paintGuide();
  const guideTimer = setInterval(paintGuide, 60_000);
  const offCtl = client.on?.('control', paintGuide);
  // The channel is chosen on /radio; if it changes while this page is open
  // (another tab, the booth), the guide follows.
  const offCh = client.on?.('channel', paintGuide);

  return () => {
    clearInterval(guideTimer);
    offCtl?.();
    offCh?.();
    player.removeEventListener('station', paintStation);
    player.removeEventListener('tick', onTick);
  };
}
