#!/usr/bin/env node
/**
 * The library bot — keeps the music folder in the shape of Ortis's Spotify
 * playlists, so filling the station is "download, and forget about it".
 *
 *   node library/bot.mjs read              refresh every playlist's track list from Spotify
 *   node library/bot.mjs add <url>...      follow another playlist (or several)
 *   node library/bot.mjs sort              file what is waiting into the right playlist folders
 *   node library/bot.mjs watch             keep doing that, every few seconds, until Ctrl+C
 *   node library/bot.mjs status            what each playlist has, and what is still missing
 *   node library/bot.mjs import <file>     full track lists (browser export JSON, or Exportify CSV)
 *   node library/bot.mjs publish           send new music to the cloud tower (library/tower.json)
 *
 * Options: --lib <dir> (default: ../music), --from <dir> (extra folder to
 * sort from, repeatable), --to "<playlist>" (file everything into that one),
 * --dry-run, --no-downloads (do not look in the Downloads folder).
 *
 * What it does, and what it never does
 * ------------------------------------
 * - Reads playlists from Spotify's public embed pages: no login, no API key.
 *   An embed lists a playlist's first 100 tracks; a fuller list can be
 *   imported (`import`). Nothing is ever written to Spotify.
 * - Never downloads music. Files arrive however Ortis gets them — bought on
 *   Bandcamp, ripped from his own CDs, whatever — into `_inbox/` or his
 *   Downloads folder. The bot only *sorts*.
 * - Moves a file only when it matches a song a playlist wants (or `--to`
 *   says where). In `_inbox/`, a file it cannot place goes to `_unmatched/`.
 *   In Downloads, a file it cannot place is not its business and stays put.
 * - Never deletes, never re-encodes, never touches a file already filed in a
 *   playlist folder. A second copy of a song it already has goes to
 *   `_duplicates/` for Ortis to bin.
 * - A song in several playlists is stored once, in the folder of the first
 *   playlist that has it; `playlists.json` → `files` lists the others, and
 *   the station puts it on every one of those channels
 *   (server/lib/library.js → readMembership, server/lib/channels.js).
 *
 * Zero dependencies. Uses music-metadata for tags and durations when it can
 * find it (the station's own node_modules), and filenames when it cannot.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const AUDIO = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wav', '.webm'];
const PARTIAL = /\.(crdownload|part|partial|download|tmp)$/i;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
export const STATE_FILE = 'playlists.json';
export const EMBED_LIMIT = 100;

/* --------------------------------------------------------------- text -- */

/** Accent-, case- and width-blind. "Été", "ETE" and "ｅｔｅ" all fold to "ete". */
export function fold(s) {
  return String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
}

/**
 * The part of a title that names the song: no "(feat. …)", no "[Remastered
 * 2011]", no " - Radio Edit". Both the Spotify title and the downloaded
 * file go through this before they are compared.
 */
export function core(s) {
  let x = fold(s);
  x = x.replace(/[([{][^)\]}]*[)\]}]/g, ' ');
  x = x.replace(/\s[-–—]\s.*\b(remaster\w*|version|edit|mix|live|mono|stereo|bonus|demo|instrumental|from|feat\w*|ost|soundtrack|extended|original)\b.*$/u, ' ');
  x = x.replace(/\b(feat|ft|featuring)\b\.?.*$/u, ' ');
  return x.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function bigrams(s) {
  const x = s.replace(/\s+/g, ' ');
  const out = new Map();
  if (x.length < 2) { if (x) out.set(x, 1); return out; }
  for (let i = 0; i < x.length - 1; i++) {
    const g = x.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}

/** Dice coefficient over character bigrams: 1 = same, 0 = nothing shared. Works for any script. */
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let shared = 0;
  let total = 0;
  for (const n of A.values()) total += n;
  for (const n of B.values()) total += n;
  for (const [g, n] of A) shared += Math.min(n, B.get(g) || 0);
  return total ? (2 * shared) / total : 0;
}

