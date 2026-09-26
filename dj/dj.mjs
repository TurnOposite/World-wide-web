#!/usr/bin/env node
/**
 * The DJ — a booth for Radio Tower.
 *
 * Two things this program can touch, and nothing else:
 *
 *   1. The MP3 files on disk (read-only, always — the DJ never deletes audio).
 *   2. The station's HTTP API, over what the docs here call the Pi bridge.
 *
 * It is deliberately standalone: zero dependencies, no import from `../server`,
 * so `cd dj && node dj.mjs` works against a station running anywhere — this
 * laptop, the Pi on the LAN, or the public tunnel — without the rest of the
 * repo being present or correct.
 *
 * The one thing to understand before changing anything here:
 *
 *   A SPONTANEOUS EMISSION IS A PERMUTATION.
 *
 * The station's programme is a pure function of wall-clock time. The only
 * sanctioned way to overrule it is `POST /api/queue/reorder`, which permutes a
 * bounded window of upcoming slots — the same multiset of durations, in a
 * different order — so the window still ends at the same instant and every
 * cycle boundary since the epoch stays where it was. The DJ therefore does not
 * "insert" a track; it *brings forward* the tracks already standing in the
 * window. If a mood is not represented in the window, say so plainly instead
 * of pretending. See dj/CLAUDE.md §"What the DJ cannot do".
 *
 * Usage:
 *   node dj.mjs status
 *   node dj.mjs moods
 *   node dj.mjs files [--genre <slug>] [--grep <text>] [--big]
 *   node dj.mjs library [--grep <text>]
 *   node dj.mjs emit "<mood>" [--top N] [--dry-run]
 *   node dj.mjs clear
 *   node dj.mjs rescan
 *   node dj.mjs doctor
 *
 * Environment:
 *   STATION_URL   default http://localhost:8080     (--url overrides)
 *   STATION_KEY   required for emit / clear / rescan (--key overrides)
 *   MUSIC_DIR     default ../music                  (--music overrides)
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wav', '.webm']);

// ---------------------------------------------------------------------------
// text folding
//
// This library is full of fullwidth Latin ("ＶＥＲＩＤＩＳ"), bold-math styling
// ("𝗟𝗢𝗦𝗧 𝗩𝗜𝗗𝗘𝗢𝗚𝗔𝗠𝗘 𝗠𝗔𝗟𝗟") and accents. A mood match that compares raw strings
// misses precisely the third of the library that most needs matching. Kept
// deliberately duplicated from server/lib/genre.js rather than imported — the
// booth has to run with no repo around it.
// ---------------------------------------------------------------------------
export function fold(input) {
  if (!input) return '';
  let s = String(input).normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[\u{1D400}-\u{1D7FF}]/gu, (ch) => {
    const offset = (ch.codePointAt(0) - 0x1d400) % 52;
    return offset < 26 ? String.fromCharCode(65 + offset) : String.fromCharCode(97 + (offset - 26));
  });
  return s.toLowerCase().replace(/[_\-\[\]()（）【】]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// moods
// ---------------------------------------------------------------------------

let MOODS = null;
function moods() {
  if (MOODS) return MOODS;
  MOODS = JSON.parse(fs.readFileSync(path.join(HERE, 'moods.json'), 'utf8'));
  return MOODS;
}

/**
 * Turn whatever Ortis typed into a scoring rule.
 *
 * A named mood from moods.json wins. Anything else is treated as free text:
 * its words are matched against genre slugs and labels, and whatever is left
 * becomes keywords. "play something like macroblank" is a legitimate mood.
 */
export function resolveMood(input, vocab = moods()) {
  const q = fold(input);
  if (!q) throw new Error('Name a mood. `node dj.mjs moods` lists the ones with rules.');

  for (const [name, rule] of Object.entries(vocab.moods)) {
    if (q === name || (rule.aliases || []).some((a) => fold(a) === q)) {
      return { name, free: false, ...rule };
    }
  }

  const words = q.split(' ').filter((w) => w.length > 2);
  const genres = {};
  const keywords = [];
  for (const w of words) {
    const hit = vocab.genres.find((g) => fold(g.slug).includes(w) || fold(g.label).includes(w));
    if (hit) genres[hit.slug] = 1;
    else keywords.push(w);
  }
  return { name: input, free: true, genres, keywords, prefer: null, why: 'free-text mood' };
}

/**
 * Score one slot against a mood. Higher is nearer the front.
 *
 * The weights are ordinal, not physical: genre is the strongest signal the
 * library actually carries, a filename keyword is a good second, and duration
 * is only a nudge — enough to break a tie between two barber-beats tracks when
 * the mood asked for something short, never enough to outrank the genre.
 */
