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
 *   - The log is the station's view of the line (Ortis, 2026-11-16: « more
 *     parameters in the chat logs for admin with history beyond what's not
 *     kept and restore option »). Each message is written with the track on
 *     air when it was sent and a sender tag; taking off, silencing, restoring
 *     and un-silencing are written as events. `history()` reads all of it
 *     back for the station key; `restore()` puts a message that was taken off,
 *     or that left at 05:00, back in today's room.
 *   - The sender tag is the salted hash above, with a salt that lasts one
 *     broadcast day: within a day « the same person » can be seen, and a
 *     silence survives a restart; at the day's turn the salt is replaced (the
 *     one before is kept one more day, so a silence still holds across 05:00)
 *     and nothing can tie an older tag to an address any more. The salt lives
 *     in a file beside the log, never in the log.
 *   - A ceiling for the whole room (thirty messages at once, then one every
 *     two seconds, whoever sends them) on top of each address's budget, so
 *     many addresses cannot flood it either. The station's own are exempt.
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
const DAY = 86_400_000;

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
   * @param {number} [o.logKeepDays]  how many days the log goes back; 0 = no limit but the size
   * @param {number} [o.muteMs]       how long a silenced sender stays silenced
   * @param {RateLimiter} [o.limiter] the budget per address
   * @param {RateLimiter} [o.roomLimiter] the ceiling for the whole room
   * @param {(() => ({id: string, title: string}|null))|null} [o.onAir] what is playing, for the log
   * @param {((t: number) => number)|null} [o.dayStart] when the room's day began, for a time (dailyReset);
   *                                    null = the room never empties
   * @param {() => number} [o.now]    clock, for tests
   */
  constructor({ keep = 200, logFile = null, logMaxBytes = 5 * 1048576, logKeepDays = 0, muteMs = 24 * 3600_000, limiter = null, roomLimiter = null, dayStart = null, onAir = null, now = Date.now } = {}) {
    this.keep = keep;
    this.dayStart = typeof dayStart === 'function' ? dayStart : null;
    this.logFile = logFile;
    this.logMaxBytes = logMaxBytes;
    this.logKeepDays = Number.isFinite(logKeepDays) && logKeepDays > 0 ? logKeepDays : 0;
    this.onAir = typeof onAir === 'function' ? onAir : null;
    this.muteMs = muteMs;
    this.now = now;
    this.limiter = limiter || new RateLimiter({ capacity: 4, refillPerSec: 1 / 3, maxKeys: 5000, now });
    this.roomLimiter = roomLimiter || new RateLimiter({ capacity: 30, refillPerSec: 1 / 2, maxKeys: 4, now });
    this.messages = [];
    this.removed = []; // { id, t } — so a browser that already shows a message learns it went
    this.restoredLately = []; // { id, t } — so a browser that asks by id learns an older message is back
    this.lastId = 0;
    this._from = new Map(); // message id -> sender tag (memory only)
    this._last = new Map(); // sender tag -> { text, t }
    this._muted = new Map(); // sender tag -> until
    this._salts = null; // { day, salt, prev } — today's salt, and the one before
    this._day = null;
    this._logBytes = 0;
    this._writing = Promise.resolve();
    this._warned = false;
    this._load();
    this._trimLog();
  }

  /** The day a time belongs to, for the salt: the room's own day, or the calendar's (UTC) for a room that never empties. */
  _dayOf(t) { return this.dayStart ? this.dayStart(t) : Math.floor(t / DAY) * DAY; }

  /**
   * Today's salt and yesterday's. Kept in a file beside the log — so a restart during the day does not forgive a
   * silenced sender — and replaced at the day's turn, which is what makes an older tag meaningless.
   */
  _saltsFor(t) {
    const day = this._dayOf(t);
    if (this._salts?.day === day) return this._salts;
    const file = this.logFile ? `${this.logFile}.salt` : null;
    let had = this._salts;
    if (!had && file) {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Number.isFinite(j.day) && typeof j.salt === 'string') had = { day: j.day, salt: Buffer.from(j.salt, 'base64'), prev: j.prev ? Buffer.from(j.prev, 'base64') : null };
      } catch { /* no salt kept: a new one */ }
    }
    if (had?.day === day) { this._salts = had; return had; }
    // Yesterday's salt is kept one more day (a day is 23 to 25 hours long); anything older is gone for good.
    const prev = had && day > had.day && day - had.day <= 26 * 3600_000 ? had.salt : null;
    this._salts = { day, salt: crypto.randomBytes(16), prev };
    if (file) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ day, salt: this._salts.salt.toString('base64'), prev: prev ? prev.toString('base64') : null }), { mode: 0o600 });
      } catch { /* a salt that cannot be kept lasts as long as the process, as it used to */ }
    }
    return this._salts;
  }

  _hash(salt, who) { return crypto.createHmac('sha256', salt).update(String(who ?? '?')).digest('base64url').slice(0, 22); }

  /** Who sent it, for today: never the address itself. */
  _tag(who, t = this.now()) { return this._hash(this._saltsFor(t).salt, who); }

  /** Until when this sender is silenced (0: not), under today's tag or yesterday's. */
  _mutedUntil(who, t) {
    const s = this._saltsFor(t);
    let until = 0;
    for (const salt of [s.salt, s.prev]) {
      if (!salt) continue;
      const tag = this._hash(salt, who);
      const u = this._muted.get(tag);
      if (u && u > t) until = Math.max(until, u);
      else if (u) this._muted.delete(tag);
    }
    return until;
  }

  /**
   * When this room's day began (0 for a room that never empties); what was said before it leaves the room —
   * but for a message the station put back today, which stays until the next turn.
   */
  _prune(t) {
    if (!this.dayStart) return 0;
    const start = this.dayStart(t);
    if (this.messages.some((m) => m.t < start && !(m.restored >= start))) {
      this.messages = this.messages.filter((m) => {
        const stays = !(m.t < start) || m.restored >= start;
        if (!stays) this._from.delete(m.id);
        return stays;
      });
    }
    if (this._day !== null && this._day !== start) this._trimLog();
    this._day = start;
    return start;
  }

  _load() {
    if (!this.logFile) return;
    // Both files, the set-aside one first: right after the log turns over, most of today is in `<file>.1`
    // (until 2026-11-16 only the new file was read, and a restart at that moment emptied the room).
    const raws = [];
    for (const f of [`${this.logFile}.1`, this.logFile]) {
      try {
        const raw = fs.readFileSync(f, 'utf8');
        raws.push(raw);
        if (f === this.logFile) this._logBytes = Buffer.byteLength(raw);
      } catch { /* not there */ }
    }
    if (!raws.length) return;
    const now = this.now();
    const { entries, muted } = replay(raws);
    const since = this.dayStart ? this.dayStart(now) : -Infinity;
    this._day = this.dayStart ? since : null;
    const here = [...entries.values()].filter((e) => !isOff(e) && (!(e.t < since) || e.restoredAt >= since)).sort((a, b) => a.id - b.id).slice(-this.keep);
    this.messages = here.map(publicMessage);
    for (const e of here) if (e.tag) this._from.set(e.id, e.tag);
    for (const [tag, until] of muted) if (until > now) this._muted.set(tag, until);
    this.lastId = [...entries.keys()].reduce((hi, id) => Math.max(hi, id), 0);
  }

  /** Lines older than `logKeepDays` leave the log: at start, and at each day's turn. Off (0) by default. */
  _trimLog() {
    if (!this.logFile || !this.logKeepDays) return;
    const file = this.logFile;
    const cutoff = this.now() - this.logKeepDays * DAY;
    this._writing = this._writing.then(async () => {
      for (const f of [`${file}.1`, file]) {
        let raw;
        try { raw = await fs.promises.readFile(f, 'utf8'); } catch { continue; }
        const kept = raw.split('\n').filter((line) => {
          if (!line) return false;
          try { return !(JSON.parse(line).t < cutoff); } catch { return false; }
        });
        const out = kept.length ? `${kept.join('\n')}\n` : '';
        if (out.length === raw.length) continue;
        if (!out && f !== file) { await fs.promises.rm(f, { force: true }); continue; }
        await fs.promises.writeFile(`${f}.tmp`, out);
        await fs.promises.rename(`${f}.tmp`, f);
        if (f === file) this._logBytes = Buffer.byteLength(out);
      }
    }).catch((err) => {
      if (!this._warned) console.warn(`[telegraph] the log could not be trimmed (${file}): ${err.message}`);
      this._warned = true;
    });
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
  post({ name, icon, text, stream, who, host = false, on = undefined } = {}) {
    const t = this.now();
    this._prune(t);
    const cleanName = cleanText(name, LIMITS.name);
    const cleanBody = stripLinks(cleanText(text, LIMITS.text));
    if (!cleanName) return { ok: false, status: 400, error: 'no_name', detail: 'Join the line with a name first.' };
    if (!cleanBody) return { ok: false, status: 400, error: 'empty', detail: 'Nothing to send.' };
    const tag = this._tag(who, t);
    if (this._mutedUntil(who, t)) return { ok: false, status: 403, error: 'muted', detail: 'The station has taken this line away from you for a while.' };
    const last = this._last.get(tag);
    if (last && last.text === cleanBody && t - last.t < 30_000) return { ok: false, status: 409, error: 'duplicate', detail: 'That is already on the line.' };
    const budget = this.limiter.take(tag);
    if (!budget.ok) return { ok: false, status: 429, error: 'slow_down', detail: `One message every few seconds. Try again in ${budget.retryAfter} s.`, retryAfter: budget.retryAfter };
    // The whole room's ceiling, whoever is sending; the station itself is never told to wait.
    if (host !== true) {
      const room = this.roomLimiter.take('room');
      if (!room.ok) return { ok: false, status: 429, error: 'busy_line', detail: `The line is very busy. Try again in ${room.retryAfter} s.`, retryAfter: room.retryAfter };
    }

    const id = Math.max(this.lastId + 1, t);
    this.lastId = id;
    const message = { id, t, name: cleanName, icon: cleanIcon(icon), text: cleanBody, stream: cleanText(stream, LIMITS.stream) || null, host: host === true };
    this.messages.push(message);
    while (this.messages.length > this.keep) this._from.delete(this.messages.shift().id);
    this._from.set(id, tag);
    this._last.delete(tag);
    this._last.set(tag, { text: cleanBody, t });
    while (this._last.size > 5000) this._last.delete(this._last.keys().next().value);
    // The log's line says more than the room is told: what was on air, and today's tag for whoever sent it.
    const air = cleanOnAir(on === undefined ? this.onAir?.() : on);
    this._append({ ...message, ...(air ? { on: air } : {}), tag });
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
    // A message put back keeps its id, so a page asking « what is new since… » would never be told: say it apart.
    this.restoredLately = this.restoredLately.filter((r) => r.t > cutoff).slice(-100);
    if (this.restoredLately.length) {
      const back = new Set(this.restoredLately.map((r) => r.id));
      out.restored = this.messages.filter((m) => back.has(m.id));
    }
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
    this.restoredLately = this.restoredLately.filter((r) => r.id !== id);
    const tag = this._from.get(id);
    this._from.delete(id);
    let muted = false;
    if (mute && tag) {
      this._muted.set(tag, t + this.muteMs);
      while (this._muted.size > 5000) this._muted.delete(this._muted.keys().next().value);
      muted = true;
    }
    this._append({ del: id, t, ...(muted ? { mute: true } : {}) });
    // Written apart, with its tag and its end, so a restart does not forgive a silenced sender.
    if (muted) this._append({ mute: tag, until: t + this.muteMs, t });
    return { ok: true, muted };
  }

  /** Who is silenced right now: today's tags (or yesterday's), and until when. Never an address. */
  muted() {
    const t = this.now();
    return [...this._muted].filter(([, until]) => until > t).map(([tag, until]) => ({ tag, until }));
  }

  /** Give a silenced sender the line back (the station key's call). */
  unmute(tag) {
    const key = String(tag ?? '');
    if (!this._muted.has(key)) return { ok: false, status: 404, error: 'not_muted', detail: 'Nobody is silenced under that tag.' };
    this._muted.delete(key);
    this._append({ unmute: key, t: this.now() });
    return { ok: true };
  }

  /** Everything the log holds, oldest file first, with what happened to each message since. */
  async _readLog() {
    await this._writing;
    const raws = [];
    if (this.logFile) {
      for (const f of [`${this.logFile}.1`, this.logFile]) {
        try { raws.push(await fs.promises.readFile(f, 'utf8')); } catch { /* not there */ }
      }
    }
    return replay(raws).entries;
  }

  /**
   * The log, for the station key: every message kept — on the line, taken off, or gone at 05:00 — newest first.
   * @param {object} [o]
   * @param {number} [o.from] @param {number} [o.to]  times (ms)
   * @param {string} [o.q] in the text   @param {string} [o.name] in the name
   */
  async history({ from = -Infinity, to = Infinity, q = '', name = '', limit = 100, offset = 0 } = {}) {
    const t = this.now();
    const day = this._prune(t);
    const entries = await this._readLog();
    const here = new Set(this.messages.map((m) => m.id));
    // A line kept in memory only (no log file) still has a history: the room itself.
    for (const m of this.messages) if (!entries.has(m.id)) entries.set(m.id, { ...m, on: null, tag: this._from.get(m.id) || null, removedAt: null, silenced: false, restoredAt: m.restored || null });
    const want = (s) => String(s ?? '').normalize('NFKC').toLowerCase();
    const wq = want(q).trim();
    const wn = want(name).trim();
    const all = [...entries.values()]
      .filter((e) => e.t >= from && e.t <= to && (!wq || want(e.text).includes(wq)) && (!wn || want(e.name).includes(wn)))
      .sort((a, b) => b.id - a.id);
    const lim = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 100));
    const off = Math.max(0, Number.parseInt(offset, 10) || 0);
    const muted = new Map(this.muted().map((m) => [m.tag, m.until]));
    return {
      total: all.length,
      offset: off,
      limit: lim,
      day: this.dayStart ? day : null,
      keepDays: this.logKeepDays,
      muted: [...muted].map(([tag, until]) => ({ tag, until })),
      entries: all.slice(off, off + lim).map((e) => ({
        ...e,
        // on the line now · taken off by the station · left when the room emptied
        state: here.has(e.id) ? 'on' : isOff(e) ? 'removed' : 'left',
        mutedUntil: e.tag ? muted.get(e.tag) || null : null,
      })),
    };
  }

  /**
   * Put a message back in today's room (the station key's call): one that was taken off, or that left when the
   * room emptied. It keeps its id, its time and its words, and carries when it was put back.
   */
  async restore(id) {
    const e = (await this._readLog()).get(id);
    const t = this.now();
    this._prune(t);
    if (this.messages.some((m) => m.id === id)) return { ok: false, status: 409, error: 'on_the_line', detail: 'That message is on the line already.' };
    if (!e) return { ok: false, status: 404, error: 'unknown_message', detail: 'The log does not hold that message any more.' };
    const message = { ...publicMessage(e), restored: t };
    this.messages.push(message);
    this.messages.sort((a, b) => a.id - b.id);
    while (this.messages.length > this.keep) this._from.delete(this.messages.shift().id);
    if (e.tag) this._from.set(id, e.tag);
    this.removed = this.removed.filter((r) => r.id !== id);
    this.restoredLately.push({ id, t });
    // The whole message goes with the event: the file it was first written in may be gone by the next start.
    this._append({ restore: id, t, message: { ...publicMessage(e), restored: undefined, ...(e.on ? { on: e.on } : {}), ...(e.tag ? { tag: e.tag } : {}) } });
    return { ok: true, message };
  }
}

