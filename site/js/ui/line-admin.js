/**
 * The Booth's « Line » tab: the station's view of the telegraph line (Ortis,
 * 2026-11-16 — « more parameters in the chat logs for admin with history
 * beyond what's not kept and restore option »).
 *
 * The room on /antenna empties every morning; the tower's log does not. This
 * reads it back with the station key (GET /api/telegraph/log): every message
 * kept, by broadcast day, with the stream and the track on air when it was
 * said, a per-day sender tag (so « the same person » shows within a day —
 * never an address, the tower keeps none), and what happened to it since. A
 * message on the line can be taken off; one taken off, or gone at 05:00, can
 * be put back in today's room; a silenced sender can be given the line again.
 *
 * Everything a stranger typed goes on the page as text (textContent), as on
 * the line itself. Built for a phone first: rows, not a table.
 *
 * The top of this file is pure (no DOM) so node:test can check it.
 */

/** How many messages a page of the log holds. */
export const PAGE = 50;

const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * The broadcast day a message belongs to (YYYY-MM-DD): a day runs 05:00 → 05:00 in Paris, like the programme
 * and like the room, so what was said at 02:00 is still the evening before's.
 */
export function broadcastDay(t, startHour = 5) {
  return DAY_FMT.format(new Date(t - startHour * 3600_000));
}

/** Entries (newest first, as the tower sends them) in groups by broadcast day, newest day first. */
export function groupByDay(entries) {
  const days = [];
  for (const e of entries) {
    const day = broadcastDay(e.t);
    if (days.at(-1)?.day !== day) days.push({ day, entries: [] });
    days.at(-1).entries.push(e);
  }
  return days;
}

/** What happened to a message, in a few words. */
export function stateLabel(e) {
  if (e.state === 'on') return e.restoredAt ? 'on the line (put back)' : 'on the line';
  if (e.state === 'removed') return e.silenced ? 'taken off, sender silenced' : 'taken off';
  return 'left at 05:00';
}

/** What the station may do with a row: take it off (and silence) while it is on the line, put it back otherwise. */
export function actionsFor(e) {
  if (e.state === 'on') return e.host ? ['remove'] : ['remove', 'mute'];
  return ['restore'];
}

/** The filters as the tower wants them: whole days in this browser's time, empty ones left out. */
export function queryOf({ from = '', to = '', q = '', name = '' } = {}, offset = 0, limit = PAGE) {
  const out = { limit, offset };
  const start = from ? new Date(`${from}T00:00:00`).getTime() : NaN;
  const end = to ? new Date(`${to}T00:00:00`).getTime() + 86_400_000 - 1 : NaN;
  if (Number.isFinite(start)) out.from = start;
  if (Number.isFinite(end)) out.to = end;
  if (q.trim()) out.q = q.trim();
  if (name.trim()) out.name = name.trim();
  return out;
}

