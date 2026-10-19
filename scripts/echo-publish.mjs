#!/usr/bin/env node
/**
 * One-step publish of an Echo article, run on the laptop in a World-wide-web clone.
 *
 *   node scripts/echo-publish.mjs <article.md> [<media-dir>] [--no-test]
 *
 * Copies the article into echo/articles/, the media into site/assets/echo/,
 * sets `draft: false`, rebuilds site/data/echo.json and runs `npm test`.
 * It never commits or pushes: that stays your gesture (merge = publish).
 * Media limits keep the repository light: 8 MB per file, 60 MB per article.
 * Media are copied flat, so the article's `hero:` / `video:` / `video_poster:`
 * must read assets/echo/<file>.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { frontMatter } from './site-texts.mjs';
import { build } from './site-echo.mjs';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_FILE = 8 * 1024 * 1024;
export const MAX_TOTAL = 60 * 1024 * 1024;
const MEDIA = /\.(jpe?g|png|webp|gif|svg|mp4)$/i;

/** Front matter with `draft: false` — replaced if present, added before the closing rule if not. */
export function undraft(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error('the article has no front matter');
  const lines = m[1].split('\n').filter((l) => !/^draft:/.test(l));
  lines.push('draft: false');
  return `---\n${lines.join('\n')}\n---\n${text.slice(m[0].length)}`;
}

/** Throws before anything is copied when the media do not fit. */
export function checkMedia(dir) {
  if (!dir) return [];
  const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
  const bad = files.filter((f) => !MEDIA.test(f));
  if (bad.length) throw new Error(`not an image or mp4: ${bad.join(', ')}`);
  let total = 0;
  for (const f of files) {
    const n = fs.statSync(path.join(dir, f)).size;
    if (n > MAX_FILE) throw new Error(`${f} is ${(n / 1048576).toFixed(1)} MB — the limit is 8 MB per file (shrink it, or host it on the tower)`);
    total += n;
  }
  if (total > MAX_TOTAL) throw new Error(`media total ${(total / 1048576).toFixed(1)} MB — the limit is 60 MB`);
  return files;
}

export function publish(article, mediaDir, { root = HERE, test = true } = {}) {
  const text = fs.readFileSync(article, 'utf8');
  const { meta } = frontMatter(text);
  const out = undraft(text);
  const files = checkMedia(mediaDir);
  const missing = ['hero', 'video', 'video_poster'].map((k) => meta[k]).filter(Boolean)
    .filter((p) => !files.includes(path.basename(p)) && !fs.existsSync(path.join(root, 'site', p)));
  if (missing.length) throw new Error(`the article names media that are nowhere: ${missing.join(', ')}`);
  const articles = path.join(root, 'echo/articles');
  const assets = path.join(root, 'site/assets/echo');
  fs.mkdirSync(articles, { recursive: true });
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(path.join(root, 'site/data'), { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(mediaDir, f), path.join(assets, f));
  const dest = path.join(articles, path.basename(article));
  fs.writeFileSync(dest, out);
  const data = build({ drafts: false, src: articles });
  fs.writeFileSync(path.join(root, 'site/data/echo.json'), JSON.stringify(data, null, 1) + '\n');
  if (test) {
    const r = spawnSync('npm', ['test'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error('npm test failed — nothing is committed; fix it or delete the copied files');
  }
  return { dest, media: files, articles: data.articles.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!args[0]) { console.error('usage: node scripts/echo-publish.mjs <article.md> [<media-dir>] [--no-test]'); process.exit(2); }
  try {
    const r = publish(args[0], args[1], { test: !process.argv.includes('--no-test') });
    console.log(`  ✓ ${path.relative(HERE, r.dest)} published (${r.media.length} media, ${r.articles} articles in echo.json)`);
    console.log('  Next: git add -A && git commit -m "Echo: publish" && git push origin claude/echo, then merge the PR.');
  } catch (e) { console.error(`  ✗ ${e.message}`); process.exit(1); }
}
