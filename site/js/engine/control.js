/**
 * Where the DJ's decisions live — the station's only shared, mutable state.
 *
 * A control document is tiny:
 *   { version: 1, override: { cycleIndex, startWithin, ids, setAt, by } | null,
 *     look: { preset, layers, intensity, hue, … } | null, updatedAt, note? }
 *
 * Every plane has the same two verbs — `read()` and `write(doc)` — so the
 * booth does not care where the file lives:
 *
 *   GitHubControl  the static site on GitHub Pages. A listener reads the
 *                  REST API at most every 90 s (60 unauthenticated calls an
 *                  hour per IP; a 304 is only free with a token) and the copy
 *                  Pages serves in between — the newer document wins; writes
 *                  by committing the file with a fine-grained token that
 *                  never leaves the DJ's browser.
 *   StaticControl  read-only: any host serving station/control.json.
 *   LocalControl   a preview on one machine: localStorage + BroadcastChannel,
 *                  so two tabs behave like two listeners.
 *   ArtifactControl the claude.ai preview: the artifact's own shared
 *                  database, so everyone the preview is shared with hears the
 *                  same reorder. Falls back to LocalControl where there is
 *                  no such database (any other host).
 *
 * (A Radio Tower server needs none of this — its own POST /api/queue/*
 * endpoints are the control plane. See ./transport.js.)
 */

