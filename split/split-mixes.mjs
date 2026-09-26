#!/usr/bin/env node
/**
 * Split the long mixes into tracks.
 *
 * Radio Tower shuffles *slots*, not minutes. A 121-minute mix is one slot
 * exactly like a 44-second track, so eight files currently hold 71.8% of the
 * air. Deleting them was modelled and makes the station worse (18 tracks on a
 * 90-minute loop). Splitting them fixes the slot-share problem and the
 * library-size problem at once, and loses no music.
 *
 * This tool PROPOSES. It writes nothing to `music/` ever, and nothing at all
 * without `--apply`. That is not caution theatre — silence detection cannot see
 * a crossfade, and these mixes are often gapless by design, so a proposal that
 * a human looks at is the only honest output.
 *
 *   node split-mixes.mjs                        # propose for every long file
 *   node split-mixes.mjs --file "path/to.mp3"   # one file
 *   node split-mixes.mjs --gap 2.0              # only breaks at 2s+ of silence
 *   node split-mixes.mjs --apply proposals/x.json
 *
 * Requires ffmpeg and ffprobe on PATH. Neither is a runtime dependency of the
 * station — this is offline tooling you run on the laptop, like usb/.
 *
 *   winget install Gyan.FFmpeg      (Windows)
 *   sudo apt install ffmpeg         (the Pi, Debian)
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wav', '.webm']);

// One decode pass, at a sensitive threshold. Every coarser proposal is then
// derived in JS by raising the minimum gap — decoding a two-hour file three
// times to try three sensitivities would be silly.
const DETECT_NOISE = '-45dB';
const DETECT_MIN_SILENCE = 0.35;

// ---------------------------------------------------------------------------
// pure helpers — exported so test.mjs can assert them without touching ffmpeg
// ---------------------------------------------------------------------------

/** Pull (start, end) pairs out of ffmpeg's silencedetect log. */
export function parseSilences(stderr) {
  const out = [];
  let start = null;
  for (const line of String(stderr).split('\n')) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) { start = Number(s[1]); continue; }
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && start !== null) {
      const end = Number(e[1]);
      if (end > start) out.push({ start, end, duration: end - start });
      start = null;
    }
  }
  return out;
}

/**
 * Turn silences into segments.
 *
 * The cut lands in the MIDDLE of a silence, so neither the outgoing track's
 * tail nor the incoming track's first beat is clipped. Segments shorter than
 * `minTrack` are merged forward — a two-second blip between two halves of one
 * track is a detection artefact, not a track.
 */
export function planSegments(silences, totalDuration, { gap = 1.0, minTrack = 90 } = {}) {
  const cuts = silences
    .filter((s) => s.duration >= gap)
    .map((s) => s.start + s.duration / 2)
    .filter((t) => t > 0 && t < totalDuration)
    .sort((a, b) => a - b);

  const bounds = [0, ...cuts, totalDuration];
  const segs = [];
  for (let i = 0; i < bounds.length - 1; i++) segs.push({ start: bounds[i], end: bounds[i + 1] });

  // Merge anything too short into its neighbour, preferring backwards so the
  // first segment stays anchored at 0.
  const merged = [];
  for (const seg of segs) {
    const prev = merged[merged.length - 1];
    if (prev && seg.end - seg.start < minTrack) prev.end = seg.end;
    else merged.push({ ...seg });
  }
  // A trailing short one can only merge backwards, which the loop above did;
  // a single over-short segment at the head merges forward here.
  if (merged.length > 1 && merged[0].end - merged[0].start < minTrack) {
    merged[1].start = merged[0].start;
    merged.shift();
  }
  return merged.map((s, i) => ({ index: i + 1, start: s.start, end: s.end, duration: s.end - s.start }));
}

/**
 * How much did this actually help? A proposal whose longest piece is still
 * 40 minutes has not solved the problem it was run to solve, and should say so
 * rather than reporting "12 tracks!" and letting the number flatter it.
 */
export function verdict(segments, totalDuration) {
  if (segments.length < 2) {
    return { ok: false, note: 'No usable boundaries found. This mix is probably gapless or crossfaded — silence detection cannot see a crossfade. It needs a manual cue sheet, or leave it whole.' };
  }
  const longest = Math.max(...segments.map((s) => s.duration));
  const share = longest / totalDuration;
  // 12 minutes, not 20: the point of this exercise is that a slot is a slot,
  // and a 13-minute piece still takes the air four times as long as a track.
  // The share test catches the other shape of failure — a mix cut into one
  // huge piece and a handful of stubs, which counts well and sounds the same.
  if (longest > 12 * 60 || share > 0.35) {
    return { ok: true, weak: true, note: `Longest piece is still ${(longest / 60).toFixed(1)} min — ${Math.round(share * 100)}% of the mix — so it very likely holds several tracks that run into each other. Try --gap 0.5. If that doesn't help, this stretch is crossfaded and only a manual cue sheet will cut it.` };
  }
  return { ok: true, weak: false, note: `Longest piece ${(longest / 60).toFixed(1)} min, ${Math.round(share * 100)}% of the mix. Good split.` };
}