/* ------------------------------------------------------------------ DOM -- */
const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayTitle = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export class LineAdmin {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root
   * @param {object} o.client   the tower client, unlocked
   * @param {Function} [o.toast]
   */
  constructor({ root, client, toast = () => {} }) {
    this.root = root;
    this.client = client;
    this.toast = toast;
    this.entries = [];
    this.total = 0;
    this.muted = [];
    this.keepDays = 0;
    this.filters = { from: '', to: '', q: '', name: '' };
    this._alive = true;
    this._busy = false;

    root.classList.add('la');
    root.innerHTML = `
      <div class="panel-head"><h2 id="laH">The line's log</h2><span class="hint" id="laKeep"></span></div>
      <p class="queue-note">Everything the tower has kept of the telegraph line: what is on it now, what you took off, and what left when the room emptied at 05:00. Only the station key reads this.</p>
      <form class="la-filters" id="laForm" autocomplete="off" aria-label="Filter the log">
        <label>From <input type="date" id="laFrom"></label>
        <label>To <input type="date" id="laTo"></label>
        <label>Name <input type="search" id="laName" maxlength="24" placeholder="who"></label>
        <label>Words <input type="search" id="laQ" maxlength="100" placeholder="in the message"></label>
        <div class="la-go"><button class="btn small primary" type="submit">Search</button>
          <button class="btn small" type="button" id="laAll">Everything</button>
          <button class="btn small" type="button" id="laCsv">Export (CSV)</button></div>
      </form>
      <p class="qstate" id="laState" aria-live="polite"></p>
      <div class="la-muted" id="laMuted" hidden></div>
      <div class="la-days" id="laDays" aria-labelledby="laH"></div>
      <button class="btn small la-more" type="button" id="laMore" hidden>Older messages</button>`;
    const $ = (id) => root.querySelector(`#${id}`);
    this.$ = $;
    $('laForm').addEventListener('submit', (e) => { e.preventDefault(); this._readFilters(); this.load(); });
    $('laAll').addEventListener('click', () => { for (const id of ['laFrom', 'laTo', 'laName', 'laQ']) $(id).value = ''; this._readFilters(); this.load(); });
    $('laCsv').addEventListener('click', () => this.exportCsv());
    $('laMore').addEventListener('click', () => this.load({ more: true }));
    $('laDays').addEventListener('click', (e) => this._onAct(e));
    $('laMuted').addEventListener('click', (e) => this._onAct(e));
    this.load();
  }

  _readFilters() {
    const $ = this.$;
    this.filters = { from: $('laFrom').value, to: $('laTo').value, name: $('laName').value, q: $('laQ').value };
  }

  say(text, tone = '') {
    const s = this.$('laState');
    if (s) { s.textContent = text; s.className = `qstate ${tone}`; }
  }

  async load({ more = false } = {}) {
    if (!this._alive || this._busy) return;
    this._busy = true;
    this.say(more ? 'Reading further back…' : 'Reading the log…');
    try {
      const out = await this.client.telegraphLog(queryOf(this.filters, more ? this.entries.length : 0));
      if (!this._alive) return;
      this.entries = more ? [...this.entries, ...out.entries.filter((e) => !this.entries.some((x) => x.id === e.id))] : out.entries;
      this.total = out.total;
      this.muted = out.muted || [];
      this.keepDays = out.keepDays || 0;
      this.say(this.total ? `${this.total} message${this.total === 1 ? '' : 's'}${this.entries.length < this.total ? `, the newest ${this.entries.length} shown` : ''}.` : 'Nothing in the log for that.');
      this.paint();
    } catch (err) {
      if (this._alive) this.say(err.status === 404 ? 'This tower does not keep a readable log yet (it runs an older version).' : err.message, 'bad');
    } finally { this._busy = false; }
  }

  paint() {
    const $ = this.$;
    $('laKeep').textContent = this.keepDays ? `kept ${this.keepDays} day${this.keepDays === 1 ? '' : 's'}` : 'kept until the log is full (two files of 5 MB)';
    const mutedBox = $('laMuted');
    mutedBox.replaceChildren();
    mutedBox.hidden = !this.muted.length;
    if (this.muted.length) {
      mutedBox.append(h('h3', 'la-sub', 'Silenced now'));
      for (const m of this.muted) {
        const row = h('p', 'la-mrow');
        row.append(h('code', 'la-tag', `#${m.tag.slice(0, 6)}`), ` until ${new Date(m.until).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} `);
        const b = h('button', 'btn small', 'Give the line back');
        b.type = 'button';
        b.dataset.act = 'unmute';
        b.dataset.tag = m.tag;
        row.append(b);
        mutedBox.append(row);
      }
    }
    const days = $('laDays');
    days.replaceChildren();
    for (const g of groupByDay(this.entries)) {
      const sec = h('section', 'la-day');
      sec.append(h('h3', 'la-sub', dayTitle(g.day)));
      const ol = h('ol', 'la-list');
      for (const e of g.entries) ol.append(this._row(e));
      sec.append(ol);
      days.append(sec);
    }
    $('laMore').hidden = this.entries.length >= this.total;
  }

  _row(e) {
    const li = h('li', `la-row la-${e.state}${e.host ? ' la-host' : ''}`);
    li.dataset.id = String(e.id);
    const top = h('p', 'la-top');
    top.append(h('b', 'la-name', e.name));
    if (e.host) top.append(h('span', 'tg-badge', 'tower'));
    top.append(h('span', 'la-time', hhmm(e.t)));
    top.append(h('span', `la-chip la-chip-${e.state}`, stateLabel(e)));
    const bits = [];
    if (e.stream) bits.push(`stream ${e.stream}`);
    if (e.on?.title) bits.push(`on air: ${e.on.title}`);
    if (e.tag) bits.push(`sender #${e.tag.slice(0, 6)}`);
    if (e.icon) bits.push(e.icon);
    if (e.removedAt > 1) bits.push(`taken off ${hhmm(e.removedAt)}`);
    if (e.restoredAt > 1) bits.push(`put back ${hhmm(e.restoredAt)}`);
    if (e.mutedUntil) bits.push('sender silenced now');
    li.append(top, h('p', 'la-text', e.text), h('p', 'la-meta', bits.join(' · ')));
    const acts = h('div', 'la-acts');
    const labels = { remove: 'Take off', mute: 'Take off and silence for a day', restore: 'Put back on the line' };
    for (const a of actionsFor(e)) {
      const b = h('button', 'btn small', labels[a]);
      b.type = 'button';
      b.dataset.act = a;
      b.setAttribute('aria-label', `${labels[a]}: ${e.name}'s message of ${hhmm(e.t)}`);
      acts.append(b);
    }
    li.append(acts);
    return li;
  }

  async _onAct(ev) {
    const b = ev.target.closest('button[data-act]');
    if (!b || this._busy) return;
    const id = Number(b.closest('.la-row')?.dataset.id);
    const act = b.dataset.act;
    b.disabled = true;
    try {
      if (act === 'unmute') {
        await this.client.telegraphUnmute(b.dataset.tag);
        this.toast('They have the line back.');
      } else if (act === 'restore') {
        await this.client.telegraphRestore(id);
        this.toast('Back on the line, for everyone, until the room empties.');
      } else {
        const out = await this.client.telegraphRemove(id, { mute: act === 'mute' });
        this.toast(out.muted ? 'Taken off the line, and its sender silenced for a day.' : 'Taken off the line.');
      }
      // Read again rather than guess: the tower's log is the truth, and the same page is asked for.
      const shown = this.entries.length;
      const out = await this.client.telegraphLog(queryOf(this.filters, 0, Math.max(PAGE, Math.min(500, shown))));
      if (!this._alive) return;
      this.entries = out.entries;
      this.total = out.total;
      this.muted = out.muted || [];
      this.paint();
    } catch (err) {
      b.disabled = false;
      this.say(err.message, 'bad');
    }
  }

  async exportCsv() {
    this.say('Preparing the export…');
    try {
      const { limit, offset, ...filters } = queryOf(this.filters);
      const text = await this.client.telegraphLogCsv(filters);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      const a = h('a');
      a.href = url;
      a.download = `telegraph-line-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      this.say('Exported: one line a message, every field.', 'ok');
    } catch (err) { this.say(err.message, 'bad'); }
  }

  destroy() {
    this._alive = false;
    this.root.replaceChildren();
    this.root.classList.remove('la');
  }
}

export default LineAdmin;
