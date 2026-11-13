#!/usr/bin/env node
/**
 * Does the same song come round twice, close together? (Ortis, 2026-11-13, of the six Snowpoint Lounge
 * recordings that are on the tower twice under two titles: « I love Snowpoint Lounge … have them play. Just
 * do warn me if they ever play like twice the same song over. »)
 *
 * Reads only the tower's public API, so it runs anywhere with the internet — the laptop, GitHub's daily
 * run (.github/workflows/repeats.yml), a cloud agent:
 *   - /api/library, every page, for each track's artist, title and length;
 *   - /api/schedule, 48 hours at a time, for what the tower will actually play over the next days — the
 *     programme is a function of the clock and the library, so the days ahead are already known (until a
 *     publish or a Booth reorder changes them; the daily run reads them again).
 *
 * « The same song » is the same track, or its twin — two files of one recording, which the tower's own dedupe
 * cannot see (Japanese titles fold to nothing there, and the names differ):
 *   - the same artist, or one of the two without one (« Unknown artist »: the backup's copies carry no tags);
 *   - and either the same title once case, width, punctuation and anything in brackets are set aside, or one
 *     inside the other, with lengths within 0.2 s (« 空間と時間 (ep version) » / « (ep album version) »);
 *   - or titles made mostly of the same letters, with lengths within 0.05 s (« fallacious will and desire » /
 *     « fallacious willpower », « ミチナの飲み物 » / « A3 ミチナで飲む »).
 * Measured on the tower's library of 2026-11-07: it finds the six copies from the Behold backup, the two
 * remastered Snowpoint albums against their originals, and no two different songs.
 *
 *   node scripts/repeats.mjs                 the next 7 days, warn within 3 hours
 *   node scripts/repeats.mjs --days 14 --within 120 --tower https://… --json
 *
 * Exit 0: nothing comes round too soon. Exit 1: a warning (listed). Exit 2: the tower could not be read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Lengths within this for titles that are the same; within NEAR_S for titles that are only alike. */
export const TOLERANCE_S = 0.2;
export const NEAR_S = 0.05;
const HOUR = 3_600_000;

/** A title or an artist with case, width, accents' composition and everything but letters and digits set aside. */
export const fold = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

const unbracket = (s) => String(s ?? '').replace(/[([{（【［][^)\]}）】］]*[)\]}）】］]/g, ' ');
const UNKNOWN = new Set(['', 'unknownartist', 'unknown', 'various', 'variousartists']);

/** Sørensen–Dice: the share of pieces in common, counted with repeats. */
function dice(xs, ys) {
  if (!xs.length || !ys.length) return 0;
  const count = new Map();
  for (const c of xs) count.set(c, (count.get(c) || 0) + 1);
  let common = 0;
  for (const c of ys) { const n = count.get(c); if (n) { common++; count.set(c, n - 1); } }
  return (2 * common) / (xs.length + ys.length);
}
const pairs = (s) => { const c = [...s]; return c.slice(1).map((x, i) => c[i] + x); };
const latinMostly = (s) => { const c = [...s]; return c.filter((x) => /[a-z]/.test(x)).length * 2 >= c.length; };
/** The title before its first « - » or « | »: « Space Jazz | Jazzy Beats | 1 Hour Playlist » is « Space Jazz ». */
const head = (t) => String(t ?? '').split(/\s[-|–—]\s/).map((x) => x.trim()).find(Boolean) || String(t ?? '');

/**
 * How two titles compare: 'same' (equal, or one inside the other, brackets aside), 'alike', or null. Alike, for
 * a title mostly in Latin letters: the same letter pairs in its head (« fallacious will and desire » /
 * « fallacious willpower »). For one mostly in other scripts, where a character is a word: half the
 * characters in common (« ミチナの飲み物 » / « A3 ミチナで飲む »).
 */
export function titleMatch(a, b) {
  const x = fold(unbracket(a)) || fold(a);
  const y = fold(unbracket(b)) || fold(b);
  if (!x || !y) return null;
  if (x === y || x.includes(y) || y.includes(x)) return 'same';
  if (latinMostly(x) && latinMostly(y)) {
    const hx = fold(unbracket(head(a))) || x;
    const hy = fold(unbracket(head(b))) || y;
    return dice(pairs(hx), pairs(hy)) >= 0.6 ? 'alike' : null;
  }
  return dice([...x], [...y]) >= 0.5 ? 'alike' : null;
}

/** Same artist, or one of the two has none worth the name. */
export const sameArtist = (a, b) => { const x = fold(a); const y = fold(b); return x === y || UNKNOWN.has(x) || UNKNOWN.has(y); };

/** Two tracks that are one recording, by the rule above. */
export function sameRecording(a, b, { tolerance = TOLERANCE_S, near = NEAR_S } = {}) {
  if (!Number.isFinite(a.duration) || !Number.isFinite(b.duration) || !sameArtist(a.artist, b.artist)) return false;
  const d = Math.abs(a.duration - b.duration);
  if (d > tolerance) return false;
  const m = titleMatch(a.title, b.title);
  return m === 'same' || (m === 'alike' && d <= near);
}

