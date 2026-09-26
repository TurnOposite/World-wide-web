import express from 'express';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { publicTrack } from '../lib/schedule.js';
import { resolveTrackPath } from '../lib/library.js';
import { sendAudio } from '../lib/stream.js';

/**
 * @param {object} ctx
 * @param {import('../lib/schedule.js').Station} ctx.station
 * @param {import('../lib/listeners.js').Listeners} ctx.listeners
 * @param {object} ctx.config
 * @param {object} ctx.state  mutable server state (lastScan, startedAt, ...)
 * @param {Function} ctx.rescan
 */
export function apiRouter(ctx) {
  const { station, listeners, config, state, collections } = ctx;
  const router = express.Router();

  // --- collections -----------------------------------------------------------
  // The manifest behind /library.html, /photos.html and /crates.html. Read-only
  // and public by design: everything it lists was put there to be seen.
  router.get('/collections', async (req, res, next) => {
    try {
      if (!collections) return res.json({ ok: false, reason: 'collections disabled' });
      res.set('Cache-Control', 'no-cache');
      res.json(await collections.load());
    } catch (err) {
      next(err);
    }
  });

  // --- clock ---------------------------------------------------------------
  // The player calls this a few times at startup to measure round-trip time
  // and correct for a listener whose device clock is wrong. Without it, a
  // phone that is 20s off would join 20s out of sync.
  router.get('/time', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ t: Date.now() });
  });

  router.get('/health', (req, res) => {
    const onAir = station.at(Date.now());
    // The first scan hasn't landed yet: `scanning` is distinct from
    // `no_tracks` (a scan finished and genuinely found nothing) so an
    // operator — or the player — can tell "still warming up" from "empty
    // library, go add some MP3s". Once the first scan lands, lastScanAt is
    // set forever after, so this branch only ever fires during startup.
    const warmingUp = state.scanning && state.lastScanAt === null;
    const status = warmingUp ? 'scanning' : station.isEmpty ? 'no_tracks' : 'on_air';
    res.set('Cache-Control', 'no-store');
    res.json({
      ok: status === 'on_air',
      status,
      uptimeSeconds: Math.round(process.uptime()),
      tracks: station.tracks.length,
      cycleSeconds: Math.round(station.cycleSeconds),
      revision: station.revision,
      nowPlayingId: onAir?.track?.id ?? null,
      listeners: listeners.count(),
      lastScanAt: state.lastScanAt,
      musicDir: config.musicDir,
      version: state.version,
      node: process.version,
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    });
  });

  // --- the station ---------------------------------------------------------
  router.get('/station', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const now = Date.now();

    if (req.query.listener) listeners.ping(String(req.query.listener));

    const onAir = station.at(now);
    if (!onAir) {
      // Same warming-up test as /api/health — kept in sync so the player and
      // an operator's healthcheck never disagree about why nothing is on air.
      const warmingUp = state.scanning && state.lastScanAt === null;
      return res.json({
        serverTime: now,
        station: { name: config.stationName, tagline: config.stationTagline, revision: station.revision },
        onAir: null,
        upcoming: [],
        warmingUp,
        message: warmingUp
          ? 'Warming up — scanning the library for the first time. Hang tight.'
          : 'No playable audio found. Drop MP3s into the music directory and rescan.',
      });
    }

    res.json({
      serverTime: now,
      station: {
        name: config.stationName,
        tagline: config.stationTagline,
        revision: station.revision,
        trackCount: station.tracks.length,
        cycleSeconds: Math.round(station.cycleSeconds),
      },
      onAir: {
        ...publicTrack(onAir.track),
        offset: Math.round(onAir.offset * 1000) / 1000,
        startsAt: onAir.startsAt,
        endsAt: onAir.endsAt,
        remaining: Math.max(0, Math.round((onAir.endsAt - now) / 1000)),
        streamUrl: `/api/track/${onAir.track.id}/stream`,
        artUrl: onAir.track.hasArt ? `/api/track/${onAir.track.id}/art` : null,
      },
      upcoming: station.upcoming(now, config.lookahead).map((t) => ({
        ...t,
        artUrl: t.hasArt ? `/api/track/${t.id}/art` : null,
      })),
      recent: station.history(now, 3),
      listeners: listeners.count(),
    });
  });

  // --- programme guide -------------------------------------------------------
  // "See what plays when, and plan ahead" (roadmap #0b). `Station.schedule()`
  // is already a pure function of time — this route just parses a window and
  // hands it off. No storage, no stale cache: the answer is only ever as
  // fresh as `station`'s current tracks, same as every other endpoint here.
  router.get('/schedule', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const now = Date.now();

    // A "plan ahead" guide, not an infinite scroll — cap the span so a
    // caller can't make a single request walk months of programme on a Pi.
    const MAX_SPAN_MS = 48 * 60 * 60 * 1000;
    const DEFAULT_SPAN_MS = 2 * 60 * 60 * 1000;

    const fromMs = req.query.from ? Date.parse(String(req.query.from)) : now;
    if (!Number.isFinite(fromMs)) return res.status(400).json({ error: 'invalid_from' });

    let toMs = req.query.to ? Date.parse(String(req.query.to)) : fromMs + DEFAULT_SPAN_MS;
    if (!Number.isFinite(toMs)) return res.status(400).json({ error: 'invalid_to' });
    if (toMs <= fromMs) return res.status(400).json({ error: 'to_before_from' });
    if (toMs - fromMs > MAX_SPAN_MS) toMs = fromMs + MAX_SPAN_MS;

    res.json({
      from: fromMs,
      to: toMs,
      revision: station.revision,
      items: station.schedule(fromMs, toMs).map((t) => ({
        ...t,
        artUrl: t.hasArt ? `/api/track/${t.id}/art` : null,
      })),
    });
  });

  // --- library -------------------------------------------------------------
  router.get('/library', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);

    let items = station.tracks;
    if (q) {
      items = items.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album || '').toLowerCase().includes(q),
      );
    }
    res.json({
      total: items.length,
      offset,
      limit,
      items: items.slice(offset, offset + limit).map(publicTrack),
    });
  });

  // --- audio ---------------------------------------------------------------
  router.get('/track/:id/stream', async (req, res) => {
    const track = station.get(req.params.id);
    if (!track) return res.status(404).json({ error: 'unknown_track' });
    let abs;
    try {
      abs = resolveTrackPath(track, config.musicDir);
    } catch (err) {
      return res.status(410).json({ error: 'file_gone', detail: err.message });
    }
    await sendAudio(req, res, abs);
  });

  router.get('/track/:id/art', async (req, res) => {
    const track = station.get(req.params.id);
    if (!track || !track.hasArt) return res.status(404).end();
    try {
      const abs = resolveTrackPath(track, config.musicDir);
      const { parseFile } = await import('music-metadata');
      const meta = await parseFile(abs, { skipCovers: false });
      const pic = meta.common?.picture?.[0];
      if (!pic) return res.status(404).end();
      res.set('Content-Type', pic.format || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(pic.data));
    } catch {
      res.status(404).end();
    }
  });

  // --- the queue -----------------------------------------------------------
  // Reordering is the one place a human gets to overrule the station clock,
  // so it is fenced on three sides:
  //
  //   1. It is a permutation only (enforced in Station.setQueueOrder), so the
  //      programme's total duration cannot change.
  //   2. It requires STATION_KEY. With no key configured the endpoint is
  //      disabled outright rather than open — this station is meant to sit on
  //      a public Cloudflare tunnel, and "off by default" is the only safe
  //      posture for a write endpoint on a public URL.
  //   3. It cannot touch the track on air, nor anything starting within
  //      QUEUE_LOCK_SECONDS. Ortis's rule: never interfere with what is
  //      playing, and leave a minute's margin so a reorder can't land on a
  //      track a listener has already begun buffering.

  /** Constant-time compare so the key can't be recovered by timing the endpoint. */
  function keyMatches(provided) {
    const expected = config.stationKey;
    if (!expected) return false;
    const a = Buffer.from(String(provided ?? ''));
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  function requireKey(req, res, opts = {}) {
    const {
      disabledError = 'queue_editing_disabled',
      disabledDetail = 'Set STATION_KEY in the environment to enable queue reordering.',
    } = opts;
    if (!config.stationKey) {
      res.status(503).json({ error: disabledError, detail: disabledDetail });
      return false;
    }
    const provided = req.get('x-station-key') || req.query.key;
    if (!keyMatches(provided)) {
      res.status(401).json({ error: 'bad_key' });
      return false;
    }
    return true;
  }

  router.get('/queue', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const now = Date.now();
    const onAir = station.at(now);
    if (!onAir) return res.json({ editable: false, locked: [], slots: [] });

    const lockUntil = now + config.queueLockSeconds * 1000;
    const slots = station.upcoming(now, Math.max(config.lookahead, config.queueWindow)).map((t) => ({
      ...t,
      artUrl: t.hasArt ? `/api/track/${t.id}/art` : null,
      // A slot is locked when it starts too soon to be safely moved.
      locked: t.startsAt < lockUntil,
    }));

    res.json({
      serverTime: now,
      // Whether the *server* permits editing at all. The client uses this to
      // decide whether to show the editor; the key is still checked on write.
      editable: Boolean(config.stationKey),
      lockSeconds: config.queueLockSeconds,
      onAir: { id: onAir.track.id, endsAt: onAir.endsAt },
      override: station.queueOverride,
      revision: station.revision,
      slots,
    });
  });

  router.post('/queue/reorder', express.json({ limit: '32kb' }), (req, res) => {
    if (!requireKey(req, res)) return;

    const now = Date.now();
    const { cycleIndex, startWithin, ids } = req.body ?? {};

    if (!Array.isArray(ids) || ids.length < 2) {
      return res.status(400).json({ error: 'nothing_to_reorder' });
    }
    if (ids.length > 100) return res.status(400).json({ error: 'window_too_large' });
    if (!Number.isInteger(cycleIndex) || !Number.isInteger(startWithin)) {
      return res.status(400).json({ error: 'invalid_window' });
    }

    // Slots are addressed by (cycleIndex, withinCycle), which is unambiguous
    // even when the library is smaller than the lookahead window and the same
    // track id therefore appears more than once in `upcoming`.
    const windowStart = station.slotStartsAt(cycleIndex, startWithin);
    if (windowStart === null) return res.status(400).json({ error: 'invalid_window' });

    // The safety fence: never touch what is playing, nor anything about to
    // start. Checking the *first* slot is sufficient — the window runs
    // forward from there, so if it is clear, every slot behind it is too.
    const lockUntil = now + config.queueLockSeconds * 1000;
    if (windowStart < lockUntil) {
      return res.status(409).json({
        error: 'too_close_to_air',
        detail: `Slots starting within ${config.queueLockSeconds}s cannot be moved.`,
      });
    }

    // A permutation cannot straddle a cycle boundary: the two cycles are
    // different shuffles, so a rearrangement across the seam is not a
    // permutation of either.
    if (startWithin + ids.length > station.cycleOrder(cycleIndex).length) {
      return res.status(409).json({ error: 'window_crosses_cycle' });
    }

    const result = station.setQueueOrder({ cycleIndex, startWithin, ids });
    // `not_a_permutation` here almost always means the client was looking at
    // a stale programme — a rescan reshuffled the cycle under it.
    if (!result.ok) {
      return res.status(409).json({ ...result, detail: 'Refetch /api/queue and try again.' });
    }

    res.json({
      ok: true,
      // Hand back the fresh programme so the client renders the truth rather
      // than its own optimistic guess.
      slots: station.upcoming(Date.now(), config.lookahead),
    });
  });

  router.post('/queue/clear', express.json(), (req, res) => {
    if (!requireKey(req, res)) return;
    const had = station.clearQueueOrder();
    res.json({ ok: true, cleared: had, slots: station.upcoming(Date.now(), config.lookahead) });
  });

  // --- operations ----------------------------------------------------------
  // On a station meant to sit on a public URL, an unauthenticated on-demand
  // filesystem walk is a standing invitation to force slow USB reads at will
  // (roadmap #6). Same STATION_KEY, same fail-closed posture as the queue
  // write endpoints above: unset disables the endpoint entirely (503) rather
  // than leaving it open, since AUTO_RESCAN_MINUTES already covers the
  // ordinary "did the library change" case without anyone needing to poke it.
  router.post('/rescan', express.json(), async (req, res) => {
    if (!requireKey(req, res, {
      disabledError: 'rescan_disabled',
      disabledDetail: 'Set STATION_KEY in the environment to enable POST /api/rescan.',
    })) return;
    if (state.scanning) return res.status(409).json({ error: 'scan_in_progress' });
    try {
      const result = await ctx.rescan();
      res.json({ ok: true, tracks: result.tracks.length, skipped: result.skipped.length });
    } catch (err) {
      res.status(500).json({ error: 'scan_failed', detail: err.message });
    }
  });

  return router;
}

export default apiRouter;
