/**
 * Listener counting without cookies, accounts, or a database.
 *
 * The player sends an anonymous random id with each /api/station poll. We keep
 * the last-seen time in a Map and expire anything older than the TTL. Costs a
 * few hundred bytes per listener and survives fine on a Pi Zero.
 */
export class Listeners {
  /**
   * @param {object} [opts]
   * @param {number} [opts.ttlMs]   how long a ping counts as "tuned in"
   * @param {number} [opts.maxIds]  hard cap on remembered ids (roadmap #14):
   *   the ids are client-chosen, so a client inventing a fresh one on every
   *   poll could otherwise grow this map faster than the TTL drains it. Past
   *   the cap the least recently seen id goes first, so real listeners, who
   *   keep pinging, are the last to be forgotten.
   */
  constructor({ ttlMs = 45_000, maxIds = 5000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxIds = maxIds;
    this.seen = new Map();
    this.peak = 0;
  }

  ping(id) {
    if (!id || typeof id !== 'string') return this.count();
    const key = id.slice(0, 64);
    this.seen.delete(key); // re-insert: Map order = least recently seen first
    this.seen.set(key, Date.now());
    while (this.seen.size > this.maxIds) this.seen.delete(this.seen.keys().next().value);
    const c = this.count();
    if (c > this.peak) this.peak = c;
    return c;
  }

  count() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, t] of this.seen) if (t < cutoff) this.seen.delete(id);
    return this.seen.size;
  }
}

export default Listeners;
