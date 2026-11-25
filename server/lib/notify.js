/**
 * « Phone notification for messages in antenna » (Ortis, 2026-11-16).
 *
 * Two ways a message on the telegraph line reaches a phone, both off until
 * someone turns them on:
 *
 *   A. Ortis is told. With TELEGRAPH_NOTIFY_URL set to an ntfy topic
 *      (https://ntfy.sh/<a long random name>), the tower posts there when a
 *      listener writes — the name and the first 80 characters — and the ntfy
 *      app on his phone shows it. The station's own messages are not sent to
 *      him. The topic's name is the only secret: it lives in the tower's
 *      environment, never in the repository.
 *
 *   B. The station's own devices are told (« Notify this device » in the
 *      Booth's Line side, behind the key — Ortis, 2026-11-17: « the
 *      notifications should only be accessible to me »): standard Web Push
 *      (server/lib/webpush.js). The browser's subscription — an address at its
 *      push service and two keys — is kept in a file beside the line's log. A
 *      subscription the push service says is gone (404, 410) is forgotten.
 *
 * Neither may become a stream of buzzing: at most one notification a minute,
 * and what arrived meanwhile goes out together (« 3 new messages »).
 * Nothing here can slow or fail a message: sending happens after the line
 * has answered, and every error ends in a single warning.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RateLimiter } from './ratelimit.js';
import { allowedEndpoint, generateKeys, send as pushSend, subscriptionKeys } from './webpush.js';

const cut = (s, max) => { const a = [...String(s ?? '')]; return a.length > max ? `${a.slice(0, max - 1).join('')}…` : a.join(''); };

/** What a notification says for the messages it stands for. */
export function summarise(items) {
  if (items.length === 1) return { title: `${items[0].name} on the telegraph line`, body: cut(items[0].text, 80) };
  const names = [...new Set(items.map((m) => m.name))];
  const who = names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  return { title: `${items.length} new messages on the telegraph line`, body: cut(`${who}. Last: ${items.at(-1).text}`, 120) };
}

/**
 * At most one `send` every `gapMs`: the first item goes at once, what comes during the gap goes together when it ends.
 */
export class Batcher {
  constructor({ gapMs = 60_000, send, now = Date.now, setTimer = setTimeout }) {
    this.gapMs = gapMs;
    this.send = send;
    this.now = now;
    this.setTimer = setTimer;
    this.pending = [];
    this.lastAt = -Infinity;
    this.timer = null;
    this.busy = Promise.resolve();
  }

  add(item) {
    this.pending.push(item);
    if (this.pending.length > 500) this.pending.shift();
    const wait = this.lastAt + this.gapMs - this.now();
    if (wait <= 0) this.flush();
    else if (!this.timer) {
      this.timer = this.setTimer(() => { this.timer = null; this.flush(); }, wait);
      this.timer?.unref?.();
    }
  }

  flush() {
    if (!this.pending.length) return;
    const items = this.pending.splice(0);
    this.lastAt = this.now();
    this.busy = this.busy.then(() => this.send(items)).catch(() => {});
  }

  /** Resolves once everything handed over so far has been sent (tests). */
  idle() { return this.busy; }
}

/** `https://ntfy.sh/topic` → where to post, and the topic. JSON publishing, so names and texts keep their accents. */
export function ntfyTarget(url) {
  try {
    const u = new URL(String(url));
    const parts = u.pathname.split('/').filter(Boolean);
    const topic = parts.pop();
    if (!/^https?:$/.test(u.protocol) || !topic) return null;
    return { base: `${u.origin}/${parts.join('/')}`.replace(/\/$/, '') || u.origin, topic: decodeURIComponent(topic) };
  } catch { return null; }
}

/** The listeners' subscriptions, in one small file beside the line's log. */
export class PushStore {
  /**
   * @param {object} o
   * @param {string|null} o.file      where subscriptions (and, by default, the server's key pair) are kept
   * @param {{publicKey: string, privateKey: string}|null} [o.keys]  from the environment; else made once and kept
   * @param {string} o.subject        who is sending, for the push service: an https address (RFC 8292)
   * @param {string[]} [o.allowOrigins]  extra endpoint origins (the self-test's stand-in)
   */
  constructor({ file = null, keys = null, subject, max = 2000, allowOrigins = [], fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    this.file = file;
    this.max = max;
    this.allowOrigins = allowOrigins;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.subs = new Map(); // endpoint -> { endpoint, keys: { p256dh, auth }, t }
    this._writing = Promise.resolve();
    let kept = null;
    if (file) {
      try { kept = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first start */ }
    }
    for (const s of Array.isArray(kept?.subs) ? kept.subs : []) if (this._valid(s)) this.subs.set(s.endpoint, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, t: s.t || 0 });
    const pair = keys?.publicKey && keys?.privateKey ? keys : kept?.vapid?.publicKey && kept?.vapid?.privateKey ? kept.vapid : null;
    this._ownKeys = !(keys?.publicKey && keys?.privateKey);
    this.vapid = { ...(pair || generateKeys()), subject };
    // A key pair made here must outlive the process: every subscription is tied to it.
    if (!pair && file) this._save();
  }

