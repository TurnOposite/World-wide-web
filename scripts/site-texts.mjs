#!/usr/bin/env node
/**
 * The Écrits room: writing/globe-trotter/*.md → site/data/texts.json.
 *
 * The six texts are a verbatim mirror of what Globe Trotter publishes
 * (writing/globe-trotter/LISEZ-MOI.md: "Rien n'a été corrigé"). This keeps
 * them verbatim — no spelling, punctuation or line-break is touched; only
 * the Markdown is turned into paragraphs — and records which radio track
 * scores which text, from site/station/library.json.
 *
 *   node scripts/site-texts.mjs          # write
 *   node scripts/site-texts.mjs --check  # exit 1 if texts.json is stale
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'writing/globe-trotter');
const OUT = path.join(ROOT, 'site/data/texts.json');

// URL-safe slugs (the Wix ones carry accents and a leading underscore).
const SLUGS = {
  '01_L-ascenceur-tombe.md': 'l-ascenceur-tombe',
  '02_Odes.md': 'odes',
  '03_Coracao-sertao.md': 'coracao-sertao',
  '04_Voyages.md': 'voyages',
  '05_Narration-en-vers.md': 'narration-en-vers',
  '06_Opal-Orre.md': 'opal-orre',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Just enough YAML for these headers: `key: value` at the top level. */
export function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1').trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>');

/** Paragraphs from blank-line-separated blocks; `[Title]` lines become headings. */
export function toHtml(body) {
  return body.trim().split(/\n\s*\n/).map((block) => {
    const b = block.trim();
    const heading = b.match(/^\**\[(.+?)\]\**$/);
    if (heading) return `<h2>${esc(heading[1])}</h2>`;
    return `<p>${b.split('\n').map(inline).join('<br>')}</p>`;
  }).join('\n');
}

function excerpt(body) {
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !/^\**\[.*\]\**$/.test(l) && !/^\*.*\*$/.test(l));
  const first = lines.slice(0, 2).join(' / ').replace(/\*/g, '');
  return first.length > 150 ? `${first.slice(0, 147)}…` : first;
}

export function build() {
  const lib = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/station/library.json'), 'utf8'));
  const scoredBy = new Map(lib.tracks.filter((t) => t.scores).map((t) => [t.scores, { id: t.id, title: t.title, artist: t.artist, duration: t.duration }]));

  const frame = fs.readFileSync(path.join(SRC, '00_Textes-de-la-charpente.md'), 'utf8');
  const quote = (n) => {
    const sec = frame.split(/\n## /)[n] || '';
    return sec.split('\n').filter((l) => l.startsWith('> ')).map((l) => l.slice(2)).join(' ').trim();
  };

  const texts = Object.entries(SLUGS).map(([file, slug]) => {
    const { meta, body } = frontMatter(fs.readFileSync(path.join(SRC, file), 'utf8'));
    const t = {
      slug,
      title: meta.titre,
      category: meta.categorie,
      signature: meta.signature,
      published: meta.publie,
      readingTime: meta.duree_lecture,
      summary: meta.resume_seo || null,
      excerpt: excerpt(body),
      html: toHtml(body),
      scoredBy: scoredBy.get(slug) || null,
      source: meta.url || null,
    };
    // The author's note is about this one story; the Wix footer showed it on
    // every page (STRUCTURE.md §8.7). Here it sits under the story it is about.
    if (slug === 'l-ascenceur-tombe') t.afterword = quote(2);
    return t;
  });
  // Newest first, as the site shows them.
  texts.sort((a, b) => (b.published || '').localeCompare(a.published || '') || a.slug.localeCompare(b.slug));
  return { _generated: 'by scripts/site-texts.mjs from writing/globe-trotter — edit the .md files, not this', intro: quote(1), texts };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const want = JSON.stringify(build(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (have !== want) { console.error('  ✗ site/data/texts.json is stale — run node scripts/site-texts.mjs'); process.exit(1); }
    console.log('  ✓ texts.json matches writing/globe-trotter');
  } else {
    fs.writeFileSync(OUT, want);
    console.log(`  ✓ wrote site/data/texts.json (${JSON.parse(want).texts.length} texts)`);
  }
}