/** What the room is told of a message: never the tag, never what was on air. */
function publicMessage(e) {
  const m = { id: e.id, t: e.t, name: String(e.name || ''), icon: e.icon || null, text: e.text, stream: e.stream || null, host: e.host === true };
  if (e.restoredAt) m.restored = e.restoredAt;
  return m;
}

/** The track on air, as the log keeps it: an id and a title, nothing else, or nothing. */
function cleanOnAir(on) {
  if (!on || typeof on !== 'object') return null;
  const id = cleanText(on.id, 64);
  const title = cleanText(on.title, 120);
  return id || title ? { id: id || null, title: title || null } : null;
}

/** Taken off, and not put back since. */
const isOff = (e) => Boolean(e.removedAt) && !(e.restoredAt > e.removedAt);

/**
 * Read log files (oldest first) into what they say today: each message once, with when it was taken off, whether
 * its sender was silenced, when it was put back; and who is silenced. Lines that are not JSON are skipped.
 */
export function replay(raws) {
  const entries = new Map();
  const muted = new Map();
  const blank = (m) => ({
    id: m.id, t: m.t, name: String(m.name || ''), icon: m.icon || null, text: m.text, stream: m.stream || null, host: m.host === true,
    on: m.on && typeof m.on === 'object' ? { id: m.on.id ?? null, title: m.on.title ?? null } : null,
    tag: typeof m.tag === 'string' ? m.tag : null, removedAt: null, silenced: false, restoredAt: null,
  });
  for (const raw of raws) {
    for (const line of String(raw).split('\n')) {
      if (!line) continue;
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (!m || typeof m !== 'object') continue;
      if (Number.isFinite(m.del)) {
        const e = entries.get(m.del);
        if (e) { e.removedAt = Number.isFinite(m.t) ? m.t : 1; e.silenced = m.mute === true; }
      } else if (Number.isFinite(m.restore)) {
        let e = entries.get(m.restore);
        if (!e && Number.isFinite(m.message?.id) && typeof m.message.text === 'string') { e = blank(m.message); entries.set(e.id, e); }
        if (e) e.restoredAt = Number.isFinite(m.t) ? m.t : 1;
      } else if (typeof m.mute === 'string') {
        if (Number.isFinite(m.until)) muted.set(m.mute, m.until);
      } else if (typeof m.unmute === 'string') {
        muted.delete(m.unmute);
      } else if (Number.isFinite(m.id) && typeof m.text === 'string') {
        entries.set(m.id, blank(m));
      }
    }
  }
  return { entries, muted };
}

/** The history as a spreadsheet: one line a message. A cell a spreadsheet would run as a formula is defused. */
export function historyCsv(entries) {
  const iso = (t) => (Number.isFinite(t) && t > 1 ? new Date(t).toISOString() : '');
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const head = ['id', 'time', 'name', 'character', 'stream', 'text', 'station', 'track_id', 'track_title', 'sender_tag', 'state', 'taken_off', 'silenced', 'restored'];
  const rows = entries.map((e) => [e.id, iso(e.t), e.name, e.icon || '', e.stream || '', e.text, e.host ? 'yes' : '', e.on?.id || '', e.on?.title || '', e.tag || '', e.state || '', iso(e.removedAt), e.silenced ? 'yes' : '', iso(e.restoredAt)]);
  return `${[head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

export default Telegraph;
