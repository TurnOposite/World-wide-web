/**
 * « A way to reply to the chat I received a notification about directly through my phone without looking at the
 * website » (Ortis, 2026-11-25).
 *
 * A second ntfy topic, TELEGRAPH_REPLY_URL (https://ntfy.sh/<another long random name>), is the station's mouth:
 * the tower listens to it (ntfy's JSON stream), and whatever is published there goes on the telegraph line as the
 * station's own message — under the name and picture of the station's last message on the line, else
 * TELEGRAPH_REPLY_NAME. Publishing needs nothing but the topic's name: the « Reply » button on the line's
 * notifications (ntfy's web page for the topic), an iPhone Shortcut, `curl -d`. The name is the secret, as for the
 * notification topic; it lives in the tower's environment only, and is never logged.
 *
 * Nothing is replayed: the first connection asks only for what is published from then on, and a reconnection asks
 * for what came after the last message it took. A stream silent for longer than ntfy's keepalive is dropped and
 * opened again; failures wait longer each time, up to five minutes.
 */
import { ntfyTarget } from './notify.js';

export class ReplyListener {
  /**
   * @param {object} o
   * @param {string} o.url          the reply topic's address (TELEGRAPH_REPLY_URL)
   * @param {(text: string) => void} o.onText  what to do with a published message
   * @param {string} [o.notifyUrl]  the notification topic: the same topic for both would echo the station to itself
   */
  constructor({ url, onText, notifyUrl = null, fetchImpl = globalThis.fetch, now = Date.now, silenceMs = 120_000, maxWaitMs = 300_000 } = {}) {
    this.target = ntfyTarget(url);
    const same = this.target && notifyUrl && JSON.stringify(ntfyTarget(notifyUrl)) === JSON.stringify(this.target);
    if (url && !this.target) console.warn('[reply] TELEGRAPH_REPLY_URL is not an address like https://ntfy.sh/<topic>: replies are off');
    if (same) console.warn('[reply] TELEGRAPH_REPLY_URL is the notification topic itself: replies are off (choose a second topic)');
    if (same) this.target = null;
    this.onText = onText;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.silenceMs = silenceMs;
    this.maxWaitMs = maxWaitMs;
    this.since = String(Math.floor(now() / 1000)); // from now on: nothing published before the tower started
    this.seen = new Set();
    this.stopped = false;
    this.connected = false;
    this.taken = 0;
    this._warned = false;
  }

  get enabled() { return Boolean(this.target); }

  /** The ntfy web page for the topic, where a reply can be typed and sent. */
  get webUrl() { return this.target ? `${this.target.base}/${encodeURIComponent(this.target.topic)}` : null; }

  start() {
    if (!this.target || this._loop) return this;
    this._loop = this._run();
    return this;
  }

  async stop() {
    this.stopped = true;
    this._abort?.abort();
    await this._loop?.catch(() => {});
  }

  /** One message from the stream. Exported for the tests through the instance. */
  take(ev) {
    if (!ev || ev.event !== 'message' || typeof ev.message !== 'string') return false;
    if (ev.id) {
      if (this.seen.has(ev.id)) return false;
      this.seen.add(ev.id);
      if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value);
      this.since = ev.id;
    }
    const text = ev.message.trim();
    if (!text) return false;
    this.taken++;
    try { this.onText(text); } catch (err) { console.warn(`[reply] ${err.message}`); }
    return true;
  }

  async _run() {
    let wait = 2000;
    while (!this.stopped) {
      const ok = await this._once();
      if (this.stopped) break;
      wait = ok ? 2000 : Math.min(wait * 2, this.maxWaitMs);
      await new Promise((r) => { const t = setTimeout(r, wait); t.unref?.(); });
    }
  }

  /** One stream, until it ends, falls silent or fails. True when it was opened at all. */
  async _once() {
    const ac = new AbortController();
    this._abort = ac;
    let silence = null;
    const quiet = () => { clearTimeout(silence); silence = setTimeout(() => ac.abort(), this.silenceMs); silence.unref?.(); };
    try {
      quiet();
      const url = `${this.webUrl}/json?since=${encodeURIComponent(this.since)}`;
      const res = await this.fetchImpl(url, { signal: ac.signal, headers: { Accept: 'application/x-ndjson' } });
      if (!res.ok || !res.body) throw new Error(`status ${res.status}`);
      this.connected = true;
      this._warned = false;
      const decoder = new TextDecoder();
      let buf = '';
      for await (const chunk of res.body) {
        quiet();
        buf += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try { this.take(JSON.parse(line)); } catch { /* not a line of ntfy's: skipped */ }
        }
      }
      return true;
    } catch (err) {
      // Never the address: the topic's name is the secret.
      if (!this.stopped && !this.connected && !this._warned) console.warn(`[reply] the reply topic cannot be reached: ${err.name === 'AbortError' ? 'no answer' : err.message}`);
      if (!this.connected) this._warned = true;
      return this.connected;
    } finally {
      clearTimeout(silence);
      this.connected = false;
    }
  }
}

export default ReplyListener;
