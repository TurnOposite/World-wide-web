/**
 * Per-address request budgets — roadmap #14.
 *
 * The tower is on the public internet now (an Oracle server with its own
 * HTTPS name), so anyone can call it as fast as they like. A token bucket per
 * client address keeps one noisy client from starving everyone else, without
 * a dependency (the two-runtime-dependency rule, docs/DECISIONS.md
 * 2026-08-17): each address gets `capacity` requests at once and earns
 * `refillPerSec` back. Memory is bounded twice — buckets that have refilled
 * completely are forgotten, and past `maxKeys` the least recently seen go
 * first — so a flood from many addresses cannot grow the map without limit
 * either. Same lazy-sweep shape as Listeners.
 */
export class RateLimiter {
  /**
   * @param {object} [opts]
   * @param {number} [opts.capacity]      burst size, in requests
   * @param {number} [opts.refillPerSec]  sustained rate, in requests a second
   * @param {number} [opts.maxKeys]       hard cap on remembered addresses
   * @param {() => number} [opts.now]     clock, for tests
   */
  constructor({ capacity = 300, refillPerSec = 5, maxKeys = 10_000, now = Date.now } = {}) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.maxKeys = maxKeys;
    this.now = now;
    this.buckets = new Map(); // key -> { tokens, at }
    this._lastSweep = now();
  }

  /**
   * Spend `cost` tokens for `key`. Returns { ok, remaining, retryAfter } —
   * retryAfter in whole seconds, 0 when ok.
   */
  take(key, cost = 1) {
    const t = this.now();
    const k = String(key ?? '?').slice(0, 128);
    let b = this.buckets.get(k);
    if (b) {
      b.tokens = Math.min(this.capacity, b.tokens + ((t - b.at) / 1000) * this.refillPerSec);
      b.at = t;
      this.buckets.delete(k); // re-insert below: Map order = least recently seen first
    } else {
      b = { tokens: this.capacity, at: t };
    }
    let ok = false;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      ok = true;
    }
    this.buckets.set(k, b);
    this._bound(t);
    const retryAfter = ok ? 0 : Math.max(1, Math.ceil((cost - b.tokens) / this.refillPerSec));
    return { ok, remaining: Math.floor(b.tokens), retryAfter };
  }

  /** Would `cost` be allowed right now? Spends nothing. */
  allows(key, cost = 1) {
    const b = this.buckets.get(String(key ?? '?').slice(0, 128));
    if (!b) return cost <= this.capacity;
    return Math.min(this.capacity, b.tokens + ((this.now() - b.at) / 1000) * this.refillPerSec) >= cost;
  }

  get size() {
    return this.buckets.size;
  }

  _bound(t) {
    // A bucket that has refilled completely carries no information: forget
    // it. At most once a second, so the sweep never dominates a request.
    if (t - this._lastSweep >= 1000) {
      this._lastSweep = t;
      for (const [k, b] of this.buckets) {
        if (b.tokens + ((t - b.at) / 1000) * this.refillPerSec >= this.capacity) this.buckets.delete(k);
      }
    }
    while (this.buckets.size > this.maxKeys) {
      this.buckets.delete(this.buckets.keys().next().value);
    }
  }
}

/**
 * Express middleware spending from `limiter` for each request's address.
 * Over budget → 429 with Retry-After, and the JSON shape every other /api
 * error uses.
 *
 * @param {RateLimiter} limiter
 * @param {object} [opts]
 * @param {(req: any) => number} [opts.cost]  how much a request costs (default 1)
 * @param {(req: any) => boolean} [opts.skip] requests that do not count
 */
export function rateLimit(limiter, { cost = () => 1, skip = () => false } = {}) {
  return (req, res, next) => {
    if (skip(req)) return next();
    const r = limiter.take(req.ip || req.socket?.remoteAddress, cost(req));
    if (r.ok) return next();
    res.set('Retry-After', String(r.retryAfter));
    res.status(429).json({ error: 'rate_limited', retryAfter: r.retryAfter });
  };
}

export default RateLimiter;

/** This machine talking to itself: the healthcheck, the booth on the Pi, tests. */
export function isLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
