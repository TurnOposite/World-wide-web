/**
 * One interface, two kinds of station.
 *
 *   cloud  — the static site. The programme is computed here, in this tab
 *            (./cloud.js); the DJ's decisions arrive through a control plane
 *            (./control.js).
 *   tower  — a Radio Tower server (the Pi, or `npm start` anywhere). Every
 *            answer comes from its /api/*, exactly as public/app.js always
 *            did, and the queue is its own POST /api/queue/* with the
 *            station key.
 *
 * Pages, the player and the booth only ever talk to the object `connect()`
 * returns, so none of them knows or cares which one it got.
 */
import { CloudEngine } from './cloud.js';
import { GitHubControl, LocalControl, StaticControl, ArtifactControl, EMPTY_CONTROL, ControlError } from './control.js';

const TOKEN_KEY = 'radiotower.githubToken';
const CHANNEL_KEY = 'radiotower.channel';
const CONTROL_POLL_MS = 20_000;

/** Small event emitter — the site has no framework and needs only this much. */
class Emitter {
  constructor() { this._h = new Map(); }
  on(type, fn) {
    if (!this._h.has(type)) this._h.set(type, new Set());
    this._h.get(type).add(fn);
    return () => this._h.get(type)?.delete(fn);
  }
  emit(type, detail) { this._h.get(type)?.forEach((fn) => { try { fn(detail); } catch (e) { console.error(e); } }); }
}

/**
 * Device clock vs. the host's clock, from the HTTP `Date` header.
 * A static host has no /api/time, but every response carries the server's
 * time to the second. That resolution is too coarse to correct small errors,
 * so anything under 1.5 s is left alone (the player's own drift tolerance is
 * 2 s) — what this catches is the phone that is thirty seconds off, which is
 * the case that actually breaks "everyone on the same second".
 */
export async function skewFromDateHeader(url, { samples = 3, fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  let best = { rtt: Infinity, skew: 0 };
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    try {
      const u = new URL(url, globalThis.location?.href ?? 'http://localhost/');
      u.searchParams.set('clock', String(t0));
      const res = await fetchImpl(u.href, { method: 'HEAD', cache: 'no-store' });
      const t1 = Date.now();
      const d = Date.parse(res.headers.get('Date') || '');
      if (!Number.isFinite(d)) continue;
      const rtt = t1 - t0;
      const skew = d + 500 - (t0 + rtt / 2); // the header truncates to the second
      if (rtt < best.rtt) best = { rtt, skew };
    } catch { /* keep what we have */ }
  }
  return Math.abs(best.skew) < 1500 ? 0 : Math.round(best.skew);
}

/** The channel this browser last tuned to. A convenience only — never load-bearing. */
export const channelStore = {
  get() { try { return localStorage.getItem(CHANNEL_KEY) || null; } catch { return null; } },
  set(slug) { try { slug ? localStorage.setItem(CHANNEL_KEY, slug) : localStorage.removeItem(CHANNEL_KEY); } catch { /* private mode */ } },
};

