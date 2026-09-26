#!/usr/bin/env node
/**
 * Consolidate scattered music folders onto one drive.
 *
 * The library for this station does not live in one place: it is a Desktop
 * folder, a USB drive root, and two backup trees, which overlap heavily.
 * This script walks all of them, works out what is actually distinct, and
 * copies one clean set to a destination — normally the USB drive that gets
 * plugged into the Pi.
 *
 * It is deliberately a *separate* step from `npm run scan`. Scanning is what
 * the station does to itself, continuously, and must stay fast and read-only.
 * Ingesting is a rare, destructive-ish, human-supervised act. Conflating them
 * would mean a routine rescan could start copying gigabytes.
 *
 *   node scripts/ingest.mjs --dry-run                 # report only, touch nothing
 *   node scripts/ingest.mjs --dest E:/RadioTowerMusic # do it
 *   node scripts/ingest.mjs --dest /mnt/usb --move    # move instead of copy
 *
 * Sources come from --source flags, or from ingest.sources.json at the repo
 * root, or from the built-in defaults below (Ortis's six folders).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { walk } from '../server/lib/library.js';
import { classify, genreBreakdown } from '../server/lib/genre.js';
import { dedupeTracks } from '../server/lib/dedupe.js';
import config from '../server/config.js';

const DEFAULT_SOURCES = [
  'C:/Users/barri/Desktop/Music',
  'E:/Music',
  'E:/Behold the backkup/Musiques',
  "E:/Behold the backkup/Arthur's/Arthur s music",
];

function parseArgs(argv) {
  const opts = { sources: [], dest: null, dryRun: false, move: false, flat: false, limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run' || arg === '-n') opts.dryRun = true;
    else if (arg === '--move') opts.move = true;
    else if (arg === '--flat') opts.flat = true;
    else if (arg === '--source' || arg === '-s') opts.sources.push(argv[++i]);
    else if (arg === '--dest' || arg === '-d') opts.dest = argv[++i];
    else if (arg === '--limit') opts.limit = Number(argv[++i]) || 0;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (!opts.dest) opts.dest = arg;
  }
  return opts;
}

async function loadSources(opts) {
  if (opts.sources.length) return opts.sources;
  try {
    const raw = await fs.readFile(path.join(config.ROOT ?? '.', 'ingest.sources.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
    if (Array.isArray(parsed?.sources) && parsed.sources.length) return parsed.sources;
  } catch {
    /* no config file — fall through to defaults */
  }
  return DEFAULT_SOURCES;
}

const bytes = (n) => {
  if (n < 1024) return `${n}B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)}${units[i]}`;
};

const hhmm = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