  get publicKey() { return this.vapid.publicKey; }
  get size() { return this.subs.size; }

  _valid(s) {
    if (!s || typeof s !== 'object' || !allowedEndpoint(s.endpoint, this.allowOrigins)) return false;
    try { subscriptionKeys(s.keys); } catch { return false; }
    return true;
  }

  _save() {
    if (!this.file) return;
    const file = this.file;
    this._writing = this._writing.then(async () => {
      const doc = { vapid: this._ownKeys ? { publicKey: this.vapid.publicKey, privateKey: this.vapid.privateKey } : undefined, subs: [...this.subs.values()] };
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(`${file}.tmp`, JSON.stringify(doc), { mode: 0o600 });
      await fs.promises.rename(`${file}.tmp`, file);
    }).catch((err) => {
      if (!this._warned) console.warn(`[notify] subscriptions are not being kept (${file}): ${err.message}`);
      this._warned = true;
    });
  }

  flushed() { return this._writing; }

  /** Keep a browser's subscription. */
  add(sub) {
    if (!this._valid(sub)) return { ok: false, status: 400, error: 'bad_subscription', detail: 'That is not a push subscription this tower can use.' };
    if (!this.subs.has(sub.endpoint) && this.subs.size >= this.max) return { ok: false, status: 503, error: 'full', detail: 'Too many listeners have asked already.' };
    this.subs.set(sub.endpoint, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, t: this.now() });
    this._save();
    return { ok: true };
  }

  remove(endpoint) {
    if (this.subs.delete(String(endpoint ?? ''))) this._save();
    return { ok: true };
  }

  /** Send `payload` to every subscription but those in `skip`; forget the ones the push service says are gone. */
  async sendAll(payload, { skip = new Set() } = {}) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const targets = [...this.subs.values()].filter((s) => !skip.has(s.endpoint));
    let sent = 0;
    let gone = 0;
    for (let i = 0; i < targets.length; i += 20) {
      const results = await Promise.allSettled(targets.slice(i, i + 20).map((s) => pushSend(s, text, this.vapid, { fetchImpl: this.fetchImpl })));
      results.forEach((r, j) => {
        if (r.status !== 'fulfilled') return;
        if (r.value === 404 || r.value === 410) { this.subs.delete(targets[i + j].endpoint); gone++; }
        else if (r.value >= 200 && r.value < 300) sent++;
      });
    }
    if (gone) this._save();
    return { sent, gone };
  }
}

/** Post one notification to an ntfy topic. Throws on failure; callers warn once. */
async function postNtfy(target, fetchImpl, payload) {
  const res = await fetchImpl(target.base, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: target.topic, ...payload }),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
}

/** What kind of device, from its User-Agent — never more than the kind: no model, no version, no address. */
export function deviceKind(ua = '') {
  const s = String(ua);
  if (/iPhone/i.test(s)) return 'An iPhone';
  if (/iPad/i.test(s)) return 'An iPad';
  if (/Android/i.test(s)) return /Mobile/i.test(s) ? 'An Android phone' : 'An Android tablet';
  if (/Macintosh|Mac OS X/i.test(s)) return 'A Mac';
  if (/Windows/i.test(s)) return 'A Windows computer';
  if (/CrOS/i.test(s)) return 'A Chromebook';
  if (/Linux/i.test(s)) return 'A Linux computer';
  return 'A device';
}

/** What a « someone tuned in » notification says. */
export function listenSummary(items) {
  const now = items.at(-1).playing;
  const tail = `${now} listening now`;
  if (items.length === 1) return { title: 'Someone tuned in to the tower', body: `${items[0].kind} started listening. ${tail}` };
  const kinds = [...new Set(items.map((i) => i.kind.replace(/^An? /, '')))];
  return { title: `${items.length} devices tuned in to the tower`, body: cut(`${kinds.join(', ')}. ${tail}`, 120) };
}

/**
 * « Notify [my phone] when another device than this computer starts listening » (Ortis, 2026-11-25).
 *
 * The player says, on each /api/station poll, whether it is playing (`playing=1`) and whether this browser is the
 * station's own (`own=1`: the Booth was unlocked here with the key once). A device that was not playing a moment
 * ago and is now is « tuned in »: unless it is the station's own, the ntfy topic is told — the kind of device and
 * how many are playing. The same device is told of once per `cooldownMs` (pausing and resuming is not news), and
 * the line's rule holds here too: at most one notification per gap, what came meanwhile together.
 *
 * `own=1` cannot be checked — anyone can send it — and it does not need to be: all it does is keep that one device
 * quiet. Nothing here is written to disk.
 */
export class ListenAlert {
  constructor({ ntfyUrl, siteUrl = null, gapMs = 60_000, ttlMs = 45_000, cooldownMs = 30 * 60_000, maxIds = 5000, fetchImpl = globalThis.fetch, now = Date.now, setTimer = setTimeout } = {}) {
    this.ntfy = ntfyUrl ? ntfyTarget(ntfyUrl) : null;
    this.siteUrl = siteUrl ? String(siteUrl).replace(/\/+$/, '') : null;
    this.ttlMs = ttlMs;
    this.cooldownMs = cooldownMs;
    this.maxIds = maxIds;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.lastPlaying = new Map(); // device -> last poll that said playing (Map order: least recent first)
    this.told = new Map(); // device -> when the phone was last told of it
    this._warned = false;
    this.batch = new Batcher({ gapMs, now, setTimer, send: (items) => this._send(items) });
  }

