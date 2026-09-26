/**
 * Duplicate detection.
 *
 * Ortis's library is six folders that were never a single collection: a
 * laptop Desktop folder, a USB drive, and two backup trees. They overlap
 * heavily and unevenly — `E:\Music` and `Desktop\Music\April music re-up`
 * share whole albums (the entire `undersaken - Music Has the Right to Barber`
 * run, the `silph skyline` Snowpoint set), sometimes as `.mp3` in one place
 * and `.m4a` in another, sometimes with a `(1)` suffix from a second download.
 *
 * A duplicate is not merely wasted disk. Because the schedule plays every
 * track in the library exactly once per cycle (see schedule.js), a duplicate
 * means the same song plays twice a cycle — which is precisely the thing a
 * listener notices and a station should never do.
 *
 * Why this lives in the library rather than in a one-off cleanup script:
 * the drive is meant to be swapped and re-filled by hand. A cleanup that ran
 * once, in August, protects nothing in September. Making it intrinsic to the
 * scan means the invariant "no track plays twice in a cycle" holds no matter
 * what gets dragged onto the drive later.
 *
 * See docs/DECISIONS.md, 2026-08-19.
 */

import { foldText } from './genre.js';

/**
 * Reduce a filename to the song it is probably naming.
 *
 * Removes, in order: the extension, a leading track number, a trailing
 * download-tool suffix, a trailing `(1)`-style duplicate marker, bracketed
 * qualifiers that don't change the recording (`[Official Audio]`,
 * `(Official Music Video)`, `(Audio)`), then all non-alphanumerics.
 *
 * Deliberately *not* removed: "(slowed + reverb)", "(remix)", "(Extended
 * Version)", "[AI Cover]" — those are different recordings and must survive
 * as distinct tracks.
 */
export function normalizeTitle(input) {
  let s = foldText(String(input || ''));

  s = s.replace(/\.(mp3|m4a|aac|ogg|oga|opus|flac|wav|webm|wma)$/g, '');
  // Some files in this library are literally "name.mp3.mp3".
  s = s.replace(/\.(mp3|m4a|aac|ogg|oga|opus|flac|wav|webm|wma)$/g, '');

  // Leading track number: "03 Invention", "01. Ready or Not", "1 - Taurus".
  // Two shapes are allowed — two-plus digits followed by space, or any digits
  // followed by real punctuation — and the remainder must begin with a
  // letter. Both guards matter: a bare `\d+[-\s]` would turn Gorillaz'
  // "19-2000" into "2000", and would eat the "1990" in "1990s Low Poly".
  s = s.replace(/^\s*(?:\d{2,3}\s*[-._)]?\s+|\d{1,3}\s*[-._)]\s*)(?=[a-z])/, '');
  s = s.replace(/\(getmp3[^)]*\)/g, '');                   // "(getmp3.pro)"
  s = s.replace(/\[(official[^\]]*|audio|hd|hq|4k|lyrics?)\]/g, '');
  s = s.replace(/\((official[^)]*|audio|hd|hq|4k|lyrics?)\)/g, '');
  s = s.replace(/[\s(_-]*\(\d\)\s*$/, '');                 // trailing "(1)"
  s = s.replace(/[\s_-]*\(\d\)$/, '');

  s = s.replace(/[^a-z0-9]+/g, '');
  return s;
}

/**
 * Which of two duplicates should the station keep?
 *
 * Higher bitrate wins, then larger file, then lossless container, then the
 * shorter relative path (a file sitting at the top of the drive is more
 * likely the "real" copy than one buried in a backup tree), then the path
 * itself as a final tiebreak.
 *
 * That last clause is not decoration: the resolution has to be *total* and
 * deterministic. Two scans of the same drive must drop the same file, or the
 * library revision flaps between rescans and the schedule re-eras itself
 * every 30 minutes for no reason.
 */
const LOSSLESS = new Set(['flac', 'wav', 'alac']);

