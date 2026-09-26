#!/usr/bin/env node
/**
 * Copy the station's shared, dependency-free modules into the site.
 *
 * The static site runs the *same* clock as the Pi, not a port of it. Rather
 * than a bundler (BRIEF.md: no build step) the two files are copied verbatim;
 * tests/site-sync.test.js fails if a copy ever drifts from its source.
 *
 *   node scripts/site-sync.mjs          # copy
 *   node scripts/site-sync.mjs --check  # exit 1 if anything is out of date
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SYNCED = [
  ['server/lib/schedule.js', 'site/js/lib/schedule.js'],
  ['server/lib/payloads.js', 'site/js/lib/payloads.js'],
  ['dj/moods.json', 'site/station/moods.json'],
  // The visualiser's pure maths (palette, bands, onset detection, squircle,
  // tiers) — pinned by tests/viz.test.js. The site's full-page stage builds
  // on these rather than re-deriving them.
  ['public/viz.js', 'site/js/lib/viz-core.js'],
  // The queue editor's pure helpers (movableWindow, applyMove, isPermutation)
  // — pinned by tests/queue-ui.test.js.
  ['public/queue.js', 'site/js/lib/queue-core.js'],
];

const BANNER = (src) => `// GENERATED — copied verbatim from ${src} by scripts/site-sync.mjs. Edit the source, not this file.\n`;

export function expected(src) {
  const body = fs.readFileSync(path.join(ROOT, src), 'utf8');
  return src.endsWith('.js') ? BANNER(src) + body : body;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [src, dst] of SYNCED) {
    const want = expected(src);
    const abs = path.join(ROOT, dst);
    const have = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (have === want) continue;
    stale++;
    if (check) { console.error(`  ✗ ${dst} is out of date with ${src} — run: node scripts/site-sync.mjs`); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, want);
    console.log(`  ↻ ${dst}`);
  }
  if (check && stale) process.exit(1);
  if (!stale) console.log('  ✓ site/js/lib is in sync with server/lib');
}