  get enabled() { return Boolean(this.ntfy); }

  _touch(map, key, t) {
    map.delete(key);
    map.set(key, t);
    while (map.size > this.maxIds) map.delete(map.keys().next().value);
  }

  /** How many devices are playing right now. */
  playing() {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, t] of this.lastPlaying) { if (t < cutoff) this.lastPlaying.delete(id); else break; }
    return this.lastPlaying.size;
  }

  /** One poll from one device. */
  seen(id, { playing = false, own = false, ua = '' } = {}) {
    if (!this.ntfy || !playing || !id || typeof id !== 'string') return;
    const key = id.slice(0, 64);
    const t = this.now();
    const last = this.lastPlaying.get(key);
    this._touch(this.lastPlaying, key, t);
    if (last !== undefined && t - last <= this.ttlMs) return; // still the same listening
    if (own) return;
    const told = this.told.get(key);
    if (told !== undefined && t - told < this.cooldownMs) return;
    this._touch(this.told, key, t);
    this.batch.add({ kind: deviceKind(ua), playing: this.playing() });
  }

  async _send(items) {
    const { title, body } = listenSummary(items);
    try {
      await postNtfy(this.ntfy, this.fetchImpl, { title, message: body, tags: ['headphones'], ...(this.siteUrl ? { click: this.siteUrl } : {}) });
    } catch (err) {
      if (!this._warned) console.warn(`[notify] the « someone tuned in » notification did not go: ${err.message}`);
      this._warned = true;
    }
  }

  idle() { return this.batch.idle(); }
}

export class LineNotifier {
  /**
   * @param {object} o
   * @param {string|null} [o.ntfyUrl]   the ntfy topic's address (TELEGRAPH_NOTIFY_URL)
   * @param {PushStore|null} [o.push]   the listeners' subscriptions, or null when Web Push is off
   * @param {string|null} [o.siteUrl]   where a tap on Ortis's notification leads
   * @param {number} [o.gapMs]          at most one notification per gap, each way
   */
  constructor({ ntfyUrl = null, push = null, siteUrl = null, gapMs = 60_000, fetchImpl = globalThis.fetch, now = Date.now, setTimer = setTimeout } = {}) {
    this.ntfy = ntfyUrl ? ntfyTarget(ntfyUrl) : null;
    if (ntfyUrl && !this.ntfy) console.warn('[notify] TELEGRAPH_NOTIFY_URL is not an address like https://ntfy.sh/<topic>: no notification will be sent');
    this.push = push;
    this.siteUrl = siteUrl ? String(siteUrl).replace(/\/+$/, '') : null;
    this.fetchImpl = fetchImpl;
    this._warned = false;
    // Whoever tries to subscribe over and over: a few times, then one more every two minutes.
    this.subscribeBudget = new RateLimiter({ capacity: 6, refillPerSec: 1 / 120, maxKeys: 5000, now });
    const opts = { gapMs, now, setTimer };
    this.toOrtis = new Batcher({ ...opts, send: (items) => this._ntfy(items) });
    this.toListeners = new Batcher({ ...opts, send: (items) => this._push(items) });
  }

  get enabled() { return Boolean(this.ntfy || this.push); }

  /**
   * A message is on the line. `from`: the sender's own push endpoint, if their page sent it — so a listener is
   * not told about what they just said.
   */
  message(m, { from = null } = {}) {
    const item = { name: m.name, text: m.text, host: m.host === true, from: typeof from === 'string' ? from : null };
    if (this.ntfy && !item.host) this.toOrtis.add(item);
    // The station's own words are the station's: nobody is told of them, either way.
    if (this.push?.size && !item.host) this.toListeners.add(item);
  }

  async _ntfy(items) {
    const { title, body } = summarise(items);
    try {
      await postNtfy(this.ntfy, this.fetchImpl, { title, message: body, tags: ['radio'], ...(this.siteUrl ? { click: `${this.siteUrl}/antenna` } : {}) });
    } catch (err) {
      // Never the address: the topic's name is the secret.
      if (!this._warned) console.warn(`[notify] the notification to the station's phone did not go: ${err.message}`);
      this._warned = true;
    }
  }

  async _push(items) {
    if (!this.push) return;
    const { title, body } = summarise(items);
    // A listener who wrote every message of this batch already knows.
    const authors = new Set(items.map((i) => i.from));
    const skip = authors.size === 1 && items[0].from ? new Set([items[0].from]) : new Set();
    await this.push.sendAll({ title, body, tag: 'telegraph', url: 'antenna' }, { skip });
  }

  /** Resolves once everything due has been sent (tests). */
  async idle() { await this.toOrtis.idle(); await this.toListeners.idle(); }
}

export default LineNotifier;
