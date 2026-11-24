import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { originFromEnv } from './lib/origin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

/** The website's public address, as `fire` knows it (deploy/fire.json) — where a notification's tap leads. */
function siteFromFire() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy', 'fire.json'), 'utf8')).site || null; } catch { return null; }
}

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

  // Where the tower broadcasts from (the site's Zone map): STATION_LAT /
  // STATION_LON / STATION_PLACE, optional STATION_TZ. null = not said, and
  // the site uses its own config.json. See server/lib/origin.js.
  stationOrigin: originFromEnv(process.env),

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
  // scripts/site-build.mjs with SITE_TOWER='') instead of the API alone (the Pi-era
  // player in public/ was retired 2026-11-25). Set by deploy/cloud/install.sh on the cloud tower.
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

  // The telegraph line (server/lib/telegraph.js): the one chat room, for
  // whoever is tuned in. On unless TELEGRAPH=0. The line is kept in a log
  // beside the scan cache (so a code update never touches it) unless
  // TELEGRAPH_LOG says where, or `none` for memory only.
  telegraph: process.env.TELEGRAPH !== '0',
  // When the line empties every day (Ortis, 2026-11-13): 05:00 in Paris, the
  // programme's own day boundary. TELEGRAPH_RESET=off keeps everything said.
  telegraphReset: process.env.TELEGRAPH_RESET || '05:00',
  telegraphResetZone: process.env.TELEGRAPH_RESET_TZ || 'Europe/Paris',
  // How many days the log goes back (Ortis, 2026-11-16: the station reads the whole history behind the key).
  // 0 = no limit in days: only the size cap (two files of 5 MB), as before.
  telegraphLogKeepDays: Math.max(0, envInt('TELEGRAPH_LOG_KEEP_DAYS', 0)),
  telegraphLog: process.env.TELEGRAPH_LOG === 'none'
    ? null
    : path.resolve(process.env.TELEGRAPH_LOG || path.join(path.dirname(process.env.CACHE_FILE || path.join(ROOT, '.cache', 'library.json')), 'telegraph.jsonl')),

  // Notifications for the line (server/lib/notify.js; docs/NOTIFICATIONS.md).
  // A — the station's own phone: an ntfy topic's address. Unset = nothing is sent. The topic's name is a
  //     secret (whoever knows it can read what is sent there): it lives in the tower's environment only.
  telegraphNotifyUrl: process.env.TELEGRAPH_NOTIFY_URL || null,
  // B — listeners who ask (« Tell me when someone writes »): Web Push. On with the line unless TELEGRAPH_PUSH=0.
  //     Subscriptions, and the server's key pair unless VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY give one, are kept
  //     beside the line's log; with TELEGRAPH_LOG=none there is nowhere to keep them, and push is off.
  telegraphPush: process.env.TELEGRAPH_PUSH !== '0',
  telegraphPushFile: process.env.TELEGRAPH_PUSH_FILE ? path.resolve(process.env.TELEGRAPH_PUSH_FILE) : null,
  vapidKeys: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : null,
  // Extra origins a subscription may point at, comma-separated: the self-test's stand-in for a push service.
  // Never set on a real tower — the built-in list (Google, Mozilla, Apple, Microsoft) is the protection.
  telegraphPushAllow: (process.env.TELEGRAPH_PUSH_ALLOW || '').split(',').map((s) => s.trim()).filter(Boolean),
  // At most one notification per this many seconds, each way; what arrives meanwhile goes out together.
  telegraphNotifyGapSeconds: Math.max(0, envInt('TELEGRAPH_NOTIFY_GAP_SECONDS', 60)),
  // The website's own address: where a tap on a notification leads, and who the tower says it is to a push service.
  publicSite: process.env.PUBLIC_SITE || siteFromFire(),

  // Rescan the library automatically every N minutes. 0 disables.
  autoRescanMinutes: envInt('AUTO_RESCAN_MINUTES', 30),

  audioExtensions: ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wav', '.webm'],
};

export default config;
