#!/usr/bin/env node
/**
 * A plain Markdown draft (from Word via pandoc, or typed) → an Echo article.
 *
 *   node scripts/echo-import.mjs draft.md --date 2026-10-17 --author "Nom" \
 *        [--standfirst "…"] [--place "…"] [--tags a,b] [--hero path --hero-alt … --hero-caption … --hero-credit …] \
 *        [--lang fr] [--out echo/articles]
 *
 * What it does: the first `# Heading` becomes the title; `#`/`###`+ headings
 * become `##` intertitles; `* * *` / `___` become `---`; `Sources`/`Notes`
 * stay the closing block. Anything missing is written as `[à compléter : …]`
 * so it shows up in the preview instead of being silently invented. An
 * existing front matter is kept and only filled in. It never overwrites.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontMatter } from './site-texts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'article';
}

const q = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** → { file, text } ; throws when the date is missing or malformed. */
export function importMarkdown(source, opts = {}) {
  const { meta: have, body: raw } = frontMatter(source);
  const meta = { ...have };
  let body = raw.replace(/\r\n?/g, '\n').trim();
  const h1 = body.match(/^#\s+(.+)\n?/);
  if (h1) { meta.title = meta.title || h1[1].trim(); body = body.slice(h1[0].length).trim(); }
  body = body
    .replace(/^#{1,6}\s+(.+)$/gm, (_, t) => `## ${t.trim()}`)
    .replace(/^[ \t]*(?:\* \* \*|\*\*\*|___|- - -)[ \t]*$/gm, '---');
  for (const k of ['standfirst', 'author', 'date', 'place', 'lang']) if (opts[k]) meta[k] = opts[k];
  if (opts.tags) meta.tags = opts.tags;
  if (opts.hero) Object.assign(meta, { hero: opts.hero, hero_alt: opts.heroAlt, hero_caption: opts.heroCaption, hero_credit: opts.heroCredit });
  const date = String(meta.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('a date is required (--date yyyy-mm-dd)');
  const miss = (what) => `[à compléter : ${what}]`;
  const out = {
    title: meta.title || miss('titre'),
    standfirst: meta.standfirst || miss('chapeau'),
    author: meta.author || miss('auteur'),
    date,
    place: meta.place,
    tags: meta.tags,
    hero: meta.hero,
    hero_alt: meta.hero_alt,
    hero_caption: meta.hero_caption,
    hero_credit: meta.hero_credit,
    lang: meta.lang || 'fr',
  };
  const front = Object.entries(out).filter(([, v]) => v).map(([k, v]) => `${k}: ${/^\d{4}-\d{2}-\d{2}$/.test(v) || k === 'lang' ? v : q(v)}`).join('\n');
  return { file: `${date}-${slugify(out.title)}.md`, text: `---\n${front}\n---\n${body}\n` };
}

const FLAGS = { '--date': 'date', '--author': 'author', '--standfirst': 'standfirst', '--place': 'place', '--tags': 'tags', '--hero': 'hero', '--hero-alt': 'heroAlt', '--hero-caption': 'heroCaption', '--hero-credit': 'heroCredit', '--lang': 'lang', '--out': 'out' };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opts = {};
  let input = null;
  for (let i = 0; i < args.length; i++) {
    if (FLAGS[args[i]]) opts[FLAGS[args[i]]] = args[++i];
    else if (!input) input = args[i];
  }
  if (!input) { console.error('usage: node scripts/echo-import.mjs draft.md --date yyyy-mm-dd [--author …] [--standfirst …]'); process.exit(2); }
  try {
    const { file, text } = importMarkdown(fs.readFileSync(input, 'utf8'), opts);
    const dir = path.resolve(ROOT, opts.out || 'echo/articles');
    const dest = path.join(dir, file);
    if (fs.existsSync(dest)) throw new Error(`${path.relative(ROOT, dest)} already exists — not overwriting`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dest, text);
    console.log(`  ✓ wrote ${path.relative(ROOT, dest)} — check the [à compléter] fields, then: node scripts/site-echo.mjs`);
  } catch (e) { console.error(`  ✗ ${e.message}`); process.exit(1); }
}
