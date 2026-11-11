/**
 * The telegraph line: the one chat room, for whoever is tuned in (Ortis,
 * 2026-11-10). The tower keeps the line (server/lib/telegraph.js); this is
 * the listener's end of it.
 *
 * Joining is choosing a name and a character from the cast (ui/cast.js: slide
 * to choose who, slide again to change their clothes — Ortis, 2026-11-11) or
 * a picture from the bank (site/assets/telegraph/, listed in
 * data/telegraph.json). They last the visit. The browser keeps them only if the listener ticks « Remember me on
 * this device » — his rule: « let people decide if they want to save that
 * info » — and « Leave » forgets them either way.
 *
 * Everything a stranger typed is put on the page as text (textContent),
 * never as markup, and nothing in a message becomes a link.
 *
 * The top of this file is pure (no DOM) so node:test can check it.
 */
import { clock } from './util.js';
import { CastPicker, castFace, castIcon, castLabel, CAST } from './cast.js';

export const IDENTITY_KEY = 'gt.telegraph.me';
/** How often the line is read while its window is open and the tab is in view. */
export const POLL_MS = 4000;
/** At most this many messages stay on the page; the tower keeps no more either. */
export const KEEP = 200;

/** A name and an icon worth keeping: a real name, an icon that is a plain file name or none. */
export function validIdentity(me, { name: max = 24 } = {}) {
  if (!me || typeof me !== 'object') return null;
  const name = String(me.name ?? '').replace(/\s+/g, ' ').trim();
  if (!name || [...name].length > max) return null;
  const icon = typeof me.icon === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(me.icon) && !me.icon.includes('..') ? me.icon : null;
  return { name, icon };
}

/**
 * What the page shows after an answer from the tower: the messages it had,
 * without those taken off, plus the new ones — each once, in order, the
 * newest KEEP of them.
 */
export function mergeMessages(have, incoming = [], removed = [], keep = KEEP) {
  const gone = new Set(removed);
  const byId = new Map();
  for (const m of [...have, ...incoming]) if (m && Number.isFinite(m.id) && !gone.has(m.id)) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-keep);
}

/** The first letter of a name, for a listener whose icon the bank does not hold. */
export const initial = (name) => ([...String(name || '?').trim()][0] || '?').toUpperCase();

/**
 * Who this listener is on the line. Kept in this module for the visit (the
 * site is one page, so moving between windows keeps it); in the browser's
 * storage only when asked.
 */
export const identity = {
  _me: null,
  _read: false,
  _heard: new Set(),
  /** Told whenever who the listener is changes (the mini-player shows them): returns the way to stop listening. */
  on(fn) { this._heard.add(fn); return () => this._heard.delete(fn); },
  _tell() { for (const fn of this._heard) { try { fn(this._me); } catch { /* a listener's trouble is its own */ } } },
  get(storage = safeStorage()) {
    if (!this._read) {
      this._read = true;
      try { const kept = validIdentity(JSON.parse(storage?.getItem(IDENTITY_KEY) || 'null')); if (kept) this._me = { ...kept, kept: true }; } catch { /* nothing kept */ }
    }
    return this._me;
  },
  set(me, { remember = false } = {}, storage = safeStorage()) {
    const ok = validIdentity(me);
    if (!ok) return null;
    this._read = true;
    this._me = { ...ok, kept: Boolean(remember) };
    try { if (remember) storage?.setItem(IDENTITY_KEY, JSON.stringify(ok)); else storage?.removeItem(IDENTITY_KEY); } catch { this._me.kept = false; }
    this._tell();
    return this._me;
  },
  leave(storage = safeStorage()) {
    this._me = null;
    this._read = true;
    try { storage?.removeItem(IDENTITY_KEY); } catch { /* nothing to forget */ }
    this._tell();
  },
};
function safeStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }

let BANK = null;
/** The icon bank, asked for once. A site without one still has a line: letters in circles. */
export function loadBank(base = document.baseURI) {
  BANK ??= fetch(new URL('data/telegraph.json', base)).then((r) => (r.ok ? r.json() : { icons: [] })).then((j) => (Array.isArray(j.icons) ? j.icons : [])).catch(() => []);
  return BANK;
}

