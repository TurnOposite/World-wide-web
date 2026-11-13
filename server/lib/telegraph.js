/**
 * The telegraph line: one chat room for whoever is tuned in (Ortis,
 * 2026-11-10 — « a chat system for the people on board », then « the single
 * chat room idea, with icons to select when asked to join the telegraph
 * line »).
 *
 * It is the first thing on the tower that listeners write, so it is fenced
 * the way the queue is (docs/DECISIONS.md, 2026-11-10):
 *
 *   - No account. A message carries the name and the icon its sender chose
 *     for the visit; whether the browser remembers them is the listener's
 *     own choice, made there, and nothing here knows which they chose.
 *   - Plain text, short. Control and direction-override characters go,
 *     whitespace collapses, links are replaced by « [link] » — and the site
 *     never turns text into a link or into markup.
 *   - A budget per address (four messages at once, then one every three
 *     seconds), and the same line twice in a row from one address is refused.
 *   - The station key can take a message off the line and silence its
 *     sender for a day. The address itself is never kept: a salted hash of
 *     it lives in memory beside the message, is never logged and never
 *     leaves the server, and the salt dies with the process.
 *   - What is kept (Ortis: « yes do keep it »): the line is appended to a
 *     log file, one JSON object a line — time, name, icon, text, the stream
 *     the sender was on — so a restart does not empty the room. No address.
 *     The file is capped: past `logMaxBytes` it becomes `<file>.1` and a new
 *     one starts, so the tower's disk holds two files at most.
 *   - The room empties every morning (Ortis, 2026-11-13: « make it that chat
 *     disappears every 24 hours … the 5 a.m. limit is a good reset time »).
 *     At the broadcast day's turn — 05:00 Paris, the programme's own
 *     boundary — what was said the day before leaves the room: it is no
 *     longer served, nor read back at start. The log file is not touched by
 *     this (it is the tower's private record, kept at his word of
 *     2026-11-10); only what listeners see starts over.
 *
 * Messages only: who is tuned in is still the listener count, and the
 * station's clock knows nothing of any of this.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RateLimiter } from './ratelimit.js';
import { makeCalendar, minutesOf } from './programme.js';

export const LIMITS = Object.freeze({ text: 240, name: 24, icon: 64, stream: 48 });

// Control characters, and the invisible ones that hide or reorder text (zero-width, bidi overrides, BOM).
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
const LINK = /(?:https?:\/\/|www\.)\S+/gi;

/** One line of plain text: no control or invisible characters, single spaces, at most `max` characters. */
export function cleanText(input, max) {
  const s = String(input ?? '').normalize('NFC').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, max).join('').trim();
}

/** A link is not something a stranger gets to hand to the room. */
export const stripLinks = (s) => String(s).replace(LINK, '[link]');

/**
 * When the room's day began, for a given time: the last `hhmm` in `timeZone` at or before `t`. Uses the
 * programme's calendar, so the line and the programme turn over at the same moment, summer time included.
 * `null` for anything unreadable (or « off »): a room that never empties.
 */
export function dailyReset(hhmm = '05:00', timeZone = 'Europe/Paris') {
  if (minutesOf(hhmm) === null) return null;
  const cal = makeCalendar({ timeZone, dayStarts: hhmm });
  return (t) => cal.dayStart(cal.dayOf(t));
}

/** An icon is a file name from the site's bank (site/assets/telegraph/); anything else is no icon. */
export function cleanIcon(input) {
  const s = String(input ?? '');
  return s.length <= LIMITS.icon && /^[a-z0-9][a-z0-9._-]*$/i.test(s) && !s.includes('..') ? s : null;
}

export class Telegraph {
  /**
   * @param {object} [o]
   * @param {number} [o.keep]         messages kept in memory, and read back from the log at start
   * @param {string|null} [o.logFile] where the line is kept; null = memory only
   * @param {number} [o.logMaxBytes]  the log's size before it is set aside as <file>.1
   * @param {number} [o.muteMs]       how long a silenced sender stays silenced
   * @param {RateLimiter} [o.limiter] the budget per address
   * @param {((t: number) => number)|null} [o.dayStart] when the room's day began, for a time (dailyReset);
   *                                    null = the room never empties
   * @param {() => number} [o.now]    clock, for tests
   */
  constructor({ keep = 200, logFile = null, logMaxBytes = 5 * 1048576, muteMs = 24 * 3600_000, limiter = null, dayStart = null, now = Date.now } = {}) {
    this.keep = keep;
    this.dayStart = typeof dayStart === 'function' ? dayStart : null;
    this.logFile = logFile;
    this.logMaxBytes = logMaxBytes;
    this.muteMs = muteMs;
    this.now = now;
    this.limiter = limiter || new RateLimiter({ capacity: 4, refillPerSec: 1 / 3, maxKeys: 5000, now });
    this.messages = [];
    this.removed = []; // { id, t } — so a browser that already shows a message learns it went
    this.lastId = 0;
    this._from = new Map(); // message id -> sender tag (memory only)
    this._last = new Map(); // sender tag -> { text, t }
    this._muted = new Map(); // sender tag -> until
    this._salt = crypto.randomBytes(16);
    this._logBytes = 0;
    this._writing = Promise.resolve();
    this._warned = false;
    this._load();
  }

  /** Who sent it, as far as this process is concerned: never the address itself. */
  _tag(who) {
    return crypto.createHmac('sha256', this._salt).update(String(who ?? '?')).digest('base64url').slice(0, 22);
  }