const b64encode = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const b64decode = (b64) => {
  const bin = atob(String(b64).replace(/\s+/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const EMPTY_CONTROL = Object.freeze({ version: 1, override: null, look: null, updatedAt: null });

function parseDoc(text) {
  try {
    const doc = JSON.parse(text);
    return doc && typeof doc === 'object' ? doc : { ...EMPTY_CONTROL };
  } catch {
    return { ...EMPTY_CONTROL };
  }
}

export class ControlError extends Error {
  constructor(message, { status = 0, code = 'control_error' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Read-only: fetch a control.json from wherever the site is hosted. */
export class StaticControl {
  constructor(url, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
    this.url = url;
    this.fetch = fetchImpl;
    this.kind = 'static';
    this.writable = false;
  }

  async read() {
    // A query string defeats any intermediate cache; `no-store` the browser's.
    const u = new URL(this.url, globalThis.location?.href ?? 'http://localhost/');
    u.searchParams.set('t', String(Math.floor(Date.now() / 15000)));
    const res = await this.fetch(u.href, { cache: 'no-store' });
    if (!res.ok) throw new ControlError(`control.json ${res.status}`, { status: res.status });
    return { doc: parseDoc(await res.text()), changed: true };
  }

  async write() {
    throw new ControlError('This copy of the site is read-only.', { code: 'read_only' });
  }
}

/**
 * The repository is the database.
 *
 * `read()` returns `{ doc, changed }`; `changed` is false when nothing new arrived, so a
 * listener polling every 20 s re-renders only when the DJ actually did
 * something. `write(doc)` commits and returns the new doc; a concurrent edit
 * (409/422 — someone else committed since our read) is retried once against
 * the fresh sha, because the booth always writes a whole document computed
 * from what it last saw, and "last writer wins" is the right rule for one DJ.
 */
export class GitHubControl {
  constructor({ owner, repo, branch = 'main', path = 'site/station/control.json', api = 'https://api.github.com', token = null, fallbackUrl = null, fetchImpl = globalThis.fetch?.bind(globalThis), apiEveryMs = 90_000, now = () => Date.now() }) {
    if (!owner || !repo) throw new ControlError('GitHubControl needs owner and repo', { code: 'misconfigured' });
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.path = path;
    this.api = api.replace(/\/$/, '');
    this.token = token;
    this.fetch = fetchImpl;
    this.fallback = fallbackUrl ? new StaticControl(fallbackUrl, { fetchImpl }) : null;
    this.kind = 'github';
    this.etag = null;
    this.sha = null;
    this.last = null;
    // Bumped by every write: a read that started before a write and answers
    // after it carries the document (and sha) the write just replaced.
    this._gen = 0;
    // Without a token GitHub allows 60 API calls an hour per IP, and a 304
    // is only free *with* one. So a listener asks the API at most every
    // `apiEveryMs` (and not at all while rate-limited), and reads the Pages
    // copy in between; whichever document is newer wins. The DJ, holding a
    // token (5,000 an hour), asks the API every time.
    this.apiEveryMs = apiEveryMs;
    this.now = now;
    this._nextApiAt = 0;
    this._best = null;      // the document that stands (see _settle)
    this._shown = null;     // JSON of what read() last returned
    this._pagesText = null; // JSON of the Pages copy when last read
  }

  get writable() {
    return Boolean(this.token);
  }

  get contentsUrl() {
    const p = this.path.split('/').map(encodeURIComponent).join('/');
    return `${this.api}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/contents/${p}`;
  }

  _headers(extra = {}) {
    const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...extra };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async read() {
    if (this.fallback && !this.token && this.now() < this._nextApiAt) return this._settle(await this._fallbackRead(this._gen), 'pages');
    const r = await this._apiRead();
    return this._settle(r, r.source || 'api');
  }

  /**
   * Which document stands. The repository (the API) is the authority: what it
   * says goes, even an older-looking document — a revert on github.com must
   * reach tabs already open. The Pages copy only fills the gap between API
   * calls: it wins when it has *changed since we last read it* and is newer
   * than what we hold (a fresh deploy of the DJ's commit), never merely
   * because a not-yet-redeployed copy carries a later date.
   */
  _settle({ doc }, source) {
    const ts = (d) => Date.parse(d?.updatedAt) || 0;
    if (doc) {
      const text = JSON.stringify(doc);
      if (source === 'api') {
        this._best = doc;
      } else if (text !== this._pagesText) {
        this._pagesText = text;
        if (!this._best || ts(doc) > ts(this._best)) this._best = doc;
      }
    }
    const out = this._best ?? doc;
    const shown = JSON.stringify(out);
    const changed = shown !== this._shown;
    this._shown = shown;
    return { doc: out, changed };
  }

  _limited(res) {
    const raw = res.headers.get('X-RateLimit-Reset') || res.headers.get('x-ratelimit-reset');
    const reset = raw ? Number(raw) * 1000 : NaN;
    return Number.isFinite(reset) && reset > this.now() ? reset : this.now() + 15 * 60_000;
  }

  async _apiRead() {
    const url = `${this.contentsUrl}?ref=${encodeURIComponent(this.branch)}`;
    const gen = this._gen;
    const stale = () => gen !== this._gen && this.last;
    let res;
    try {
      res = await this.fetch(url, { headers: this._headers(this.etag ? { 'If-None-Match': this.etag } : {}), cache: 'no-store' });
    } catch (err) {
      if (this.fallback) return { ...(await this._fallbackRead(gen)), source: 'pages' };
      throw new ControlError(`GitHub unreachable: ${err.message}`, { code: 'network' });
    }
    if (stale()) return { doc: this.last, changed: false };
    const leftHeader = res.headers.get('X-RateLimit-Remaining') ?? res.headers.get('x-ratelimit-remaining');
    const left = leftHeader === null || leftHeader === '' ? NaN : Number(leftHeader);
    this._nextApiAt = this.now() + (this.token ? 0 : this.apiEveryMs);
    if (Number.isFinite(left) && left < 5) this._nextApiAt = Math.max(this._nextApiAt, this._limited(res));
    if (res.status === 304 && this.last) return { doc: this.last, changed: false };
    if (!res.ok) {
      // 403/429 = rate limited: no more API calls until it resets.
      // 404 = repo private or file missing. The Pages copy still works.
      if (res.status === 403 || res.status === 429) this._nextApiAt = this._limited(res);
      if (this.fallback) return { ...(await this._fallbackRead(gen)), source: 'pages' };
      throw new ControlError(`GitHub ${res.status}`, { status: res.status });
    }
    const body = await res.json();
    if (stale()) return { doc: this.last, changed: false };
    this.etag = res.headers.get('ETag') || res.headers.get('etag') || null;
    this.sha = body.sha || null;
    this.last = parseDoc(b64decode(body.content || ''));
    return { doc: this.last, changed: true };
  }

  /** The Pages copy — unless a write happened meanwhile (then it is older than what we hold). */
  async _fallbackRead(gen) {
    const out = await this.fallback.read();
    if (gen !== this._gen && this.last) return { doc: this.last, changed: false };
    return out;
  }

  async write(doc, { message = 'booth: update control.json' } = {}) {
    if (!this.token) throw new ControlError('Paste a GitHub token in the booth to go on air.', { code: 'no_token' });
    this._gen++;
    const attempt = async () => {
      if (!this.sha) await this.read();
      const res = await this.fetch(this.contentsUrl, {
        method: 'PUT',
        headers: this._headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          message,
          content: b64encode(JSON.stringify(doc, null, 2) + '\n'),
          sha: this.sha || undefined,
          branch: this.branch,
        }),
      });
      return res;
    };

    let res = await attempt();
    if (res.status === 409 || res.status === 422) {
      // Someone committed since we read. Take their sha and write ours on top.
      this.sha = null;
      this.etag = null;
      res = await attempt();
    }
    if (res.status === 401 || res.status === 403) {
      throw new ControlError('GitHub refused the token — check it has Contents: read & write on this repository.', { status: res.status, code: 'bad_token' });
    }
    if (!res.ok) throw new ControlError(`GitHub ${res.status} while saving`, { status: res.status });
    const body = await res.json();
    this.sha = body.content?.sha || null;
    this.etag = null;
    this.last = doc;
    this._best = doc;                    // the booth applied it already:
    this._shown = JSON.stringify(doc);   // not news on the next read
    this._gen++;
    return { doc, commit: body.commit?.sha || null };
  }
}

/**
 * One machine, several tabs: good enough to try the booth before a repo
 * exists, and it is what the preview uses. Not shared with anyone else.
 */
export class LocalControl {
  constructor({ key = 'radiotower.control', storage = globalThis.localStorage, channelName = 'radiotower-control' } = {}) {
    this.key = key;
    this.storage = storage;
    this.kind = 'local';
    this.writable = true;
    this.listeners = new Set();
    try {
      this.channel = new BroadcastChannel(channelName);
      this.channel.onmessage = () => this.listeners.forEach((fn) => fn());
    } catch {
      this.channel = null;
    }
    this._lastText = null;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async read() {
    let text = null;
    try { text = this.storage?.getItem(this.key) ?? null; } catch { /* private mode */ }
    const changed = text !== this._lastText;
    this._lastText = text;
    return { doc: text ? parseDoc(text) : { ...EMPTY_CONTROL }, changed };
  }

  async write(doc) {
    const text = JSON.stringify(doc);
    try { this.storage?.setItem(this.key, text); } catch { throw new ControlError('This browser will not store the change.', { code: 'storage' }); }
    this._lastText = null; // force the next read() to report a change
    this.channel?.postMessage('changed');
    return { doc, commit: null };
  }
}

/**
 * The claude.ai preview's shared database (`claude.use('db')`).
 *
 * The database arrives after the page has started (or never, on any other
 * host), and the radio must not wait for it: until it answers, this plane
 * behaves exactly like LocalControl; when it answers, it subscribes to one
 * document and every listener hears a change live. A viewer who may only
 * look (a Viewer, or anyone below Contributor) gets a refusal on the first
 * write — then the booth says so and stays read-only.
 */
export class ArtifactControl {
  constructor({ dbPromise, path = 'station/control', local = null, waitMs = 5000 } = {}) {
    this.path = path;
    this.local = local || new LocalControl({ key: 'radiotower.preview-control', channelName: 'radiotower-preview-control' });
    this.listeners = new Set();
    this.db = null;
    this.ref = null;
    this.state = 'pending'; // → 'shared' | 'local' | 'read-only'
    this._doc = null;
    this._changed = false;
    this.error = null;
    this.local.onChange?.(() => { if (!this.ref) this._notify(); });
    const settle = Promise.resolve(dbPromise).catch(() => null).then((db) => this._attach(db));
    // Writes wait this long for the database before falling back to this browser.
    this._ready = Promise.race([settle, new Promise((r) => setTimeout(r, waitMs)?.unref?.())]);
  }

  get kind() { return this.ref ? 'artifact' : 'local'; }
  get writable() { return this.state !== 'read-only'; }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify() { this.listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

  _attach(db) {
    if (!db || typeof db.doc !== 'function') { this.state = 'local'; return; }
    try {
      this.ref = db.doc(this.path);
    } catch (err) {
      this.error = err;
      this.state = 'local';
      return;
    }
    this.db = db;
    this.state = 'shared';
    this.unsubscribe = this.ref.onSnapshot((snap) => {
      const doc = snap.exists ? clone(snap.data()) : { ...EMPTY_CONTROL };
      // Our own write comes back as a snapshot too: not news.
      if (this._doc && JSON.stringify(doc) === JSON.stringify(this._doc)) return;
      this._doc = doc;
      this._changed = true;
      this._notify();
    }, (err) => {
      // Terminal for this subscription: the 20 s poll keeps reading.
      this.error = err;
      this.unsubscribe = null;
    });
    this._notify(); // the booth repaints "where changes go"
  }

  async read() {
    if (!this.ref) return this.local.read();
    if (!this._doc || !this.unsubscribe) {
      const snap = await this.ref.get();
      const doc = snap.exists ? clone(snap.data()) : { ...EMPTY_CONTROL };
      const changed = !this._doc || JSON.stringify(doc) !== JSON.stringify(this._doc);
      this._doc = doc;
      this._changed = false;
      return { doc, changed };
    }
    const changed = this._changed;
    this._changed = false;
    return { doc: this._doc, changed };
  }

  async write(doc) {
    await this._ready;
    if (!this.ref) return this.local.write(doc);
    if (this.state === 'read-only') throw readOnly();
    const body = clone(doc);
    try {
      await this.ref.set(body);
    } catch (err) {
      let final = err;
      if (err?.code === 'unavailable') {
        // Transient: once more after a short, randomised pause.
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 800));
        try { await this.ref.set(body); final = null; } catch (again) { final = again; }
      }
      if (final) {
        // Below Contributor, a well-formed write is refused as invalid_argument.
        if (final.code === 'invalid_argument' || final.code === 'not_granted') {
          this.state = 'read-only';
          this._notify();
          throw readOnly();
        }
        throw new ControlError(`The preview could not save the change (${final.code || final.message || 'error'}).`, { code: final.code || 'control_error' });
      }
    }
    this._doc = body;
    this._changed = false;
    return { doc: body, commit: null };
  }
}

function readOnly() {
  return new ControlError('This preview is view-only for you: the person who shared it can change the queue.', { code: 'view_only' });
}

/** Snapshots are frozen; the engine gets its own copy. */
const clone = (x) => JSON.parse(JSON.stringify(x ?? null)) ?? { ...EMPTY_CONTROL };

export { b64encode, b64decode };
