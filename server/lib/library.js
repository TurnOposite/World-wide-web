/**
 * Library scanning.
 *
 * Walks the music directory, reads duration + tags for every audio file, and
 * caches the result to disk. The cache is keyed on (path, size, mtime) so a
 * rescan on a Raspberry Pi only pays the metadata cost for files that actually
 * changed — important when the library is thousands of files on a USB drive.
 */
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../config.js';
import { classify } from './genre.js';
import { dedupeTracks } from './dedupe.js';

/** Stable, filesystem-independent id for a track. */
export function trackId(relPath) {
  return crypto.createHash('sha1').update(relPath).digest('hex').slice(0, 12);
}

/** Recursively collect audio file paths under `dir`. */
export async function walk(dir, exts = config.audioExtensions, acc = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, exts, acc);
    } else if (entry.isFile() && exts.includes(path.extname(entry.name).toLowerCase())) {
      acc.push(full);
    }
  }
  return acc;
}

function titleFromFilename(file) {
  return path
    .basename(file, path.extname(file))
    .replace(/^\d+[\s._-]+/, '')
    .replace(/[_]+/g, ' ')
    .trim();
}

async function readCache(cacheFile) {
  try {
    const raw = await fs.readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(raw);
    const byKey = new Map();
    for (const t of parsed.tracks || []) byKey.set(`${t.relPath}:${t.size}:${t.mtimeMs}`, t);
    return byKey;
  } catch {
    return new Map();
  }
}

async function writeCache(cacheFile, tracks) {
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  const tmp = `${cacheFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ version: 1, scannedAt: Date.now(), tracks }, null, 0));
  await fs.rename(tmp, cacheFile);
}

/**
 * Scan the music directory into a track list.
 *
 * The returned `tracks` are deduplicated: the library is assembled by hand
 * from several overlapping folders, and a duplicate would otherwise play
 * twice per cycle. `duplicates` reports what was dropped and why, so
 * `npm run scan` can show it rather than silently losing files.
 *
 * @returns {Promise<{tracks: Array, skipped: Array, duplicates: Array, totalSeconds: number, musicDir: string}>}
 */
export async function scanLibrary({
  musicDir = config.musicDir,
  cacheFile = config.cacheFile,
  useCache = true,
  dedupe = true,
  onProgress = null,
} = {}) {
  const files = (await walk(musicDir)).sort();
  const cache = useCache ? await readCache(cacheFile) : new Map();

  // music-metadata is ESM-only and heavy; import it lazily so unit tests that
  // never touch real audio stay fast.
  let parseFile = null;

  const tracks = [];
  const skipped = [];
  let done = 0;

  for (const file of files) {
    const relPath = path.relative(musicDir, file).split(path.sep).join('/');
    let stat;
    try {
      stat = await fs.stat(file);
    } catch {
      skipped.push({ relPath, reason: 'unreadable' });
      continue;
    }

    const key = `${relPath}:${stat.size}:${stat.mtimeMs}`;
    const cached = cache.get(key);
    if (cached) {
      tracks.push(cached);
      done++;
      onProgress?.(done, files.length, relPath, true);
      continue;
    }

    if (!parseFile) ({ parseFile } = await import('music-metadata'));

    try {
      const meta = await parseFile(file, { duration: true });
      const duration = Number(meta.format?.duration || 0);
      if (!Number.isFinite(duration) || duration <= 0.5) {
        skipped.push({ relPath, reason: 'no usable duration' });
        continue;
      }
      tracks.push({
        id: trackId(relPath),
        relPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        duration: Math.round(duration * 1000) / 1000,
        title: (meta.common?.title || titleFromFilename(file)).trim(),
        artist: (meta.common?.artist || meta.common?.albumartist || 'Unknown artist').trim(),
        album: (meta.common?.album || '').trim(),
        year: meta.common?.year || null,
        genre: (meta.common?.genre || [])[0] || null,
        hasArt: Boolean(meta.common?.picture?.length),
        codec: meta.format?.codec || null,
        bitrate: meta.format?.bitrate ? Math.round(meta.format.bitrate) : null,
      });
    } catch (err) {
      skipped.push({ relPath, reason: err.message });
    }
    done++;
    onProgress?.(done, files.length, relPath, false);
  }

  // Classify after the metadata pass, and re-classify anything restored from
  // a cache written before genres existed — the rules in genre.js change more
  // often than the audio does, so the cache must never pin an old verdict.
  for (const track of tracks) {
    const verdict = classify(track);
    track.genreSlug = verdict.slug;
    track.genreLabel = verdict.label;
    // The hue the visualiser keys its palette off. Carried on the track (and
    // so through publicTrack to the API) rather than looked up client-side,
    // because that would mean a second copy of the GENRES table living in
    // public/ — and a copy that silently drifts the first time someone adds a
    // bucket here. `server/lib/genre.js` stays the single source of truth.
    track.genreAccent = verdict.accent;
  }

  tracks.sort((a, b) => a.relPath.localeCompare(b.relPath));
  // Cache the full scan, duplicates included: the cache exists to avoid
  // re-reading tags off a slow USB drive, and a file that is a duplicate
  // today may be the survivor tomorrow if its twin is deleted.
  if (useCache) await writeCache(cacheFile, tracks);

  const { unique, duplicates } = dedupe ? dedupeTracks(tracks) : { unique: tracks, duplicates: [] };

  return {
    tracks: unique,
    skipped,
    duplicates,
    musicDir,
    totalSeconds: unique.reduce((s, t) => s + t.duration, 0),
  };
}

/**
 * Resolve a track id back to an absolute path, refusing anything that escapes
 * the music directory. This is the only place user input becomes a filesystem
 * path, so the containment check lives here and nowhere else.
 */
export function resolveTrackPath(track, musicDir = config.musicDir) {
  const abs = path.resolve(musicDir, track.relPath);
  const root = path.resolve(musicDir);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`path escapes music directory: ${track.relPath}`);
  }
  if (!fssync.existsSync(abs)) throw new Error(`missing file: ${track.relPath}`);
  return abs;
}

export default { scanLibrary, walk, trackId, resolveTrackPath };