  /** When this room's day began (0 for a room that never empties); what was said before it leaves the room. */
  _prune(t) {
    if (!this.dayStart) return 0;
    const start = this.dayStart(t);
    while (this.messages.length && this.messages[0].t < start) this._from.delete(this.messages.shift().id);
    return start;
  }

  _load() {
    if (!this.logFile) return;
    let raw;
    try {
      this._logBytes = fs.statSync(this.logFile).size;
      raw = fs.readFileSync(this.logFile, 'utf8');
    } catch { return; }
    const gone = new Set();
    const all = [];
    for (const line of raw.split('\n')) {
      if (!line) continue;
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (Number.isFinite(m?.del)) gone.add(m.del);
      else if (Number.isFinite(m?.id) && typeof m.text === 'string') all.push(m);
    }
    const since = this.dayStart ? this.dayStart(this.now()) : -Infinity;
    this.messages = all.filter((m) => !gone.has(m.id) && !(m.t < since)).slice(-this.keep)
      .map((m) => ({ id: m.id, t: m.t, name: String(m.name || ''), icon: m.icon || null, text: m.text, stream: m.stream || null, host: m.host === true }));
    this.lastId = all.reduce((hi, m) => Math.max(hi, m.id), 0);
  }

  _append(obj) {
    if (!this.logFile) return;
    const line = `${JSON.stringify(obj)}\n`;
    const file = this.logFile;
    this._writing = this._writing.then(async () => {
      if (this._logBytes === 0) await fs.promises.mkdir(path.dirname(file), { recursive: true });
      if (this._logBytes > 0 && this._logBytes + Buffer.byteLength(line) > this.logMaxBytes) {
        await fs.promises.rename(file, `${file}.1`).catch(() => {});
        this._logBytes = 0;
      }
      await fs.promises.appendFile(file, line);
      this._logBytes += Buffer.byteLength(line);
    }).catch((err) => {
      if (!this._warned) console.warn(`[telegraph] the line is not being kept (${file}): ${err.message}`);
      this._warned = true;
    });
  }

  /** Resolves once everything posted so far is in the log (tests, shutdown). */
  flushed() { return this._writing; }

  /**
   * Put a message on the line.
   * @returns {{ok: true, message: object} | {ok: false, status: number, error: string, detail: string, retryAfter?: number}}
   */
  post({ name, icon, text, stream, who, host = false } = {}) {
    const t = this.now();
    this._prune(t);
    const cleanName = cleanText(name, LIMITS.name);
    const cleanBody = stripLinks(cleanText(text, LIMITS.text));
    if (!cleanName) return { ok: false, status: 400, error: 'no_name', detail: 'Join the line with a name first.' };
    if (!cleanBody) return { ok: false, status: 400, error: 'empty', detail: 'Nothing to send.' };
    const tag = this._tag(who);
    const until = this._muted.get(tag);
    if (until && until > t) return { ok: false, status: 403, error: 'muted', detail: 'The station has taken this line away from you for a while.' };
    if (until) this._muted.delete(tag);
    const last = this._last.get(tag);
    if (last && last.text === cleanBody && t - last.t < 30_000) return { ok: false, status: 409, error: 'duplicate', detail: 'That is already on the line.' };
    const budget = this.limiter.take(tag);
    if (!budget.ok) return { ok: false, status: 429, error: 'slow_down', detail: `One message every few seconds. Try again in ${budget.retryAfter} s.`, retryAfter: budget.retryAfter };

    const id = Math.max(this.lastId + 1, t);
    this.lastId = id;
    const message = { id, t, name: cleanName, icon: cleanIcon(icon), text: cleanBody, stream: cleanText(stream, LIMITS.stream) || null, host: host === true };
    this.messages.push(message);
    while (this.messages.length > this.keep) this._from.delete(this.messages.shift().id);
    this._from.set(id, tag);
    this._last.delete(tag);
    this._last.set(tag, { text: cleanBody, t });
    while (this._last.size > 5000) this._last.delete(this._last.keys().next().value);
    this._append(message);
    return { ok: true, message };
  }

  /** The messages after `since` (an id), at most `limit` of them, oldest first; and what was taken off lately. */
  since(since = 0, limit = 100) {
    const t = this.now();
    const day = this._prune(t);
    const after = Number.isFinite(since) ? since : 0;
    const fresh = this.messages.filter((m) => m.id > after).slice(-limit);
    const cutoff = t - 3600_000;
    this.removed = this.removed.filter((r) => r.t > cutoff).slice(-100);
    // `day`: when this room's day began, so a page still showing yesterday's messages knows to let them go.
    const out = { messages: fresh, removed: this.removed.map((r) => r.id), latest: this.lastId };
    if (this.dayStart) out.day = day;
    return out;
  }

  /** Take a message off the line (the station key's call); `mute` also silences whoever sent it. */
  remove(id, { mute = false } = {}) {
    const i = this.messages.findIndex((m) => m.id === id);
    if (i < 0) return { ok: false, status: 404, error: 'unknown_message', detail: 'That message is not on the line.' };
    this.messages.splice(i, 1);
    const t = this.now();
    this.removed.push({ id, t });
    this._append({ del: id, t });
    const tag = this._from.get(id);
    this._from.delete(id);
    let muted = false;
    if (mute && tag) {
      this._muted.set(tag, t + this.muteMs);
      while (this._muted.size > 5000) this._muted.delete(this._muted.keys().next().value);
      muted = true;
    }
    return { ok: true, muted };
  }
}

export default Telegraph;