/** Token for the GitHub control plane. Lives in this browser only. */
export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; } },
  set(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

/* ------------------------------------------------------------------ cloud */

class CloudClient extends Emitter {
  constructor({ config, base, library, plane, skew }) {
    super();
    this.mode = 'cloud';
    this.config = config;
    this.base = base;
    this.plane = plane;
    this.skew = skew;
    this.engine = new CloudEngine({
      library,
      config: config.station || {},
      base,
      clock: () => Date.now() + this.skew,
    });
    this._timer = null;
  }

  now() { return Date.now() + this.skew; }

  get planeKind() { return this.plane.kind; }
  get canWrite() { return Boolean(this.plane.writable); }
  get look() { return this.engine.look; }
  get controlStatus() { return this.engine.controlStatus; }

  /** The channel this tab is tuned to (server/lib/channels.js). */
  get channel() { return this.engine.channel; }

  /** Every channel, with what is on air on each right now. */
  async channels() { return this.engine.get('/api/channels').body; }

  /**
   * Switch channel. The programme on every channel is already running — this
   * only changes which clock this tab listens to. Emits 'channel'; the player
   * follows it to the new channel's track and second.
   */
  async setChannel(slug, { remember = true } = {}) {
    const before = this.engine.channel;
    const now = this.engine.setChannel(slug);
    if (remember) channelStore.set(now);
    if (now !== before) this.emit('channel', { slug: now, from: before });
    return now;
  }

  async get(path) {
    // The portfolio is data, not programme: a file the build writes from the
    // same manifest code the Pi uses (scripts/site-collections.mjs).
    if (path.startsWith('/api/collections')) {
      this._collections ??= fetch(new URL('data/collections.json', this.base)).then((r) => {
        if (!r.ok) throw new Error(`collections ${r.status}`);
        return r.json();
      }).catch((err) => { this._collections = null; throw err; }); // a failed load may be retried
      return this._collections;
    }
    const { status, body } = this.engine.get(path);
    if (status >= 400) throw Object.assign(new Error(body.error || `status ${status}`), { status, body });
    return body;
  }

  async syncClock() {
    this.skew = await skewFromDateHeader(new URL('station/library.json', this.base).href);
    return this.skew;
  }

  /** Pull the control document now; emits 'control' when it changed. */
  async pollControl() {
    try {
      const { doc, changed } = await this.plane.read();
      if (changed || this.engine.control === null) {
        const status = this.engine.applyControl(doc);
        this.emit('control', { doc, status });
      }
      this.emit('control-ok');
    } catch (err) {
      this.emit('control-error', err);
    }
  }

  startPolling() {
    if (this._timer) return;
    // Hidden tabs poll too: a phone in a pocket is still a listener, and one
    // that missed a reorder would play a different programme from everyone
    // else. (Browsers slow a hidden tab's timer to about once a minute — well
    // inside the 3-minute fence; the API is asked at most every 90 s anyway.)
    this._timer = setInterval(() => this.pollControl(), CONTROL_POLL_MS);
    this.plane.onChange?.(() => this.pollControl());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.pollControl(); });
  }

  async _commit(proposal, message) {
    if (!proposal.ok) throw new ControlError(proposal.detail || proposal.error, { status: proposal.status, code: proposal.error });
    await this.plane.write(proposal.doc, { message });
    const status = this.engine.applyControl(proposal.doc);
    this.emit('control', { doc: proposal.doc, status });
    return { ok: true, status, full: proposal.full, until: proposal.until ?? null };
  }

  reorder(req, meta = {}) {
    const titles = req.ids.slice(0, 3).map((id) => this.engine.station.get(id)?.title).filter(Boolean).join(', ');
    return this._commit(this.engine.proposeReorder(req, meta), `booth: reorder — ${titles}${req.ids.length > 3 ? '…' : ''}`);
  }

  clear() { return this._commit(this.engine.proposeClear(), 'booth: back to the station clock'); }

  setLook(look) { return this._commit(this.engine.proposeLook(look), `booth: broadcast look ${look?.preset || 'cleared'}`); }

  sourcesFor(id) { return this.engine.sourcesFor(id); }

  setToken(token) {
    tokenStore.set(token);
    if (this.plane.kind === 'github') this.plane.token = token || null;
  }
}

/* ------------------------------------------------------------------ tower */

class TowerClient extends Emitter {
  constructor({ config, origin }) {
    super();
    this.mode = 'tower';
    this.config = config;
    this.origin = origin.replace(/\/$/, '');
    this.skew = 0;
    this.key = null; // the station key, held in memory only — public/queue.js's rule
    this.listenerId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this._look = null;
    this.channel = null; // null = the server's default; set by setChannel()
    this._channels = null;
  }

  /** Every channel the tower offers ({ default, current, channels }). Older towers have none. */
  async channels() {
    try {
      const body = await this.get('/api/channels');
      this._channels = body;
      if (!this.channel) this.channel = body.default ?? null;
      return { ...body, current: this.channel };
    } catch {
      return { default: null, current: null, channels: [] };
    }
  }

  async setChannel(slug, { remember = true } = {}) {
    const list = this._channels?.channels || (await this.channels()).channels;
    const ok = list.some((c) => c.slug === slug);
    const before = this.channel;
    this.channel = ok ? slug : (this._channels?.default ?? null);
    if (remember) channelStore.set(this.channel);
    if (this.channel !== before) this.emit('channel', { slug: this.channel, from: before });
    return this.channel;
  }

  now() { return Date.now() + this.skew; }
  get planeKind() { return 'tower'; }
  get canWrite() { return Boolean(this.key); }
  get look() { return this._look; }
  get controlStatus() { return 'n/a'; }

