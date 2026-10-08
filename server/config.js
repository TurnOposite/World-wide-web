import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  // Network
  port: envInt('PORT', 8080),
  host: process.env.HOST || '0.0.0.0',

  // Where the MP3s live. On the Pi this is usually an external drive,
  // e.g. /mnt/music or /media/pi/MUSIC.
  musicDir: path.resolve(process.env.MUSIC_DIR || path.join(ROOT, 'music')),

  // The University / Photos / Crates pages: a folder holding collection.json
  // and the files it lists. Missing folder = empty pages, never a crash.
  collectionsDir: path.resolve(process.env.COLLECTIONS_DIR || path.join(ROOT, 'collections')),

  // Where the scanned library cache is written.
  cacheFile: path.resolve(process.env.CACHE_FILE || path.join(ROOT, '.cache', 'library.json')),
  // Which channels to offer (server/lib/channels.js). Lives beside the music
  // by default, so the library carries its own channel list wherever it goes.
  channelsFile: path.resolve(process.env.CHANNELS_FILE || path.join(process.env.MUSIC_DIR || path.join(ROOT, 'music'), 'channels.json')),

  // The station epoch. The whole schedule is derived from this instant,
  // so the position is reproducible across restarts and across machines.
  // Changing it reshuffles history. Keep it fixed once you go live.
  stationEpoch: Date.parse(process.env.STATION_EPOCH || '2026-01-01T00:00:00Z'),

  // Silence inserted between tracks, in seconds.
  gapSeconds: Number(process.env.GAP_SECONDS ?? 0),

  // Station identity, surfaced in the UI and in /api/station.
  stationName: process.env.STATION_NAME || 'Radio Tower',
  stationTagline: process.env.STATION_TAGLINE || 'One signal. Everyone on the same second.',

  // How many upcoming tracks /api/station reveals.
  lookahead: envInt('LOOKAHEAD', 5),

  // Queue reordering. Unset STATION_KEY disables the write endpoints
  // entirely — this station is designed to sit on a public tunnel, so an
  // unauthenticated write surface must never be the default. Generate one
  // with: node -e "console.log(crypto.randomUUID())"
  stationKey: process.env.STATION_KEY || null,

  // Receiving music over HTTP (PUT /api/library/file) — how the library bot
  // on the laptop fills a tower in the cloud (library/bot.mjs publish). Off
  // unless ALLOW_UPLOADS=1, and even then only with the station key.
  allowUploads: process.env.ALLOW_UPLOADS === '1',

  // Serve the full website (the site/ edition, built into a folder by
  // scripts/site-build.mjs with SITE_TOWER='') instead of the Pi's own page
  // in public/. Set by deploy/cloud/install.sh on the cloud tower.
  siteDir: process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : null,
  uploadMaxMb: envInt('UPLOAD_MAX_MB', 1024),

  // How far ahead the queue editor can see and rearrange.
  queueWindow: envInt('QUEUE_WINDOW', 12),

  // Slots starting within this many seconds are frozen. Ortis's rule: never
  // disturb the current track, and keep a minute's margin beyond it so a
  // reorder cannot land on something a listener has already begun buffering.
  queueLockSeconds: envInt('QUEUE_LOCK_SECONDS', 60),

  // A listener is considered "tuned in" if it pinged within this window (ms).
  listenerTtlMs: envInt('LISTENER_TTL_MS', 45_000),

  // Per-address budget on /api (server/lib/ratelimit.js, roadmap #14): a
  // burst of RATE_BURST requests, refilled at RATE_PER_SECOND. Generous —
  // a whole classroom behind one address polls well under it — and aimed
  // only at floods. RATE_BURST=0 turns it off. Requests from this machine
  // itself (the healthcheck, the booth on the Pi) never count.
  rateBurst: envInt('RATE_BURST', 300),
  ratePerSecond: Number(process.env.RATE_PER_SECOND ?? 5),

  // Rescan the library automatically every N minutes. 0 disables.
  autoRescanMinutes: envInt('AUTO_RESCAN_MINUTES', 30),

  audioExtensions: ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wav', '.webm'],
};

export default config;