export function scoreTrack(track, mood) {
  let score = 0;
  const hay = fold([track.title, track.artist, track.album, track.genreLabel].filter(Boolean).join(' '));

  const g = mood.genres?.[track.genreSlug];
  if (g) score += 100 * g;

  for (const kw of mood.keywords || []) {
    if (hay.includes(fold(kw))) score += 40;
  }

  for (const kw of mood.exclude || []) {
    if (hay.includes(fold(kw)) || track.genreSlug === kw) score -= 200;
  }

  const mins = (track.duration || 0) / 60;
  if (mood.prefer === 'short') score += mins <= 8 ? 20 : mins <= 20 ? 5 : -15;
  if (mood.prefer === 'long') score += mins >= 30 ? 20 : mins >= 10 ? 8 : -10;

  return score;
}

// ---------------------------------------------------------------------------
// the movable window
//
// Copied in behaviour from public/queue.js so the booth and the browser editor
// can never disagree about which slots are legally movable. A window must be
// contiguous, unlocked, and within ONE cycle: two cycles are different
// shuffles, so a rearrangement across the seam is not a permutation of either.
// The LONGEST run wins (ties to the earliest) — taking the first run offered
// nothing at all about one time in four on a small library.
// ---------------------------------------------------------------------------
export function movableWindow(slots = []) {
  let best = null;
  let i = 0;
  while (i < slots.length) {
    const s = slots[i];
    if (!s || s.locked) { i++; continue; }
    const cycleIndex = s.cycleIndex;
    let end = i;
    while (end < slots.length && slots[end] && !slots[end].locked && slots[end].cycleIndex === cycleIndex) end++;
    if (!best || end - i > best.to - best.from) best = { from: i, to: end, cycleIndex };
    i = end;
  }
  if (!best || best.to - best.from < 2) return null;
  const chosen = slots.slice(best.from, best.to);
  return {
    cycleIndex: best.cycleIndex,
    startWithin: chosen[0].withinCycle,
    // The window's extent in *slot addresses*, not ids. With a library smaller
    // than the lookahead the same track id appears several times in `upcoming`,
    // so "is this slot in the window" can only be answered by its address.
    endWithin: chosen[chosen.length - 1].withinCycle,
    slots: chosen,
    ids: chosen.map((s) => s.id),
  };
}

/**
 * Plan an emission: what the window looks like now, and what it would look
 * like after. Pure — no network, no side effects — so it is testable and so
 * `--dry-run` and the real thing can never diverge.
 *
 * `top` limits the disruption: with `--top 3`, the three best-matching tracks
 * are brought to the front and everything else keeps its existing relative
 * order. A listener hears the mood arrive, not the whole hour rewritten.
 */
export function planEmission(slots, mood, { top = 0 } = {}) {
  const win = movableWindow(slots);
  if (!win) return { ok: false, error: 'no_movable_window', detail: 'Nothing upcoming can be moved right now — the window is locked, or spans a cycle boundary. Try again in a minute.' };

  const scored = win.slots.map((s, i) => ({ slot: s, i, score: scoreTrack(s, mood) }));
  const matched = scored.filter((s) => s.score > 0).length;

  // Stable throughout: equal scores keep their programmed order, so an
  // emission is a nudge toward a mood rather than a reshuffle of the library.
  let ordered;
  if (top > 0) {
    const picks = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, top);
    const chosen = new Set(picks.map((p) => p.i));
    ordered = [...picks, ...scored.filter((s) => !chosen.has(s.i))];
  } else {
    ordered = scored.slice().sort((a, b) => b.score - a.score || a.i - b.i);
  }

  const changed = ordered.some((s, idx) => s.i !== idx);
  return {
    ok: true,
    matched,
    changed,
    cycleIndex: win.cycleIndex,
    startWithin: win.startWithin,
    before: scored,
    after: ordered,
    ids: ordered.map((s) => s.slot.id),
  };
}

// ---------------------------------------------------------------------------
// the Pi bridge
// ---------------------------------------------------------------------------

class Bridge {
  constructor({ url, key }) {
    this.url = (url || process.env.STATION_URL || 'http://localhost:8080').replace(/\/+$/, '');
    this.key = key || process.env.STATION_KEY || null;
  }

  async get(p) {
    const res = await fetch(this.url + p, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`GET ${p} -> ${res.status} ${await res.text().catch(() => '')}`.trim());
    return res.json();
  }