  async get(path) {
    // The programme endpoints answer for one channel; ask for ours.
    if (this.channel && /^\/api\/(station|queue|schedule)\b/.test(path) && !/[?&]channel=/.test(path)) {
      path += `${path.includes('?') ? '&' : '?'}channel=${encodeURIComponent(this.channel)}`;
    }
    const sep = path.includes('?') ? '&' : '?';
    const url = path.startsWith('/api/station') ? `${this.origin}${path}${sep}listener=${this.listenerId}` : `${this.origin}${path}`;
    const res = await fetch(url, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || `status ${res.status}`), { status: res.status, body });
    return body;
  }

  /** Lowest-round-trip of several /api/time samples — public/app.js's method. */
  async syncClock(samples = 5) {
    let best = { rtt: Infinity, skew: 0 };
    for (let i = 0; i < samples; i++) {
      const t0 = Date.now();
      try {
        const { t } = await (await fetch(`${this.origin}/api/time`, { cache: 'no-store' })).json();
        const rtt = Date.now() - t0;
        const skew = t - (t0 + rtt / 2);
        if (rtt < best.rtt) best = { rtt, skew };
      } catch { /* keep what we have */ }
    }
    this.skew = Math.round(best.skew);
    return this.skew;
  }

  async pollControl() { this.emit('control-ok'); }
  startPolling() {}

  async _post(path, body) {
    const res = await fetch(`${this.origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-station-key': this.key || '' },
      body: JSON.stringify(body || {}),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new ControlError(out.detail || out.error || `status ${res.status}`, { status: res.status, code: out.error });
    this.emit('control', { doc: null, status: 'applied' });
    return out;
  }

  reorder(req) { return this._post('/api/queue/reorder', this.channel ? { ...req, channel: this.channel } : req); }
  clear() { return this._post('/api/queue/clear', this.channel ? { channel: this.channel } : {}); }
  async setLook(look) { this._look = look; this.emit('control', { doc: { look }, status: 'local' }); return { ok: true }; }
  sourcesFor() { return []; }
  setToken(key) { this.key = key || null; }
}

/* ---------------------------------------------------------------- connect */

/**
 * May this site tune to the station at `url`? Its own origin, a machine on
 * this computer, the configured tower, or anything listed in
 * config.tower.allowed (origins, e.g. "https://radio.example.com").
 */
export function towerAllowed(url, config = {}, here = globalThis.location?.origin ?? '') {
  if (url === '') return true;
  let origin;
  try { origin = new URL(url).origin; } catch { return false; }
  if (origin === here) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return true;
  const list = [config.tower?.url, ...(config.tower?.allowed || [])].filter(Boolean);
  return list.some((u) => { try { return new URL(u).origin === origin; } catch { return false; } });
}

/**
 * Read site config and return the right client.
 * @param {object} o
 * @param {string} o.base  the site root (document.baseURI)
 */
export async function connect({ base = document.baseURI, overrides = {} } = {}) {
  const params = new URLSearchParams(location.search);
  let config = {};
  try {
    config = await (await fetch(new URL('config.json', base), { cache: 'no-store' })).json();
  } catch { config = {}; }
  config = { ...config, ...overrides };

  // ?tower=https://radio.example.com points this front end at a real station.
  // Only at a station this site trusts: otherwise a crafted link could dress
  // a stranger's server up in this site's clothes — and the booth would hand
  // it the station key.
  let towerUrl = config.mode === 'tower' ? (config.tower?.url ?? '') : null;
  const asked = params.get('tower');
  if (asked !== null) {
    if (towerAllowed(asked, config)) towerUrl = asked;
    else console.warn(`[radio-tower] ignoring ?tower=${asked} — not this site's station (config.json → tower.allowed)`);
  }
  // ?ch=long tunes straight to a channel; otherwise the one this browser
  // last chose; otherwise the station's default.
  const wantChannel = params.get('ch') || channelStore.get();

  // A tower the site is *configured* for (not one a link asked for) may be
  // down — a cloud server being updated, a Pi unplugged. Rather than dead
  // air, fall back to the in-browser station and its own library.
  if (towerUrl !== null && towerUrl !== undefined && asked === null && towerUrl !== '') {
    const up = await fetch(`${towerUrl.replace(/\/$/, '')}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout?.(6000) })
      .then((r) => r.ok).catch(() => false);
    if (!up) {
      console.warn(`[radio-tower] the tower at ${towerUrl} is not answering — playing the in-browser station instead`);
      towerUrl = null;
      config = { ...config, towerFallback: true };
    }
  }

  if (towerUrl !== null && towerUrl !== undefined) {
    const client = new TowerClient({ config, origin: towerUrl || location.origin });
    await client.syncClock(3);
    await client.channels();
    if (wantChannel) await client.setChannel(wantChannel, { remember: Boolean(params.get('ch')) });
    return client;
  }

  const library = await (await fetch(new URL('station/library.json', base), { cache: 'no-store' })).json();

  const gh = config.github || {};
  const wantLocal = params.get('control') === 'local' || config.control === 'local';
  let plane;
  if (config.control === 'artifact') {
    // The claude.ai preview: its own shared database, when the viewer serves one.
    const use = globalThis.claude?.use;
    plane = new ArtifactControl({ dbPromise: typeof use === 'function' ? use.call(globalThis.claude, 'db') : null });
  } else if (!wantLocal && gh.owner && gh.repo) {
    plane = new GitHubControl({
      owner: gh.owner, repo: gh.repo, branch: gh.branch || 'main',
      path: gh.controlPath || 'site/station/control.json',
      api: gh.api || 'https://api.github.com',
      token: tokenStore.get(),
      fallbackUrl: new URL('station/control.json', base).href,
    });
  } else if (wantLocal) {
    plane = new LocalControl();
  } else {
    plane = new StaticControl(new URL('station/control.json', base).href);
  }

  const client = new CloudClient({ config, base, library, plane, skew: 0 });
  if (wantChannel) client.engine.setChannel(wantChannel);
  await client.syncClock();
  await client.pollControl();
  if (client.engine.control === null) client.engine.applyControl({ ...EMPTY_CONTROL });
  client.startPolling();
  return client;
}