/* ------------------------------------------------------------------ DOM -- */
const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export class TelegraphLine {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root
   * @param {object} o.client      engine/transport.js client (only a tower has a line)
   * @param {Function} [o.toast]
   */
  constructor({ root, client, toast = () => {} }) {
    this.root = root;
    this.client = client;
    this.toast = toast;
    this.messages = [];
    this.icons = [];
    this.limits = { text: 240, name: 24 };
    this.state = 'loading'; // loading | open | off | away | none
    this.joining = false;
    this.busy = false;
    this._asking = null;
    this.latest = 0;
    this._timer = 0;
    this._alive = true;

    root.classList.add('tg');
    root.innerHTML = `
      <div class="tg-head"><h2 id="tgH">Telegraph line</h2><span class="hint tg-sub">One room for everyone tuned in, whatever the stream.</span></div>
      <ol class="tg-log" id="tgLog" aria-labelledby="tgH" aria-live="polite" tabindex="0"></ol>
      <div class="tg-foot" id="tgFoot"></div>`;
    this.log = root.querySelector('#tgLog');
    this.foot = root.querySelector('#tgFoot');
    this.log.addEventListener('click', (e) => this._onLogClick(e));
    this._vis = () => { if (!document.hidden) this.poll(); };
    document.addEventListener('visibilitychange', this._vis);
    // The booth's key opens or closes the « take off the line » buttons.
    this._off = client.on?.('control', () => this.paintLog());

    if (client.mode !== 'tower' || typeof client.telegraph !== 'function') {
      this.state = 'none';
      this.paint();
      return;
    }
    loadBank().then((icons) => { this.icons = icons; if (this._alive) this.paint(); });
    this.poll();
    this._timer = setInterval(() => { if (!document.hidden) this.poll(); }, POLL_MS);
  }

  iconUrl(file) {
    return file && this.icons.some((i) => i.file === file) ? new URL(`assets/telegraph/${file}`, document.baseURI).href : null;
  }

  /** A sender's picture: their character, or their icon when the bank has it, else their initial in a circle. */
  face(name, icon, cls = 'tg-face') {
    const cast = castFace(icon, cls);
    if (cast) return cast;
    const url = this.iconUrl(icon);
    if (url) {
      const img = h('img', cls);
      img.src = url;
      img.alt = '';
      img.width = 28;
      img.height = 28;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.dataset.icon = icon;
      return img;
    }
    const s = h('span', `${cls} tg-letter`, initial(name));
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  async poll() {
    if (!this._alive || this._polling || this.state === 'none') return;
    this._polling = true;
    try {
      const out = await this.client.telegraph(this.latest);
      if (!this._alive) return;
      if (out.enabled === false) { this.state = 'off'; this.paint(); return; }
      if (out.limits) this.limits = { ...this.limits, ...out.limits };
      const before = this.messages;
      this.messages = mergeMessages(before, out.messages, out.removed);
      this.latest = Math.max(this.latest, ...this.messages.map((m) => m.id), 0);
      const was = this.state;
      this.state = 'open';
      if (was !== 'open') this.paint();
      else if (before.length !== this.messages.length || before.at(-1)?.id !== this.messages.at(-1)?.id) this.paintLog();
    } catch (err) {
      if (!this._alive) return;
      // A tower that does not know the line (one still running the code from before it): closed, not broken.
      if (err?.status === 404) { this.state = 'off'; this.paint(); return; }
      // A tower out of reach for a moment keeps what the page already shows.
      if (this.state === 'loading') { this.state = 'away'; this.paint(); }
    } finally { this._polling = false; }
  }

  paint() { this.paintLog(); this.paintFoot(); }

  paintLog() {
    if (!this._alive) return;
    const log = this.log;
    const nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    const mod = Boolean(this.client.canWrite);
    log.replaceChildren();
    if (!this.messages.length) {
      const empty = {
        loading: 'Listening to the line…',
        open: 'Nobody has said anything yet. The line is yours.',
        off: 'The telegraph line is not open on this tower right now.',
        away: 'The tower is out of reach, so the line is silent for now.',
        none: 'The telegraph line runs through the tower, and this page is playing without it. It comes back with the tower.',
      }[this.state];
      log.append(h('li', 'tg-empty', empty));
      return;
    }
    for (const m of this.messages) {
      const li = h('li', `tg-msg${m.host ? ' tg-host' : ''}`);
      li.dataset.id = String(m.id);
      const body = h('div', 'tg-body');
      const top = h('p', 'tg-top');
      top.append(h('b', 'tg-name', m.name));
      if (m.host) top.append(h('span', 'tg-badge', 'tower'));
      top.append(h('span', 'tg-meta', `${clock(m.t)}${m.stream ? ` · ${m.stream}` : ''}`));
      body.append(top, h('p', 'tg-text', m.text));
      li.append(this.face(m.name, m.icon), body);
      if (mod && this._asking === m.id) li.append(this._modRow());
      else if (mod) {
        const x = h('button', 'tg-x', '×');
        x.type = 'button';
        x.dataset.act = 'ask';
        x.setAttribute('aria-label', `Take ${m.name}'s message off the line`);
        li.append(x);
      }
      log.append(li);
    }
    if (nearEnd) log.scrollTop = log.scrollHeight;
  }

  _modRow() {
    const row = h('div', 'tg-mod');
    for (const [act, label] of [['remove', 'Take off'], ['mute', 'Take off and silence for a day'], ['cancel', 'Keep']]) {
      const x = h('button', 'btn small', label);
      x.type = 'button';
      x.dataset.act = act;
      row.append(x);
    }
    return row;
  }

  /** The booth's key in hand: × asks, then takes the message off — or takes it off and silences its sender for a day. */
  async _onLogClick(e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const li = b.closest('.tg-msg');
    const id = Number(li?.dataset.id);
    if (b.dataset.act === 'ask') {
      // Kept across repaints: a message arriving must not close the question under the DJ's finger.
      this._asking = id;
      this.paintLog();
      this.log.querySelector('.tg-mod button')?.focus();
      return;
    }
    this._asking = null;
    if (b.dataset.act === 'cancel') { this.paintLog(); return; }
    try {
      const out = await this.client.telegraphRemove(id, { mute: b.dataset.act === 'mute' });
      this.messages = this.messages.filter((m) => m.id !== id);
      this.paintLog();
      this.toast(out.muted ? 'Taken off the line, and its sender silenced for a day.' : 'Taken off the line.');
    } catch (err) { this.say(err.message, 'bad'); this.paintLog(); }
  }

  say(text, tone = '') {
    const s = this.foot.querySelector('.tg-state');
    if (s) { s.textContent = text; s.className = `qstate tg-state ${tone}`; }
  }

  paintFoot() {
    if (!this._alive) return;
    const foot = this.foot;
    foot.replaceChildren();
    // While the join form is open the line steps back, so the form's button is on the screen (site.css).
    this.root.classList.toggle('tg-joining', this.state === 'open' && this.joining);
    if (this.state !== 'open') return;
    const me = identity.get();
    if (!me && !this.joining) {
      const b = h('button', 'btn primary tg-join', 'Join the telegraph line');
      b.type = 'button';
      b.addEventListener('click', () => { this.joining = true; this.paintFoot(); this.foot.querySelector('#tgName')?.focus(); });
      foot.append(b, h('span', 'hint tg-joinhint', 'A name and a character, nothing else. No account.'));
      return;
    }
    if (!me || this.joining) { this._joinForm(me); return; }

    const form = h('form', 'tg-say');
    form.autocomplete = 'off';
    const input = h('input');
    input.id = 'tgText';
    input.type = 'text';
    input.maxLength = this.limits.text;
    input.placeholder = 'Say something to the room';
    input.setAttribute('aria-label', 'Your message');
    input.enterKeyHint = 'send';
    const send = h('button', 'btn primary', 'Send');
    send.type = 'submit';
    form.append(this.face(me.name, me.icon, 'tg-face tg-me'), input, send);
    form.addEventListener('submit', (e) => { e.preventDefault(); this.send(input); });
    const who = h('p', 'tg-who');
    who.append('On the line as ', h('b', '', me.name), me.kept ? ' (remembered on this device) · ' : ' · ');
    const change = h('button', 'tg-link', 'change');
    change.type = 'button';
    change.addEventListener('click', () => { this.joining = true; this.paintFoot(); this.foot.querySelector('#tgName')?.focus(); });
    const leave = h('button', 'tg-link', 'leave');
    leave.type = 'button';
    leave.addEventListener('click', () => { identity.leave(); this.joining = false; this.paintFoot(); this.toast('You left the line. Nothing about you is kept in this browser.'); });
    who.append(change, ' · ', leave);
    const state = h('p', 'qstate tg-state');
    state.setAttribute('aria-live', 'polite');
    foot.append(form, who, state);
  }

  _joinForm(me) {
    const form = h('form', 'tg-joinform');
    form.autocomplete = 'off';
    form.setAttribute('aria-label', 'Join the telegraph line');
    const nameL = h('label', '', 'Your name on the line');
    nameL.htmlFor = 'tgName';
    const name = h('input');
    name.id = 'tgName';
    name.type = 'text';
    name.required = true;
    name.maxLength = this.limits.name;
    name.value = me?.name || '';
    name.placeholder = 'e.g. Night owl';
    // The character select (ui/cast.js): the cast first, then whatever pictures the bank holds.
    const set = h('div', 'tg-icons');
    const pictures = this.icons.map((ic) => ({ file: ic.file, label: ic.label, url: new URL(`assets/telegraph/${ic.file}`, document.baseURI).href }));
    const known = me?.icon && (castLabel(me.icon) || pictures.some((x) => x.file === me.icon)) ? me.icon : castIcon(CAST[0].id, 0);
    const picker = new CastPicker({ root: set, value: me ? known : null, pictures });
    const keepL = h('label', 'v-follow tg-keep');
    const keep = h('input');
    keep.type = 'checkbox';
    keep.id = 'tgKeep';
    keep.checked = Boolean(me?.kept);
    keepL.append(keep, ' Remember me on this device');
    const note = h('p', 'hint', 'Unticked, your name and character last until you close or reload this page. What you say on the line is kept by the tower, with the name and character you said it under.');
    const row = h('div', 'v-row');
    const go = h('button', 'btn primary', me ? 'Save' : 'Join');
    go.type = 'submit';
    const no = h('button', 'btn', 'Cancel');
    no.type = 'button';
    no.addEventListener('click', () => { this.joining = false; this.paintFoot(); });
    row.append(go, no);
    // Two columns on a desktop (site.css): who you are and the buttons on the left, the character select on the right.
    const who = h('div', 'tg-jwho');
    who.append(nameL, name, keepL, row);
    form.append(who, set, note);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const icon = picker.value;
      const ok = identity.set({ name: name.value, icon }, { remember: keep.checked });
      if (!ok) { name.focus(); return; }
      this.joining = false;
      this.paintFoot();
      this.foot.querySelector('#tgText')?.focus();
    });
    this.foot.append(form);
  }

  async send(input) {
    const me = identity.get();
    const text = input.value.trim();
    if (!me || !text || this.busy) return;
    this.busy = true;
    try {
      let stream = null;
      try {
        const list = await this.client.channels?.();
        stream = list?.channels?.find((c) => c.slug === (this.client.channel ?? list.current))?.label || null;
      } catch { /* the stream is a courtesy */ }
      const message = await this.client.telegraphSend({ name: me.name, icon: me.icon, text, stream });
      input.value = '';
      this.say('');
      this.messages = mergeMessages(this.messages, [message]);
      this.latest = Math.max(this.latest, message.id);
      this.paintLog();
      this.log.scrollTop = this.log.scrollHeight;
    } catch (err) {
      this.say(err.message, 'bad');
    } finally {
      this.busy = false;
      input.focus();
    }
  }

  destroy() {
    this._alive = false;
    clearInterval(this._timer);
    document.removeEventListener('visibilitychange', this._vis);
    this._off?.();
  }
}

export default TelegraphLine;
