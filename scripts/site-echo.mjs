#!/usr/bin/env node
/**
 * The Echo room: echo/articles/<yyyy-mm-dd>-<slug>.md → site/data/echo.json.
 *
 * Unlike the Écrits (a verbatim mirror), Echo is edited prose, so this applies
 * French typography on the way through: a no-break space before : ; ! ? and
 * inside « guillemets ». Source files stay as written.
 *
 *   node scripts/site-echo.mjs          # write
 *   node scripts/site-echo.mjs --check  # exit 1 if echo.json is stale
 *
 * Body format: paragraphs; `## Title` = intertitle; `> text` = pull quote;
 * `---` = section break; a final `## Sources` (or `## Notes`) list = the notes block.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontMatter } from './site-texts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'echo/articles');
const OUT = path.join(ROOT, 'site/data/echo.json');
const NBSP = ' ';
const NNBSP = ' ';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** French spacing for plain text (not for markup: run it before escaping). */
export function frenchTypo(s) {
  return String(s)
    .replace(/[  ]*([;!?])/g, `${NNBSP}$1`)
    .replace(/[  ]*:/g, `${NBSP}:`)
    .replace(/«[  ]*/g, `«${NBSP}`)
    .replace(/[  ]*»/g, `${NBSP}»`);
}

