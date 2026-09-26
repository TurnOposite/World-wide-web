/**
 * What's next — and, for the DJ, what can still move.
 *
 * public/queue.js's editor, rebuilt around the transport so the same
 * component drives a Pi (POST /api/queue/reorder with the station key) and the
 * static site (a control.json commit). Its rules are the Pi's rules, because
 * the permutation rule is what keeps everyone on the same second:
 *
 *   - the track on air and anything inside the lock fence never move;
 *   - only one contiguous run inside one cycle can be rearranged;
 *   - a move is a permutation — nothing is added, nothing removed.
 *
 * Pointer drag (mouse and touch, one implementation) and ArrowUp/ArrowDown.
 * Every render comes from the station, never from an optimistic guess —
 * except the few seconds a cloud commit is in flight, which are labelled.
 */
import { movableWindow, isPermutation } from '../lib/queue-core.js';
import { esc, fmt, clock } from './util.js';

const REASONS = {
  too_close_to_air: 'too close to air — pick something further down',
  window_crosses_cycle: 'that run crosses the end of the loop',
  not_a_permutation: 'the programme moved underneath — refreshed',
  no_token: 'paste your GitHub token in the booth first',
  bad_token: 'GitHub refused the token',
  read_only: 'this copy of the site cannot save changes',
};

export class QueueEditor {
  constructor({ root, client, player, limit = 12, title = "What's next" }) {
    this.root = root;
    this.client = client;
    this.player = player;
    this.limit = limit;
    this.title = title;
    this.slots = [];
    this.window = null;
    this.data = null;
    this.busy = false;
    this.drag = null;
    this.lastTouch = 0;
    this.msg = { text: '', tone: '' };

    root.innerHTML = `
      <div class="panel-head"><h3>${esc(title)}</h3><div class="queue-actions" data-actions></div></div>
      <p class="queue-note" data-note></p>
      <ol class="tracklist queue" data-list></ol>
      <p class="qstate" data-state role="status" aria-live="polite"></p>`;
    this.els = {
      list: root.querySelector('[data-list]'),
      note: root.querySelector('[data-note]'),
      actions: root.querySelector('[data-actions]'),
      state: root.querySelector('[data-state]'),
    };
    const l = this.els.list;
    l.addEventListener('pointerdown', (e) => this._down(e));
    l.addEventListener('pointermove', (e) => this._move(e));
    l.addEventListener('pointerup', (e) => this._up(e));
    l.addEventListener('pointercancel', () => this._cancel());
    l.addEventListener('keydown', (e) => this._key(e));
    l.addEventListener('focusin', () => { this.lastTouch = Date.now(); });

    this._offControl = client.on?.('control', () => this.refresh({ force: true }));
    this._onTrack = () => this.refresh({ force: true });
    player.addEventListener('track', this._onTrack);
    this._timer = setInterval(() => this.refresh(), 5000);
    this.refresh({ force: true });
  }

  destroy() {
    clearInterval(this._timer);
    this._offControl?.();
    this.player.removeEventListener('track', this._onTrack);
  }

  get canWrite() { return this.client.canWrite; }

  _state(text, tone = '') {
    this.msg = { text, tone };
    this.els.state.textContent = text;
    this.els.state.className = `qstate ${tone}`;
  }

  async refresh({ force = false } = {}) {
    if (this.drag || this.busy) return;
    if (!force && Date.now() - this.lastTouch < 4000) return;
    try {
      const data = await this.client.get('/api/queue');
      this.data = data;
      this.slots = (data.slots || []).slice(0, this.limit);
      this.window = movableWindow(this.slots);
      this.render();
    } catch {
      this.els.list.innerHTML = '<li class="empty">the queue is not reachable right now</li>';
    }
  }

