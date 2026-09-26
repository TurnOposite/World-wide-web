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

  // How far ahead the queue editor can see and rearrange.
  queueWindow: envInt('QUEUE_WINDOW', 12),

  // Slots starting within this many seconds are frozen. Ortis's rule: never
  // disturb the current track, and keep a minute's margin beyond it so a
  // reorder cannot land on something a listener has already begun buffering.
  queueLockSeconds: envInt('QUEUE_LOCK_SECONDS', 60),

  // A listener is considered "tuned in" if it pinged within this window (ms).
  listenerTtlMs: envInt('LISTENER_TTL_MS', 45_000),

  // Rescan the library automatically every N minutes. 0 disables.
  autoRescanMinutes: envInt('AUTO_RESCAN_MINUTES', 30),

  audioExtensions: ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wav', '.webm'],
};

export default config;
