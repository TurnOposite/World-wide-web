#!/usr/bin/env node
/**
 * The portfolio's data for the static site: site/data/collections.json.
 *
 * Built by the very same code the Pi uses to answer GET /api/collections
 * (server/lib/collections.js) — so the static site publishes exactly what the
 * manifest publishes, drops exactly what is missing, and never exposes the
 * private _review/ and _incoming/ folders. The only difference is that URLs
 * become relative ("collections/…") so they resolve under any <base>.
 *
 *   node scripts/site-collections.mjs           # write
 *   node scripts/site-collections.mjs --check   # exit 1 if stale
 *   node scripts/site-collections.mjs --files   # print the files it references
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Collections } from '../server/lib/collections.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site/data/collections.json');

export async function buildView(dir = path.join(ROOT, 'collections')) {
  const view = await new Collections({ dir }).load();
  const files = new Set();
  const rel = (u) => {
    if (typeof u !== 'string' || !u.startsWith('/collections/')) return u;
    files.add(decodeURIComponent(u.slice('/collections/'.length)));
    return u.slice(1);
  };
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return rel(v);
  };
  const out = walk(view);
  delete out.missing;
  return { view: out, files: [...files].sort() };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { view, files } = await buildView();
  const text = JSON.stringify(view, null, 1) + '\n';
  if (process.argv.includes('--files')) console.log(files.join('\n'));
  else if (process.argv.includes('--check')) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (have !== text) { console.error('  ✗ site/data/collections.json is stale — run node scripts/site-collections.mjs'); process.exit(1); }
    console.log(`  ✓ collections.json matches the manifest (${files.length} files)`);
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`  ✓ wrote site/data/collections.json — ${files.length} files published`);
  }
}
