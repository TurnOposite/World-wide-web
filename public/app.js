/**
 * Radio Tower — player.
 *
 * The interesting part is not playing audio, it is *joining late*. The server
 * tells us which track is on air and how many seconds into it the tower is.
 * We seek there and then keep checking that we haven't drifted.
 *
 * Two things can put a listener out of sync:
 *   1. Their device clock is wrong. Fixed by measuring skew against /api/time.
 *   2. Buffering stalls. Fixed by a drift check that re-seeks when we fall behind.
 */

import { Visualizer, PRESETS, DEFAULT_PRESET } from './viz.js';
import { QueueEditor } from './queue.js';
import { backdropUrlForGenre, createBackdropSwitcher } from './backdrops.js';

const $ = (id) => document.getElementById(id);

const el = {
  audio: $('audio'),
  title: $('title'), artist: $('artist'), album: $('album'),
  art: $('art'), artFallback: $('artFallback'), viz: $('viz'), vizStage: $('vizStage'),
  badge: $('badge'), progressBar: $('progressBar'),
  elapsed: $('elapsed'), remaining: $('remaining'),
  tuneBtn: $('tuneBtn'), tuneIcon: $('tuneIcon'), tuneLabel: $('tuneLabel'),
  volume: $('volume'), resyncBtn: $('resyncBtn'), vizPreset: $('vizPreset'),
  upcoming: $('upcoming'), recent: $('recent'), library: $('library'),
  libCount: $('libCount'), libSearch: $('libSearch'), libMore: $('libMore'),
  listenerCount: $('listenerCount'), listenersMeter: $('listenersMeter'),
  syncValue: $('syncValue'), syncMeter: $('syncMeter'),
  stationName: $('stationName'), stationTagline: $('stationTagline'),
  statusLine: $('statusLine'), hint: $('hint'),
  backdropA: $('backdropA'), backdropB: $('backdropB'),
};

const setBackdrop = createBackdropSwitcher(el.backdropA, el.backdropB);

const STATE = {
  clockSkew: 0,          // serverTime - clientTime, in ms
  onAir: null,
  revision: null,
  playing: false,
  listenerId: Math.random().toString(36).slice(2) + Date.now().toString(36),
  pollTimer: null,
  libOffset: 0,
  libQuery: '',
  lastDrift: null,
};

const DRIFT_TOLERANCE = 2.0;   // seconds before we hard-seek
const POLL_MS = 15_000;

const serverNow = () => Date.now() + STATE.clockSkew;

function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function status(text, tone = '') {
  el.statusLine.textContent = text;
  el.statusLine.style.color = tone === 'bad' ? 'var(--live)' : '';
}

/* ------------------------------------------------------------------ clock */

/**
 * Estimate the offset between this device's clock and the tower's.
 * Several samples, keep the one with the lowest round trip — that sample has
 * the least network noise, so its midpoint estimate is the most trustworthy.
 */
async function syncClock(samples = 5) {
  let best = { rtt: Infinity, skew: 0 };
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch('/api/time', { cache: 'no-store' });
      const { t } = await res.json();
      const t1 = Date.now();
      const rtt = t1 - t0;
      const skew = t - (t0 + rtt / 2);
      if (rtt < best.rtt) best = { rtt, skew };
    } catch { /* keep whatever we have */ }
  }
  if (Number.isFinite(best.skew)) STATE.clockSkew = Math.round(best.skew);
  return STATE.clockSkew;
}

/* ------------------------------------------------------------ station feed */

