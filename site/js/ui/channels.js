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

export class ChannelDial {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root
   * @param {object} o.client   engine/transport.js client
   * @param {string} [o.label]  accessible name of the group
   */
  constructor({ root, client, label = 'Channels' }) {
    this.root = root;
    this.client = client;
    this.label = label;
    this._busy = false;
    this._off = client.on?.('channel', () => this.paint());
    this._timer = setInterval(() => this.paint(), 20_000);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-ch]');
      if (b) this.tune(b.dataset.ch);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const btns = [...root.querySelectorAll('button[data-ch]')];
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length].focus();
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

  async paint() {
    if (typeof this.client.channels !== 'function') { this.root.hidden = true; return; }
    const { channels = [], current } = await this.client.channels();
    // One channel is no choice at all: the dial only appears when there is one to make.
    this.root.hidden = channels.length < 2;
    if (this.root.hidden) return;
    const on = this.client.channel ?? current;
    const focused = document.activeElement?.closest?.('button[data-ch]')?.dataset.ch;
    const keepScroll = this.root.querySelector('.dial')?.scrollLeft ?? null;
    this.root.innerHTML = `
      <div class="dial-head"><span class="dial-title">${esc(this.label)}</span><span class="dial-hint">${channels.length} channels, all on air at once</span></div>
      <div class="dial" role="group" aria-label="${esc(this.label)}">
        ${channels.map((c) => `
          <button type="button" class="ch${c.slug === on ? ' on' : ''}" data-ch="${esc(c.slug)}" aria-pressed="${c.slug === on}"
            title="${esc(c.blurb || c.label)}">
            <span class="ch-name">${c.slug === on ? '<span class="dot" aria-hidden="true"></span>' : ''}${esc(c.label)}</span>
            <span class="ch-now">${c.onAir ? esc(c.onAir.title) : '—'}</span>
            <span class="ch-meta">${c.trackCount} track${c.trackCount === 1 ? '' : 's'} · ${fmtSpan(c.seconds)}</span>
          </button>`).join('')}
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
