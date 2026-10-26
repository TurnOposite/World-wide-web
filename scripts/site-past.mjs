#!/usr/bin/env node
/**
 * The versions of the past (docs/ATELIER.md): frozen copies of the site that
 * stay reachable at /past/<id>/, each online or offline in
 * site/data/layout.json, each with a window on the world.
 *
 *   node scripts/site-past.mjs                         # what is frozen, and whether it is online
 *   node scripts/site-past.mjs snapshot <id> <ref>     # freeze site/ as it was at a commit, branch or tag
 *
 * A snapshot is past/<id>/: that commit's site/ folder, less what the build
 * fills in from today — station/ (an old page plays today's radio, not the
 * programme of the day it was frozen) and the press, fonts and images that
 * are byte for byte today's. past/<id>/SNAPSHOT.json says where it came from.
 * A snapshot is never edited by hand: it is what the site was.
 *
 * The build (site-build.mjs, assemble below) lays each online version out
 * under dist/past/<id>/ — today's shared files first, the snapshot over them —
 * with its own <base>, a shell at each of its routes, today's tower, and the
 * bar (site/past/bar.js) that ties it to the rest of the site. An offline
 * version is not built at all: its address answers as any unknown one does.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FAR, pointHome } from '../site/js/refs.js';

export { FAR, pointHome };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Filled from today's site at build time, so a snapshot does not carry its own copy. */
export const SHARED = ['press', 'fonts', 'assets', 'collections'];
/**
 * …of which these are small, and copied under the version (its CSS reaches
 * them by relative url()). The heavy rest (refs.js FAR) is not copied: the
 * version's data names it at today's copy (pointHome).
 */
const NEAR = ['fonts', 'assets'];
/** Never frozen: an old page plays today's programme. */
export const LIVE = ['station'];

const git = (args, o = {}) => execFileSync('git', args, { cwd: o.cwd || ROOT, maxBuffer: 256 * 1024 * 1024, ...o });

/**
 * Freeze site/ at `ref` into past/<id>/. Refuses to overwrite a snapshot:
 * a version of the past is not something to retake by accident.
 */