/** `Macroblank - 一生に一度` + 3 -> `Macroblank - 一生に一度 - 03.mp3`
 *
 * The stem is kept deliberately. `server/lib/genre.js` classifies by filename
 * and folder, so a piece that loses the original name loses its genre and
 * becomes `unsorted` — which no mood in dj/moods.json can reach.
 */
export function pieceName(stem, index, ext = '.mp3') {
  return `${stem} - ${String(index).padStart(2, '0')}${ext}`;
}

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(3)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const slug = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'mix';

// ---------------------------------------------------------------------------
// ffmpeg
// ---------------------------------------------------------------------------

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => reject(new Error(
      e.code === 'ENOENT'
        ? `${cmd} is not on PATH. Install it: winget install Gyan.FFmpeg (Windows) / sudo apt install ffmpeg (Pi).`
        : e.message,
    )));
    p.on('close', (code) => (code === 0 ? resolve({ out, err }) : reject(new Error(`${cmd} exited ${code}\n${err.slice(-800)}`))));
  });
}

async function probe(file) {
  const { out } = await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_chapters', file]);
  const j = JSON.parse(out);
  return {
    duration: Number(j.format?.duration || 0),
    tags: j.format?.tags || {},
    chapters: (j.chapters || []).map((c) => ({
      start: Number(c.start_time),
      end: Number(c.end_time),
      title: c.tags?.title || null,
    })),
  };
}

async function detectSilence(file) {
  // -vn: some of these carry a cover image; decoding it is wasted work.
  const { err } = await run('ffmpeg', [
    '-hide_banner', '-nostats', '-vn', '-i', file,
    '-af', `silencedetect=noise=${DETECT_NOISE}:d=${DETECT_MIN_SILENCE}`,
    '-f', 'null', '-',
  ]);
  return parseSilences(err);
}

// ---------------------------------------------------------------------------
// propose
// ---------------------------------------------------------------------------

async function proposeOne(file, opts) {
  const stem = path.basename(file, path.extname(file));
  process.stdout.write(`\n  ${stem.slice(0, 72)}\n`);

  const info = await probe(file);
  process.stdout.write(`  ${(info.duration / 60).toFixed(1)} min — analysing…\n`);

  let segments, source;
  if (info.chapters.length > 1) {
    // Embedded chapters are the artist's own answer. Always beat guessing.
    source = 'chapters';
    segments = info.chapters.map((c, i) => ({ index: i + 1, start: c.start, end: c.end, duration: c.end - c.start, title: c.title }));
  } else {
    source = 'silence';
    const silences = await detectSilence(file);
    segments = planSegments(silences, info.duration, { gap: opts.gap, minTrack: opts.minTrack });

    // What the other sensitivities would have given — cheap, since the decode
    // already happened, and it saves a second two-minute run to find out.
    const sweep = [0.5, 1.0, 2.0, 3.0]
      .map((g) => `${g}s → ${planSegments(silences, info.duration, { gap: g, minTrack: opts.minTrack }).length}`)
      .join('   ');
    process.stdout.write(`  ${silences.length} silences found. Pieces by --gap:  ${sweep}\n`);
  }

  const v = verdict(segments, info.duration);
  process.stdout.write(`  ${segments.length} pieces, from ${source}\n\n`);
  for (const s of segments) {
    process.stdout.write(`    ${String(s.index).padStart(2)}.  ${mmss(s.start)} → ${mmss(s.end)}   ${mmss(s.duration)}${s.title ? '  ' + s.title : ''}\n`);
  }
  process.stdout.write(`\n  ${v.weak ? 'WEAK: ' : v.ok ? '' : 'NO: '}${v.note}\n`);

  const proposal = {
    generatedAt: new Date().toISOString(),
    source: file,
    stem,
    totalDuration: info.duration,
    detection: source,
    gap: opts.gap,
    minTrack: opts.minTrack,
    verdict: v,
    album: info.tags.album || stem,
    artist: info.tags.artist || info.tags.album_artist || null,
    segments,
  };
  const dir = path.join(HERE, 'proposals');
  await fsp.mkdir(dir, { recursive: true });
  const out = path.join(dir, `${slug(stem)}.json`);
  await fsp.writeFile(out, JSON.stringify(proposal, null, 2));
  process.stdout.write(`  proposal: ${path.relative(process.cwd(), out)}\n`);
  return proposal;
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

async function apply(proposalPath, opts) {
  const p = JSON.parse(await fsp.readFile(proposalPath, 'utf8'));
  if (!fs.existsSync(p.source)) throw new Error(`The source file has moved: ${p.source}`);

  const ext = path.extname(p.source);
  const outDir = path.resolve(opts.out || path.join(HERE, 'out', slug(p.stem)));

  // Refuse to write into the library. Ortis moves the reviewed pieces in
  // himself — BRIEF.md rule 7, and an --apply that could land straight in
  // MUSIC_DIR is one typo away from a station full of unreviewed cuts.
  const music = path.resolve(opts.music || process.env.MUSIC_DIR || path.join(HERE, '..', 'music'));
  if (outDir === music || outDir.startsWith(music + path.sep)) {
    throw new Error(`--out is inside the music library (${music}). Write somewhere else and move the pieces in yourself once you have listened to them.`);
  }

  await fsp.mkdir(outDir, { recursive: true });
  process.stdout.write(`\n  ${p.segments.length} pieces → ${outDir}\n  Copying streams, not re-encoding — no quality is lost.\n\n`);

  for (const s of p.segments) {
    const name = pieceName(p.stem, s.index, ext);
    const dest = path.join(outDir, name);
    await run('ffmpeg', [
      '-hide_banner', '-nostats', '-y',
      '-ss', s.start.toFixed(3), '-i', p.source, '-t', s.duration.toFixed(3),
      '-map', '0:a', '-c', 'copy',
      '-metadata', `title=${s.title || `${p.stem} (${s.index})`}`,
      '-metadata', `album=${p.album}`,
      ...(p.artist ? ['-metadata', `artist=${p.artist}`] : []),
      '-metadata', `track=${s.index}/${p.segments.length}`,
      dest,
    ]);
    process.stdout.write(`    ${name}\n`);
  }

  process.stdout.write(`\n  Done. Now LISTEN to a few before you move anything.\n`);
  process.stdout.write(`  The names keep the original stem on purpose — server/lib/genre.js classifies\n`);
  process.stdout.write(`  by filename, so renaming them would drop every piece into "unsorted".\n\n`);
}

// ---------------------------------------------------------------------------

async function findLongFiles(dir, minMinutes) {
  const out = [];
  async function walk(d) {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) {
        // Size as a cheap pre-filter: probing 500 files to find 8 is wasteful.
        // ~1.4MB/min at 192kbps, so this is generous on purpose.
        const st = await fsp.stat(abs);
        if (st.size > minMinutes * 1.0 * 1048576) out.push(abs);
      }
    }
  }
  await walk(dir);
  return out;
}

