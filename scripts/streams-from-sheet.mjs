#!/usr/bin/env node
/**
 * Rebuild server/data/streams.json — what fills Chill and Energy — from Arthur's label sheet and the tower's
 * library (docs/STREAMS.md). His rule of 2026-11-17: « all the breakcore and all the faster BPM stuff » to Energy,
 * « all the liminal, barber beat, jazz » to Chill, Everything as it is.
 *
 *   python -I scripts/sheet-to-json.py <the .xlsx> sheet.json
 *   node scripts/streams-from-sheet.mjs sheet.json        writes server/data/streams.json, prints the totals
 *
 * Reads only the tower's public /api/library. Each album row of the sheet is decided by, in order: « Your
 * stream »; « Your label » (energy words win — breakcore, hyperpop, energy, dnb, jungle — then the first label he
 * typed); the label the tower gives it; the sheet's own suggestion for rows with none (Focus → Chill, Energy →
 * Energy). A stream then takes its labels (genres), plus the tracks the sheet sends it whatever their label, minus
 * the tracks whose label says one thing and the sheet another (excludeTracks).
 */
import fs from 'node:fs';

const [sheetFile] = process.argv.slice(2);
if (!sheetFile) { console.error('usage: node scripts/streams-from-sheet.mjs sheet.json'); process.exit(2); }
const sheet = JSON.parse(fs.readFileSync(sheetFile, 'utf8'));
const TOWER = process.env.TOWER_URL || 'https://129-151-227-129.sslip.io';
const LONG_S = 35 * 60; // a long mix, in the sheet as in the programme (2026-11-07)
const SEP = '|';

const library = [];
for (let offset = 0; ; offset += 500) {
  const page = await (await fetch(`${TOWER}/api/library?limit=500&offset=${offset}`)).json();
  library.push(...page.items);
  if (!page.items.length || library.length >= page.total) break;
}

// One sheet row per album, or per long mix, under the label the tower gave it.
const albumOf = (artist, album) => [String(artist ?? '').trim(), String(album ?? '').trim()].join(SEP);
const trackAlbum = (t) => albumOf(t.artist || 'Unknown artist', t.duration >= LONG_S ? `(long mix) ${t.title}` : t.album || '(no album)');

const CHILL = { 'Barber Beats': 'barber-beats', Vaporwave: 'vaporwave', Ambient: 'ambient', 'Lo-fi': 'lofi', Jazz: 'jazz' };
const ENERGY = { 'Atmospheric DnB': 'dnb-jungle', Electronic: 'electronic' };

/** His own words: energy words win, then the first label he typed. */
function fromHisWords(s) {
  const w = s.toLowerCase();
  const why = `his label « ${s.trim()} »`;
  if (/breakcore|hyperpop|energ|dnb|jungle|drum and bass/.test(w)) return { stream: 'energy', why };
  if (/adjacent barber/.test(w)) return { stream: 'chill', why }; // « VGM adjacent barberbeats »
  const first = w.split(/\s*(?:\/|,|\band\b|\bn\b)\s*/)[0].trim();
  if (/barber|jazz|lo-?fi|slush|slosh|vapor|ambient|bossa|beat tape/.test(first)) return { stream: 'chill', why };
  if (/electro/.test(first)) return { stream: 'energy', why };
  return { stream: null, why };
}

function decide(r) {
  if (r['Your stream']) {
    const y = String(r['Your stream']).toLowerCase();
    return { stream: /energy/.test(y) ? 'energy' : /focus|easy|chill/.test(y) ? 'chill' : null, why: `his stream « ${r['Your stream']} »` };
  }
  if (r['Your label']) return fromHisWords(String(r['Your label']));
  const label = r['Label today'] !== 'Unsorted' ? r['Label today'] : r['Suggested label'];
  if (label in CHILL) return { stream: 'chill', why: `label ${label}` };
  if (label in ENERGY) return { stream: 'energy', why: `label ${label}` };
  if (r['Suggested stream'] === 'Focus') return { stream: 'chill', why: 'sheet suggestion Focus' };
  if (r['Suggested stream'] === 'Energy') return { stream: 'energy', why: 'sheet suggestion Energy' };
  return { stream: null, why: label ? `label ${label}` : 'no label' };
}

const byRow = new Map();
for (const t of library) {
  const k = [t.genreLabel, trackAlbum(t)].join(SEP);
  if (!byRow.has(k)) byRow.set(k, []);
  byRow.get(k).push(t);
}

const out = {
  chill: { genres: Object.values(CHILL), tracks: [], excludeTracks: [] },
  energy: { genres: Object.values(ENERGY), tracks: [], excludeTracks: [] },
};
const report = { rows: 0, unmatched: [], chill: { rows: 0, tracks: 0, hours: 0 }, energy: { rows: 0, tracks: 0, hours: 0 } };
const covered = new Set();
for (const r of sheet.rows) {
  report.rows++;
  const album = albumOf(r.Artist, r['Album, or the long mix']);
  let tracks = byRow.get([r['Label today'], album].join(SEP)) || [];
  // A label the tower's rules changed since the sheet was made: the same artist and album under any label.
  if (!tracks.length) tracks = library.filter((t) => trackAlbum(t) === album && !covered.has(t.id));
  if (!tracks.length) { report.unmatched.push(album); continue; }
  const d = decide(r);
  for (const t of tracks) {
    covered.add(t.id);
    for (const s of ['chill', 'energy']) {
      const byLabel = out[s].genres.includes(t.genreSlug);
      if (d.stream === s && !byLabel) out[s].tracks.push(t.id);
      if (d.stream !== s && byLabel) out[s].excludeTracks.push(t.id);
    }
  }
  if (d.stream) {
    report[d.stream].rows++;
    report[d.stream].tracks += tracks.length;
    report[d.stream].hours += tracks.reduce((h, t) => h + t.duration, 0) / 3600;
  }
}
report.notInSheet = library.filter((t) => !covered.has(t.id)).length;
for (const s of ['chill', 'energy']) {
  out[s].tracks = [...new Set(out[s].tracks)].sort();
  out[s].excludeTracks = [...new Set(out[s].excludeTracks)].sort();
  report[s].hours = Math.round(report[s].hours * 10) / 10;
}

const file = new URL('../server/data/streams.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
data.built = new Date().toISOString().slice(0, 10);
data.chill = { label: 'Chill', ...out.chill };
data.energy = { label: 'Energy', ...out.energy };
// Ids several to a line: the file stays short enough to read.
fs.writeFileSync(file, `${JSON.stringify(data, null, 1).replace(/\n {2,}"([0-9a-f]{12})"/g, ' "$1"')}\n`);
console.log(`${report.rows} rows, ${report.unmatched.length} not found on the tower, ${report.notInSheet} tracks the sheet does not list (they go by their label)`);
console.log(`Chill:  ${report.chill.rows} rows, ${report.chill.tracks} tracks, ${report.chill.hours} h`);
console.log(`Energy: ${report.energy.rows} rows, ${report.energy.tracks} tracks, ${report.energy.hours} h`);
if (report.unmatched.length) console.log(`not found: ${report.unmatched.slice(0, 10).join(' · ')}`);
