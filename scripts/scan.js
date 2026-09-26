#!/usr/bin/env node
/**
 * Radio Tower — library scanner.
 *
 * Scans the music directory and reports what the station will play. Run it
 * before the first boot to see what your files look like to the tower, and
 * afterwards to find files that were skipped.
 *
 *   node scripts/scan.js                 # scan, using the cache
 *   node scripts/scan.js --fresh         # ignore the cache
 *   node scripts/scan.js --list          # print every track
 */
import config from '../server/config.js';
import { scanLibrary } from '../server/lib/library.js';

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const list = args.includes('--list');

const fmtHms = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`;
};

console.log(`\n  scanning ${config.musicDir}${fresh ? ' (fresh)' : ''}\n`);

let lastPct = -1;
const t0 = Date.now();
const { tracks, skipped, totalSeconds } = await scanLibrary({
  useCache: !fresh,
  onProgress: (done, total) => {
    const pct = Math.floor((done / total) * 100);
    if (pct !== lastPct && pct % 5 === 0) {
      process.stdout.write(`\r  ${pct}%  (${done}/${total})   `);
      lastPct = pct;
    }
  },
});
process.stdout.write('\r' + ' '.repeat(40) + '\r');

const artists = new Set(tracks.map((t) => t.artist));
const albums = new Set(tracks.map((t) => t.album).filter(Boolean));

console.log(`  ${tracks.length} playable tracks`);
console.log(`  ${artists.size} artists · ${albums.size} albums`);
console.log(`  ${fmtHms(totalSeconds)} of audio — one full cycle of the station`);
console.log(`  scanned in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Genre breakdown — every track is already classified during scanLibrary()
// (server/lib/genre.js is the single source of truth; see docs/DECISIONS.md
// "Genre hue is carried on the track, not duplicated in the browser"). This
// was previously invisible from the CLI — the only way to see the library's
// genre shape was to read the API or the code — which made "what genres does
// this library actually have" a harder question than it needed to be.
if (tracks.length) {
  const counts = new Map();
  for (const t of tracks) {
    const key = t.genreSlug || 'unsorted';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n  genres:`);
  for (const [slug, count] of rows) {
    const pct = ((count / tracks.length) * 100).toFixed(1);
    console.log(`    ${String(count).padStart(3)}  ${slug.padEnd(14)} ${pct}%`);
  }
}

if (skipped.length) {
  console.log(`\n  ${skipped.length} file(s) skipped:`);
  for (const s of skipped.slice(0, 25)) console.log(`    ${s.relPath}  —  ${s.reason}`);
  if (skipped.length > 25) console.log(`    …and ${skipped.length - 25} more`);
}

if (list) {
  console.log('');
  for (const t of tracks) {
    const mins = `${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration % 60)).padStart(2, '0')}`;
    const genre = (t.genreSlug || 'unsorted').padEnd(14);
    console.log(`  ${mins.padStart(6)}  ${genre}  ${t.artist} — ${t.title}`);
  }
}

if (!tracks.length) {
  console.log(`\n  Nothing to play. Put audio files in ${config.musicDir} and run this again.`);
  process.exit(1);
}
console.log('');
