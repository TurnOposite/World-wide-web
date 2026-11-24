// Retired 2026-11-25 with the claude.ai preview build (LIGHTER step 3). Was in site/js/engine/control.js; it needs
// that file's LocalControl, ControlError and EMPTY_CONTROL. Kept as text, not run.

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
