/**
 * Listener counting without cookies, accounts, or a database.
 *
 * The player sends an anonymous random id with each /api/station poll. We keep
 * the last-seen time in a Map and expire anything older than the TTL. Costs a
 * few hundred bytes per listener and survives fine on a Pi Zero.
 */
export class Listeners {
  constructor({ ttlMs = 45_000 } = {}) {
    this.ttlMs = ttlMs;
    this.seen = new Map();
    this.peak = 0;
  }

  ping(id) {
    if (!id || typeof id !== 'string') return this.count();
    this.seen.set(id.slice(0, 64), Date.now());
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