export function preferredOf(a, b) {
  const bitrate = (t) => (Number.isFinite(t.bitrate) ? t.bitrate : 0);
  const lossless = (t) => (LOSSLESS.has(String(t.codec || '').toLowerCase()) ? 1 : 0);
  const depth = (t) => String(t.relPath || '').split('/').length;

  // A "(1)" or "(0)" suffix is the fingerprint of a second download, so the
  // copy without one is the original. Cosmetic — both files are the same
  // audio — but it keeps the library's filenames tidy.
  const marked = (t) => (/[\s(_-]*\(\d\)\s*\.[a-z0-9]+$/i.test(String(t.relPath || '')) ? 1 : 0);

  if (bitrate(a) !== bitrate(b)) return bitrate(a) > bitrate(b) ? a : b;
  if (lossless(a) !== lossless(b)) return lossless(a) > lossless(b) ? a : b;
  if ((a.size || 0) !== (b.size || 0)) return (a.size || 0) > (b.size || 0) ? a : b;
  if (marked(a) !== marked(b)) return marked(a) < marked(b) ? a : b;
  if (depth(a) !== depth(b)) return depth(a) < depth(b) ? a : b;
  return String(a.relPath) <= String(b.relPath) ? a : b;
}

/**
 * Partition a track list into the set the station will play and the copies it
 * will ignore.
 *
 * Two tracks are the same recording when their normalised titles match AND
 * their durations agree to within `toleranceSeconds`. Duration is the guard
 * that stops "Main Theme" from a dozen different soundtracks collapsing into
 * one entry; the title is the guard that stops two genuinely different
 * three-minute songs colliding on duration alone.
 *
 * Byte-identical files (same size, same normalised title) are treated as
 * duplicates regardless of duration, which catches the case where metadata
 * failed to parse on one copy.
 *
 * @param {Array} tracks
 * @param {object} [opts]
 * @param {number} [opts.toleranceSeconds=2]
 * @returns {{unique: Array, duplicates: Array}} `duplicates` entries carry
 *   `{ ...track, duplicateOf }` so the scan report can name both sides.
 */
export function dedupeTracks(tracks = [], { toleranceSeconds = 2 } = {}) {
  // Sort first so the walk order — and therefore the outcome — does not
  // depend on readdir order on whatever filesystem the drive is formatted as.
  const sorted = tracks.slice().sort((a, b) => String(a.relPath).localeCompare(String(b.relPath)));

  /** @type {Map<string, Array<{keep: object}>>} */
  const buckets = new Map();
  const duplicates = [];

  for (const track of sorted) {
    const key = normalizeTitle(track.title || track.relPath);
    if (!key) {
      // No usable name to compare on — keep it rather than guess.
      buckets.set(`\u0000${track.relPath}`, [{ keep: track }]);
      continue;
    }

    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, [{ keep: track }]);
      continue;
    }

    const duration = Number(track.duration) || 0;
    const slot = bucket.find((entry) => {
      const other = Number(entry.keep.duration) || 0;
      if (Math.abs(other - duration) <= toleranceSeconds) return true;
      // Same title and byte-identical size: same file, one of which has
      // unreadable metadata.
      return track.size && entry.keep.size === track.size;
    });

    if (!slot) {
      bucket.push({ keep: track });
      continue;
    }

    const winner = preferredOf(slot.keep, track);
    const loser = winner === slot.keep ? track : slot.keep;
    slot.keep = winner;
    duplicates.push({ ...loser, duplicateOf: winner.relPath });
  }

  const unique = [];
  for (const bucket of buckets.values()) for (const entry of bucket) unique.push(entry.keep);
  unique.sort((a, b) => String(a.relPath).localeCompare(String(b.relPath)));

  duplicates.sort((a, b) => String(a.relPath).localeCompare(String(b.relPath)));
  return { unique, duplicates };
}

export default { dedupeTracks, normalizeTitle, preferredOf };
