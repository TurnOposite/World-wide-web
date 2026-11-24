/**
 * Radio Tower — the queue editor.
 *
 * The API behind this (`GET /api/queue`, `POST /api/queue/reorder`) was built
 * and tested on 2026-08-19; this is the UI that was missing. What it can do is
 * deliberately narrow, because the station clock only tolerates one kind of
 * change: a **permutation of a bounded window of upcoming slots**. Reordering
 * the same multiset of durations leaves the window ending at the same instant,
 * so nothing after it moves and no era is created. Insert, delete and duplicate
 * are structurally impossible here — the window's length is fixed by `ids`.
 *
 * Four rules this file exists to keep:
 *
 *   1. **Never offer to drag a locked slot.** The track on air and anything
 *      starting within `QUEUE_LOCK_SECONDS` are frozen. They render, greyed,
 *      with no drag affordance at all — not draggable-then-rejected.
 *   2. **The key lives in memory and nowhere else.** Not in localStorage, not
 *      in a served file, not in the URL. A reload asks again. That is the
 *      correct trade for a write endpoint on a public Cloudflare tunnel.
 *   3. **Hide the editor entirely when `editable` is false.** No key box, no
 *      teasing UI, no hint that a write endpoint exists.
 *   4. **Re-render from the server, never from an optimistic guess.** After a
 *      successful reorder the whole queue is refetched. The DOM is moved
 *      during a drag for feedback, but that is never treated as truth.
 *
 * Slots are addressed by `(cycleIndex, withinCycle)`, never by track id: a
 * library smaller than the lookahead repeats ids across cycles, so "move track
 * X" would name two different slots.
 */

/* ══════════════════════════════════════════════════════ pure helpers ══════
 * DOM-free so `tests/queue-ui.test.js` can check the window arithmetic in
 * plain Node. The window rules are where this can silently do the wrong
 * thing; the drag gestures are not.
 */

/**
 * Work out which run of slots may be rearranged.
 *
 * Two constraints, both from the server, both of which reject the request if
 * the client gets them wrong:
 *
 *  - Locked slots cannot move. They are always the earliest ones, so the
 *    movable run is a suffix that starts after the last locked slot.
 *  - A permutation cannot straddle a cycle boundary — two cycles are two
 *    different shuffles, so a rearrangement across the seam is not a
 *    permutation of either. The run therefore stops at the first slot whose
 *    `cycleIndex` differs from the first movable slot's.
 *
 * Of the runs that satisfy both, this returns the **longest** — not the
 * earliest. With a library smaller than the lookahead the queue spans several
 * cycles, and the first run after the fence is often a stub: if the frozen
 * slot happens to sit second-to-last in its cycle, that run is one slot long
 * and the editor would offer nothing at all, while the very next cycle has a
 * full set waiting. Taking the longest run makes the editor usable at every
 * moment in the cycle instead of three times out of four, and it is
 * deterministic — ties go to the earliest, so the same queue always yields
 * the same window.
 *
 * @param {Array<{id:string, locked:boolean, cycleIndex:number, withinCycle:number}>} slots
 * @returns {{cycleIndex:number, startWithin:number, ids:string[], from:number, to:number}|null}
 *   `from`/`to` are indices into `slots` (half-open), for the renderer.
 *   Null when there is nothing to rearrange.
 */
export function movableWindow(slots = []) {
  let best = null;
  let i = 0;
  while (i < slots.length) {
    const s = slots[i];
    if (!s || s.locked) { i++; continue; }
    const cycleIndex = s.cycleIndex;
    let end = i;
    while (
      end < slots.length &&
      slots[end] &&
      !slots[end].locked &&
      slots[end].cycleIndex === cycleIndex
    ) {
      end++;
    }
    // Strictly greater, so ties keep the earlier run.
    if (!best || end - i > best.to - best.from) best = { from: i, to: end, cycleIndex };
    i = end;
  }

  // A window of one is not a reorder. Reporting null keeps the caller from
  // rendering drag handles that could never produce a valid request — and the
  // server rejects `ids.length < 2` as `nothing_to_reorder` anyway.
  if (!best || best.to - best.from < 2) return null;

  return {
    cycleIndex: best.cycleIndex,
    startWithin: slots[best.from].withinCycle,
    ids: slots.slice(best.from, best.to).map((s) => s.id),
    from: best.from,
    to: best.to,
  };
}

