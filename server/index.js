/**
 * Radio Tower — entry point.
 *
 * Boots the station: scans the library, builds the clock, serves the player
 * and the API, and keeps rescanning in the background so newly dropped MP3s
 * join the rotation without a restart.
 */
import express from 'express';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import config, { ROOT } from './config.js';
import { scanLibrary } from './lib/library.js';
import { Station } from './lib/schedule.js';
import { Listeners } from './lib/listeners.js';
import { apiRouter } from './routes/api.js';
import { attachDevReload } from './lib/devReload.js';
import { Collections, isPrivatePath } from './lib/collections.js';

const VERSION = '0.1.0';

const station = new Station([], {
  epoch: config.stationEpoch,
  gapSeconds: config.gapSeconds,
  name: config.stationName,
});
const listeners = new Listeners({ ttlMs: config.listenerTtlMs });
const collections = new Collections({ dir: config.collectionsDir });

const state = {
  version: VERSION,
  startedAt: Date.now(),
  lastScanAt: null,
  lastScanSkipped: [],
  scanning: false,
};

async function rescan({ useCache = true } = {}) {
  if (state.scanning) throw new Error('scan already running');
  state.scanning = true;
  const t0 = Date.now();
  try {
    const result = await scanLibrary({ musicDir: config.musicDir, cacheFile: config.cacheFile, useCache });
    station.setTracks(result.tracks);
    state.lastScanAt = Date.now();
    state.lastScanSkipped = result.skipped;
    const hours = (result.totalSeconds / 3600).toFixed(1);
    console.log(
      `[library] ${result.tracks.length} tracks (${hours}h) in ${Date.now() - t0}ms` +
        (result.skipped.length ? ` — ${result.skipped.length} skipped` : ''),
    );
    for (const s of result.skipped.slice(0, 5)) console.warn(`[library] skipped ${s.relPath}: ${s.reason}`);
    return result;
  } finally {
    state.scanning = false;
  }
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.devReload] wire up the dev-only hot-reload SSE
 *   endpoint (server/lib/devReload.js). Must be decided *here*, before the
 *   catch-all 404 handler below is registered — Express matches routes in
 *   registration order, so a route added to `app` after `createApp()`
 *   returns is unreachable, shadowed by that handler. Defaults to false so
 *   the test suite, which imports and calls this with no arguments, never
 *   opens an fs.watch handle of its own.
 */
export function createApp({ devReload = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true); // sits behind cloudflared

  app.use((req, res, next) => {
    // The player is same-origin, but allowing cross-origin reads means someone
    // can embed the tower in their own page. That is a feature for a radio.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.use('/api', apiRouter({ station, listeners, config, state, rescan, collections }));

  // The files behind the University / Photos / Crates pages. Read-only, and
  // narrower than express.static on its own: `_review/` and `_incoming/` are
  // working folders that must never be reachable, and only the listed file
  // types are served at all (see isPrivatePath). `?download=1` turns any of
  // them into a download instead of an inline view.
  app.use('/collections', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (isPrivatePath(req.path)) return res.status(404).json({ error: 'not_found' });
    next();
  });
  app.use(
    '/collections',
    express.static(collections.dir, {
      index: false,
      dotfiles: 'deny',
      fallthrough: true,
      setHeaders: (res, filePath) => {
        // These change rarely and are large; a day is a fair trade against
        // "I replaced a photo and it still shows the old one".
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (res.req?.query?.download !== undefined) {
          res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath).replace(/"/g, '')}"`);
        }
      },
    }),
  );

  if (devReload) attachDevReload(app, path.join(ROOT, 'public'));

  // Cache policy. The old `maxAge: '1h'` put `Cache-Control: public,
  // max-age=3600` on every .js and .css file, which made two correct deploys
  // look like silent failures (docs/HANDOFF-2026-08-20.md): the browser kept
  // running the ES modules it had already cached and never asked the server
  // whether they had changed. Diagnosed live — `fetch('/viz.js',
  // {cache:'no-store'})` returned the new file while `await import('/viz.js')`
  // returned the old module, and #vizStage's CSS was in the served stylesheet
  // but in no entry of document.styleSheets.
  //
  // That is a listener-facing bug, not a developer annoyance: a stranger who
  // opened the link cannot be told to press Ctrl+Shift+R.
  //
  // `no-cache` does not mean "do not store" — the browser still keeps the file
  // and still revalidates with If-None-Match, so the common case is a 304 with
  // an empty body, not a re-download. express.static's ETag stays on, so this
  // costs one conditional request per file per load and nothing else.
  //
  // /assets/ is the exception: images are large, change rarely, and are
  // referenced by a name that changes when their content does. A week rather
  // than `immutable`, so replacing one in place still resolves itself.
  app.use(
    express.static(path.join(ROOT, 'public'), {
      setHeaders: (res, filePath) => {
        const isAsset = filePath.split(path.sep).includes('assets');
        res.setHeader('Cache-Control', isAsset ? 'public, max-age=604800' : 'no-cache');
      },
    }),
  );

  app.use((req, res) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'internal', detail: err.message });
  });

  return app;
}

export { station, listeners, state, rescan, collections };

// A manually-built `file://${resolved}` string does not percent-encode the
// path, but import.meta.url always does — so this comparison silently failed
// whenever the project lived under a directory with a space (or any other
// character requiring escaping) in its name, e.g. "Radio Tower". The server
// would exit(0) immediately with no output and never open the port.
// pathToFileURL() applies the same encoding import.meta.url uses, so the two
// sides compare correctly regardless of the path's contents.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  // Hot reload for public/, dev only. Nothing in the deploy path sets
  // NODE_ENV except the systemd unit (deploy/radiotower.service), which now
  // sets NODE_ENV=production explicitly so this stays off on a real station.
  const devReload = process.env.NODE_ENV !== 'production';
  const app = createApp({ devReload });
  const server = createServer(app);

  // Listen first, scan second. A cold scan of a large library over slow USB
  // can take minutes, and it used to gate `server.listen()` — the site was
  // simply unreachable for that whole window, indistinguishable from a
  // crashed process. Now the port opens immediately and `/api/health` /
  // `/api/station` report a `scanning` warm-up state (see routes/api.js)
  // until the first scan lands and the station has something to play.
  server.listen(config.port, config.host, () => {
    console.log(`\n  ${config.stationName} v${VERSION}`);
    console.log(`  ${config.stationTagline}`);
    console.log(`  listening on http://${config.host}:${config.port}`);
    console.log(`  music: ${config.musicDir}`);
    console.log(`  epoch: ${new Date(config.stationEpoch).toISOString()}`);
    if (devReload) console.log(`  dev hot-reload: watching public/ (SSE at /api/dev/reload)`);
    console.log(`  warming up — scanning the library now...\n`);
  });

  // Deliberately not awaited: the scan runs alongside a server that is already
  // accepting connections. Awaiting it here would restore exactly the bug the
  // warm-up state was built to fix.
  rescan().catch((err) => console.error('[library] initial scan failed:', err.message));

  if (config.autoRescanMinutes > 0) {
    setInterval(() => {
      rescan().catch((err) => console.error('[library] rescan failed:', err.message));
    }, config.autoRescanMinutes * 60_000).unref();
  }

  const shutdown = (signal) => {
    console.log(`\n[${signal}] going off air...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