  render() {
    const d = this.data || {};
    const now = this.client.now();
    const w = this.window;
    const can = this.canWrite;
    const lock = d.lockSeconds ?? 60;
    const moved = new Set(d.override?.ids || []);

    if (d.mode === 'cloud' && d.controlStatus === 'rejected') {
      this.els.note.textContent = 'The DJ\'s last reorder no longer matches the library, so the station is playing its own order.';
    } else if (can) {
      this.els.note.textContent = `Drag or use ↑ ↓ to rearrange. What's on air and anything starting in the next ${Math.round(lock / 60) >= 2 ? `${Math.round(lock / 60)} minutes` : `${lock} s`} stays put, so no listener ever loses a track they were promised.`;
    } else {
      this.els.note.innerHTML = `${d.override ? '<b>The DJ has rearranged what\'s next.</b> ' : ''}This is the programme every listener hears. <a href="booth" data-link>The DJ booth</a> can rearrange it.`;
    }

    this.els.actions.innerHTML = can && d.override
      ? '<button class="btn small" type="button" data-clear>Back to the station clock</button>'
      : '';
    this.els.actions.querySelector('[data-clear]')?.addEventListener('click', () => this.clear());

    this.els.list.innerHTML = this.slots.map((s, i) => {
      const movable = can && w && i >= w.from && i < w.to;
      const inSec = Math.max(0, Math.round((s.startsAt - now) / 1000));
      return `<li class="${s.locked ? 'locked' : ''}${moved.has(s.id) ? ' moved' : ''}" data-index="${i}" data-movable="${movable ? 1 : 0}"
          ${movable ? 'tabindex="0"' : ''} aria-label="${esc(s.title)} by ${esc(s.artist)}, at ${clock(s.startsAt)}${s.locked ? ', frozen' : ''}">
        <span class="grip" aria-hidden="true">${movable ? '⋮⋮' : s.locked ? '🔒' : ''}</span>
        <span class="when" title="${inSec < 3600 ? `in ${fmt(inSec)}` : ''}">${clock(s.startsAt)}</span>
        <span class="ta"><span class="t">${esc(s.title)}</span><span class="a">${esc(s.artist)}</span></span>
        <span class="d">${fmt(s.duration)}</span>
      </li>`;
    }).join('') || '<li class="empty">nothing scheduled</li>';
  }

  /* ----------------------------------------------------------------- drag */

  _items() { return [...this.els.list.querySelectorAll('li[data-movable="1"]')]; }

  _down(e) {
    if (!this.canWrite || this.busy) return;
    const li = e.target.closest('li');
    if (!li || li.dataset.movable !== '1') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.lastTouch = Date.now();
    this.drag = { li, id: e.pointerId, from: [...this.els.list.children].indexOf(li) };
    li.setPointerCapture(e.pointerId);
    li.classList.add('dragging');
    e.preventDefault();
  }

  _move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const others = this._items().filter((n) => n !== d.li);
    for (const n of others) {
      const r = n.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { this.els.list.insertBefore(d.li, n); return; }
    }
    others.at(-1)?.after(d.li);
  }

  async _up(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    d.li.classList.remove('dragging');
    this.drag = null;
    if ([...this.els.list.children].indexOf(d.li) === d.from) return;
    await this._commit();
  }

  _cancel() {
    if (!this.drag) return;
    this.drag.li.classList.remove('dragging');
    this.drag = null;
    this.render();
  }

  async _key(e) {
    if (!this.canWrite || this.busy) return;
    const li = e.target.closest('li');
    if (!li || li.dataset.movable !== '1') return;
    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const items = this._items();
    const target = items[items.indexOf(li) + dir];
    if (!target) return;
    if (dir < 0) this.els.list.insertBefore(li, target); else target.after(li);
    li.focus();
    await this._commit();
  }

  /* --------------------------------------------------------------- commit */

  async _commit() {
    const w = this.window;
    if (!w) return;
    const ids = this._items().map((n) => this.slots[Number(n.dataset.index)]?.id).filter(Boolean);
    if (!isPermutation(w.ids, ids)) { this._state('could not build a valid reorder — refreshing', 'bad'); return this.refresh({ force: true }); }
    if (ids.every((id, i) => id === w.ids[i])) return;
    await this.apply({ cycleIndex: w.cycleIndex, startWithin: w.startWithin, ids });
  }

  /** Send a reorder (also used by the booth's moods). */
  async apply(req, meta = {}) {
    this.busy = true;
    this._state(this.client.mode === 'cloud' && this.client.planeKind === 'github' ? 'saving to GitHub…' : 'saving…');
    try {
      await this.client.reorder(req, meta);
      this._state(this.client.planeKind === 'github'
        ? 'On air. Every listener picks it up within about a minute.'
        : 'On air.', 'ok');
    } catch (err) {
      this._state(REASONS[err.code] || err.message || 'refused', 'bad');
    } finally {
      this.busy = false;
      await this.refresh({ force: true });
    }
  }

  async clear() {
    this.busy = true;
    this._state('clearing…');
    try {
      await this.client.clear();
      this._state('Back to the station clock.', 'ok');
    } catch (err) {
      this._state(REASONS[err.code] || err.message || 'refused', 'bad');
    } finally {
      this.busy = false;
      await this.refresh({ force: true });
    }
  }
}