  async post(p, body) {
    if (!this.key) {
      throw new Error(
        'No STATION_KEY. Write endpoints are disabled without one — that is deliberate, ' +
        'this station sits on a public tunnel. Export the key the server was started with:\n' +
        '  export STATION_KEY=...    (PowerShell: $env:STATION_KEY="...")',
      );
    }
    const res = await fetch(this.url + p, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-station-key': this.key },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep the raw text for the error */ }
    if (!res.ok) {
      const err = new Error(json?.detail || json?.error || text || `POST ${p} -> ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }
}

// ---------------------------------------------------------------------------
// reading the files directly
// ---------------------------------------------------------------------------

async function walkAudio(dir, base = dir, out = []) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Cannot read the music directory ${dir}: ${err.message}`);
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await walkAudio(abs, base, out);
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) {
      const st = await fsp.stat(abs);
      const rel = path.relative(base, abs);
      out.push({ rel, abs, bytes: st.size, folder: path.dirname(rel) === '.' ? '(root)' : path.dirname(rel).split(path.sep)[0] });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// output helpers
// ---------------------------------------------------------------------------

const mmss = (sec) => {
  if (!Number.isFinite(sec)) return ' --:--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(3)}:${String(s).padStart(2, '0')}`;
};
const mb = (b) => `${(b / 1048576).toFixed(1)}MB`;
const clip = (s, n) => (String(s ?? '').length > n ? String(s).slice(0, n - 1) + '…' : String(s ?? ''));

function line(t, extra = '') {
  return `${mmss(t.duration)}  ${clip(t.genreLabel || t.genreSlug || '—', 16).padEnd(16)}  ${clip(t.artist, 24).padEnd(24)}  ${clip(t.title, 44)}${extra}`;
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

const commands = {
  async status(args, bridge) {
    const [health, station, queue] = await Promise.all([
      bridge.get('/api/health'),
      bridge.get('/api/station'),
      bridge.get('/api/queue'),
    ]);

    console.log(`\n  ${station.station?.name ?? 'Radio Tower'} — ${bridge.url}`);
    console.log(`  ${health.status.toUpperCase()}  ${health.tracks} tracks  ${Math.round(health.cycleSeconds / 60)}min cycle  ${health.listeners} listening  rev ${health.revision}`);
    console.log(`  music: ${health.musicDir}`);
    console.log(`  booth: ${queue.editable ? 'OPEN — STATION_KEY is set on the server' : 'CLOSED — server has no STATION_KEY, emissions are refused'}`);
    if (queue.override) console.log(`  ON AIR OVERRIDE: cycle ${queue.override.cycleIndex} from slot ${queue.override.startWithin}, set ${new Date(queue.override.setAt).toLocaleTimeString()}`);

    if (station.onAir) {
      const left = station.onAir.remaining;
      console.log(`\n  NOW  ${line(station.onAir)}   (${Math.floor(left / 60)}m${String(left % 60).padStart(2, '0')} left)`);
    } else {
      console.log(`\n  NOTHING ON AIR — ${station.message}`);
    }

    const win = movableWindow(queue.slots || []);
    console.log('');
    for (const s of queue.slots || []) {
      const movable = win && s.cycleIndex === win.cycleIndex && s.withinCycle >= win.startWithin && s.withinCycle <= win.endWithin;
      console.log(`  ${s.locked ? 'FROZEN' : movable ? '  ~   ' : '      '} ${line(s)}`);
    }
    if (!win) console.log('\n  Nothing is movable this minute. Frozen slots thaw as the clock advances.');
    else console.log(`\n  ${win.ids.length} slots movable (cycle ${win.cycleIndex}, from ${win.startWithin}). Frozen = on air or starting within ${queue.lockSeconds}s.`);
    console.log('');
  },

  async moods() {
    const v = moods();
    console.log('\n  Named moods — `node dj.mjs emit "<name>"`\n');
    for (const [name, rule] of Object.entries(v.moods)) {
      console.log(`  ${name.padEnd(14)} ${rule.why}`);
      const bits = [];
      if (rule.genres && Object.keys(rule.genres).length) bits.push(`genres: ${Object.keys(rule.genres).join(', ')}`);
      if (rule.keywords?.length) bits.push(`words: ${rule.keywords.slice(0, 6).join(', ')}`);
      if (rule.prefer) bits.push(`prefers ${rule.prefer} tracks`);
      if (rule.aliases?.length) bits.push(`aka ${rule.aliases.join(', ')}`);
      console.log(`  ${' '.repeat(14)} ${bits.join('  ·  ')}\n`);
    }
    console.log('  Anything not in this list is treated as free text: its words are matched');
    console.log('  against genre names first, then against titles, artists and albums.\n');
  },

  async files(args) {
    const dir = path.resolve(args.music || process.env.MUSIC_DIR || path.join(HERE, '..', 'music'));
    const all = await walkAudio(dir);
    let items = all;
    if (args.genre) items = items.filter((f) => fold(f.folder).includes(fold(args.genre)));
    if (args.grep) items = items.filter((f) => fold(f.rel).includes(fold(args.grep)));
    if (args.big) items = items.filter((f) => f.bytes > 50 * 1048576);

    const byFolder = new Map();
    for (const f of items) byFolder.set(f.folder, [...(byFolder.get(f.folder) || []), f]);

    console.log(`\n  ${dir}`);
    console.log(`  ${items.length} of ${all.length} audio files, ${mb(all.reduce((a, f) => a + f.bytes, 0))} total\n`);
    for (const [folder, fs_] of [...byFolder].sort()) {
      console.log(`  ${folder}/  (${fs_.length})`);
      for (const f of fs_.sort((a, b) => b.bytes - a.bytes)) {
        const flag = f.bytes > 50 * 1048576 ? '  ⚠ oversized — one file, probably a whole album' : '';
        console.log(`    ${mb(f.bytes).padStart(8)}  ${clip(path.basename(f.rel), 72)}${flag}`);
      }
      console.log('');
    }
    const big = all.filter((f) => f.bytes > 50 * 1048576);
    if (big.length && !args.big) {
      console.log(`  ${big.length} files are over 50MB. On a radio station each of those is ONE slot that`);
      console.log('  holds the air for an hour or more. `node dj.mjs doctor` explains what to do.\n');
    }
  },

  async library(args, bridge) {
    const q = args.grep ? `?q=${encodeURIComponent(args.grep)}&limit=500` : '?limit=500';
    const lib = await bridge.get('/api/library' + q);
    console.log(`\n  ${lib.items.length} of ${lib.total} tracks as the station sees them\n`);
    for (const t of lib.items) console.log(`  ${line(t)}`);
    const byGenre = new Map();
    for (const t of lib.items) byGenre.set(t.genreLabel || '—', (byGenre.get(t.genreLabel || '—') || 0) + 1);
    console.log('\n  ' + [...byGenre].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}`).join('  ·  ') + '\n');
  },

  async emit(args, bridge) {
    const moodText = args._[0];
    if (!moodText) throw new Error('What mood? e.g. `node dj.mjs emit "night drive"`. `node dj.mjs moods` lists the named ones.');
    const mood = resolveMood(moodText);

    // One retry, and only for the two errors that mean "you were looking at a
    // stale programme" — a rescan reshuffled the cycle, or a slot froze while
    // we were deciding. Anything else is a real refusal and must surface.
    for (let attempt = 0; attempt < 2; attempt++) {
      const queue = await bridge.get('/api/queue');
      if (!queue.editable) throw new Error('The server has no STATION_KEY, so the queue is read-only. Start it with STATION_KEY set — see dj/CLAUDE.md.');

      const plan = planEmission(queue.slots || [], mood, { top: args.top ? Number(args.top) : 0 });
      if (!plan.ok) throw new Error(plan.detail);

      console.log(`\n  EMISSION — "${mood.name}"${mood.free ? ' (free text)' : ''}`);
      console.log(`  ${plan.matched} of ${plan.before.length} movable slots match. Cycle ${plan.cycleIndex}, from slot ${plan.startWithin}.\n`);
      for (const [i, s] of plan.after.entries()) {
        const moved = s.i === i ? '  ' : s.i > i ? '↑ ' : '↓ ';
        console.log(`  ${String(i + 1).padStart(2)}. ${moved}${String(s.score).padStart(4)}  ${line(s.slot)}`);
      }

      if (!plan.changed) {
        console.log('\n  The window is already in that order. Nothing sent.\n');
        return;
      }
      if (plan.matched === 0) {
        console.log('\n  Nothing upcoming matches that mood, so this would only shuffle. Refusing.');
        console.log('  A permutation can only reorder what is already in the window — the DJ cannot');
        console.log('  pull a track in from elsewhere in the library. Try a wider mood, or wait for');
        console.log('  the cycle to bring different tracks into range.\n');
        return;
      }
      if (args['dry-run']) {
        console.log('\n  --dry-run: nothing sent.\n');
        return;
      }

      try {
        await bridge.post('/api/queue/reorder', { cycleIndex: plan.cycleIndex, startWithin: plan.startWithin, ids: plan.ids });
        console.log('\n  ON AIR. The programme now runs in that order. `node dj.mjs clear` puts the clock back.\n');
        return;
      } catch (err) {
        const retryable = err.body?.error === 'not_a_permutation' || err.body?.error === 'too_close_to_air';
        if (retryable && attempt === 0) {
          console.log(`\n  ${err.body.error} — the programme moved under us. Refetching and trying once more.`);
          continue;
        }
        throw err;
      }
    }
  },

  async clear(args, bridge) {
    const res = await bridge.post('/api/queue/clear', {});
    console.log(res.cleared ? '\n  Override dropped. Back to the station clock.\n' : '\n  There was no override. Nothing to drop.\n');
  },

  async rescan(args, bridge) {
    console.log('  Rescanning — this reads every file, so it is slow on a Pi with a USB drive…');
    const res = await bridge.post('/api/rescan', {});
    console.log(`\n  ${res.tracks} tracks, ${res.skipped} skipped.`);
    console.log('  A library change takes effect at the next cycle boundary, not immediately.\n');
  },

  async doctor(args, bridge) {
    const dir = path.resolve(args.music || process.env.MUSIC_DIR || path.join(HERE, '..', 'music'));
    console.log('');
    let files = [];
    try {
      files = await walkAudio(dir);
      console.log(`  OK    music directory readable: ${dir} (${files.length} files)`);
    } catch (err) {
      console.log(`  FAIL  ${err.message}`);
    }

    const big = files.filter((f) => f.bytes > 50 * 1048576);
    if (big.length) {
      const totalMin = Math.round(big.reduce((a, f) => a + f.bytes, 0) / 1048576 / 1.4);
      console.log(`  WARN  ${big.length} files over 50MB — roughly ${totalMin} minutes held by ${big.length} slots.`);
      console.log('        On a shuffle this is why "the music sucks": a 291MB three-hour ambient');
      console.log('        mix is one slot, so it wins the air as often as a four-minute track.');
      console.log('        Split them, or move them to a folder outside MUSIC_DIR.');
    } else if (files.length) {
      console.log('  OK    no oversized single-file albums');
    }

    try {
      const health = await bridge.get('/api/health');
      console.log(`  OK    station reachable at ${bridge.url} — ${health.status}, ${health.tracks} tracks`);
      if (path.resolve(health.musicDir) !== dir) {
        console.log(`  WARN  the station is playing ${health.musicDir}`);
        console.log(`        which is NOT the directory this booth is reading (${dir}).`);
        console.log('        That mismatch is the usual cause of "these are not the right files".');
      } else {
        console.log('  OK    the station and the booth are looking at the same folder');
      }
      const queue = await bridge.get('/api/queue');
      console.log(queue.editable ? '  OK    server accepts emissions (STATION_KEY set server-side)' : '  FAIL  server has no STATION_KEY — every emission will be refused with 503');
    } catch (err) {
      console.log(`  FAIL  station unreachable at ${bridge.url} — ${err.message}`);
      console.log('        Start it: cd .. && STATION_KEY=$(node -e "console.log(crypto.randomUUID())") npm start');
    }
    console.log(bridge.key ? '  OK    STATION_KEY present in this shell' : '  WARN  no STATION_KEY in this shell — status and files work, emit and clear will not');
    console.log('');
  },
};

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; } else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '--help' || cmd === '-h' || !commands[cmd]) {
    console.log(`
  The DJ booth for Radio Tower.

    node dj.mjs status                 what is on air, and what can be moved
    node dj.mjs moods                  the mood vocabulary
    node dj.mjs files [--big]          the MP3s on disk, by folder
    node dj.mjs library [--grep x]     the library as the station sees it
    node dj.mjs emit "night drive"     a Spontaneous Emission — reorder to a mood
    node dj.mjs emit "vgm" --top 3     bring only the best 3 forward
    node dj.mjs emit "vgm" --dry-run   show the plan, send nothing
    node dj.mjs clear                  drop the override, back to the clock
    node dj.mjs rescan                 re-read the music directory
    node dj.mjs doctor                 why isn't this working

  --url http://pi.local:8080   --key <station key>   --music <path>
  or the environment: STATION_URL, STATION_KEY, MUSIC_DIR
`);
    process.exit(cmd && !commands[cmd] ? 1 : 0);
  }

  const args = parseArgs(process.argv);
  const bridge = new Bridge({ url: args.url, key: args.key });
  await commands[cmd](args, bridge);
}

// Only run when invoked directly, so the exported helpers can be unit-tested.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(`\n  ${err.message}\n`);
    process.exit(1);
  });
}