export function snapshot(id, ref, { root = ROOT, quiet = false } = {}) {
  if (!/^[a-z][a-z0-9-]{0,23}$/.test(id)) throw new Error(`"${id}" is not a usable id (a-z, 0-9, -)`);
  const dir = path.join(root, 'past', id);
  if (fs.existsSync(path.join(dir, 'SNAPSHOT.json'))) throw new Error(`past/${id}/ already exists — a snapshot is never retaken; pick another id`);
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  const names = git(['ls-tree', '-r', '-z', '--name-only', commit, '--', 'site'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const kept = [];
  const filled = [];
  for (const name of names) {
    const rel = name.slice('site/'.length);
    const top = rel.split('/')[0];
    if (LIVE.includes(top)) continue;
    const bytes = git(['show', `${commit}:${name}`], { cwd: root });
    if (SHARED.includes(top)) {
      const today = path.join(root, 'site', rel);
      if (fs.existsSync(today) && fs.readFileSync(today).equals(bytes)) { filled.push(rel); continue; }
    }
    const out = path.join(dir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, bytes);
    kept.push(rel);
  }
  if (!kept.includes('index.html')) throw new Error(`${ref} has no site/index.html — not a version of this site`);
  const meta = { id, ref, commit, takenAt: new Date().toISOString(), files: kept.length, fromToday: filled.length };
  fs.writeFileSync(path.join(dir, 'SNAPSHOT.json'), JSON.stringify(meta, null, 2) + '\n');
  if (!quiet) console.log(`  ✓ past/${id}/ — ${kept.length} files from ${commit.slice(0, 7)} (${ref}); ${filled.length} shared with today, filled in at build`);
  return meta;
}

/** <base>, the version's name for the bar, and the bar itself (a module from today's site). */
export function pastShell(html, { id, base = '/' }) {
  const own = `${base}past/${id}/`;
  return html
    .replace(/<base href="[^"]*">/, `<base href="${own}">`)
    .replace('</head>', `<meta name="gt-past" content="${id}">\n<script type="module" src="${base}past/bar.js"></script>\n</head>`);
}

/**
 * The version's config.json: its own settings, but today's tower — a frozen
 * page that pointed at a server since moved would go silent — and today's
 * repository for its booth.
 */
export function pastConfig(own, today) {
  const cfg = { ...own };
  for (const k of ['mode', 'tower', 'github']) if (today[k] !== undefined) cfg[k] = today[k];
  delete cfg.world;
  return cfg;
}

/** Every address of a version that should answer 200 on a cold load, from its route list and its own data. */
export function pastRoutes(page, { texts = [], echo = [] } = {}) {
  const has = (r) => page.routes.includes(r);
  const out = page.routes.filter((r) => r !== '');
  if (has('ecrits')) out.push(...texts.map((t) => `ecrits/${t.slug}`));
  if (has('echo/lectures')) out.push(...texts.map((t) => `echo/lectures/${t.slug}`));
  if (has('echo')) out.push(...echo.map((a) => `echo/${a.slug}`));
  if (has('portfolio')) out.push('portfolio/library', 'portfolio/photos', 'portfolio/crates');
  return [...new Set(out)];
}

async function copyTree(src, dst) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  await fsp.mkdir(dst, { recursive: true });
  for (const e of await fsp.readdir(src, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) n += await copyTree(s, d);
    else { await fsp.copyFile(s, d); n++; }
  }
  return n;
}

const readJson = async (f, fallback) => { try { return JSON.parse(await fsp.readFile(f, 'utf8')); } catch { return fallback; } };

/**
 * Lay out one online version under dist/past/<id>/ (called by site-build.mjs
 * after today's site is in dist/). Today's small shared folders and station
 * go in first, then the snapshot over them, so the snapshot always wins
 * where it has a file; its data then names the heavy ones at today's copy.
 */
export async function assemble(page, { dist, base = '/', root = ROOT }) {
  const src = path.join(root, 'past', page.id);
  if (!fs.existsSync(path.join(src, 'index.html'))) throw new Error(`${page.id} is online in layout.json but past/${page.id}/ holds no snapshot (node scripts/site-past.mjs snapshot ${page.id} <ref>)`);
  const out = path.join(dist, 'past', page.id);
  await fsp.rm(out, { recursive: true, force: true });
  let files = 0;
  for (const dir of [...NEAR, ...LIVE]) files += await copyTree(path.join(dist, dir), path.join(out, dir));
  files += await copyTree(src, out);
  await fsp.rm(path.join(out, 'SNAPSHOT.json'), { force: true });
  const kept = (rel) => fs.existsSync(path.join(src, rel));
  for (const f of fs.existsSync(path.join(out, 'data')) ? await fsp.readdir(path.join(out, 'data')) : []) {
    if (!f.endsWith('.json')) continue;
    const file = path.join(out, 'data', f);
    await fsp.writeFile(file, JSON.stringify(pointHome(JSON.parse(await fsp.readFile(file, 'utf8')), kept), null, 1) + '\n');
  }
  const shell = pastShell(await fsp.readFile(path.join(src, 'index.html'), 'utf8'), { id: page.id, base });
  await fsp.writeFile(path.join(out, 'index.html'), shell);
  const today = await readJson(path.join(dist, 'config.json'), {});
  const own = await readJson(path.join(src, 'config.json'), {});
  await fsp.writeFile(path.join(out, 'config.json'), JSON.stringify(pastConfig(own, today), null, 2) + '\n');
  const texts = (await readJson(path.join(src, 'data/texts.json'), {})).texts || [];
  const echo = (await readJson(path.join(src, 'data/echo.json'), {})).articles || [];
  const routes = pastRoutes(page, { texts, echo });
  for (const r of routes) {
    await fsp.mkdir(path.join(out, r), { recursive: true });
    await fsp.writeFile(path.join(out, r, 'index.html'), shell);
  }
  return { id: page.id, files, routes: routes.length };
}

/**
 * For the local server (site-serve.mjs): the file a request under
 * /past/<id>/ stands for, read from the snapshot, then today's site for the
 * shared folders — the same overlay the build makes, without a build. null
 * means "not this version's": the caller answers as for any unknown path.
 * An address with no extension is the version's shell.
 */
export async function devPastFile(id, rel, { root = ROOT, base = '/', today = {} } = {}) {
  const src = path.join(root, 'past', id);
  if (!/^[a-z][a-z0-9-]{0,23}$/.test(id) || !fs.existsSync(path.join(src, 'index.html'))) return null;
  // A URL path, so POSIX whatever the machine: on Windows path.normalize would turn it into backslashes.
  const clean = path.posix.normalize(String(rel).replace(/\\/g, '/')).replace(/^\/+/, '').replace(/^\.$/, '');
  if (clean.startsWith('..')) return null;
  const top = clean.split('/')[0];
  if (clean === 'config.json') {
    const own = await readJson(path.join(src, 'config.json'), {});
    return { json: pastConfig(own, today) };
  }
  if (clean === 'SNAPSHOT.json') return null;
  // The same data the build writes: heavy shared files named at today's copy.
  if (/^data\/[^/]+\.json$/.test(clean) && fs.existsSync(path.join(src, clean))) {
    return { json: pointHome(JSON.parse(await fsp.readFile(path.join(src, clean), 'utf8')), (rel) => fs.existsSync(path.join(src, rel))) };
  }
  const own = path.join(src, clean);
  if (clean && fs.existsSync(own) && fs.statSync(own).isFile() && clean !== 'index.html') return { file: own };
  if (SHARED.includes(top) || LIVE.includes(top)) return top === 'collections' ? { collections: clean.slice('collections/'.length) } : { file: path.join(root, 'site', clean) };
  if (!path.extname(clean)) return { html: pastShell(await fsp.readFile(path.join(src, 'index.html'), 'utf8'), { id, base }) };
  return null;
}

/** What past/ holds, read from disk. */
export function listSnapshots(root = ROOT) {
  const dir = path.join(root, 'past');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())
    .map((e) => ({ id: e.name, ...(JSON.parse(fs.readFileSync(path.join(dir, e.name, 'SNAPSHOT.json'), 'utf8'))) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, id, ref] = process.argv.slice(2);
  try {
    if (cmd === 'snapshot') {
      if (!id || !ref) throw new Error('usage: node scripts/site-past.mjs snapshot <id> <git-ref>');
      snapshot(id, ref);
      console.log(`  Next: give it a window — an entry with "id": "${id}", "era": "past" in site/data/layout.json (docs/ATELIER.md), or the Atelier.`);
    } else if (!cmd || cmd === 'list') {
      const layout = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data/layout.json'), 'utf8'));
      const status = new Map(layout.pages.filter((p) => p.era === 'past').map((p) => [p.id, p.status]));
      for (const s of listSnapshots()) console.log(`  ${s.id.padEnd(8)} ${String(status.get(s.id) || 'no window').padEnd(10)} ${s.commit.slice(0, 7)}  ${s.ref}  (${s.files} files, taken ${s.takenAt.slice(0, 10)})`);
      for (const [pid, st] of status) if (!listSnapshots().some((s) => s.id === pid)) console.log(`  ${pid.padEnd(8)} ${st.padEnd(10)} (no snapshot — an external page, or not frozen yet)`);
    } else throw new Error(`unknown command "${cmd}" — snapshot <id> <ref>, or list`);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    process.exit(1);
  }
}
