#!/usr/bin/env node
/**
 * Ortis's labels, from his label sheet onto the tower (BACKLOG W1, 2026-11-22): writes server/data/labels.json,
 * which library.js applies over the rules at every scan.
 *
 *   python -I scripts/sheet-to-json.py <the .xlsx> sheet.json
 *   node scripts/labels-from-sheet.mjs sheet.json        writes server/data/labels.json, prints the totals
 *
 * Each album row of the sheet (artist + album, a long mix alone) gives its tracks one label, in this order:
 *  1. « Your label », his own words, read as the label whose word comes first (« jazz lofi anime » is Jazz,
 *     « Denz1000 is all uk garage n house » is Electronic);
 *  2. a label he gave another row of the same artist (« if I labeled one of his tracks in a way, probably the rest is
 *     the same »), Unknown artist excepted;
 *  3. the sheet's « Right label » (the tower's own, or the guess he left standing).
 * « ? » and « Mixed » give nothing: those tracks keep what the rules say. Reads only the tower's public /api/library.
 */
import fs from 'node:fs';
import { GENRE_BY_LABEL } from '../server/lib/genre.js';

const WORDS = [
  [/hyperpop/, 'Hyperpop'], [/breakcore/, 'Breakcore'], [/barber/, 'Barber Beats'], [/sl[ou]shwave|slosh|slush/, 'Slushwave'],
  [/bossa/, 'Bossa nova'], [/beat ?tape/, 'Beat tape'], [/lo-?fi/, 'Lo-fi'], [/jazz/, 'Jazz'], [/\bvgm\b|video ?game/, 'Video Game'],
  [/atmospheric|\bdnb\b|drum ?(n|and|&) ?bass|jungle/, 'Atmospheric DnB'], [/funk/, 'Funk'], [/hip ?hop/, 'Hip-hop'], [/rap fr/, 'Rap FR'],
  [/electro|techno|house|garage|garabe|\bukg|daft punk/, 'Electronic'], [/vapor/, 'Vaporwave'], [/ambient/, 'Ambient'],
  [/trip-?hop/, 'Trip-Hop'], [/chanson/, 'Chanson'], [/classical|classique/, 'Classical'], [/\brock\b/, 'Rock & Pop'], [/\bpop\b/, 'Pop'],
];
/** His words → one label: the one whose word comes first in what he typed; null when no word names one. */
export function labelOf(text) {
  const w = String(text || '').toLowerCase();
  let best = null, at = Infinity;
  for (const [re, lab] of WORDS) { const m = re.exec(w); if (m && m.index < at) { at = m.index; best = lab; } }
  return best;
}

const SEP = '|';
const key = (a, b) => [String(a ?? '').trim(), String(b ?? '').trim()].join(SEP);
const LONG_S = 35 * 60;
const albumOf = (t) => key(t.artist || 'Unknown artist', t.duration >= LONG_S ? `(long mix) ${t.title}` : t.album || '(no album)');

/** Each row's final label (and why), with the artist rule applied. Pure: the tests call it. */
export function decideRows(rows) {
  const out = rows.map((r) => {
    const his = labelOf(r['Your label']);
    return { artist: String(r.Artist ?? '').trim(), album: String(r['Album, or the long mix'] ?? '').trim(), his, label: his || r['Right label'] || null, why: his ? 'his label' : 'sheet' };
  });
  const byArtist = new Map();
  for (const o of out) if (o.his && o.artist && o.artist !== 'Unknown artist') byArtist.set(o.artist, [...(byArtist.get(o.artist) || []), o.his]);
  for (const o of out) {
    const theirs = byArtist.get(o.artist);
    if (o.his || !theirs) continue;
    const counts = {}; for (const l of theirs) counts[l] = (counts[l] || 0) + 1;
    o.label = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    o.why = 'his label for the artist';
  }
  return out;
}

if (String(process.argv[1] || '').replace(/\\/g, '/').endsWith('scripts/labels-from-sheet.mjs')) {
  const [sheetFile] = process.argv.slice(2);
  if (!sheetFile) { console.error('usage: node scripts/labels-from-sheet.mjs sheet.json'); process.exit(2); }
  const sheet = JSON.parse(fs.readFileSync(sheetFile, 'utf8'));
  const TOWER = process.env.TOWER_URL || 'https://129-151-227-129.sslip.io';
  const library = [];
  for (let offset = 0; ; offset += 500) {
    const page = await (await fetch(`${TOWER}/api/library?limit=500&offset=${offset}`)).json();
    library.push(...page.items);
    if (!page.items.length || library.length >= page.total) break;
  }
  const byAlbum = new Map();
  for (const t of library) { const k = albumOf(t); if (!byAlbum.has(k)) byAlbum.set(k, []); byAlbum.get(k).push(t); }
  const tracks = {}, count = {};
  let rows = 0, unmatched = 0;
  for (const o of decideRows(sheet.rows)) {
    rows++;
    const g = GENRE_BY_LABEL.get(String(o.label || '').toLowerCase());
    const ts = byAlbum.get(key(o.artist, o.album)) || [];
    if (!ts.length) { unmatched++; continue; }
    if (!g) continue;
    for (const t of ts) { tracks[t.id] = g.slug; count[g.label] = (count[g.label] || 0) + 1; }
  }
  const file = new URL('../server/data/labels.json', import.meta.url);
  fs.writeFileSync(file, JSON.stringify({ _readme: 'His labels, track by track, from his label sheet (scripts/labels-from-sheet.mjs, docs/STREAMS.md). library.js applies them over the rules of genre.js at every scan.', built: new Date().toISOString().slice(0, 10), tracks }, null, 0) + '\n');
  console.log(`${rows} rows, ${unmatched} not found on the tower; ${Object.keys(tracks).length} tracks labelled:`, count);
}