/** Strip characters that FAT32/exFAT drives refuse, without mangling the name. */
function safeName(name) {
  return name.replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/\s+$/, '').slice(0, 180);
}

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    console.log(`
Consolidate scattered music folders onto one drive.

  --source, -s <dir>   add a source (repeatable). Default: ingest.sources.json
                       or the built-in list.
  --dest,   -d <dir>   where to write the consolidated library.
  --dry-run, -n        report what would happen; write nothing.
  --move               move files instead of copying (frees the source).
  --flat               one flat folder instead of genre subfolders.
  --limit <n>          only process the first n files (for a trial run).
`);
    return;
  }

  const sources = await loadSources(opts);

  console.log('\n\u001b[1mRadio Tower — library ingest\u001b[0m');
  console.log(`sources : ${sources.length}`);
  for (const s of sources) console.log(`          ${s}`);
  console.log(`dest    : ${opts.dest || '(none — dry run)'}`);
  console.log(`mode    : ${opts.dryRun ? 'DRY RUN' : opts.move ? 'MOVE' : 'COPY'}${opts.flat ? ', flat' : ', by genre'}\n`);

  // --- 1. Collect ---------------------------------------------------------
  let files = [];
  for (const source of sources) {
    let found = [];
    try {
      found = await walk(path.resolve(source));
    } catch {
      /* walk already swallows unreadable dirs; this catches a bad root */
    }
    if (!found.length) {
      console.log(`  \u001b[33m!\u001b[0m ${source} — unreadable or empty (drive not plugged in?)`);
      continue;
    }
    console.log(`  \u001b[32m\u2713\u001b[0m ${source} — ${found.length} audio files`);
    files.push(...found.map((abs) => ({ abs, source })));
  }

  if (!files.length) {
    console.error('\nNo audio found in any source. Is the USB drive plugged in?');
    process.exitCode = 1;
    return;
  }
  if (opts.limit) files = files.slice(0, opts.limit);

  // --- 2. Read metadata ---------------------------------------------------
  // Duration is what makes duplicate detection trustworthy, so it is worth
  // paying the tag-read cost here even though it is the slow part.
  console.log(`\nreading tags from ${files.length} files…`);
  const { parseFile } = await import('music-metadata');
  const tracks = [];
  let done = 0;

  for (const { abs, source } of files) {
    done++;
    if (done % 50 === 0 || done === files.length) {
      process.stdout.write(`\r  ${done}/${files.length}`);
    }
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    let meta = null;
    try {
      meta = await parseFile(abs, { duration: true });
    } catch {
      /* unreadable tags — still ingest it, dedupe falls back to size */
    }
    const relPath = path.relative(source, abs).split(path.sep).join('/');
    const base = path.basename(abs, path.extname(abs));
    const track = {
      abs,
      source,
      relPath,
      size: stat.size,
      duration: Number(meta?.format?.duration) || 0,
      title: (meta?.common?.title || base).trim(),
      artist: (meta?.common?.artist || meta?.common?.albumartist || '').trim(),
      album: (meta?.common?.album || '').trim(),
      genre: (meta?.common?.genre || [])[0] || null,
      codec: meta?.format?.codec || null,
      bitrate: meta?.format?.bitrate ? Math.round(meta.format.bitrate) : null,
    };
    const verdict = classify(track);
    track.genreSlug = verdict.slug;
    track.genreLabel = verdict.label;
    tracks.push(track);
  }
  process.stdout.write('\n');

  // --- 3. Dedupe ----------------------------------------------------------
  const { unique, duplicates } = dedupeTracks(tracks);
  const totalSeconds = unique.reduce((s, t) => s + (t.duration || 0), 0);
  const totalBytes = unique.reduce((s, t) => s + (t.size || 0), 0);
  const dupBytes = duplicates.reduce((s, t) => s + (t.size || 0), 0);

  console.log(`\n\u001b[1mResult\u001b[0m`);
  console.log(`  found      ${tracks.length} files`);
  console.log(`  unique     ${unique.length}  (${bytes(totalBytes)}, ${hhmm(totalSeconds)} of music)`);
  console.log(`  duplicates ${duplicates.length}  (${bytes(dupBytes)} reclaimed)`);

  console.log(`\n\u001b[1mBy genre\u001b[0m`);
  for (const g of genreBreakdown(unique)) {
    const bar = '\u2588'.repeat(Math.max(1, Math.round((g.count / unique.length) * 40)));
    console.log(`  ${g.label.padEnd(18)} ${String(g.count).padStart(4)}  ${bar}`);
  }

  if (duplicates.length) {
    console.log(`\n\u001b[1mDuplicates dropped\u001b[0m (first 25)`);
    for (const d of duplicates.slice(0, 25)) {
      console.log(`  \u2717 ${d.relPath}`);
      console.log(`    kept ${d.duplicateOf}`);
    }
    if (duplicates.length > 25) console.log(`  … and ${duplicates.length - 25} more`);
  }

  // --- 4. Write the manifest ---------------------------------------------
  const manifest = {
    generatedAt: new Date().toISOString(),
    sources,
    counts: { found: tracks.length, unique: unique.length, duplicates: duplicates.length },
    totalSeconds,
    totalBytes,
    genres: genreBreakdown(unique),
    tracks: unique.map((t) => ({
      relPath: t.relPath, source: t.source, size: t.size, duration: t.duration,
      title: t.title, artist: t.artist, album: t.album,
      genreSlug: t.genreSlug, genreLabel: t.genreLabel,
    })),
    dropped: duplicates.map((d) => ({ relPath: d.relPath, source: d.source, duplicateOf: d.duplicateOf })),
  };
  const manifestPath = path.resolve('ingest-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nmanifest → ${manifestPath}`);

  // --- 5. Copy ------------------------------------------------------------
  if (opts.dryRun || !opts.dest) {
    console.log('\n\u001b[33mDry run — nothing was written.\u001b[0m Re-run with --dest <dir> to copy.\n');
    return;
  }

  const dest = path.resolve(opts.dest);
  await fs.mkdir(dest, { recursive: true });
  console.log(`\n${opts.move ? 'moving' : 'copying'} ${unique.length} files → ${dest}`);

  let copied = 0;
  let failed = 0;
  const seen = new Set();

  for (const track of unique) {
    const folder = opts.flat ? '' : track.genreSlug;
    const ext = path.extname(track.abs);
    let base = safeName(path.basename(track.abs, ext));
    let target = path.join(dest, folder, base + ext);

    // Two distinct recordings can still share a filename once sanitised.
    let n = 1;
    while (seen.has(target.toLowerCase())) {
      target = path.join(dest, folder, `${base} (${++n})${ext}`);
    }
    seen.add(target.toLowerCase());

    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      if (opts.move) {
        try {
          await fs.rename(track.abs, target);
        } catch {
          // rename fails across volumes — fall back to copy + unlink
          await fs.copyFile(track.abs, target);
          await fs.unlink(track.abs);
        }
      } else {
        await fs.copyFile(track.abs, target);
      }
      copied++;
      if (copied % 25 === 0 || copied === unique.length) {
        process.stdout.write(`\r  ${copied}/${unique.length}`);
      }
    } catch (err) {
      failed++;
      console.error(`\n  \u001b[31m\u2717\u001b[0m ${track.relPath}: ${err.message}`);
    }
  }
  process.stdout.write('\n');

  console.log(`\n\u001b[32mDone.\u001b[0m ${copied} files, ${failed} failed.`);
  console.log(`\nPoint the station at it:\n  MUSIC_DIR="${dest}" npm start\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