/**
 * Which tracks are one recording: a map from track id to a group id (the first track's). A track alone is
 * its own group.
 */
export function recordings(library, opts = {}) {
  const tolerance = opts.tolerance ?? TOLERANCE_S;
  const group = new Map(library.map((t) => [t.id, t.id]));
  const root = (id) => { let r = id; while (group.get(r) !== r) r = group.get(r); return r; };
  // Sorted by length, each track is compared only with those a fraction of a second longer: a few comparisons each.
  const list = library.filter((t) => Number.isFinite(t.duration)).sort((a, b) => a.duration - b.duration);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length && list[j].duration - list[i].duration <= tolerance; j++) {
      if (sameRecording(list[i], list[j], opts)) {
        const a = root(list[i].id);
        const b = root(list[j].id);
        if (a !== b) group.set(b, a);
      }
    }
  }
  return new Map([...group.keys()].map((id) => [id, root(id)]));
}

/** The twins found: groups of more than one track, as lists of tracks. */
export function twins(library, opts) {
  const g = recordings(library, opts);
  const byGroup = new Map();
  for (const t of library) {
    const k = g.get(t.id);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(t);
  }
  return [...byGroup.values()].filter((l) => l.length > 1);
}

/**
 * Every time a recording starts again less than `withinMs` after it last ended, in the schedule `items`
 * ({id, title, artist, startsAt, endsAt}). `twin: true` when the two plays are two different files.
 */
export function findRepeats(library, items, { withinMs = 3 * HOUR, ...opts } = {}) {
  const g = recordings(library, opts);
  const last = new Map();
  const out = [];
  const seen = new Set();
  for (const it of [...items].sort((a, b) => a.startsAt - b.startsAt)) {
    if (seen.has(it.startsAt)) continue; // the 48-hour windows overlap by nothing, but be safe
    seen.add(it.startsAt);
    const k = g.get(it.id) ?? it.id;
    const prev = last.get(k);
    if (prev && it.startsAt - prev.endsAt < withinMs) {
      out.push({ first: prev, second: it, gapMs: it.startsAt - prev.endsAt, twin: prev.id !== it.id });
    }
    last.set(k, it);
  }
  return out;
}

/* ---------------------------------------------------------------- the tower -- */

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export async function readTower(tower, { days = 7, now = Date.now(), fetchImpl = globalThis.fetch } = {}) {
  const base = tower.replace(/\/+$/, '');
  const library = [];
  for (let offset = 0; ; offset += 500) {
    const page = await getJson(`${base}/api/library?limit=500&offset=${offset}`, fetchImpl);
    const got = page.tracks || page.items || [];
    library.push(...got);
    if (!got.length || library.length >= (page.total ?? 0)) break;
  }
  const items = [];
  for (let from = now; from < now + days * 24 * HOUR; from += 48 * HOUR) {
    const to = Math.min(from + 48 * HOUR, now + days * 24 * HOUR);
    const page = await getJson(`${base}/api/schedule?from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}`, fetchImpl);
    items.push(...(page.items || []));
  }
  return { library, items };
}

const paris = (ms) => new Date(ms).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function towerFromConfig() {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    return JSON.parse(fs.readFileSync(path.join(root, 'site', 'config.json'), 'utf8')).tower?.url || null;
  } catch { return null; }
}

async function main(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const tower = arg('--tower', process.env.TOWER_URL || towerFromConfig());
  const days = Number(arg('--days', 7));
  const within = Number(arg('--within', 180));
  if (!tower) { console.error('No tower: pass --tower https://… or set TOWER_URL.'); return 2; }
  let data;
  try { data = await readTower(tower, { days }); } catch (err) { console.error(`Could not read the tower: ${err.message}`); return 2; }
  const pairs = twins(data.library);
  const found = findRepeats(data.library, data.items, { withinMs: within * 60_000 });
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ tower, days, withinMinutes: within, tracks: data.library.length, slots: data.items.length,
      twins: pairs.map((l) => l.map((t) => `${t.artist} — ${t.title}`)), repeats: found }, null, 1));
  } else {
    console.log(`${data.library.length} tracks on the tower; ${pairs.length} recording(s) there under two names or more; ${data.items.length} slots over the next ${days} days.`);
    for (const l of pairs) console.log(`  twins: ${l.map((t) => `« ${t.title} »`).join(' = ')} (${l[0].artist})`);
    if (!found.length) console.log(`Nothing comes round within ${within} minutes of itself.`);
    for (const r of found) {
      console.log(`WARNING ${r.twin ? 'same recording, two files' : 'same track'}: « ${r.first.title} » at ${paris(r.first.startsAt)}, then « ${r.second.title} » at ${paris(r.second.startsAt)} — ${Math.round(r.gapMs / 60_000)} min between them (${r.first.artist || r.second.artist || '?'}).`);
    }
  }
  return found.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
