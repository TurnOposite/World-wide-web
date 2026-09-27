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
 *      run is in, so the booth commits to the right place with no setup.
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
import { buildView } from './site-collections.mjs';

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

/** Every route that should answer 200 on a cold load. */
export function routes(texts) {
  return [
    'radio', 'atlas', 'ecrits', 'portfolio', 'booth',
    'portfolio/library', 'portfolio/photos', 'portfolio/crates',
    ...texts.map((t) => `ecrits/${t.slug}`),
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

export async function build({ base = process.env.SITE_BASE || '/', repo = process.env.GITHUB_REPOSITORY || '', siteUrl = process.env.SITE_URL || '', quiet = false, dist = DIST, shells = true } = {}) {
  const DIST = dist;
  base = normaliseBase(base);
  const log = (...a) => { if (!quiet) console.log(...a); };

  // 1. generated inputs
  for (const s of ['site-sync.mjs', 'site-texts.mjs', 'site-collections.mjs']) {
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
  if (shells) await fsp.writeFile(path.join(DIST, '404.html'), shell);
  for (const r of shells ? routes(texts) : []) {
    await fsp.mkdir(path.join(DIST, r), { recursive: true });
    await fsp.writeFile(path.join(DIST, r, 'index.html'), shell);
  }

  // 5. config: which repository the booth writes to
  const cfgPath = path.join(DIST, 'config.json');
  const cfg = JSON.parse(await fsp.readFile(cfgPath, 'utf8'));
  const [owner, name] = repo.split('/');
  if (owner && name) cfg.github = { ...cfg.github, owner, repo: name };
  cfg.builtAt = new Date().toISOString();
  await fsp.writeFile(cfgPath, JSON.stringify(cfg, null, 2) + '\n');

  // GitHub Pages: serve files and folders starting with _ as-is.
  await fsp.writeFile(path.join(DIST, '.nojekyll'), '');

  log(`  ✓ dist/ ready — base ${base}${siteUrl ? ` at ${siteUrl}` : ''}${owner ? `, booth writes to ${owner}/${name}` : ', booth read-only (no repository)'}; ${files.length} portfolio files (${(bytes / 1048576).toFixed(1)} MB)`);
  return { base, files: files.length, routes: routes(texts).length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await build();