async function fetchStation() {
  const res = await fetch(`/api/station?listener=${STATE.listenerId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`station ${res.status}`);
  return res.json();
}

function renderStation(data) {
  el.stationName.textContent = data.station.name;
  el.stationTagline.textContent = data.station.tagline;
  document.title = data.onAir ? `${data.onAir.title} — ${data.station.name}` : data.station.name;

  el.listenerCount.textContent = data.listeners ?? 0;
  el.listenersMeter.classList.toggle('off', !data.listeners);

  if (!data.onAir) {
    // Warming up (first library scan still running) is a normal, temporary
    // state, not a failure — say so, rather than showing the same "dead air"
    // treatment a genuinely empty library gets.
    el.title.textContent = data.warmingUp ? 'Warming up' : 'Dead air';
    el.artist.textContent = data.message || 'No tracks in the library yet.';
    el.album.textContent = '';
    el.badge.classList.add('paused');
    el.badge.lastChild.textContent = data.warmingUp ? 'WARMING UP' : 'OFF AIR';
    status(data.warmingUp ? 'warming up — scanning the library' : 'no tracks — add MP3s and rescan', data.warmingUp ? '' : 'bad');
    return;
  }

  const changed = STATE.onAir?.id !== data.onAir.id;
  STATE.onAir = data.onAir;

  // Repaint the palette from the genre even when the track has not changed —
  // a first load, or a reconnect, lands here with `changed` false but a
  // visualiser still sitting on the default hue.
  viz.setTrack(data.onAir);

  if (changed) {
    setBackdrop(backdropUrlForGenre(data.onAir.genreSlug));
    el.title.textContent = data.onAir.title;
    el.artist.textContent = data.onAir.artist;
    el.album.textContent = [data.onAir.album, data.onAir.year].filter(Boolean).join(' · ');
    if (data.onAir.artUrl) {
      el.art.src = data.onAir.artUrl;
      el.art.hidden = false;
      el.artFallback.hidden = true;
    } else {
      el.art.hidden = true;
      el.artFallback.hidden = false;
    }
  }

  renderList(el.upcoming, data.upcoming, (t, i) => `<span class="idx">${i + 1}</span>`);
  renderList(el.recent, data.recent, () => '<span class="idx">·</span>');

  if (STATE.revision && STATE.revision !== data.station.revision) {
    // Library changed under us — the whole schedule shifted, so rejoin.
    status('library changed — rejoining');
    STATE.revision = data.station.revision;
    if (STATE.playing) joinLive({ force: true });
    return;
  }
  STATE.revision = data.station.revision;
}

function renderList(node, items, idxFn) {
  if (!items?.length) {
    node.innerHTML = '<li class="empty">nothing here yet</li>';
    return;
  }
  node.innerHTML = items
    .map(
      (t, i) =>
        `<li>${idxFn(t, i)}<span class="t">${esc(t.title)}</span><span class="a">${esc(t.artist)}</span><span class="d">${fmt(t.duration)}</span></li>`,
    )
    .join('');
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ player */

/** Where should we be inside the current track, right now, according to the tower? */
function livePosition() {
  if (!STATE.onAir) return null;
  return (serverNow() - STATE.onAir.startsAt) / 1000;
}

/** Point the audio element at the on-air track and seek to the live position. */
function joinLive({ force = false } = {}) {
  if (!STATE.onAir) return;
  const pos = livePosition();
  if (pos == null || pos < 0) return;

  const wantUrl = new URL(STATE.onAir.streamUrl, location.origin).href;
  if (force || el.audio.src !== wantUrl) {
    el.audio.src = wantUrl;
    // currentTime can only be set once metadata is known.
    el.audio.addEventListener(
      'loadedmetadata',
      () => {
        el.audio.currentTime = Math.max(0, Math.min(livePosition() ?? 0, (el.audio.duration || 1e9) - 0.15));
        if (STATE.playing) el.audio.play().catch(() => {});
      },
      { once: true },
    );
    el.audio.load();
  } else {
    el.audio.currentTime = Math.max(0, pos);
  }
}

/** Runs every second: paint progress, watch for drift, roll over at track end. */
function tick() {
  if (!STATE.onAir) return;
  const pos = livePosition();
  const dur = STATE.onAir.duration;

  const pct = Math.max(0, Math.min(100, (pos / dur) * 100));
  el.progressBar.style.width = `${pct}%`;
  el.progressBar.parentElement.setAttribute('aria-valuenow', Math.round(pct));
  el.elapsed.textContent = fmt(pos);
  el.remaining.textContent = `-${fmt(dur - pos)}`;

  if (pos >= dur - 0.25) {
    // Track should have ended. Ask the tower what's on now.
    refresh().then(() => { if (STATE.playing) joinLive({ force: true }); });
    return;
  }

  if (STATE.playing && !el.audio.paused && el.audio.readyState >= 2) {
    const drift = el.audio.currentTime - pos;
    STATE.lastDrift = drift;
    el.syncValue.textContent = `${drift >= 0 ? '+' : ''}${drift.toFixed(1)}s`;
    el.syncMeter.classList.toggle('off', Math.abs(drift) > DRIFT_TOLERANCE);
    if (Math.abs(drift) > DRIFT_TOLERANCE) {
      el.audio.currentTime = Math.max(0, pos);
      status(`re-synced (${drift > 0 ? 'ahead' : 'behind'} ${Math.abs(drift).toFixed(1)}s)`);
    }
  }
}

async function refresh() {
  try {
    const data = await fetchStation();
    // Trust the server's own timestamp to keep skew fresh without extra calls.
    STATE.clockSkew = Math.round(STATE.clockSkew * 0.8 + (data.serverTime - Date.now()) * 0.2);
    renderStation(data);
    if (data.onAir) status(STATE.playing ? 'on air' : 'ready');
  } catch (err) {
    status('lost the tower — retrying', 'bad');
  }
}

/* -------------------------------------------------------------- visualiser */

/**
 * The drawing lives in viz.js; this is only the wiring. Two rules:
 *
 *  - The audio graph is built on the first tune-in, never before. Browsers
 *    suspend an AudioContext created outside a user gesture, and iOS Safari
 *    will not resume one afterwards — so constructing it eagerly at boot
 *    costs a listener the visualiser permanently.
 *  - A visualiser failure must never cost anyone the music. If Web Audio is
 *    missing, or the stream is cross-origin without CORS so the element
 *    cannot be tapped, the canvas is hidden and playback carries on.
 *
 * `viz` is `let`, not `const`: a viz.js hot reload (see "dev hot reload"
 * below) replaces it with a freshly-imported instance. Every closure here
 * reads the `viz` binding at call time, so reassignment is all a hot swap
 * needs — nothing below has to know it happened.
 */
const VIZ_PRESET_KEY = 'radiotower.vizPreset';
function loadVizPreset() {
  try {
    const saved = localStorage.getItem(VIZ_PRESET_KEY);
    return PRESETS[saved] ? saved : DEFAULT_PRESET;
  } catch {
    return DEFAULT_PRESET;
  }
}

const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
let viz = new Visualizer(el.viz, {
  reducedMotion: Boolean(reducedMotion?.matches),
  preset: loadVizPreset(),
  stageCanvas: el.vizStage,
});

// Listening for changes, not just reading once: people toggle this in system
// settings while a page is open, and on a station you leave running all day
// that is a likely thing to happen.
reducedMotion?.addEventListener?.('change', (e) => { viz.reducedMotion = e.matches; });

const queue = new QueueEditor({
  section: $('queuePanel'), list: $('queueList'), unlock: $('queueUnlock'),
  keyInput: $('queueKey'), lockBtn: $('queueLock'), resetBtn: $('queueReset'),
  hint: $('queueHint'), status: $('queueStatus'),
});

function setupViz() {
  if (!viz.attach(el.audio)) {
    el.viz.hidden = true;
    return;
  }
  viz.setPlaying(true);
  viz.start();
}

/** A discreet cycle-through-looks control. Cycled by click, remembered across visits. */
function refreshVizPresetButton() {
  if (!el.vizPreset) return;
  el.vizPreset.textContent = `Look: ${PRESETS[viz.preset]?.label || viz.preset}`;
}
el.vizPreset?.addEventListener('click', () => {
  const names = Object.keys(PRESETS);
  const next = names[(names.indexOf(viz.preset) + 1) % names.length];
  viz.setPreset(next);
  try { localStorage.setItem(VIZ_PRESET_KEY, next); } catch { /* private browsing, etc. */ }
  refreshVizPresetButton();
});
refreshVizPresetButton();

/* ---------------------------------------------------------- dev hot reload */

/**
 * `?viz=dev` loads the tuning panel. A plain `import()` behind a query-string
 * check, never a `<script>` tag or a static import — so a normal page load
 * never fetches `dev-panel.js` at all, which is the only "no bundle cost in
 * production" a bundler-less project can offer.
 */
if (new URLSearchParams(location.search).get('viz') === 'dev') {
  import('./dev-panel.js').then(({ mountDevPanel }) => mountDevPanel(() => viz)).catch(() => {});
}

/**
 * Rebuild the Visualizer from a freshly-imported viz.js, in place, without
 * touching the <audio> element or the station clock.
 *
 * The one hazard: `createMediaElementSource()` may be called on a given
 * media element exactly once, ever — a second call (even from a brand new
 * AudioContext) throws. So a hot swap can never call `attach()` again; it
 * must transplant the *existing* AudioContext, analysers and bin buffers
 * onto the new instance and skip attach() entirely. `knobs` is handed to the
 * constructor (same object reference, not copied) so a mid-tuning dev panel
 * session survives a reload of code that has nothing to do with the knobs.
 */
function hotSwapViz() {
  import(`./viz.js?t=${Date.now()}`)
    .then((mod) => {
      const next = new mod.Visualizer(el.viz, {
        reducedMotion: viz.reducedMotion,
        preset: viz.preset,
        knobs: viz.knobs,
        stageCanvas: el.vizStage,
      });
      if (viz.ac) {
        next.ac = viz.ac;
        next.spec = viz.spec;
        next.wave = viz.wave;
        next.specBins = viz.specBins;
        next.waveBins = viz.waveBins;
        next.fluxBins = viz.fluxBins;
        next.available = viz.available;
      }
      // Visual continuity — nothing here is audio state, so carrying it over
      // is purely cosmetic (no hue jump-cut, no tier reset on every save).
      next.hue = viz.hue;
      next.targetHue = viz.targetHue;
      next.drift = viz.drift;
      next.phase = viz.phase;
      next.tier = viz.tier;
      next.lowSmooth = viz.lowSmooth;
      next.stageBlooms = viz.stageBlooms;
      next.setPlaying(viz.playing);

      viz.stop();
      viz = next;
      if (viz.available) viz.start();
      refreshVizPresetButton();
      status('viz.js hot-reloaded');
    })
    .catch((err) => {
      console.error('[dev-reload] viz.js hot swap failed, falling back to a full reload', err);
      location.reload();
    });
}

/** Swap the stylesheet's own URL to force a refetch, no page reload needed. */
function hotSwapCss() {
  const link = document.querySelector('link[rel="stylesheet"][href*="styles.css"]');
  if (!link) return;
  const url = new URL(link.href, location.href);
  url.searchParams.set('t', String(Date.now()));
  link.href = url.href;
}

/**
 * The dev-only SSE endpoint (server/lib/devReload.js) tells us which file
 * under public/ changed. viz.js gets the careful in-place rebuild above;
 * styles.css gets a cheap link-swap; everything else (app.js, queue.js,
 * schedule.js, index.html, or a file we don't recognise) gets a plain
 * `location.reload()` — which is always correct here, never a fallback of
 * last resort: the station clock means a fresh page just rejoins live, so
 * there is no playback position to restore and no special-case code needed
 * for it.
 */
function connectDevReload() {
  let es;
  try {
    es = new EventSource('/api/dev/reload');
  } catch {
    return;
  }
  es.addEventListener('message', (e) => {
    let files = [];
    try { files = JSON.parse(e.data).files || []; } catch { return; }
    const names = files.map((f) => String(f).split('/').pop());
    if (names.includes('viz.js')) { hotSwapViz(); return; }
    if (names.length && names.every((n) => n === 'styles.css')) { hotSwapCss(); return; }
    location.reload();
  });
  // No reconnect loop on purpose. In production this endpoint does not
  // exist, so the entire cost there is one failed request. In dev, the
  // server process restarting (npm run dev's --watch) already dropped this
  // connection; a human refreshing to pick the new server back up is the
  // normal, expected next step, not a bug to paper over with retries.
  es.onerror = () => es.close();
}
connectDevReload();

/* ----------------------------------------------------------------- library */

async function loadLibrary({ reset = false } = {}) {
  if (reset) { STATE.libOffset = 0; el.library.innerHTML = ''; }
  const params = new URLSearchParams({ limit: '50', offset: String(STATE.libOffset) });
  if (STATE.libQuery) params.set('q', STATE.libQuery);
  try {
    const res = await fetch(`/api/library?${params}`);
    const data = await res.json();
    el.libCount.textContent = data.total ? `(${data.total})` : '';
    if (!data.items.length && STATE.libOffset === 0) {
      el.library.innerHTML = '<li class="empty">nothing matches</li>';
    } else {
      el.library.insertAdjacentHTML(
        'beforeend',
        data.items
          .map(
            (t) =>
              `<li class="${t.id === STATE.onAir?.id ? 'now' : ''}"><span class="t">${esc(t.title)}</span><span class="a">${esc(t.artist)}</span><span class="d">${fmt(t.duration)}</span></li>`,
          )
          .join(''),
      );
    }
    STATE.libOffset += data.items.length;
    el.libMore.hidden = STATE.libOffset >= data.total;
  } catch {
    el.library.innerHTML = '<li class="empty">could not load the library</li>';
  }
}

/* -------------------------------------------------------------------- wire */

el.tuneBtn.addEventListener('click', async () => {
  if (STATE.playing) {
    STATE.playing = false;
    el.audio.pause();
    viz.setPlaying(false);
    el.tuneIcon.textContent = '▶';
    el.tuneLabel.textContent = 'Tune in';
    el.badge.classList.add('paused');
    el.badge.lastChild.textContent = 'MUTED';
    el.hint.textContent = "The tower kept broadcasting. Tune back in and you'll land where it is now.";
    status('ready');
    return;
  }
  STATE.playing = true;
  setupViz();
  await syncClock(3);
  joinLive({ force: true });
  try {
    await el.audio.play();
  } catch {
    status('your browser blocked playback — press Tune in again', 'bad');
  }
  el.tuneIcon.textContent = '❚❚';
  el.tuneLabel.textContent = 'Mute';
  el.badge.classList.remove('paused');
  el.badge.lastChild.textContent = 'ON AIR';
  el.hint.textContent = "Playback starts where the tower is — you can't rewind a radio.";
  status('on air');
});

el.resyncBtn.addEventListener('click', async () => {
  await syncClock(5);
  await refresh();
  joinLive({ force: true });
  status('re-synced');
});

el.volume.addEventListener('input', () => {
  el.audio.volume = Number(el.volume.value) / 100;
});
el.audio.volume = 0.8;

el.audio.addEventListener('stalled', () => status('buffering…'));
el.audio.addEventListener('waiting', () => status('buffering…'));
el.audio.addEventListener('playing', () => status('on air'));
el.audio.addEventListener('error', () => status('stream error — resyncing', 'bad'));
el.audio.addEventListener('ended', () => { refresh().then(() => STATE.playing && joinLive({ force: true })); });

let searchTimer = null;
el.libSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    STATE.libQuery = el.libSearch.value.trim();
    loadLibrary({ reset: true });
  }, 250);
});
el.libMore.addEventListener('click', () => loadLibrary());

document.addEventListener('visibilitychange', () => {
  // Phones throttle background timers hard; a tab coming back is almost
  // certainly out of sync.
  if (document.hidden) {
    // Stop drawing outright. requestAnimationFrame is already throttled in a
    // hidden tab, but the audio graph keeps feeding it and a phone that has
    // this backgrounded all afternoon should be spending nothing on pixels
    // nobody can see.
    viz.stop();
    return;
  }
  viz.start();
  if (STATE.playing) refresh().then(() => joinLive({ force: false }));
});

/* ------------------------------------------------------------------- start */

(async function boot() {
  status('measuring clock…');
  await syncClock(5);
  await refresh();
  await loadLibrary({ reset: true });
  // The idle carrier: a slow breathing bloom with no audio attached, so the
  // frame is alive before anyone has pressed Tune in. Costs one rAF on the
  // cheapest tier and stops the moment the tab is hidden.
  viz.start();
  setInterval(tick, 1000);
  STATE.pollTimer = setInterval(refresh, POLL_MS);

  // The editor hides itself when the server reports `editable: false`, which
  // is the default — STATION_KEY unset means the write endpoints are disabled
  // outright, so most listeners never see this section exists.
  queue.refresh();
  setInterval(() => { if (!document.hidden) queue.refresh(); }, POLL_MS);

  status('ready — press Tune in');
})();
