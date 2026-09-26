// GENERATED — copied verbatim from server/lib/payloads.js by scripts/site-sync.mjs. Edit the source, not this file.
/**
 * The JSON bodies of the station's read API, built in one place.
 *
 * Two front ends speak this shape: the Express router (a Radio Tower server —
 * the Pi) and the browser engine (site/js/engine/cloud.js — the static site,
 * where every visitor's browser is its own station). Both call these
 * functions, so a field cannot exist in one and be missing in the other. See
 * docs/DECISIONS.md 2026-09-26.
 *
 * Like schedule.js, this file imports nothing and touches no Node API — it is
 * copied verbatim into the site (`npm run site:sync`) and a test fails if the
 * copy drifts.
 *
 * `urls` decides where a track's bytes and cover live, because that is the
 * one thing the two hosts genuinely disagree on:
 *   server: `/api/track/<id>/stream`, `/api/track/<id>/art`
 *   cloud:  the track's own `sources[0]` and `art`, absolute URLs
 */
import { publicTrack } from './schedule.js';

/** The server's URL scheme — also the default, so the router needs no argument. */
export const serverUrls = {
  stream: (t) => `/api/track/${t.id}/stream`,
  art: (t) => (t.hasArt ? `/api/track/${t.id}/art` : null),
};

/**
 * Body of GET /api/station.
 *
 * @param {import('./schedule.js').Station} station
 * @param {object} o
 * @param {number} o.now
 * @param {{name: string, tagline: string, lookahead: number}} o.config
 * @param {number|null} [o.listeners]   null = this host cannot count (static site)
 * @param {boolean} [o.warmingUp]
 * @param {object} [o.urls]
 * @param {object} [o.extra]            merged into `station` (e.g. origin, mode)
 */
export function stationPayload(station, { now, config, listeners = null, warmingUp = false, urls = serverUrls, extra = {} }) {
  const onAir = station.at(now);
  if (!onAir) {
    return {
      serverTime: now,
      station: { name: config.stationName, tagline: config.stationTagline, revision: station.revision, ...extra },
      onAir: null,
      upcoming: [],
      warmingUp,
      message: warmingUp
        ? 'Warming up — scanning the library for the first time. Hang tight.'
        : 'No playable audio found. Drop MP3s into the music directory and rescan.',
    };
  }

  const body = {
    serverTime: now,
    station: {
      name: config.stationName,
      tagline: config.stationTagline,
      revision: station.revision,
      trackCount: station.tracks.length,
      cycleSeconds: Math.round(station.cycleSeconds),
      ...extra,
    },
    onAir: {
      ...publicTrack(onAir.track),
      offset: Math.round(onAir.offset * 1000) / 1000,
      startsAt: onAir.startsAt,
      endsAt: onAir.endsAt,
      remaining: Math.max(0, Math.round((onAir.endsAt - now) / 1000)),
      streamUrl: urls.stream(onAir.track),
      artUrl: urls.art(onAir.track),
    },
    upcoming: station.upcoming(now, config.lookahead).map((t) => ({
      ...t,
      artUrl: urls.art(station.get(t.id) || t),
    })),
    recent: station.history(now, 3),
  };
  // `listeners` stays absent — not zero — where nobody can count. A static
  // site showing "0 listening" would be a confident lie.
  if (listeners !== null && listeners !== undefined) body.listeners = listeners;
  return body;
}

/** Largest window /api/schedule will return, and the default. */
export const SCHEDULE_MAX_SPAN_MS = 48 * 60 * 60 * 1000;
export const SCHEDULE_DEFAULT_SPAN_MS = 2 * 60 * 60 * 1000;

/**
 * Body of GET /api/schedule, or `{ status, error }` for a bad request.
 * `from`/`to` are the raw query strings (ISO dates or anything Date.parse takes).
 */
export function schedulePayload(station, { now, from, to, urls = serverUrls }) {
  const fromMs = from ? Date.parse(String(from)) : now;
  if (!Number.isFinite(fromMs)) return { status: 400, error: 'invalid_from' };

  let toMs = to ? Date.parse(String(to)) : fromMs + SCHEDULE_DEFAULT_SPAN_MS;
  if (!Number.isFinite(toMs)) return { status: 400, error: 'invalid_to' };
  if (toMs <= fromMs) return { status: 400, error: 'to_before_from' };
  if (toMs - fromMs > SCHEDULE_MAX_SPAN_MS) toMs = fromMs + SCHEDULE_MAX_SPAN_MS;

  return {
    from: fromMs,
    to: toMs,
    revision: station.revision,
    items: station.schedule(fromMs, toMs).map((t) => ({
      ...t,
      artUrl: urls.art(station.get(t.id) || t),
    })),
  };
}

/**
 * Body of GET /api/queue.
 * @param {object} o
 * @param {{lookahead: number, queueWindow: number, queueLockSeconds: number}} o.config
 * @param {boolean} o.editable   whether this host accepts reorders at all
 */
export function queuePayload(station, { now, config, editable, urls = serverUrls, extra = {} }) {
  const onAir = station.at(now);
  if (!onAir) return { editable: false, locked: [], slots: [] };

  const lockUntil = now + config.queueLockSeconds * 1000;
  const slots = station.upcoming(now, Math.max(config.lookahead, config.queueWindow)).map((t) => ({
    ...t,
    artUrl: urls.art(station.get(t.id) || t),
    locked: t.startsAt < lockUntil,
  }));

  return {
    serverTime: now,
    editable: Boolean(editable),
    lockSeconds: config.queueLockSeconds,
    onAir: { id: onAir.track.id, endsAt: onAir.endsAt },
    override: station.queueOverride,
    revision: station.revision,
    slots,
    ...extra,
  };
}

/**
 * Validate a reorder request against the lock fence and the cycle, *without*
 * applying it. Returns `{ ok: true }` or `{ ok: false, status, error, detail? }`.
 * The caller then calls `station.setQueueOrder()`, which does the permutation
 * check itself.
 */
export function checkReorder(station, { now, lockSeconds, body }) {
  const { cycleIndex, startWithin, ids } = body ?? {};

  if (!Array.isArray(ids) || ids.length < 2) return { ok: false, status: 400, error: 'nothing_to_reorder' };
  if (ids.length > 100) return { ok: false, status: 400, error: 'window_too_large' };
  if (!Number.isInteger(cycleIndex) || !Number.isInteger(startWithin)) {
    return { ok: false, status: 400, error: 'invalid_window' };
  }

  const windowStart = station.slotStartsAt(cycleIndex, startWithin);
  if (windowStart === null) return { ok: false, status: 400, error: 'invalid_window' };

  const lockUntil = now + lockSeconds * 1000;
  if (windowStart < lockUntil) {
    return {
      ok: false,
      status: 409,
      error: 'too_close_to_air',
      detail: `Slots starting within ${lockSeconds}s cannot be moved.`,
    };
  }

  if (startWithin + ids.length > station.cycleOrder(cycleIndex).length) {
    return { ok: false, status: 409, error: 'window_crosses_cycle' };
  }
  return { ok: true };
}

export default { stationPayload, schedulePayload, queuePayload, checkReorder, serverUrls };