/**
 * Move the item at `from` to `to`, returning a new array.
 * Out-of-range indices return the input unchanged rather than throwing —
 * a drag that ends outside the list is a normal thing to do, not an error.
 */
export function applyMove(ids = [], from, to) {
  const n = ids.length;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return ids.slice();
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return ids.slice();
  const out = ids.slice();
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

/**
 * Is `b` a rearrangement of `a` — same multiset, same length?
 *
 * The server enforces this too (and rejects with `not_a_permutation`), but
 * checking here means a client bug shows up as "nothing happened" rather than
 * as a 409 the user has to interpret. Counts, not sets: the same track id can
 * legitimately appear twice in one window when the library is small.
 */
export function isPermutation(a = [], b = []) {
  if (a.length !== b.length) return false;
  const counts = new Map();
  for (const x of a) counts.set(x, (counts.get(x) || 0) + 1);
  for (const x of b) {
    const c = counts.get(x);
    if (!c) return false;
    counts.set(x, c - 1);
  }
  return true;
}

/** Seconds until a slot airs, for the "in 4:20" column. */
export function untilAir(slot, now) {
  return Math.max(0, Math.round((slot.startsAt - now) / 1000));
}

/* ══════════════════════════════════════════════════════════ the editor ════ */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = (sec) => {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
};

export class QueueEditor {
  /** @param {Record<string, HTMLElement>} els */
  constructor(els) {
    this.els = els;
    /**
     * The station key. In memory for the lifetime of this page and nowhere
     * else — see rule 2 at the top of this file. Deliberately not a private
     * field, because a private field would imply a guarantee this cannot
     * make: anything in the page can read it. What it *does* guarantee is
     * that nothing writes it to disk.
     */
    this.key = null;
    this.slots = [];
    this.window = null;
    this.editable = false;
    this.serverTime = 0;
    this.busy = false;
    this.drag = null;
    this._wired = false;
    /** When the user last touched the list — see `refresh()`. */
    this.lastInteractionAt = 0;
  }

  /** Anything the user does that a re-render would disrupt. */
  _touched() {
    this.lastInteractionAt = Date.now();
  }

  /** Fetch state and render. Safe to call repeatedly; the poll loop does. */
  async refresh({ force = false } = {}) {
    // A refresh mid-drag would yank the item out from under the pointer.
    if (this.drag || this.busy) return;
    // And a refresh moments *before* one is nearly as bad: the queue advances
    // a slot every time a track ends, so a poll landing between "reach for
    // that row" and "press" re-renders the list and the press lands on a
    // different track — or on a frozen one, which does nothing at all. Hold
    // off briefly after any interaction. The programme is authoritative, but
    // it can wait five seconds to say so.
    if (!force && Date.now() - this.lastInteractionAt < 5000) return;
    try {
      const res = await fetch('/api/queue', { cache: 'no-store' });
      if (!res.ok) return this._disable();
      const data = await res.json();
      this.editable = Boolean(data.editable);
      if (!this.editable) return this._disable();

      this.slots = Array.isArray(data.slots) ? data.slots : [];
      this.serverTime = data.serverTime || Date.now();
      this.lockSeconds = data.lockSeconds ?? 60;
      this.hasOverride = Boolean(data.override);
      this.window = movableWindow(this.slots);
      this.els.section.hidden = false;
      this._wire();
      this.render();
    } catch {
      this._disable();
    }
  }

  /** Editing is off at the server: show nothing at all. */
  _disable() {
    this.editable = false;
    this.els.section.hidden = true;
  }

  _wire() {
    if (this._wired) return;
    this._wired = true;

    this.els.unlock.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = this.els.keyInput.value.trim();
      if (!v) return;
      this.key = v;
      // Clear the field immediately. The key stays in `this.key`; leaving it
      // in a DOM input means it survives in the accessibility tree, in form
      // autofill, and in any screenshot of the page.
      this.els.keyInput.value = '';
      this._status('unlocked — drag to rearrange');
      this.render();
    });

    this.els.lockBtn.addEventListener('click', () => {
      this.key = null;
      this._status('locked');
      this.render();
    });

    this.els.resetBtn.addEventListener('click', () => this.clearOrder());

    const list = this.els.list;
    list.addEventListener('pointerdown', (e) => this._onDown(e));
    list.addEventListener('pointermove', (e) => this._onMove(e));
    list.addEventListener('pointerup', (e) => this._onUp(e));
    list.addEventListener('pointercancel', () => this._cancelDrag());
    list.addEventListener('keydown', (e) => this._onKey(e));

    // Hovering, focusing or touching the list all mean "a move is imminent".
    // Registering them here — rather than only on pointerdown — is what stops
    // a poll re-rendering the row out from under a hand already reaching for
    // it. `pointerover` covers mouse, `focusin` covers keyboard.
    list.addEventListener('pointerover', () => this._touched());
    list.addEventListener('focusin', () => this._touched());
  }

  _status(text, tone = '') {
    this.els.status.textContent = text;
    this.els.status.dataset.tone = tone;
  }

  /* ------------------------------------------------------------- rendering */

  render() {
    const unlocked = Boolean(this.key);
    this.els.unlock.hidden = unlocked;
    this.els.lockBtn.hidden = !unlocked;
    this.els.resetBtn.hidden = !unlocked || !this.hasOverride;
    this.els.hint.textContent = unlocked
      ? `Drag to rearrange. The track on air and anything starting within ${this.lockSeconds}s are frozen.`
      : 'Enter the station key to rearrange what plays next.';

    const now = Date.now();
    const w = this.window;
    this.els.list.innerHTML = this.slots
      .map((s, i) => {
        const movable = unlocked && w && i >= w.from && i < w.to;
        return `<li class="q-item${s.locked ? ' locked' : ''}${movable ? ' movable' : ''}"
             data-index="${i}" data-movable="${movable ? '1' : '0'}"
             ${movable ? 'tabindex="0"' : ''}
             aria-label="${esc(s.title)} by ${esc(s.artist)}${s.locked ? ', frozen' : ''}">
          <span class="q-grip" aria-hidden="true">${s.locked ? '&#128274;' : '&#8942;&#8942;'}</span>
          <span class="t">${esc(s.title)}</span>
          <span class="a">${esc(s.artist)}</span>
          <span class="q-when">${s.locked ? 'frozen' : `in ${fmt(untilAir(s, now))}`}</span>
          <span class="d">${fmt(s.duration)}</span>
        </li>`;
      })
      .join('') || '<li class="empty">nothing scheduled</li>';
  }

  /* ----------------------------------------------------------------- drag */

  _onDown(e) {
    if (!this.key || this.busy) return;
    const item = e.target.closest?.('.q-item');
    if (!item || item.dataset.movable !== '1') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    this._touched();
    this.drag = { item, pointerId: e.pointerId, startIndex: this._domIndex(item) };
    item.setPointerCapture(e.pointerId);
    item.classList.add('dragging');
    // Stop the page scrolling under a touch drag. `touch-action:none` in the
    // CSS does the real work; this covers the mouse case and text selection.
    e.preventDefault();
  }

  _onMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const y = e.clientY;
    // Only ever reposition among *movable* siblings, which is what keeps a
    // dragged item from crossing above a locked slot or past a cycle seam.
    const siblings = [...this.els.list.querySelectorAll('.q-item[data-movable="1"]')]
      .filter((n) => n !== d.item);
    for (const s of siblings) {
      const r = s.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        this.els.list.insertBefore(d.item, s);
        return;
      }
    }
    const last = siblings[siblings.length - 1];
    if (last) last.after(d.item);
  }

  async _onUp(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    d.item.classList.remove('dragging');
    this.drag = null;
    const endIndex = this._domIndex(d.item);
    if (endIndex === d.startIndex) return;
    await this._commitFromDom();
  }

  _cancelDrag() {
    if (!this.drag) return;
    this.drag.item.classList.remove('dragging');
    this.drag = null;
    this.render();   // snap back to the server's truth
  }

  /** Keyboard equivalent — a drag-only editor is unusable without a pointer. */
  async _onKey(e) {
    if (!this.key || this.busy) return;
    const item = e.target.closest?.('.q-item');
    if (!item || item.dataset.movable !== '1') return;
    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    this._touched();

    const movables = [...this.els.list.querySelectorAll('.q-item[data-movable="1"]')];
    const at = movables.indexOf(item);
    const target = movables[at + dir];
    if (!target) return;
    if (dir < 0) this.els.list.insertBefore(item, target);
    else target.after(item);
    item.focus();
    await this._commitFromDom();
  }

  /** Index of an element among *all* rendered slots. */
  _domIndex(el) {
    return [...this.els.list.children].indexOf(el);
  }

  /* --------------------------------------------------------------- commit */

  async _commitFromDom() {
    const w = this.window;
    if (!w) return;
    const ids = [...this.els.list.querySelectorAll('.q-item[data-movable="1"]')]
      .map((n) => this.slots[Number(n.dataset.index)]?.id)
      .filter(Boolean);

    // Client-side sanity check. The server enforces this too; catching it here
    // turns a confusing 409 into "nothing happened", which is the honest
    // outcome of a client bug.
    if (!isPermutation(w.ids, ids)) {
      this._status('could not build a valid reorder — refreshing', 'bad');
      return this.refresh({ force: true });
    }
    if (ids.every((id, i) => id === w.ids[i])) return;   // nothing moved

    this.busy = true;
    this._status('saving…');
    try {
      const res = await fetch('/api/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Station-Key': this.key },
        body: JSON.stringify({ cycleIndex: w.cycleIndex, startWithin: w.startWithin, ids }),
      });
      await this._handleWrite(res, 'reordered');
    } catch {
      this._status('could not reach the tower', 'bad');
    } finally {
      this.busy = false;
      // Always refetch, and force past the interaction hold-off: the user has
      // just finished acting, so the newest truth is wanted immediately.
      await this.refresh({ force: true });
    }
  }

  async clearOrder() {
    if (!this.key || this.busy) return;
    this.busy = true;
    this._status('clearing…');
    try {
      const res = await fetch('/api/queue/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Station-Key': this.key },
        body: '{}',
      });
      await this._handleWrite(res, 'back to the natural order');
    } catch {
      this._status('could not reach the tower', 'bad');
    } finally {
      this.busy = false;
      await this.refresh({ force: true });
    }
  }

  async _handleWrite(res, okMessage) {
    if (res.ok) return this._status(okMessage);
    if (res.status === 401) {
      // A wrong key should not stay armed — the next drag would fail the same
      // way and the user would have no idea why.
      this.key = null;
      this._status('that key was refused', 'bad');
      return;
    }
    if (res.status === 503) return this._disable();
    let detail = `refused (${res.status})`;
    try {
      const body = await res.json();
      if (body.error === 'too_close_to_air') detail = 'too close to air — try a later slot';
      else if (body.error === 'window_crosses_cycle') detail = 'that run crosses a cycle boundary';
      else if (body.error === 'not_a_permutation') detail = 'the programme moved underneath — refreshed';
      else if (body.error) detail = String(body.error).replace(/_/g, ' ');
    } catch { /* keep the status-code message */ }
    this._status(detail, 'bad');
  }
}

export default QueueEditor;