/** A name Windows, macOS and Linux all accept, and a phone's lock screen can show. */
export function safeName(s, max = 120) {
  let x = String(s ?? '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim();
  x = x.replace(/[. ]+$/g, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(x)) x = `_${x}`;
  if (x.length > max) x = x.slice(0, max).trim();
  return x || 'untitled';
}

/* ------------------------------------------------------ what a file is -- */

/** Downloader stamps that are not part of the song's name. */
const STAMPS = [/^spotimate(\.io)?\s*-\s*/i, /^\[?spot\w*downloader(\.\w+)?\]?\s*-?\s*/i, /^spotidown\w*(\.\w+)?\s*-\s*/i];

/**
 * Every (title, artist) a filename could mean. "SpotiMate.io - Le soleil est
 * près de moi - Air.mp3" is title-then-artist; "Air - Le soleil….mp3" is the
 * usual other way round. Both readings go to the matcher; the playlists
 * decide which one was meant.
 */
export function readingsOf(file) {
  let base = path.basename(file, path.extname(file)).replace(/\s*\(\d+\)$/, '').trim();
  let stamped = false;
  for (const re of STAMPS) if (re.test(base)) { base = base.replace(re, ''); stamped = true; }
  base = base.replace(/^\d{1,3}[\s._-]+(?=\D)/, '');
  const parts = base.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  if (parts.length >= 2) {
    const titleFirst = { title: parts.slice(0, -1).join(' - '), artist: parts.at(-1) };
    const artistFirst = { title: parts.slice(1).join(' - '), artist: parts[0] };
    if (stamped) out.push(titleFirst, artistFirst); else out.push(artistFirst, titleFirst);
  }
  out.push({ title: base, artist: '' });
  return out;
}

let mmPromise = null;
/** music-metadata, from the station's node_modules if it is there. Null if not. */
async function musicMetadata() {
  if (mmPromise) return mmPromise;
  mmPromise = (async () => {
    for (const dir of [HERE, path.join(HERE, '..'), process.cwd()]) {
      const pkg = path.join(dir, 'node_modules', 'music-metadata', 'package.json');
      if (!fs.existsSync(pkg)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        const entry = typeof meta.exports === 'object'
          ? (meta.exports['.']?.node?.import?.default || meta.exports['.']?.node?.import || meta.exports['.']?.import || meta.exports['.']?.default || meta.module || meta.main)
          : meta.main;
        return await import(pathToFileURL(path.join(path.dirname(pkg), typeof entry === 'string' ? entry : 'lib/index.js')).href);
      } catch { /* try the next place */ }
    }
    try { return await import('music-metadata'); } catch { return null; }
  })();
  return mmPromise;
}

/** Title, artist(s) and duration of an audio file: its tags if readable, else its name. */
export async function describe(file) {
  const out = { file, tags: null, duration: null, readings: readingsOf(file) };
  const mm = await musicMetadata();
  if (mm?.parseFile) {
    try {
      const meta = await mm.parseFile(file, { duration: true, skipCovers: true });
      const c = meta.common || {};
      if (c.title) out.tags = { title: c.title, artist: c.artists?.length ? c.artists.join(', ') : (c.artist || c.albumartist || '') };
      if (Number.isFinite(meta.format?.duration)) out.duration = meta.format.duration;
    } catch { /* unreadable tags: the name will do */ }
  }
  return out;
}

/* ---------------------------------------------------------- matching -- */

/** One searchable entry per distinct song any playlist wants. */
export function buildIndex(state) {
  const songs = new Map(); // key -> { key, title, artists, duration, ids:Set, playlists: [folder…] }
  for (const pl of state.playlists || []) {
    if (pl.skip) continue;
    for (const t of pl.tracks || []) {
      const key = songKey(t);
      let s = songs.get(key);
      if (!s) {
        s = { key, title: t.title, artists: t.artists || [], duration: t.duration ?? null, ids: new Set(), playlists: [], core: core(t.title), artistCores: (t.artists || []).map(core).filter(Boolean) };
        songs.set(key, s);
      }
      if (t.id) s.ids.add(t.id);
      if (!s.playlists.includes(pl.folder)) s.playlists.push(pl.folder);
    }
  }
  return songs;
}

/** The same song in two playlists is one key, whatever Spotify id each copy carries. */
export function songKey(t) {
  return `${core(t.title)}|${core((t.artists || [])[0] || '')}`;
}

function artistScore(song, fileArtist, fileTitle) {
  const fa = core(fileArtist);
  if (!song.artistCores.length) return 0.5;
  if (!fa) {
    // No artist on the file: accept it only if the title carries the name.
    const ft = core(fileTitle);
    return song.artistCores.some((a) => a && ft.includes(a)) ? 0.8 : 0;
  }
  let best = 0;
  for (const a of song.artistCores) {
    if (!a) continue;
    if (fa === a || fa.includes(a) || a.includes(fa)) return 1;
    best = Math.max(best, similarity(a, fa));
  }
  return best;
}

/**
 * The song a file most probably is, or null. Accepts only a confident match:
 * the title must agree (0.8 on bigrams, after `core`), the artist must agree
 * unless the file has no artist at all — then the title must be exact — and
 * a known duration more than 20 s off counts against it (a live take, an
 * extended mix: a different recording).
 */
export function matchFile(desc, songs) {
  const readings = [...(desc.tags ? [desc.tags] : []), ...desc.readings];
  let best = null;
  for (const r of readings) {
    const ft = core(r.title);
    if (!ft) continue;
    for (const s of songs.values()) {
      const ts = s.core === ft ? 1 : similarity(s.core, ft);
      if (ts < 0.8) continue;
      const as = artistScore(s, r.artist, r.title);
      if (!r.artist && ts < 1) continue;
      let score = ts * 0.7 + as * 0.3;
      if (Number.isFinite(desc.duration) && Number.isFinite(s.duration)) {
        const d = Math.abs(desc.duration - s.duration);
        if (d <= 3) score += 0.1;
        else if (d > 20) score -= 0.3;
      }
      if (as < 0.5 && r.artist) continue;
      if (score >= 0.82 && (!best || score > best.score)) best = { song: s, score, reading: r };
    }
  }
  return best;
}

/* ------------------------------------------------------------- state -- */

export function emptyState() {
  return {
    _readme: [
      'Written by library/bot.mjs — Ortis\'s Spotify playlists, and which file in this folder is which song.',
      'Safe to edit: a playlist\'s "folder" (rename the folder too), "skip": true to ignore a playlist.',
      '"files" maps a file to every playlist it belongs to; the station reads it to put a song on each of those channels.',
    ],
    version: 1,
    profiles: [],
    playlists: [],
    files: {},
  };
}

export async function loadState(lib) {
  try {
    return { ...emptyState(), ...JSON.parse(await fsp.readFile(path.join(lib, STATE_FILE), 'utf8')) };
  } catch (err) {
    if (err.code === 'ENOENT') return emptyState();
    throw new Error(`${STATE_FILE} is not valid JSON (${err.message}) — fix or remove it`);
  }
}

/** Rebuild `files` from the tracks: every file → every playlist folder that wants its song. */
export function membership(state) {
  const byFile = new Map();
  for (const pl of state.playlists || []) {
    if (pl.skip) continue;
    for (const t of pl.tracks || []) {
      if (!t.file) continue;
      if (!byFile.has(t.file)) byFile.set(t.file, []);
      const list = byFile.get(t.file);
      if (!list.includes(pl.folder)) list.push(pl.folder);
    }
  }
  // Home folder first: the one the file actually sits in.
  const out = {};
  for (const [file, list] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const home = file.split('/')[0];
    out[file] = [home, ...list.filter((f) => f !== home)];
  }
  return out;
}

export async function saveState(lib, state) {
  state.files = membership(state);
  state.updatedAt = new Date().toISOString();
  await fsp.mkdir(lib, { recursive: true });
  const tmp = path.join(lib, `${STATE_FILE}.tmp`);
  await fsp.writeFile(tmp, JSON.stringify(state, null, 1));
  await fsp.rename(tmp, path.join(lib, STATE_FILE));
}

/** A folder name for a playlist, unique in this library. */
export function folderFor(state, name, id) {
  const taken = new Set((state.playlists || []).filter((p) => p.id !== id).map((p) => p.folder.toLowerCase()));
  const base = safeName(name, 80) || id;
  let f = base;
  for (let n = 2; taken.has(f.toLowerCase()); n++) f = `${base} (${n})`;
  return f;
}

/* ------------------------------------------------------------ Spotify -- */

export function playlistIdOf(url) {
  const m = String(url).match(/playlist[/:]([A-Za-z0-9]{22})/);
  return m ? m[1] : (/^[A-Za-z0-9]{22}$/.test(url) ? url : null);
}

/**
 * A public playlist through its embed page: name, owner, and up to 100
 * tracks. The same page Spotify serves to any website that embeds the
 * playlist — no account involved.
 */
export async function fetchEmbed(id, { fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(`https://open.spotify.com/embed/playlist/${id}`, { headers: { 'user-agent': UA, 'accept-language': 'en' } });
  if (!res.ok) throw new Error(`Spotify answered ${res.status}`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('the embed page has changed shape (no __NEXT_DATA__)');
  const e = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
  if (!e) throw new Error('no playlist in the embed page (private, or deleted?)');
  return {
    id,
    name: String(e.name || e.title || id).trim(),
    owner: e.subtitle || null,
    tracks: (e.trackList || []).filter((t) => (t.entityType || 'track') === 'track').map((t) => ({
      id: String(t.uri || '').split(':').pop() || null,
      title: String(t.title || '').trim(),
      artists: String(t.subtitle || '').split(/,\s+/).map((a) => a.trim()).filter(Boolean),
      duration: Number.isFinite(t.duration) ? Math.round(t.duration / 1000) : null,
    })).filter((t) => t.title),
  };
}

/**
 * Fold freshly read tracks into a playlist, keeping what is already known:
 * which file each song is, and — when the new list is an embed's capped 100
 * — every track a fuller import found beyond them.
 */
export function mergeTracks(pl, fresh, { complete }) {
  const old = new Map((pl.tracks || []).map((t) => [t.id || songKey(t), t]));
  const next = fresh.map((t) => ({ ...t, file: old.get(t.id || songKey(t))?.file ?? null }));
  if (!complete) {
    const have = new Set(next.map((t) => t.id || songKey(t)));
    for (const t of pl.tracks || []) if (!have.has(t.id || songKey(t))) next.push(t);
  }
  pl.tracks = next;
}

async function readPlaylists(lib, state, { ids = null, fetchImpl, log = console.log } = {}) {
  const list = state.playlists.filter((p) => !p.skip && (!ids || ids.includes(p.id)));
  let ok = 0;
  for (const pl of list) {
    try {
      const got = await fetchEmbed(pl.id, { fetchImpl });
      pl.name = got.name;
      if (!pl.folder) pl.folder = folderFor(state, got.name, pl.id);
      pl.owner = got.owner;
      pl.url = `https://open.spotify.com/playlist/${pl.id}`;
      const capped = got.tracks.length >= EMBED_LIMIT;
      mergeTracks(pl, got.tracks, { complete: !capped });
      if (capped && !pl.fullAt) pl.partial = true;
      pl.readAt = new Date().toISOString();
      ok++;
      log(`  ✓ ${pl.name} — ${pl.tracks.length} tracks${pl.partial ? ' (first 100 only — see `import`)' : ''}`);
    } catch (err) {
      log(`  ✗ ${pl.name || pl.id}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await saveState(lib, state);
  return ok;
}

/* ----------------------------------------------------------- imports -- */

/** RFC 4180 CSV → rows of strings. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}

/**
 * Full track lists from elsewhere:
 *   - JSON written by a Claude browser session that read the playlists while
 *     signed in: { playlists: [{ id, name, owner, tracks: [[title, "A, B", seconds, id]] }] }
 *   - an Exportify CSV (one playlist per file; the file name is the playlist's name).
 */
export async function importFile(lib, state, file, { log = console.log } = {}) {
  const text = (await fsp.readFile(file, 'utf8')).replace(/^﻿/, '');
  const lists = [];
  if (file.toLowerCase().endsWith('.json')) {
    const doc = JSON.parse(text);
    for (const p of doc.playlists || []) {
      lists.push({
        id: p.id || null, name: p.name, owner: p.owner || null,
        tracks: (p.tracks || []).map((t) => Array.isArray(t)
          ? { title: t[0], artists: String(t[1] || '').split(/,\s+/).filter(Boolean), duration: t[2] ?? null, id: t[3] || null }
          : t),
      });
    }
  } else {
    const [head, ...rows] = parseCsv(text);
    const col = (n) => head.findIndex((h) => h.trim().toLowerCase() === n);
    const iUri = col('track uri'); const iName = col('track name'); const iArt = col('artist name(s)'); const iDur = col('track duration (ms)');
    if (iName < 0) throw new Error(`${path.basename(file)}: not an Exportify CSV (no "Track Name" column)`);
    lists.push({
      id: null,
      name: path.basename(file, path.extname(file)).replace(/_/g, ' '),
      tracks: rows.map((r) => ({
        id: iUri >= 0 ? (r[iUri] || '').split(':').pop() || null : null,
        title: r[iName],
        artists: iArt >= 0 ? (r[iArt] || '').split(/,\s*/).filter(Boolean) : [],
        duration: iDur >= 0 && r[iDur] ? Math.round(Number(r[iDur]) / 1000) : null,
      })).filter((t) => t.title),
    });
  }
  for (const l of lists) {
    let pl = state.playlists.find((p) => (l.id && p.id === l.id) || fold(p.name) === fold(l.name));
    if (!pl) {
      pl = { id: l.id || `local-${crypto.createHash('sha1').update(l.name).digest('hex').slice(0, 10)}`, name: l.name, tracks: [] };
      pl.folder = folderFor(state, l.name, pl.id);
      state.playlists.push(pl);
    }
    if (l.owner) pl.owner = l.owner;
    mergeTracks(pl, l.tracks, { complete: true });
    pl.partial = false;
    pl.fullAt = new Date().toISOString();
    log(`  ✓ ${pl.name} — ${pl.tracks.length} tracks (full list)`);
  }
  await saveState(lib, state);
  return lists.length;
}

/* -------------------------------------------------------------- files -- */

async function walkAudio(dir, acc = [], { depth = 0, maxDepth = 4 } = {}) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < maxDepth) await walkAudio(full, acc, { depth: depth + 1, maxDepth }); }
    else if (e.isFile() && AUDIO.includes(path.extname(e.name).toLowerCase()) && !PARTIAL.test(e.name)) acc.push(full);
  }
  return acc;
}

/** Move, falling back to copy + remove across drives. Never overwrites. */
async function moveFile(from, to) {
  await fsp.mkdir(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) throw Object.assign(new Error('target exists'), { code: 'EEXIST' });
  try {
    await fsp.rename(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fsp.copyFile(from, to, fs.constants.COPYFILE_EXCL);
    await fsp.unlink(from);
  }
}

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(p);
  const stem = p.slice(0, -ext.length);
  for (let n = 2; ; n++) { const c = `${stem} (${n})${ext}`; if (!fs.existsSync(c)) return c; }
}

const rel = (lib, p) => path.relative(lib, p).split(path.sep).join('/');

/** Mark the songs whose files are already in the library (dropped there by hand, or filed earlier). */
export async function reconcile(lib, state) {
  const songs = buildIndex(state);
  const known = new Set(Object.keys(state.files || {}));
  // Files that vanished (renamed or removed by hand) are no longer anyone's.
  for (const pl of state.playlists) for (const t of pl.tracks || []) if (t.file && !fs.existsSync(path.join(lib, t.file))) t.file = null;
  const wantedFolders = new Set(state.playlists.filter((p) => !p.skip).map((p) => p.folder));
  const files = [];
  for (const folder of wantedFolders) files.push(...await walkAudio(path.join(lib, folder)));
  let found = 0;
  for (const f of files) {
    const r = rel(lib, f);
    if (known.has(r) && state.playlists.some((p) => p.tracks?.some((t) => t.file === r))) continue;
    const m = matchFile(await describe(f), songs);
    if (!m) continue;
    if (assign(state, m.song, r)) found++;
  }
  return found;
}

/** Record that `relPath` is this song, in every playlist that wants it. Returns false if it already had a file. */
function assign(state, song, relPath) {
  let fresh = false;
  for (const pl of state.playlists) {
    if (pl.skip || !song.playlists.includes(pl.folder)) continue;
    for (const t of pl.tracks || []) {
      if (songKey(t) !== song.key && !(t.id && song.ids.has(t.id))) continue;
      if (!t.file) { t.file = relPath; fresh = true; }
    }
  }
  return fresh;
}

function fileOf(state, song) {
  for (const pl of state.playlists) for (const t of pl.tracks || []) if (t.file && (songKey(t) === song.key || (t.id && song.ids.has(t.id)))) return t.file;
  return null;
}

/**
 * File everything waiting. Sources: `_inbox/` (always), the Downloads folder
 * (unless --no-downloads), and any --from. Returns a report.
 */
export async function sortWaiting(lib, state, { from = [], downloads = true, to = null, dryRun = false, log = console.log, stableMs = 0, memo = new Map() } = {}) {
  const inbox = path.join(lib, '_inbox');
  await fsp.mkdir(inbox, { recursive: true });
  const target = to ? state.playlists.find((p) => fold(p.name) === fold(to) || fold(p.folder) === fold(to)) : null;
  if (to && !target) throw new Error(`no playlist called "${to}" — run \`status\` for the list`);

  // Where songs wait. `ours` = everything in it is meant for the library.
  // Downloads is not ours: only what matches a playlist leaves it, and only
  // its top level is looked at (that is where a browser saves). `--to` never
  // reads Downloads — "file everything into X" must not sweep a whole folder.
  const sources = [{ dir: inbox, ours: true, maxDepth: 4 }];
  if (downloads && !target) sources.push({ dir: path.join(os.homedir(), 'Downloads'), ours: false, maxDepth: 0 });
  for (const d of from) sources.push({ dir: path.resolve(d), ours: true, maxDepth: 4 });

  // A zip dropped into the inbox is opened where it lies (Windows 10+ ships bsdtar).
  for (const z of (await fsp.readdir(inbox).catch(() => [])).filter((n) => n.toLowerCase().endsWith('.zip'))) {
    const dest = path.join(inbox, path.basename(z, '.zip'));
    if (fs.existsSync(dest) || dryRun) continue;
    await fsp.mkdir(dest, { recursive: true });
    const r = spawnSync('tar', ['-xf', path.join(inbox, z), '-C', dest], { stdio: 'ignore' });
    if (r.status === 0) await moveFile(path.join(inbox, z), uniquePath(path.join(lib, '_unmatched', 'opened-zips', z))).catch(() => {});
    else log(`  ! could not open ${z} — unzip it into _inbox yourself`);
  }

  // Loose downloads at the top of the library (a SpotiMate file saved
  // straight into music/) are waiting too.
  const loose = [];
  for (const e of await fsp.readdir(lib, { withFileTypes: true }).catch(() => [])) {
    if (e.isFile() && AUDIO.includes(path.extname(e.name).toLowerCase()) && STAMPS.some((re) => re.test(e.name))) loose.push(path.join(lib, e.name));
  }

  const songs = buildIndex(state);
  const report = { filed: [], duplicates: [], unmatched: [], skipped: [] };
  const batches = [{ src: { ours: true }, files: loose }];
  for (const src of sources) batches.push({ src, files: await walkAudio(src.dir, [], { maxDepth: src.maxDepth }) });
  for (const { src, files } of batches) {
    for (const f of files) {
      const st = await fsp.stat(f).catch(() => null);
      if (!st || st.size === 0) continue;
      if (stableMs && Date.now() - st.mtimeMs < stableMs) { report.skipped.push(f); continue; }
      // Something in Downloads that matched nothing last time, unchanged, and
      // the playlists unchanged: do not read its tags again every 3 seconds.
      const memoKey = `${f}|${st.size}|${st.mtimeMs}|${songs.size}`;
      if (!src.ours && memo.has(memoKey)) continue;
      const desc = await describe(f);
      const m = matchFile(desc, songs);
      if (!m && !target) {
        if (src.ours) {
          const dest = uniquePath(path.join(lib, '_unmatched', path.basename(f)));
          if (!dryRun) await moveFile(f, dest).catch((e) => report.skipped.push(`${f}: ${e.message}`));
          report.unmatched.push(path.basename(f));
          log(`  ? ${path.basename(f)} — on no playlist → _unmatched`);
        } else {
          memo.set(memoKey, true);
        }
        continue;
      }
      if (m && fileOf(state, m.song)) {
        if (src.ours || STAMPS.some((re) => re.test(path.basename(f)))) {
          const dest = uniquePath(path.join(lib, '_duplicates', path.basename(f)));
          if (!dryRun) await moveFile(f, dest).catch((e) => report.skipped.push(`${f}: ${e.message}`));
          report.duplicates.push(path.basename(f));
          log(`  = ${path.basename(f)} — already have it (${fileOf(state, m.song)}) → _duplicates`);
        } else memo.set(memoKey, true);
        continue;
      }
      const home = target ? target.folder : m.song.playlists[0];
      const name = m
        ? `${safeName(m.song.artists.join(', ') || 'Unknown', 60)} - ${safeName(m.song.title, 100)}${path.extname(f).toLowerCase()}`
        : safeName(path.basename(f), 160);
      const dest = uniquePath(path.join(lib, home, name));
      if (!dryRun) {
        try { await moveFile(f, dest); } catch (e) { report.skipped.push(`${path.basename(f)}: ${e.code === 'EBUSY' || e.code === 'EPERM' ? 'still being written' : e.message}`); continue; }
        if (m) assign(state, m.song, rel(lib, dest));
      }
      const others = m ? m.song.playlists.filter((p) => p !== home) : [];
      report.filed.push({ from: path.basename(f), to: rel(lib, dest), playlists: m ? m.song.playlists : [home] });
      log(`  → ${rel(lib, dest)}${others.length ? `   (also on: ${others.join(', ')})` : ''}`);
    }
  }
  if (!dryRun && (report.filed.length || report.duplicates.length)) await saveState(lib, state);
  return report;
}

/** One folder per playlist, so there is always somewhere obvious to drop a song by hand. */
export async function makeFolders(lib, state) {
  for (const p of state.playlists) if (!p.skip && p.folder) await fsp.mkdir(path.join(lib, p.folder), { recursive: true });
  for (const d of ['_inbox']) await fsp.mkdir(path.join(lib, d), { recursive: true });
}

/* ------------------------------------------------------------- status -- */

export function summary(state) {
  return state.playlists.filter((p) => !p.skip).map((p) => {
    const total = p.tracks?.length || 0;
    const have = (p.tracks || []).filter((t) => t.file).length;
    return { name: p.name, folder: p.folder, have, total, partial: Boolean(p.partial), url: p.url };
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

/** `_checklist.html` in the library: what each playlist still lacks, with a way to find each song. */
export async function writeChecklist(lib, state) {
  const rows = summary(state);
  const haveAll = rows.reduce((s, r) => s + r.have, 0);
  const totalAll = rows.reduce((s, r) => s + r.total, 0);
  const sections = state.playlists.filter((p) => !p.skip).map((p) => {
    const missing = (p.tracks || []).filter((t) => !t.file);
    const have = (p.tracks || []).length - missing.length;
    const pct = p.tracks?.length ? Math.round((have / p.tracks.length) * 100) : 0;
    const links = missing.filter((t) => t.id).map((t) => `https://open.spotify.com/track/${t.id}`).join('\n');
    return `<section id="${esc(p.id)}" data-missing="${missing.length}">
  <header><h2>${esc(p.name)}</h2><span class="count">${have} / ${p.tracks?.length || 0}${p.partial ? ' <i title="Spotify only showed the first 100 — import the full list to see the rest">+?</i>' : ''}</span></header>
  <div class="bar"><i style="width:${pct}%"></i></div>
  <p class="meta">folder <code>${esc(p.folder)}</code>${p.url ? ` · <a href="${esc(p.url)}">playlist on Spotify</a>` : ''}${missing.length ? ` · <button type="button" data-copy="${esc(links)}">copy the ${missing.length} missing links</button>` : ' · complete'}</p>
  ${missing.length ? `<ol>${missing.map((t) => `<li><span class="t">${esc(t.title)}</span> <span class="a">${esc((t.artists || []).join(', '))}</span> <span class="d">${mmss(t.duration)}</span>
    ${t.id ? `<a href="https://open.spotify.com/track/${esc(t.id)}">Spotify</a>` : ''} <a href="https://bandcamp.com/search?q=${encodeURIComponent(`${(t.artists || [])[0] || ''} ${t.title}`)}">Bandcamp</a></li>`).join('')}</ol>` : ''}
</section>`;
  }).join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Library checklist</title><style>
:root{color-scheme:dark;--bg:#0b0d10;--raise:#12161b;--line:#232a33;--text:#e8edf3;--dim:#96a1ae;--faint:#838d99;--signal:#34d399}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,"Segoe UI",Inter,Roboto,Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:28px 16px 80px}
h1{font-size:28px;margin:0 0 4px}.lede{color:var(--dim);margin:0 0 6px}.how{color:var(--faint);font-size:13.5px;margin:0 0 22px}
.filters{display:flex;gap:8px;margin:0 0 18px;flex-wrap:wrap}.filters button,section button{background:var(--raise);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:5px 10px;font:inherit;font-size:13px;cursor:pointer}
.filters button[aria-pressed=true]{border-color:var(--signal)}
section{border:1px solid var(--line);background:var(--raise);border-radius:12px;padding:14px 16px;margin:0 0 12px}
section header{display:flex;justify-content:space-between;gap:12px;align-items:baseline}h2{font-size:17px;margin:0}
.count{font:13px ui-monospace,Menlo,Consolas,monospace;color:var(--dim)}.bar{height:4px;background:#1b2129;border-radius:4px;margin:8px 0}.bar i{display:block;height:100%;background:var(--signal);border-radius:4px}
.meta{font-size:13px;color:var(--faint);margin:0 0 6px}code{font-size:12.5px}a{color:#7dd3fc}
ol{margin:6px 0 0;padding-left:22px;font-size:14px}li{padding:2px 0}.a{color:var(--signal)}.d{color:var(--faint);font:12px ui-monospace,monospace}li a{font-size:12.5px;margin-left:6px}
body.hide-done section[data-missing="0"]{display:none}
</style></head><body><main>
<h1>Library checklist</h1>
<p class="lede">${haveAll} of ${totalAll} songs are in the library · ${rows.filter((r) => r.have === r.total && r.total).length} of ${rows.length} playlists complete · updated ${esc(new Date().toLocaleString())}</p>
<p class="how">Save a song into your Downloads folder or drop it into <code>music/_inbox</code>: while <code>watch</code> runs, the bot files it into the right playlist folder within seconds and this page catches up on its next refresh (it reloads itself every 30 s).</p>
<div class="filters"><button type="button" id="hide" aria-pressed="false">Hide complete playlists</button></div>
${sections}
</main><script>
document.addEventListener('click',async(e)=>{const b=e.target.closest('[data-copy]');if(!b)return;const t=b.dataset.copy;try{await navigator.clipboard.writeText(t)}catch{const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();document.execCommand('copy');a.remove()}b.textContent='copied';});
const h=document.getElementById('hide');const k='checklist.hide';try{if(localStorage.getItem(k)==='1'){document.body.classList.add('hide-done');h.setAttribute('aria-pressed','true')}}catch{}
h.onclick=()=>{const on=document.body.classList.toggle('hide-done');h.setAttribute('aria-pressed',String(on));try{localStorage.setItem(k,on?'1':'0')}catch{}};
setTimeout(()=>{const y=scrollY;try{sessionStorage.setItem('y',y)}catch{}location.reload()},30000);try{const y=+sessionStorage.getItem('y');if(y)scrollTo(0,y)}catch{}
</script></body></html>`;
  await fsp.writeFile(path.join(lib, '_checklist.html'), html);
  return { haveAll, totalAll };
}

/* ------------------------------------------------------------- lists -- */

/**
 * Every song of every playlist, written out: `_playlists.txt` to read (one
 * numbered list per playlist, ✓ for the songs already in the library) and
 * `_playlists.csv` to open in a spreadsheet. Rewritten on every read/status.
 */
export async function writeLists(lib, state) {
  const pls = state.playlists.filter((p) => !p.skip);
  const total = pls.reduce((s, p) => s + (p.tracks?.length || 0), 0);
  const lines = [
    'RADIO TOWER — EVERY SONG ON EVERY PLAYLIST',
    `${pls.length} playlists · ${total} songs · written ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '✓ = already in the music folder.  (+?) = Spotify showed only the first 100 songs of that playlist.',
    '',
  ];
  const csv = [['Playlist', 'No.', 'Title', 'Artists', 'Duration', 'In library', 'File', 'Spotify link'].join(',')];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  for (const p of pls) {
    const tracks = p.tracks || [];
    lines.push(`== ${p.name} — ${tracks.length} songs${p.partial ? ' (+?)' : ''}${p.owner ? ` · by ${p.owner}` : ''}`);
    if (p.url) lines.push(`   ${p.url}`);
    const w = String(tracks.length).length;
    tracks.forEach((t, i) => {
      lines.push(`${t.file ? '✓' : ' '} ${String(i + 1).padStart(w)}. ${(t.artists || []).join(', ')} — ${t.title}${Number.isFinite(t.duration) ? `  (${mmss(t.duration)})` : ''}`);
      csv.push([q(p.name), i + 1, q(t.title), q((t.artists || []).join(', ')), q(mmss(t.duration)), t.file ? 'yes' : '', q(t.file || ''), q(t.id ? `https://open.spotify.com/track/${t.id}` : '')].join(','));
    });
    lines.push('');
  }
  await fsp.writeFile(path.join(lib, '_playlists.txt'), `\uFEFF${lines.join('\r\n')}\r\n`);
  await fsp.writeFile(path.join(lib, '_playlists.csv'), `\uFEFF${csv.join('\r\n')}\r\n`);
  return { playlists: pls.length, songs: total };
}

/* ------------------------------------------------------------ publish -- */

/**
 * Send what the tower does not have yet: every audio file in a playlist
 * folder (and the other crates), plus playlists.json and channels.json. The
 * tower answers with what it holds (path + size); only the difference goes.
 * Needs the station key the tower was installed with (TOWER_KEY, or --key).
 */
export async function publish(lib, towerUrl, key, { fetchImpl = globalThis.fetch, log = console.log, dryRun = false, only = null } = {}) {
  const base = towerUrl.replace(/\/+$/, '');
  const head = { 'x-station-key': key };
  const res = await fetchImpl(`${base}/api/library/manifest`, { headers: head });
  if (res.status === 401 || res.status === 403) throw new Error('the tower refused the key');
  if (!res.ok) throw new Error(`the tower answered ${res.status} — is it a Radio Tower with uploads switched on?`);
  const theirs = new Map((await res.json()).files.map((f) => [f.path, f.size]));
  const mine = [];
  for (const e of await fsp.readdir(lib, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.') && (!only || only.some((o) => fold(o) === fold(e.name)))) {
      for (const f of await walkAudio(path.join(lib, e.name))) mine.push(f);
    }
  }
  for (const extra of [STATE_FILE, 'channels.json']) if (fs.existsSync(path.join(lib, extra))) mine.push(path.join(lib, extra));
  const todo = [];
  for (const f of mine) {
    const r = rel(lib, f);
    const size = (await fsp.stat(f)).size;
    if (theirs.get(r) !== size || r === STATE_FILE || r === 'channels.json') todo.push({ f, r, size });
  }
  const bytes = todo.reduce((s, t) => s + t.size, 0);
  log(`  ${todo.length} file(s) to send, ${(bytes / 1048576).toFixed(1)} MB`);
  let sent = 0;
  for (const t of todo) {
    if (dryRun) { log(`  · ${t.r}`); continue; }
    const body = Readable.toWeb(fs.createReadStream(t.f));
    const up = await fetchImpl(`${base}/api/library/file?path=${encodeURIComponent(t.r)}&size=${t.size}`, {
      method: 'PUT', headers: { ...head, 'content-type': 'application/octet-stream' }, body, duplex: 'half',
    });
    if (!up.ok) { log(`  ✗ ${t.r}: ${up.status} ${(await up.text()).slice(0, 120)}`); continue; }
    sent++;
    log(`  ↑ ${t.r}`);
  }
  if (sent && !dryRun) await fetchImpl(`${base}/api/rescan`, { method: 'POST', headers: head }).catch(() => {});
  return { sent, total: todo.length, bytes };
}

/** Where the tower is and its key, so `publish` needs no arguments: library/tower.json (never committed). */
export function towerSettings(dir = HERE) {
  try {
    const t = JSON.parse(fs.readFileSync(path.join(dir, 'tower.json'), 'utf8'));
    return { url: t.url || null, key: t.key || null };
  } catch {
    return { url: null, key: null };
  }
}

/* ---------------------------------------------------------------- CLI -- */

function args(argv) {
  const a = { _: [], from: [], downloads: true, dryRun: false, lib: null, to: null, key: null, publish: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--lib') a.lib = argv[++i];
    else if (k === '--from') a.from.push(argv[++i]);
    else if (k === '--to') a.to = argv[++i];
    else if (k === '--key') a.key = argv[++i];
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--no-downloads') a.downloads = false;
    else if (k === '--publish') a.publish = true;
    else if (k === '--only') a.only = argv[++i].split(',').map((x) => x.trim()).filter(Boolean);
    else a._.push(k);
  }
  return a;
}

const HELP = `
  Radio Tower — library bot

    node library/bot.mjs status              what each playlist has, and what is missing
    node library/bot.mjs list                every song of every playlist → music\_playlists.txt / .csv
    node library/bot.mjs read                refresh the playlists from Spotify
    node library/bot.mjs add <playlist url>  follow another playlist
    node library/bot.mjs sort                file what is waiting (_inbox + Downloads)
    node library/bot.mjs watch               keep filing as songs arrive (Ctrl+C to stop)
    node library/bot.mjs import <file>       a full playlist list (browser JSON / Exportify CSV)
    node library/bot.mjs publish             send new music to the cloud tower (library/tower.json, or <url> --key <key>)

    --lib <dir>  the music folder (default: the one next to this folder)
    --to "<playlist>"  file everything waiting into that playlist, matched or not
    --from <dir>  also sort from this folder      --no-downloads  leave Downloads alone
    --only "Folder A,Folder B"  publish only these folders
    --dry-run  say what would happen, change nothing
`;

async function main() {
  const a = args(process.argv.slice(2));
  const cmd = a._[0] || 'help';
  const lib = path.resolve(a.lib || process.env.MUSIC_DIR || path.join(HERE, '..', 'music'));
  const state = await loadState(lib);

  if (cmd === 'help' || cmd === '--help') { console.log(HELP); return; }

  if (cmd === 'add') {
    const ids = a._.slice(1).map(playlistIdOf).filter(Boolean);
    if (!ids.length) throw new Error('give one or more playlist links (open.spotify.com/playlist/…)');
    for (const id of ids) if (!state.playlists.some((p) => p.id === id)) state.playlists.push({ id, name: id, folder: '', tracks: [] });
    await readPlaylists(lib, state, { ids });
    await makeFolders(lib, state);
    console.log(`\n  following ${state.playlists.length} playlists. Next: node library/bot.mjs status`);
    return;
  }

  if (cmd === 'read') {
    console.log(`  reading ${state.playlists.filter((p) => !p.skip).length} playlists from Spotify…`);
    await readPlaylists(lib, state);
    await makeFolders(lib, state);
    await reconcile(lib, state);
    await saveState(lib, state);
    const { haveAll, totalAll } = await writeChecklist(lib, state);
    await writeLists(lib, state);
    console.log(`\n  ${haveAll} / ${totalAll} songs in the library. Checklist: ${path.join(lib, '_checklist.html')}`);
    console.log(`  Every song, as text: ${path.join(lib, '_playlists.txt')} (and _playlists.csv)`);
    return;
  }

  if (cmd === 'import') {
    const files = a._.slice(1);
    if (!files.length) throw new Error('give the file(s) to import');
    for (const f of files) await importFile(lib, state, f);
    await makeFolders(lib, state);
    await reconcile(lib, state);
    await saveState(lib, state);
    await writeChecklist(lib, state);
    await writeLists(lib, state);
    return;
  }

  if (cmd === 'list') {
    const r = await writeLists(lib, state);
    console.log(`  ${r.songs} songs on ${r.playlists} playlists → ${path.join(lib, '_playlists.txt')} (and _playlists.csv)`);
    return;
  }

  if (cmd === 'status') {
    await makeFolders(lib, state);
    const found = await reconcile(lib, state);
    if (found) await saveState(lib, state);
    const rows = summary(state);
    const w = Math.min(44, Math.max(...rows.map((r) => r.name.length), 8));
    for (const r of rows) {
      const bar = '█'.repeat(Math.round((r.total ? r.have / r.total : 0) * 20)).padEnd(20, '·');
      console.log(`  ${r.name.slice(0, w).padEnd(w)}  ${bar}  ${String(r.have).padStart(4)} / ${r.total}${r.partial ? '+' : ''}`);
    }
    const { haveAll, totalAll } = await writeChecklist(lib, state);
    await writeLists(lib, state);
    console.log(`\n  ${haveAll} / ${totalAll} songs. Checklist: ${path.join(lib, '_checklist.html')}`);
    return;
  }

  if (cmd === 'sort') {
    const r = await sortWaiting(lib, state, { from: a.from, downloads: a.downloads, to: a.to, dryRun: a.dryRun });
    await writeChecklist(lib, state);
    console.log(`\n  filed ${r.filed.length}${r.duplicates.length ? ` · ${r.duplicates.length} duplicate(s) → _duplicates` : ''}${r.unmatched.length ? ` · ${r.unmatched.length} not on any playlist → _unmatched (or: sort --to "<playlist>")` : ''}`);
    return;
  }

  if (cmd === 'watch') {
    console.log(`  watching ${path.join(lib, '_inbox')}${a.downloads ? ` and ${path.join(os.homedir(), 'Downloads')}` : ''} — Ctrl+C to stop`);
    await makeFolders(lib, state);
    await writeChecklist(lib, state);
    const memo = new Map();
    // --publish: whatever got filed goes up to the tower a minute later, so a
    // download is on air without anyone thinking about it.
    const tower = towerSettings();
    const autoPublish = a.publish && tower.url && tower.key;
    if (a.publish && !autoPublish) console.log('  (no library/tower.json yet — filing only, nothing is sent to the tower)');
    if (autoPublish) console.log(`  new songs go up to ${tower.url} a minute after they are filed`);
    let pendingSince = 0;
    for (;;) {
      try {
        // A browser is still writing a file for a few seconds after it appears.
        const r = await sortWaiting(lib, state, { from: a.from, downloads: a.downloads, to: a.to, stableMs: 4000, memo, log: (l) => console.log(`${new Date().toLocaleTimeString()} ${l.trim()}`) });
        if (r.filed.length || r.duplicates.length || r.unmatched.length) await writeChecklist(lib, state);
        if (autoPublish && r.filed.length && !pendingSince) pendingSince = Date.now();
        if (autoPublish && pendingSince && Date.now() - pendingSince > 60_000) {
          pendingSince = 0;
          const p = await publish(lib, tower.url, tower.key, { log: (l) => console.log(`${new Date().toLocaleTimeString()} ${l.trim()}`) });
          if (p.sent) console.log(`${new Date().toLocaleTimeString()} on the tower: ${p.sent} new`);
        }
      } catch (err) {
        console.error(`  ! ${err.message}`);
      }
      await new Promise((res) => setTimeout(res, 3000));
    }
  }

  if (cmd === 'publish') {
    const saved = towerSettings();
    const url = a._[1] || process.env.TOWER_URL || saved.url;
    const key = a.key || process.env.TOWER_KEY || saved.key;
    if (!url || !key) throw new Error('usage: publish <https://your-tower> --key <station key>   (or set TOWER_URL and TOWER_KEY)');
    const r = await publish(lib, url, key, { dryRun: a.dryRun, only: a.only });
    console.log(`\n  sent ${r.sent} of ${r.total}`);
    return;
  }

  console.log(HELP);
  process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(`\n  ✗ ${err.message}\n`);
    process.exit(1);
  });
}
