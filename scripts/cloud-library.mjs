#!/usr/bin/env node
/**
 * The cloud channel's library — site/station/library.json.
 *
 *   node scripts/cloud-library.mjs check                 # validate library.json (CI runs this)
 *   node scripts/cloud-library.mjs import <lineup.json>  # rebuild it from a Wix LINEUP export
 *
 * library.json is the source of truth once written: edit it by hand to add a
 * track (title, artist, album, duration, sources). The only rules that matter
 * are enforced by `check`, because a wrong duration desyncs everyone after it
 * (Web-Creative/sites/globe-trotter/PLAYLIST.md: "La durée n'est jamais
 * approximative").
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { classify } from '../server/lib/genre.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'site/station/library.json');

// Covers already published by the Crates room (collections/collection.json).
const COVERS = {
  'HYRULE DREAMS': 'collections/music/covers/hyrule-dreams.jpg',
  'By Thy Doors of Ash': 'collections/music/covers/by-thy-doors-of-ash.jpg',
  '思い出の森': 'collections/music/covers/omoide-no-mori.jpg',
  'Orre Region': 'collections/music/covers/orre-region.jpg',
};

// Tracks that score a Globe Trotter text (Web-Creative PLAYLIST.md, ♦).
const SCORES = {
  voyages: 'voyages',
  'cora%C3%A7%C3%A3o-sert%C3%A3o': 'coracao-sertao',
  'opal-orre': 'opal-orre',
};

export function trackIdFor(url) {
  return crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 12);
}

export function validateLibrary(lib) {
  const problems = [];
  if (!lib || !Array.isArray(lib.tracks)) return ['library.json has no "tracks" array'];
  if (!Number.isFinite(Date.parse(lib.epoch))) problems.push('"epoch" must be an ISO date');
  const ids = new Set();
  lib.tracks.forEach((t, i) => {
    const where = `track ${i + 1} (${t?.title ?? '?'})`;
    if (!t || typeof t !== 'object') { problems.push(`${where}: not an object`); return; }
    if (!/^[0-9a-f]{12}$/.test(t.id || '')) problems.push(`${where}: id must be 12 hex chars`);
    if (ids.has(t.id)) problems.push(`${where}: duplicate id ${t.id}`);
    ids.add(t.id);
    if (!t.title) problems.push(`${where}: missing title`);
    if (!(Number.isFinite(t.duration) && t.duration > 1 && t.duration < 6 * 3600)) problems.push(`${where}: duration must be seconds (got ${t.duration})`);
    if (!Array.isArray(t.sources) || !t.sources.length) problems.push(`${where}: needs at least one source URL`);
    for (const s of t.sources || []) {
      // A site path may be percent-encoded ("01%20Carrier%20Wave.mp3"); a
      // raw space, a scheme like http:, javascript: or data: may not.
      if (!/^https:\/\//.test(s) && !/^(\.\/|\/)?(?:[\w./-]|%[0-9A-Fa-f]{2})+$/.test(s)) problems.push(`${where}: source must be https:// or a site path (${s})`);
      if (/\.(wav|flac)$/i.test(s)) problems.push(`${where}: ${s} is lossless — link the transcoded -320.mp3 asset instead`);
    }
  });
  return problems;
}

function importLineup(file) {
  const lineup = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tracks = lineup.map((t) => {
    const url = t.mp3;
    const g = classify({ artist: t.artist, album: t.album, title: t.title });
    const out = {
      id: trackIdFor(url),
      title: t.title,
      artist: t.artist,
      album: t.album || null,
      duration: t.dur,
      sources: [url],
      art: COVERS[t.album] || null,
      genreSlug: g.slug,
      genreLabel: g.label,
      genreAccent: g.accent,
    };
    if (t.slug && SCORES[t.slug]) out.scores = SCORES[t.slug];
    return out;
  });
  const lib = {
    _readme: [
      'The cloud channel. Every visitor computes the programme from this file,',
      'the epoch and the clock — change a duration and everyone after it moves.',
      'Add a track: append an object with a unique 12-hex id, exact duration in',
      'seconds, and one or more https sources (tried in order). Then run',
      '`node scripts/cloud-library.mjs check`. Order matters: shuffle is off,',
      'the station plays this list top to bottom, forever.',
    ],
    name: 'Radio Tower',
    tagline: 'One signal. Everyone on the same second.',
    epoch: '2026-01-01T00:00:00Z',
    shuffle: false,
    gapSeconds: 0,
    tracks,
  };
  const problems = validateLibrary(lib);
  if (problems.length) throw new Error(problems.join('\n'));
  fs.writeFileSync(LIB, JSON.stringify(lib, null, 2) + '\n');
  const total = tracks.reduce((s, t) => s + t.duration, 0);
  console.log(`wrote ${path.relative(ROOT, LIB)} — ${tracks.length} tracks, ${(total / 60).toFixed(1)} min`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'import' && arg) importLineup(arg);
  else if (cmd === 'check') {
    const lib = JSON.parse(fs.readFileSync(LIB, 'utf8'));
    const problems = validateLibrary(lib);
    if (problems.length) { console.error(problems.map((p) => `  ✗ ${p}`).join('\n')); process.exit(1); }
    const total = lib.tracks.reduce((s, t) => s + t.duration, 0);
    console.log(`  ✓ ${lib.tracks.length} tracks, ${Math.floor(total / 3600)}h${String(Math.floor((total % 3600) / 60)).padStart(2, '0')} loop, every duration and source valid`);
  } else {
    console.error('usage: cloud-library.mjs check | import <lineup.json>');
    process.exit(2);
  }
}
