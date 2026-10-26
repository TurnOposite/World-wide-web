#!/usr/bin/env node
/**
 * Assemble dist/ — exactly what GitHub Pages (or any static host) serves.
 *
 * Not a bundler (BRIEF.md: no build step on the front end). It copies files
 * and writes JSON:
 *   1. refresh the generated inputs (shared clock modules, texts, portfolio);
 *   2. copy site/ as-is;
 *   3. copy only the portfolio files the manifest publishes (never _review/,
 *      never _incoming/ — the same rule the Pi's /collections/ route applies);
 *   4. set <base href> for where the site will live (/ at a domain, or
 *      /<repo>/ on github.io) and write a copy of the shell at every route,
 *      so a cold link to /atlas or /ecrits/voyages answers 200;
 *   5. fill config.json's github.owner/repo from the repository the Actions
 *      run is in, so the booth commits to the right place with no setup;
 *      and stamp it with the commit it was built from, which is how `fire`
 *      knows Vercel and the tower are showing what it just pushed;
 *   6. lay out each version of the past that site/data/layout.json has online
 *      under past/<id>/ (scripts/site-past.mjs, docs/ATELIER.md), and a shell
 *      for its window (versions/<id>) and for every short link (go/<code>).
 *
 *   node scripts/site-build.mjs                    # base "/"
 *   SITE_BASE=/radio-tower/ node scripts/site-build.mjs
 *   GITHUB_REPOSITORY=ortis/radio-tower node scripts/site-build.mjs
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { atomFeed, articleShell } from './site-echo.mjs';
import { buildView } from './site-collections.mjs';
import { assemble } from './site-past.mjs';
import { resolveLayout } from '../site/js/world/model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const DIST = path.resolve(process.env.SITE_DIST || path.join(ROOT, 'dist'));

export function normaliseBase(b = '/') {
  let base = String(b || '/').trim();
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base += '/';
  return base;
}

/**
 * The shell for a given address: its <base>, and — when the site's public URL
 * is known (SITE_URL, from the Pages workflow) — an absolute og:image and an
 * og:url, which is what link previews need. Pure, so it is tested.
 */