const inline = (s, fr) => esc(fr ? frenchTypo(s) : s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>');

/** Markdown subset → { html, notes, words }. */
export function renderBody(body, { fr = true } = {}) {
  const html = [];
  let notes = null;
  let words = 0;
  const blocks = body.trim().split(/\n\s*\n/);
  for (const raw of blocks) {
    const b = raw.trim();
    if (!b) continue;
    const h = b.match(/^##\s+(.+)$/m);
    if (b === '---') { html.push('<hr class="break">'); continue; }
    if (/^##\s+(Sources|Notes)\s*$/i.test(b.split('\n')[0])) {
      notes = { title: b.split('\n')[0].replace(/^##\s+/, ''), items: [] };
      const rest = b.split('\n').slice(1);
      for (const l of rest) if (/^[-*]\s+/.test(l)) notes.items.push(inline(l.replace(/^[-*]\s+/, ''), fr));
      continue;
    }
    if (notes && /^[-*]\s+/.test(b)) { for (const l of b.split('\n')) notes.items.push(inline(l.replace(/^[-*]\s+/, ''), fr)); continue; }
    if (h && b.startsWith('##')) { html.push(`<h2>${inline(h[1], fr)}</h2>`); const rest = b.split('\n').slice(1).join('\n').trim(); if (rest) html.push(`<p>${inline(rest, fr)}</p>`); words += rest.split(/\s+/).filter(Boolean).length; continue; }
    if (b.startsWith('>')) {
      const q = b.split('\n').map((l) => l.replace(/^>\s?/, '')).join(' ');
      html.push(`<blockquote class="pull"><p>${inline(q, fr)}</p></blockquote>`);
      words += q.split(/\s+/).length;
      continue;
    }
    html.push(`<p>${b.split('\n').map((l) => inline(l, fr)).join(' ')}</p>`);
    words += b.split(/\s+/).filter(Boolean).length;
  }
  return { html: html.join('\n'), notes, words };
}

const RESERVED = ['lectures', 'archives'];

export function parseArticle(file, text) {
  const { meta, body } = frontMatter(text);
  const m = path.basename(file).match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
  if (!m) throw new Error(`${file}: name must be <yyyy-mm-dd>-<slug>.md`);
  // /echo/lectures and /echo/archives are pages of their own: an article there would never be reached.
  if (RESERVED.includes(m[2])) throw new Error(`${file}: "${m[2]}" is the address of another Echo page — pick another slug`);
  for (const k of ['title', 'standfirst', 'author', 'date']) if (!meta[k]) throw new Error(`${file}: front matter lacks "${k}"`);
  const lang = meta.lang || 'fr';
  const fr = lang.startsWith('fr');
  const { html, notes, words } = renderBody(body, { fr });
  const t = (s) => (fr ? frenchTypo(s) : s);
  return {
    slug: m[2],
    title: t(meta.title),
    standfirst: t(meta.standfirst),
    author: meta.author,
    date: meta.date,
    place: meta.place || null,
    tags: (meta.tags || '').split(',').map((x) => x.trim()).filter(Boolean),
    lang,
    draft: /^(true|yes|1)$/i.test(meta.draft || ''),
    video: meta.video ? { src: meta.video, poster: meta.video_poster || '', caption: t(meta.video_caption || '') } : null,
    hero: meta.hero ? { src: meta.hero, alt: meta.hero_alt || '', caption: t(meta.hero_caption || ''), credit: meta.hero_credit || '' } : null,
    readingTime: Math.max(1, Math.ceil(words / 220)),
    html,
    notes: notes ? { title: notes.title, items: notes.items } : null,
  };
}

/** Drafts (`draft: true`) stay out of echo.json, the feed and the index unless ECHO_DRAFTS=1. */
export function build({ drafts = process.env.ECHO_DRAFTS === '1', src = SRC } = {}) {
  const files = fs.existsSync(src) ? fs.readdirSync(src).filter((f) => f.endsWith('.md')).sort() : [];
  const articles = files.map((f) => parseArticle(f, fs.readFileSync(path.join(src, f), 'utf8'))).filter((a) => drafts || !a.draft);
  const slugs = new Set();
  for (const a of articles) { if (slugs.has(a.slug)) throw new Error(`duplicate slug ${a.slug}`); slugs.add(a.slug); }
  articles.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  return { _generated: 'by scripts/site-echo.mjs from echo/articles — edit the .md files, not this', articles };
}

const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const RASTER = /\.(jpe?g|png|webp)$/i;

/**
 * The Atom feed (dist/echo/feed.xml). Entry ids are tag: URIs built from the
 * date and slug, so they survive a change of domain — readers keep their
 * "already read" marks when the site moves. `root` is the site's absolute
 * address when known (SITE_URL + base); without it links stay relative.
 */
export function atomFeed(articles, { root = '' } = {}) {
  const abs = (rel) => (root ? new URL(rel, root).href : rel);
  const updated = articles.length ? `${articles[0].date}T12:00:00Z` : '1970-01-01T00:00:00Z';
  const entries = articles.map((a) => `  <entry>
    <id>tag:globe-trotter,${a.date}:echo/${esc(a.slug)}</id>
    <title>${esc(plain(a.title))}</title>
    <link rel="alternate" type="text/html" href="${esc(abs(`echo/${a.slug}`))}"/>
    <updated>${a.date}T12:00:00Z</updated>
    <author><name>${esc(a.author)}</name></author>
${a.tags.map((t) => `    <category term="${esc(t)}"/>`).join('\n')}
    <summary>${esc(plain(a.standfirst))}</summary>
    <content type="html" xml:lang="${esc(a.lang)}">${esc(a.html)}</content>
  </entry>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fr">
  <id>tag:globe-trotter:echo</id>
  <title>Echo — Globe Trotter</title>
  <subtitle>Reportages et analyses.</subtitle>
  <link rel="self" type="application/atom+xml" href="${esc(abs('echo/feed.xml'))}"/>
  <link rel="alternate" type="text/html" href="${esc(abs('echo'))}"/>
  <updated>${updated}</updated>
${entries}
</feed>
`;
}

/**
 * Per-article link-preview tags, written into that article's cold-load shell
 * (the page itself is drawn in the browser, which crawlers do not run).
 * Only a raster hero replaces the site's share card: previews ignore SVG.
 */
export function articleShell(shell, a, { root = '' } = {}) {
  const abs = (rel) => (root ? new URL(rel, root).href : rel);
  const title = `${plain(a.title)} — Echo`;
  const set = (re, val) => { shell = shell.replace(re, (_, x, y) => `${x}${esc(val)}${y}`); };
  shell = shell.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  set(/(<meta name="description" content=")[^"]*(">)/, plain(a.standfirst));
  set(/(<meta property="og:title" content=")[^"]*(">)/, title);
  set(/(<meta property="og:description" content=")[^"]*(">)/, plain(a.standfirst));
  shell = shell.replace('<meta property="og:type" content="website">', '<meta property="og:type" content="article">');
  const extra = [`<meta property="article:published_time" content="${a.date}">`, `<meta property="article:author" content="${esc(a.author)}">`];
  shell = shell.replace(/<meta property="og:url"[^>]*>\n?/, '');
  if (root) extra.unshift(`<meta property="og:url" content="${esc(abs(`echo/${a.slug}`))}">`);
  shell = shell.replace(/(<meta property="og:type"[^>]*>)/, `$1\n${extra.join('\n')}`);
  if (a.hero && RASTER.test(a.hero.src)) {
    set(/(<meta property="og:image" content=")[^"]*(">)/, abs(a.hero.src));
    set(/(<meta property="og:image:alt" content=")[^"]*(">)/, a.hero.alt || plain(a.title));
    shell = shell.replace(/<meta property="og:image:(width|height)"[^>]*>\n?/g, '');
  }
  return shell;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const want = JSON.stringify(build(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (have !== want) { console.error('  ✗ site/data/echo.json is stale — run node scripts/site-echo.mjs'); process.exit(1); }
    console.log('  ✓ echo.json matches echo/articles');
  } else {
    fs.writeFileSync(OUT, want);
    console.log(`  ✓ wrote site/data/echo.json (${JSON.parse(want).articles.length} articles)`);
  }
}
