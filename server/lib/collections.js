/**
 * Collections — the University / Photos / Crates pages.
 *
 * Everything these pages show is described by one hand-editable manifest,
 * `collection.json`, at the root of COLLECTIONS_DIR. The server's job is small
 * and deliberately so: read the manifest, drop any entry whose file is not on
 * disk (so a half-copied SD card degrades to a shorter shelf rather than a
 * page of broken links), rewrite relative paths into URLs, and serve the files
 * read-only under /collections/.
 *
 * Why a manifest and not a directory walk: titles, course codes and captions
 * are editorial, not derivable from filenames ("261072853_Paper#3.docx" is
 * a real filename in this library). And a walk would publish whatever lands in
 * the folder; a manifest publishes only what someone deliberately listed.
 *
 * Nothing here is held in memory beyond the parsed manifest, which is re-read
 * only when its mtime changes — the Pi discipline in CLAUDE.md.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const MANIFEST = 'collection.json';

/** File types the /collections/ route will serve. Anything else is a 404. */
export const SERVABLE = new Map([
  ['.pdf', 'application/pdf'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

/**
 * True for a request path that must never be served: a segment starting with
 * `_` (the private `_review/` and `_incoming/` working folders) or `.`
 * (dotfiles), a `..`, or an extension outside SERVABLE.
 */
export function isPrivatePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return true;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return true;
  const segments = decoded.split('/').filter(Boolean);
  if (segments.length === 0) return true;
  if (segments.some((s) => s === '..' || s.startsWith('_') || s.startsWith('.'))) return true;
  return !SERVABLE.has(path.extname(segments.at(-1)).toLowerCase());
}

const toUrl = (rel) => '/collections/' + rel.split('/').map(encodeURIComponent).join('/');

export class Collections {
  /** @param {{dir: string}} opts */
  constructor({ dir }) {
    this.dir = path.resolve(dir);
    this._cache = null;
    this._mtimeMs = -1;
  }

  /** True when `rel` names a servable file that exists inside the collection. */
  _exists(rel) {
    if (typeof rel !== 'string' || !rel || isPrivatePath(rel)) return false;
    const abs = path.resolve(this.dir, rel);
    if (!abs.startsWith(this.dir + path.sep)) return false;
    try {
      return fs.statSync(abs).isFile();
    } catch {
      return false;
    }
  }

  _fileInfo(rel) {
    try {
      return { url: toUrl(rel), bytes: fs.statSync(path.resolve(this.dir, rel)).size };
    } catch {
      return null;
    }
  }

  /**
   * The public view of the manifest: paths become URLs, and anything whose
   * file is missing is dropped and counted in `missing` instead.
   */
  async load() {
    const file = path.join(this.dir, MANIFEST);
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      return emptyView(`no ${MANIFEST} in ${this.dir}`);
    }
    if (this._cache && stat.mtimeMs === this._mtimeMs) return this._cache;

    let raw;
    try {
      raw = JSON.parse(await fsp.readFile(file, 'utf8'));
    } catch (err) {
      return emptyView(`${MANIFEST} is not valid JSON: ${err.message}`);
    }

    const missing = [];
    const need = (rel, where) => {
      if (this._exists(rel)) return true;
      missing.push({ where, file: rel ?? null });
      return false;
    };

    const uni = raw.university || {};
    const shelves = (uni.shelves || []).map((shelf) => ({
      id: String(shelf.id || ''),
      label: String(shelf.label || ''),
      books: (shelf.books || [])
        .filter((b) => {
          // A book is either a readable file or a doorway into the map room.
          if (b.file) return need(b.file, `book ${b.id}`);
          return Boolean(b.mapsLink);
        })
        .map((b) => ({
          id: String(b.id),
          title: String(b.title || ''),
          subtitle: b.subtitle ? String(b.subtitle) : null,
          course: String(b.course || ''),
          kind: String(b.kind || ''),
          lang: b.lang || 'en',
          pages: Number.isFinite(b.pages) ? b.pages : null,
          featured: Boolean(b.featured),
          blurb: b.blurb ? String(b.blurb) : null,
          mapsLink: Boolean(b.mapsLink),
          file: b.file ? this._fileInfo(b.file) : null,
          cover: b.cover && this._exists(b.cover) ? toUrl(b.cover) : null,
          extra:
            b.extra?.file && this._exists(b.extra.file)
              ? { label: String(b.extra.label || 'Extra'), ...this._fileInfo(b.extra.file) }
              : null,
        })),
    }));

    const layers = (uni.maps?.layers || [])
      .filter((l) => need(l.file, `map ${l.id}`))
      .map((l) => ({
        id: String(l.id),
        title: String(l.title || ''),
        source: String(l.source || ''),
        caption: l.caption ? String(l.caption) : '',
        legend: Array.isArray(l.legend) ? l.legend : null,
        ...this._fileInfo(l.file),
      }));

    const albums = (raw.photos?.albums || []).map((a) => ({
      id: String(a.id),
      title: String(a.title || ''),
      subtitle: a.subtitle ? String(a.subtitle) : '',
      items: (a.items || [])
        .filter((p) => need(p.file, `photo in ${a.id}`))
        .map((p) => ({
          url: toUrl(p.file),
          thumb: p.thumb && this._exists(p.thumb) ? toUrl(p.thumb) : toUrl(p.file),
          w: Number(p.w) || null,
          h: Number(p.h) || null,
          caption: p.caption ? String(p.caption) : '',
        })),
    }));

    const crates = (raw.music?.crates || []).map((c) => ({
      id: String(c.id),
      match: c.match || {},
      note: c.note ? String(c.note) : '',
      cover: c.cover && this._exists(c.cover) ? toUrl(c.cover) : null,
    }));

    this._cache = {
      ok: true,
      university: {
        title: uni.title || 'The Library',
        intro: uni.intro || '',
        shelves,
        maps: { title: uni.maps?.title || 'The map room', intro: uni.maps?.intro || '', layers },
      },
      photos: { title: raw.photos?.title || 'Photos', intro: raw.photos?.intro || '', albums },
      music: { title: raw.music?.title || 'Crates', intro: raw.music?.intro || '', crates },
      missing,
    };
    this._mtimeMs = stat.mtimeMs;
    if (missing.length) {
      console.warn(`[collections] ${missing.length} manifest entr${missing.length === 1 ? 'y points' : 'ies point'} at missing files — hidden from the pages`);
    }
    return this._cache;
  }
}

function emptyView(reason) {
  return {
    ok: false,
    reason,
    university: { title: 'The Library', intro: '', shelves: [], maps: { title: 'The map room', intro: '', layers: [] } },
    photos: { title: 'Photos', intro: '', albums: [] },
    music: { title: 'Crates', intro: '', crates: [] },
    missing: [],
  };
}