export function shellFor(html, { base = '/', siteUrl = '' } = {}) {
  let out = html.replace(/<base href="[^"]*">/, `<base href="${normaliseBase(base)}">`);
  if (siteUrl) {
    const root = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
    out = out.replace(/(<meta property="og:image" content=")(?!https?:)([^"]+)(">)/, (_, a, rel, c) => `${a}${new URL(rel, root).href}${c}`);
    if (!/property="og:url"/.test(out)) out = out.replace(/(<meta property="og:type"[^>]*>)/, `$1\n<meta property="og:url" content="${root}">`);
  }
  return out;
}

/**
 * Every route that should answer 200 on a cold load. `pages` is the map
 * (model.js resolveLayout): each version of the past online gets its
 * window's address, and every page its short links — so a go/ link shared
 * in a message answers 200 (and a link preview) before it redirects.
 */
export function routes(texts, echo = [], pages = []) {
  const past = pages.filter((p) => p.era === 'past');
  return [
    ...past.map((p) => `versions/${p.id}`),
    ...pages.flatMap((p) => [`go/${p.code}`, `go/${p.id}`]),
    'radio', 'atlas', 'ecrits', 'portfolio', 'booth',
    'ondes', 'echoes', 'playlists',
    'zone',
    'portfolio/library', 'portfolio/photos', 'portfolio/crates',
    ...texts.map((t) => `ecrits/${t.slug}`),
    'echo/lectures', ...texts.map((t) => `echo/lectures/${t.slug}`),
    'echo', 'echo/archives', ...echo.map((a) => `echo/${a.slug}`),
  ];
}

async function copyDir(src, dst, skip = () => false) {
  await fsp.mkdir(dst, { recursive: true });
  for (const e of await fsp.readdir(src, { withFileTypes: true })) {
    if (e.name.startsWith('.') || skip(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d, skip);
    else await fsp.copyFile(s, d);
  }
}

/** The commit this build is made from: Vercel and GitHub say; on the tower (a git checkout) git does. */
export function builtFrom(env = process.env) {
  const sha = env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA;
  if (sha) return sha;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { return null; }
}

export async function build({ base = process.env.SITE_BASE || '/', repo = process.env.GITHUB_REPOSITORY || '', siteUrl = process.env.SITE_URL || '', tower = process.env.SITE_TOWER ?? null, quiet = false, dist = DIST, shells = true, past = shells } = {}) {
  const DIST = dist;
  base = normaliseBase(base);
  const log = (...a) => { if (!quiet) console.log(...a); };

  // 1. generated inputs
  for (const s of ['site-sync.mjs', 'site-texts.mjs', 'site-echo.mjs', 'site-collections.mjs']) {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', s)], { stdio: quiet ? 'ignore' : 'inherit' });
  }

  // 2. the site
  await fsp.rm(DIST, { recursive: true, force: true });
  await copyDir(SITE, DIST);

  // 3. the portfolio files the manifest publishes, and nothing else
  const { files } = await buildView();
  let bytes = 0;
  for (const rel of files) {
    const src = path.join(ROOT, 'collections', rel);
    const dst = path.join(DIST, 'collections', rel);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.copyFile(src, dst);
    bytes += fs.statSync(src).size;
  }

  // 4. <base>, and a shell at every route
  const shell = shellFor(await fsp.readFile(path.join(SITE, 'index.html'), 'utf8'), { base, siteUrl });
  await fsp.writeFile(path.join(DIST, 'index.html'), shell);
  const texts = JSON.parse(await fsp.readFile(path.join(DIST, 'data/texts.json'), 'utf8')).texts;
  const echo = JSON.parse(await fsp.readFile(path.join(DIST, 'data/echo.json'), 'utf8')).articles;
  // The map: the versions of the past it has online, and every page's short link (docs/ATELIER.md).
  const { pages, problems } = resolveLayout(JSON.parse(await fsp.readFile(path.join(DIST, 'data/layout.json'), 'utf8')));
  if (problems.length) throw new Error(`site/data/layout.json: ${problems.join('; ')}`);
  const shown = past ? pages : pages.filter((p) => p.era !== 'past');
  // A build without the past (the claude.ai preview) says so in its own copy of the map: no window opens on nothing.
  if (!past) {
    const file = JSON.parse(await fsp.readFile(path.join(DIST, 'data/layout.json'), 'utf8'));
    file.pages = file.pages.map((p) => (p.era === 'past' ? { ...p, status: 'offline' } : p));
    await fsp.writeFile(path.join(DIST, 'data/layout.json'), JSON.stringify(file, null, 1) + '\n');
  }
  if (shells) await fsp.writeFile(path.join(DIST, '404.html'), shell);
  const root = siteUrl ? new URL(base.replace(/^\//, ''), siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).href : '';
  const bySlug = new Map(echo.map((a) => [`echo/${a.slug}`, a]));
  for (const r of shells ? routes(texts, echo, shown) : []) {
    await fsp.mkdir(path.join(DIST, r), { recursive: true });
    const a = bySlug.get(r);
    await fsp.writeFile(path.join(DIST, r, 'index.html'), a ? articleShell(shell, a, { root }) : shell);
  }
  // A build without route shells (the claude.ai preview) has made no echo/ folder yet.
  await fsp.mkdir(path.join(DIST, 'echo'), { recursive: true });
  await fsp.writeFile(path.join(DIST, 'echo/feed.xml'), atomFeed(echo, { root }));

  // 5. config: which repository the booth writes to
  const cfgPath = path.join(DIST, 'config.json');
  const cfg = JSON.parse(await fsp.readFile(cfgPath, 'utf8'));
  const [owner, name] = repo.split('/');
  if (owner && name) cfg.github = { ...cfg.github, owner, repo: name };
  // SITE_TOWER: build the site tuned to a Radio Tower server. '' = the server
  // this copy is served from (the cloud tower serves its own site).
  if (tower !== null && tower !== undefined) {
    cfg.mode = 'tower';
    cfg.tower = { ...(cfg.tower || {}), url: tower };
  }
  cfg.builtAt = new Date().toISOString();
  cfg.commit = builtFrom();
  await fsp.writeFile(cfgPath, JSON.stringify(cfg, null, 2) + '\n');

  // 6. the versions of the past that are online — after config.json, whose tower they take.
  const laid = [];
  for (const p of shown) if (p.era === 'past' && p.kind === 'version') laid.push(await assemble(p, { dist: DIST, base }));

  // GitHub Pages: serve files and folders starting with _ as-is.
  await fsp.writeFile(path.join(DIST, '.nojekyll'), '');

  log(`  ✓ dist/ ready — base ${base}${siteUrl ? ` at ${siteUrl}` : ''}${owner ? `, booth writes to ${owner}/${name}` : ', booth read-only (no repository)'}; ${files.length} portfolio files (${(bytes / 1048576).toFixed(1)} MB)${laid.length ? `; the past online: ${laid.map((l) => l.id).join(', ')}` : ''}`);
  return { base, files: files.length, routes: routes(texts, echo, shown).length, past: laid.map((l) => l.id) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await build();