function parseArgs(argv) {
  const a = { _: [], gap: 1.0, minTrack: 90, minMinutes: 20 };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--apply') a.apply = argv[++i];
    else if (t === '--file') a.file = argv[++i];
    else if (t === '--gap') a.gap = Number(argv[++i]);
    else if (t === '--min-track') a.minTrack = Number(argv[++i]);
    else if (t === '--min-minutes') a.minMinutes = Number(argv[++i]);
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--music') a.music = argv[++i];
    else if (t === '--help' || t === '-h') a.help = true;
    else a._.push(t);
  }
  return a;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log(`
  Split the long mixes into tracks. Proposes; never writes to music/.

    node split-mixes.mjs                      propose for every file over 20 min
    node split-mixes.mjs --file "<path>"      one file
    node split-mixes.mjs --gap 0.5            break on shorter silences (more pieces)
    node split-mixes.mjs --min-track 120      merge anything under 2 min
    node split-mixes.mjs --apply proposals/x.json [--out <dir>]

  Needs ffmpeg + ffprobe on PATH. Neither is a dependency of the station.
`);
    return;
  }

  if (opts.apply) return apply(path.resolve(opts.apply), opts);

  const files = opts.file
    ? [path.resolve(opts.file)]
    : await findLongFiles(path.resolve(opts.music || process.env.MUSIC_DIR || path.join(HERE, '..', 'music')), opts.minMinutes);

  if (!files.length) {
    console.log(`\n  Nothing over ~${opts.minMinutes} minutes found. Nothing to split.\n`);
    return;
  }
  console.log(`\n  ${files.length} long file(s). Analysing each takes about as long as ffmpeg needs to decode it.`);

  const results = [];
  for (const f of files) {
    try { results.push(await proposeOne(f, opts)); }
    catch (err) { console.log(`\n  FAILED ${path.basename(f)}: ${err.message}`); }
  }

  const pieces = results.reduce((a, r) => a + r.segments.length, 0);
  const weak = results.filter((r) => r.verdict.weak || !r.verdict.ok).length;
  console.log(`\n  ${results.length} file(s) → ${pieces} pieces. ${results.length} slot(s) on the station become ${pieces}.`);
  if (weak) console.log(`  ${weak} of them are weak or unusable — read the notes above before applying those.`);
  console.log(`\n  Review a proposal, then:  node split-mixes.mjs --apply proposals/<name>.json`);
  console.log(`  Nothing has been written to your library.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => { console.error(`\n  ${err.message}\n`); process.exit(1); });
}
