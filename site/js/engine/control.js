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
 *   GitHubControl  the static site on GitHub Pages. Reads through the REST
 *                  API with ETags (a 304 costs nothing against the rate
 *                  limit), falls back to the copy Pages serves; writes by
 *                  committing the file with a fine-grained token that never
 *                  leaves the DJ's browser.
 *   StaticControl  read-only: any host serving station/control.json.
 *   LocalControl   a preview on one machine: localStorage + BroadcastChannel,
 *                  so two tabs behave like two listeners.
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
 * `read()` returns `{ doc, changed }`; `changed` is false on a 304, so a
 * listener polling every 20 s re-renders only when the DJ actually did
 * something. `write(doc)` commits and returns the new doc; a concurrent edit
 * (409/422 — someone else committed since our read) is retried once against
 * the fresh sha, because the booth always writes a whole document computed
 * from what it last saw, and "last writer wins" is the right rule for one DJ.
 */
export class GitHubControl {
  constructor({ owner, repo, branch = 'main', path = 'site/station/control.json', api = 'https://api.github.com', token = null, fallbackUrl = null, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
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
    const url = `${this.contentsUrl}?ref=${encodeURIComponent(this.branch)}`;
    let res;
    try {
      res = await this.fetch(url, { headers: this._headers(this.etag ? { 'If-None-Match': this.etag } : {}), cache: 'no-store' });
    } catch (err) {
      if (this.fallback) return this.fallback.read();
      throw new ControlError(`GitHub unreachable: ${err.message}`, { code: 'network' });
    }
    if (res.status === 304 && this.last) return { doc: this.last, changed: false };
    if (!res.ok) {
      // 403/429 = rate limited (60 unauthenticated requests an hour per IP);
      // 404 = repo private or file missing. The Pages copy still works.
      if (this.fallback) return this.fallback.read();
      throw new ControlError(`GitHub ${res.status}`, { status: res.status });
    }
    const body = await res.json();
    this.etag = res.headers.get('ETag') || res.headers.get('etag') || null;
    this.sha = body.sha || null;
    this.last = parseDoc(b64decode(body.content || ''));
    return { doc: this.last, changed: true };
  }

  async write(doc, { message = 'booth: update control.json' } = {}) {
    if (!this.token) throw new ControlError('Paste a GitHub token in the booth to go on air.', { code: 'no_token' });
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

export { b64encode, b64decode };
