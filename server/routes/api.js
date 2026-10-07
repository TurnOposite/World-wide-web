import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { publicTrack } from '../lib/schedule.js';
import { stationPayload, schedulePayload, queuePayload, checkReorder } from '../lib/payloads.js';
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
  const { station, listeners, config, state, collections, channels = null } = ctx;

  /**
   * Which clock a request is asking about. No `channel` — the tower's
   * original single programme, exactly as before channels existed (the
   * Pi's own page and the dj/ booth rely on that). An unknown one — the
   * default channel, reported back in the body so the client can see it.
   * See server/lib/channels.js.
   */
  const pick = (slug) => {
    if (!channels || slug === undefined || slug === null || slug === '') return { st: station, extra: {} };
    const resolved = channels.resolve(String(slug));
    const st = resolved ? channels.get(resolved) : null;
    if (!st) return { st: station, extra: {} };
    const label = channels.list().find((c) => c.slug === resolved)?.label ?? null;
    return { st, extra: { channel: resolved, channelLabel: label } };
  };
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
  router.get('/channels', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!channels) return res.json({ default: null, channels: [] });
    res.json({ default: channels.defaultSlug, channels: channels.list() });
  });

  router.get('/station', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const now = Date.now();

    if (req.query.listener) listeners.ping(String(req.query.listener));

    // The body is built in lib/payloads.js so the static site's in-browser
    // station (site/js/engine/cloud.js) serves the identical shape.
    const { st, extra } = pick(req.query.channel);
    res.json(stationPayload(st, {
      now,
      config,
      listeners: listeners.count(),
      warmingUp: state.scanning && state.lastScanAt === null,
      extra,
    }));
  });

  router.get('/schedule', (req, res) => {
    res.set('Cache-Control', 'no-store');
    // Span limits (48h max, 2h default) live with the body in lib/payloads.js.
    const body = schedulePayload(pick(req.query.channel).st, { now: Date.now(), from: req.query.from, to: req.query.to });
    if (body.error) return res.status(body.status).json({ error: body.error });
    res.json(body);
  });

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
    const { st, extra } = pick(req.query.channel);
    res.json(queuePayload(st, { now: Date.now(), config, editable: Boolean(config.stationKey), extra }));
  });

  router.post('/queue/reorder', express.json({ limit: '32kb' }), (req, res) => {
    if (!requireKey(req, res)) return;
    const { st: station } = pick(req.body?.channel ?? req.query.channel);

    const verdict = checkReorder(station, { now: Date.now(), lockSeconds: config.queueLockSeconds, body: req.body });
    if (!verdict.ok) {
      const { status, ok, ...rest } = verdict;
      return res.status(status).json(rest);
    }

    // Composed with the override in force, never touching what is on air
    // (Station.planQueueOrder; tests/queue-compose.test.js).
    const { cycleIndex, startWithin, ids } = req.body;
    const now = Date.now();
    const plan = station.planQueueOrder({ cycleIndex, startWithin, ids }, { now, lockMs: config.queueLockSeconds * 1000 });
    if (!plan.ok) {
      const detail = plan.error === 'earlier_reorder_on_air'
        ? `An earlier reorder is still playing out; try again after ${new Date(plan.until).toISOString()}.`
        : plan.error === 'other_reorder_waiting'
          ? `An earlier reorder is still waiting to play (until ${new Date(plan.until).toISOString()}). POST /api/queue/clear drops it; or try again after it has played.`
          : 'Refetch /api/queue and try again.';
      return res.status(409).json({ ok: false, error: plan.error, until: plan.until ?? null, detail });
    }
    const result = station.applyQueueOverride(plan.override);
    if (!result.ok) {
      return res.status(409).json({ ...result, detail: 'Refetch /api/queue and try again.' });
    }

    res.json({
      ok: true,
      slots: station.upcoming(Date.now(), config.lookahead),
    });
  });

  router.post('/queue/clear', express.json(), (req, res) => {
    if (!requireKey(req, res)) return;
    const { st: station } = pick(req.body?.channel ?? req.query.channel);
    // What is on air, or inside the fence, keeps its place and plays out.
    const now = Date.now();
    const plan = station.planClearQueueOrder({ now, lockMs: config.queueLockSeconds * 1000 });
    station.applyQueueOverride(plan.override);
    res.json({ ok: true, cleared: plan.changed, full: plan.full, until: plan.until, slots: station.upcoming(now, config.lookahead) });
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

  // --- the library, from the laptop ---------------------------------------
  // The library bot sends new music here (library/bot.mjs publish): it asks
  // what the tower holds, then PUTs only the difference. Two locks: uploads
  // must be switched on (ALLOW_UPLOADS=1) and the station key must match.
  // A path is accepted only inside MUSIC_DIR, only for audio or the two
  // library files, and lands under a temporary name first, so a cut
  // connection never leaves half a song on air.
  const UPLOAD_NAMES = new Set(['playlists.json', 'channels.json']);
  const uploadGate = (req, res) => {
    if (!config.allowUploads) {
      res.status(503).json({ error: 'uploads_disabled', detail: 'Set ALLOW_UPLOADS=1 (and STATION_KEY) to let the library bot send music here.' });
      return false;
    }
    return requireKey(req, res, { disabledError: 'uploads_disabled', disabledDetail: 'Set STATION_KEY to enable uploads.' });
  };
  const safeLibraryPath = (rel) => {
    const clean = String(rel || '').replaceAll('\\', '/').replace(/^\/+/, '');
    if (!clean || clean.split('/').some((p) => p === '..' || p === '' || p.startsWith('.'))) return null;
    const ext = path.extname(clean).toLowerCase();
    if (!config.audioExtensions.includes(ext) && !(UPLOAD_NAMES.has(clean))) return null;
    const abs = path.resolve(config.musicDir, clean);
    if (!abs.startsWith(path.resolve(config.musicDir) + path.sep)) return null;
    return { clean, abs };
  };

  router.get('/library/manifest', async (req, res) => {
    if (!uploadGate(req, res)) return;
    const out = [];
    const walkAll = async (dir) => {
      let entries;
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walkAll(full);
        else if (e.isFile()) {
          const st = await fsp.stat(full).catch(() => null);
          if (st) out.push({ path: path.relative(config.musicDir, full).split(path.sep).join('/'), size: st.size });
        }
      }
    };
    await walkAll(config.musicDir);
    res.set('Cache-Control', 'no-store');
    res.json({ files: out });
  });

  router.put('/library/file', async (req, res) => {
    if (!uploadGate(req, res)) return;
    const target = safeLibraryPath(req.query.path);
    if (!target) return res.status(400).json({ error: 'bad_path', detail: 'Audio files or playlists.json / channels.json, inside the library.' });
    const max = config.uploadMaxMb * 1048576;
    const declared = Number(req.query.size || req.get('content-length') || 0);
    if (declared > max) return res.status(413).json({ error: 'too_large', detail: `Limit is ${config.uploadMaxMb} MB (UPLOAD_MAX_MB).` });
    await fsp.mkdir(path.dirname(target.abs), { recursive: true });
    const tmp = `${target.abs}.upload-${process.pid}-${Date.now()}`;
    let received = 0;
    let tooBig = false;
    const out = fs.createWriteStream(tmp);
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > max && !tooBig) { tooBig = true; req.unpipe(out); out.destroy(); }
    });
    req.pipe(out);
    out.on('error', async () => { await fsp.rm(tmp, { force: true }); if (!res.headersSent) res.status(tooBig ? 413 : 500).json({ error: tooBig ? 'too_large' : 'write_failed' }); });
    out.on('finish', async () => {
      if (tooBig) return;
      if (Number(req.query.size) && received !== Number(req.query.size)) {
        await fsp.rm(tmp, { force: true });
        return res.status(400).json({ error: 'incomplete', detail: `got ${received} of ${req.query.size} bytes` });
      }
      try {
        await fsp.rename(tmp, target.abs);
        res.json({ ok: true, path: target.clean, size: received });
      } catch (err) {
        await fsp.rm(tmp, { force: true });
        res.status(500).json({ error: 'write_failed', detail: err.message });
      }
    });
    req.on('aborted', async () => { out.destroy(); await fsp.rm(tmp, { force: true }); });
  });

  return router;
}

export default apiRouter;
