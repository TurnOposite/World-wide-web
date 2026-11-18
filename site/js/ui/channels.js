/**
 * The dial: one button per channel, each saying what that channel is playing
 * right now — a radio you can turn, not a menu.
 *
 * Every channel's programme is already running whether anyone listens or not
 * (server/lib/channels.js), so a press does not "start" anything: it moves
 * this tab to another clock, and the player follows to that channel's track
 * and second.
 */
import { esc, fmtSpan } from './util.js';

/*
 * The lane select (the mood board's MB-02, 2026-11-19): the streams as a cast on a stage. Each lane has an accent of
 * its own, worn only while it is the one you hear (teal for the first, then Arctic Contact's sky, Zoa Deschanel's acid,
 * a violet, Emapea's sepia), and a flat emblem: a shape of its own with its initial. ▲ ▼ cycle to the next lane on air.
 */
export const LANE_ACCENTS = ['#5aaebf', '#6eb8da', '#d9e04f', '#a88bd8', '#c79a5b'];
const SHAPES = [
  'M20 3 L37 20 L20 37 L3 20Z', // a diamond
  'M20 3 A17 17 0 1 1 19.9 3Z', // a disc
  'M11 4 H29 L37 20 L29 36 H11 L3 20Z', // a hexagon
  'M20 3 L37 33 H3Z', // a triangle
  'M6 6 H34 V34 H6Z', // a square
];
/** A lane's emblem: its shape (by its place on the dial) in its accent, its initial cut out of it. */
export function emblem(label, i) {
  const acc = LANE_ACCENTS[i % LANE_ACCENTS.length];
  const ch = (String(label).match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
  return `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="${SHAPES[i % SHAPES.length]}" fill="${acc}"/><text x="20" y="25.5" text-anchor="middle" font-family="Chakra Petch,system-ui,sans-serif" font-size="15" font-weight="700" fill="#0c0e18">${esc(ch)}</text></svg>`;
}
/** The next lane on air from `slug`, `step` places on (± 1), skipping the ones still waiting for music. */
export function cycleLane(channels, slug, step) {
  const live = channels.filter((c) => !c.empty);
  if (!live.length) return null;
  const i = live.findIndex((c) => c.slug === slug);
  return live[((i < 0 ? 0 : i + step) % live.length + live.length) % live.length].slug;
}

export class ChannelDial {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root
   * @param {object} o.client   engine/transport.js client
   * @param {string} [o.label]  accessible name of the group
   * @param {string} [o.noun]   what one of them is called in the head's hint (the Antenna says « streams »)
   * @param {(count: number) => void} [o.onPaint]  told how many there are, each time the dial is drawn
   */
  constructor({ root, client, label = 'Channels', noun = 'channels', onPaint = null }) {
    this.root = root;
    this.client = client;
    this.label = label;
    this.noun = noun;
    this.onPaint = onPaint;
    this._busy = false;
    this._off = client.on?.('channel', () => this.paint());
    this._timer = setInterval(() => this.paint(), 20_000);
    root.addEventListener('click', (e) => {
      const cyc = e.target.closest('button[data-cycle]');
      if (cyc) { this.cycle(Number(cyc.dataset.cycle)); return; }
      const b = e.target.closest('button[data-ch]');
      if (b && b.getAttribute('aria-disabled') !== 'true') this.tune(b.dataset.ch);
    });
    root.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const btns = [...root.querySelectorAll('button[data-ch]')];
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
      btns[(i + (fwd ? 1 : -1) + btns.length) % btns.length].focus();
    });
    this.paint();
  }

  async tune(slug) {
    if (this._busy || slug === this.client.channel) return;
    this._busy = true;
    try {
      await this.client.setChannel(slug);
    } finally {
      this._busy = false;
      this.paint();
    }
  }

  /** ▲ ▼: tune to the lane before or after the one on, among those on air. */
  async cycle(step) {
    if (typeof this.client.channels !== 'function') return;
    const { channels = [], current } = await this.client.channels();
    const next = cycleLane(channels, this.client.channel ?? current, step);
    if (next) await this.tune(next);
  }

  async paint() {
    if (typeof this.client.channels !== 'function') { this.root.hidden = true; return; }
    const { channels = [], current } = await this.client.channels();
    // One channel is no choice at all: the dial only appears when there is one to make.
    this.root.hidden = channels.length < 2;
    this.onPaint?.(channels.length);
    if (this.root.hidden) return;
    const on = this.client.channel ?? current;
    const focused = document.activeElement?.closest?.('button[data-ch]')?.dataset.ch;
    const keepScroll = this.root.querySelector('.dial')?.scrollLeft ?? null;
    // A stream on the dial with nothing in it yet (the tower's `empty`): shown, named, not to be tuned to.
    const live = channels.filter((c) => !c.empty).length;
    const waiting = channels.length - live;
    const hint = waiting
      ? `${live} on air, ${waiting} waiting for ${waiting === 1 ? 'its' : 'their'} music`
      : `${channels.length} ${this.noun}, all on air at once`;
    this.root.innerHTML = `
      <div class="dial-head"><span class="dial-title">${esc(this.label)}</span><span class="dial-hint">${esc(hint)}</span>
        <span class="lane-cycle"><button type="button" data-cycle="-1" aria-label="The stream before">▲</button><button type="button" data-cycle="1" aria-label="The stream after">▼</button></span></div>
      <div class="dial" role="group" aria-label="${esc(this.label)}">
        ${channels.map((c, i) => (c.empty ? `
          <button type="button" class="ch waiting" data-ch="${esc(c.slug)}" aria-disabled="true" style="--lane:${LANE_ACCENTS[i % LANE_ACCENTS.length]}"
            title="${esc(c.blurb || c.label)}">
            <span class="ch-emblem">${emblem(c.label, i)}</span>
            <span class="ch-name">${esc(c.label)}</span>
            <span class="ch-now">${esc(c.blurb || 'Coming')}</span>
            <span class="ch-meta">no music yet</span>
          </button>` : `
          <button type="button" class="ch${c.slug === on ? ' on' : ''}" data-ch="${esc(c.slug)}" aria-pressed="${c.slug === on}" style="--lane:${LANE_ACCENTS[i % LANE_ACCENTS.length]}"
            title="${esc(c.blurb || c.label)}">
            <span class="ch-emblem">${emblem(c.label, i)}</span>
            <span class="ch-name">${c.slug === on ? '<span class="dot" aria-hidden="true"></span>' : ''}${esc(c.label)}</span>
            <span class="ch-now">${c.onAir ? esc(c.onAir.title) : '—'}</span>
            <span class="ch-meta">${c.trackCount} track${c.trackCount === 1 ? '' : 's'} · ${fmtSpan(c.seconds)}</span>
          </button>`)).join('')}
      </div>`;
    if (focused) this.root.querySelector(`button[data-ch="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    // Keep the dial where the listener left it; on first paint, bring the
    // tuned channel into view — sideways only, never moving the page.
    const dial = this.root.querySelector('.dial');
    const onBtn = dial.querySelector('.ch.on');
    if (keepScroll !== null) dial.scrollLeft = keepScroll;
    else if (onBtn && onBtn.offsetLeft + onBtn.offsetWidth > dial.clientWidth) dial.scrollLeft = onBtn.offsetLeft - 12;
  }

  destroy() {
    clearInterval(this._timer);
    this._off?.();
  }
}

export default ChannelDial;
