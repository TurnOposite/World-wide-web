#!/usr/bin/env node
/**
 * `npm run collections` — does collections/collection.json match the disk?
 *
 * Prints what each room will show, every manifest entry whose file is missing
 * (those are silently hidden from the pages, so this is the only place they
 * are loud), and anything large enough to hurt on a Pi uplink. Exit 1 when
 * something is missing, so a curator can't publish a manifest with holes.
 *
 *   npm run collections
 *   COLLECTIONS_DIR=/opt/radio-tower/collections npm run collections
 */
import path from 'node:path';
import config from '../server/config.js';
import { Collections } from '../server/lib/collections.js';

const dir = process.argv[2] ? path.resolve(process.argv[2]) : config.collectionsDir;
const view = await new Collections({ dir }).load();
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

console.log(`\n  collections: ${dir}`);
if (!view.ok) {
  console.log(`  ✗ ${view.reason}\n`);
  process.exit(1);
}

const books = view.university.shelves.flatMap((s) => s.books);
const photos = view.photos.albums.reduce((n, a) => n + a.items.length, 0);
console.log(`  Library  ${books.length} books on ${view.university.shelves.length} shelves, ${view.university.maps.layers.length} maps`);
for (const s of view.university.shelves) console.log(`           · ${s.label} — ${s.books.length}`);
console.log(`  Photos   ${photos} in ${view.photos.albums.length} albums`);
console.log(`  Crates   ${view.music.crates.length} hand-picked covers (the rest come from the station's library)`);

const big = [...books.map((b) => b.file), ...view.university.maps.layers].filter((f) => f && f.bytes > 10 * 1048576);
for (const f of big) console.log(`  ! large: ${f.url} (${mb(f.bytes)}) — slow for listeners on the Pi's uplink`);

if (view.missing.length) {
  console.log(`\n  ✗ ${view.missing.length} entr${view.missing.length === 1 ? 'y' : 'ies'} point at files that are not there (hidden from the pages):`);
  for (const m of view.missing) console.log(`      ${m.where}: ${m.file}`);
  console.log('');
  process.exit(1);
}
console.log('  ✓ every listed file is present\n');
