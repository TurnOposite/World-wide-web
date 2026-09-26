/**
 * The radio: join late, stay in step, roll over on the clock.
 *
 * This is public/app.js's player with the page taken out of it, so it can
 * outlive page changes: the router swaps <main>, this keeps the one <audio>
 * element and keeps playing. What it does is unchanged (docs/ARCHITECTURE.md
 * "Joining, and staying joined"):
 *
 *   - the station says *what* is on air and *when it started*;
 *   - we seek to (now − startsAt) and play;
 *   - once a second we compare and hard-seek past 2 s of drift;
 *   - rollover is driven by the clock, never by `ended`.
 *
 * Two things are new. A cloud track can have several sources; if one will not
 * load we try the next, and if none will we say so and come back at the next
 * track — we never "skip ahead", because skipping would put this listener on a
 * different second from everyone else. And the Media Session gets the track,
 * so a phone's lock screen shows what the tower is playing.
 */

const DRIFT_TOLERANCE = 2.0;

export class Player extends EventTarget {
  /**
   * @param {object} client  from engine/transport.js connect()
   * @param {HTMLAudioElement} audio
   * @param {object} [o]
   * @param {import('./viz/stage.js').Stage} [o.stage]
   */
  constructor(client, audio, { stage = null } = {}) {
    super();
    this.client = client;
    this.audio = audio;
    this.stage = stage;
    this.data = null;         // last /api/station body
    this.playing = false;
    this.drift = null;
    this.status = 'ready';
    this.statusTone = '';
    this._sourceIndex = 0;
    this._sources = [];
    this._unavailableUntil = 0;
    this._refreshing = null;
    this._timers = [];

    try {
      const v = Number(localStorage.getItem('radiotower.volume'));
      audio.volume = Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8;
    } catch { audio.volume = 0.8; }

    audio.addEventListener('waiting', () => this.playing && this._status('buffering…'));
    audio.addEventListener('playing', () => this._status('on air'));
    audio.addEventListener('error', () => this._onError());
    // `ended` is a hint, not the clock: a stalled buffer fires it late.
    audio.addEventListener('ended', () => this.refresh().then(() => this.playing && this.join({ force: true })));

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.playing) this.refresh().then(() => this.join());
    });

    client.on?.('control', () => this.refresh());
    this._setupMediaSession();
  }

  get onAir() { return this.data?.onAir ?? null; }
  get station() { return this.data?.station ?? null; }
  now() { return this.client.now(); }

  /** Seconds into the on-air track, according to the tower. */
  livePosition() {
    const t = this.onAir;
    return t ? (this.now() - t.startsAt) / 1000 : null;
  }

  _status(text, tone = '') {
    this.status = text;
    this.statusTone = tone;
    this.dispatchEvent(new CustomEvent('status', { detail: { text, tone } }));
  }

  async refresh() {
    if (this._refreshing) return this._refreshing;
    this._refreshing = (async () => {
      try {
        const data = await this.client.get('/api/station');
        const changed = data.onAir?.id !== this.onAir?.id || data.onAir?.startsAt !== this.onAir?.startsAt;
        this.data = data;
        if (changed) this._onTrackChange();
        this.dispatchEvent(new CustomEvent('station', { detail: data }));
        if (!this.playing && this.status.startsWith('lost')) this._status('ready');
      } catch (err) {
        this._status('lost the tower — retrying', 'bad');
      } finally {
        this._refreshing = null;
      }
    })();
    return this._refreshing;
  }

  _onTrackChange() {
    const t = this.onAir;
    if (!t) return;
    this.stage?.setTrack(t);
    this._sources = this.client.mode === 'cloud' ? this.client.sourcesFor(t.id) : [];
    if (!this._sources.length && t.streamUrl) this._sources = [new URL(t.streamUrl, this.client.origin || location.href).href];
    this._sourceIndex = 0;
    this._unavailableUntil = 0;
    this._updateMediaSession();
    this.dispatchEvent(new CustomEvent('track', { detail: t }));
  }

  start() {
    this.refresh();
    this._timers.push(setInterval(() => this._tick(), 1000));
    // A server has news (listeners, library changes); a cloud station only
    // needs recomputing at boundaries, but a cheap refresh keeps "up next"
    // honest if the DJ moved something.
    this._timers.push(setInterval(() => this.refresh(), this.client.mode === 'cloud' ? 10_000 : 15_000));
  }

  _tick() {
    const t = this.onAir;
    if (!t) return;
    const pos = this.livePosition();
    const dur = t.duration;
    this.dispatchEvent(new CustomEvent('tick', { detail: { pos, dur, pct: Math.max(0, Math.min(1, pos / dur)) } }));

    if (pos >= dur - 0.25) {
      this.refresh().then(() => this.playing && this.join({ force: true }));
      return;
    }
    if (!this.playing || this.audio.paused || this.audio.readyState < 2) return;
    const drift = this.audio.currentTime - pos;
    this.drift = drift;
    this.dispatchEvent(new CustomEvent('drift', { detail: drift }));
    if (Math.abs(drift) > DRIFT_TOLERANCE) {
      this.audio.currentTime = Math.max(0, pos);
      this._status(`re-synced (${drift > 0 ? 'ahead' : 'behind'} ${Math.abs(drift).toFixed(1)}s)`);
    }
  }

  /** Point the audio at the on-air track and seek to where the tower is. */
  join({ force = false } = {}) {
    const t = this.onAir;
    if (!t || !this._sources.length) return;
    if (this.now() < this._unavailableUntil) return;
    const want = this._sources[this._sourceIndex];
    const pos = this.livePosition();
    if (pos == null || pos < 0) return;
    const seek = () => {
      const p = this.livePosition() ?? 0;
      const max = (this.audio.duration || 1e9) - 0.15;
      try { this.audio.currentTime = Math.max(0, Math.min(p, max)); } catch { /* not seekable yet */ }
      if (this.playing) this.audio.play().catch(() => {});
    };
    if (force || this.audio.src !== want) {
      this.audio.src = want;
      this.audio.addEventListener('loadedmetadata', seek, { once: true });
      this.audio.load();
    } else {
      seek();
    }
  }

  _onError() {
    if (!this.playing || !this.onAir) return;
    if (this._sourceIndex < this._sources.length - 1) {
      this._sourceIndex++;
      this._status('trying another copy of this track…');
      this.join({ force: true });
      return;
    }
    // Nothing plays it. Stay on the clock: silence until the next track.
    this._unavailableUntil = this.onAir.endsAt;
    this._status('this track will not load here — back on air at the next one', 'bad');
    this.dispatchEvent(new CustomEvent('unavailable', { detail: this.onAir }));
  }

  /**
   * Tune in. Called from a click: the AudioContext and the first play() must
   * start inside the gesture or iOS keeps them suspended for good
   * (.claude/skills/tower-mobile-check), so nothing awaits before them.
   */
  tuneIn() {
    if (this.playing) return;
    this.playing = true;
    this.stage?.attach(this.audio);
    this.stage?.resume();
    this.stage?.setPlaying(true);
    const want = this._sources[this._sourceIndex];
    if (want && this.audio.src !== want) {
      this.audio.src = want;
      this.audio.addEventListener('loadedmetadata', () => this._seekLive(), { once: true });
    } else {
      this._seekLive();
    }
    const p = this.audio.play();
    p?.catch?.((e) => {
      // AbortError = a newer load replaced this one (a rollover mid-click); harmless.
      if (e?.name !== 'AbortError') this._status('your browser blocked playback — press Tune in again', 'bad');
    });
    this._status('on air');
    this.dispatchEvent(new CustomEvent('playing', { detail: true }));
    if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing';
    // Skew may have moved since boot; the drift check acts on the new value.
    this.client.syncClock?.();
  }

  _seekLive() {
    const p = this.livePosition() ?? 0;
    const max = (this.audio.duration || 1e9) - 0.15;
    try { this.audio.currentTime = Math.max(0, Math.min(p, max)); } catch { /* not seekable yet */ }
  }

  mute() {
    if (!this.playing) return;
    this.playing = false;
    this.audio.pause();
    this.stage?.setPlaying(false);
    this._status('the tower kept broadcasting — tune back in to land where it is now');
    this.dispatchEvent(new CustomEvent('playing', { detail: false }));
    if (navigator.mediaSession) navigator.mediaSession.playbackState = 'paused';
  }

  toggle() { this.playing ? this.mute() : this.tuneIn(); }

  async resync() {
    await this.client.syncClock?.();
    await this.refresh();
    this.join({ force: true });
    this._status('re-synced');
  }

  setVolume(v) {
    this.audio.volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('radiotower.volume', String(this.audio.volume)); } catch { /* ignore */ }
  }

  /* ------------------------------------------------------ media session -- */

  _setupMediaSession() {
    const ms = navigator.mediaSession;
    if (!ms) return;
    try {
      ms.setActionHandler('play', () => this.tuneIn());
      ms.setActionHandler('pause', () => this.mute());
      ms.setActionHandler('stop', () => this.mute());
      // A radio has no seek, no previous, no next: leave them unset so the
      // lock screen does not offer buttons that would do nothing.
      for (const a of ['seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack']) {
        try { ms.setActionHandler(a, null); } catch { /* unsupported action */ }
      }
    } catch { /* older browsers */ }
  }

  _updateMediaSession() {
    const ms = navigator.mediaSession;
    const t = this.onAir;
    if (!ms || !t || !globalThis.MediaMetadata) return;
    try {
      ms.metadata = new MediaMetadata({
        title: t.title,
        artist: t.artist,
        album: `${this.station?.name || 'Radio Tower'} — live`,
        artwork: t.artUrl ? [{ src: t.artUrl, sizes: '512x512' }] : [],
      });
    } catch { /* ignore */ }
  }
}

export function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
