#!/usr/bin/env node
/**
 * Build the private claude.ai preview of the site — dist-preview/.
 *
 * The same site as dist/, with the four differences a claude.ai artifact
 * needs (docs/CLOUD.md, phase 8):
 *
 *   1. The page is page content, not a document: the artifact host wraps it
 *      in its own <!doctype>/<head>/<body>, so index.html loses those tags
 *      and its <base>. Routes go after a #/ (config.router = "hash"),
 *      because the host serves one page and nothing at /radio.
 *   2. No outside hosts. The artifact's CSP blocks static.wixstatic.com, so
 *      the preview cannot play the real music. Each track instead plays a
 *      generated test signal of exactly its length — same clock, same
 *      queue, same titles — and the page says so (config.preview.note).
 *      Nobody else's music is copied anywhere.
 *   3. The booth's reorders go to the artifact's own shared database
 *      (config.control = "artifact" → ArtifactControl), so everyone the
 *      preview is shared with hears the same thing. Elsewhere it falls back
 *      to this browser only.
 *   4. The whole thing must fit one publish: ≤ 255 files, ≤ 64 MB, each
 *      binary ≤ 15 MB. Checked here, before anything is sent.
 *
 *   node scripts/site-preview.mjs            build dist-preview/ (audio cached in .cache/)
 *   node scripts/site-preview.mjs --files    …and print the file list the Artifact tool publishes
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from './site-build.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.PREVIEW_DIST || path.join(ROOT, 'dist-preview'));
const CACHE = path.join(ROOT, '.cache', 'preview-audio');

export const LIMITS = { files: 255, bytes: 64 * 1048576, binary: 15 * 1048576, text: 16 * 1048576 };
export const PREVIEW_TITLE = 'Globe Trotter';
const TEXT = /\.(html|css|js|json|svg|txt|md)$/i;

export const PREVIEW_NOTE = 'Private preview on claude.ai. The real tracks stream from Wix on the live site, which a claude.ai preview cannot reach, so each one plays a generated test tone of the same length, on the same clock.';

/**
 * index.html → artifact page content: <title> and stylesheets first, then the
 * body as it is. No doctype, html, head, body or base — the host adds its own.
 */
export function toArtifactPage(html, { title = PREVIEW_TITLE } = {}) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!body) throw new Error('index.html has no <body>');
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => `<link rel="stylesheet" href="${m[1]}">`);
  const out = [
    `<title>${title}</title>`,
    '<!-- Built by scripts/site-preview.mjs from site/index.html for the claude.ai preview. -->',
    ...styles,
    body[1].trim(),
    '',
  ].join('\n');
  if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]|<base\s/i.test(out)) throw new Error('page content still carries document tags');
  return out;
}

/** A tone that is recognisably "track n": its own key, pulse and chord, faded at both ends. */
export function toneFor(track) {
  const h = crypto.createHash('sha1').update(track.id).digest();
  const semis = h[0] % 12;
  const f = (110 * 2 ** (semis / 12)).toFixed(3);
  const bpm = 64 + (h[1] % 44);
  const third = h[2] % 2 ? 1.2599 : 1.1892; // major or minor
  const D = Number(track.duration).toFixed(3);
  const bar = (8 * 60 / bpm).toFixed(4);
  // Root moves I → vi → IV → V every eight beats; each chord re-attacks, so no clicks.
  const step = `(eq(mod(floor(t/${bar}),4),1)*-3+eq(mod(floor(t/${bar}),4),2)*5+eq(mod(floor(t/${bar}),4),3)*7)`;
  const r = `(${f}*pow(2,${step}/12))`;
  const env = `min(1,mod(t,${bar})/0.08)*(0.55+0.45*exp(-mod(t,${bar})*0.9))`;
  const pulse = `(0.7+0.3*sin(2*PI*t*${bpm}/60))`;
  const fade = `min(1,t/2)*min(1,(${D}-t)/2)`;
  const expr = `0.2*(sin(2*PI*${r}*t)+0.7*sin(2*PI*${r}*${third}*t)+0.6*sin(2*PI*${r}*1.4983*t)+0.25*sin(2*PI*${r}*2*t))*${env}*${pulse}*${fade}`;
  return { expr, duration: Number(D), key: `${track.id}-${D}-v1` };
}

async function tone(track) {
  const { expr, duration, key } = toneFor(track);
  const cached = path.join(CACHE, `${key}.mp3`);
  if (!fs.existsSync(cached)) {
    await fsp.mkdir(CACHE, { recursive: true });
    const tmp = `${cached}.part.mp3`;
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=16000:c=mono:d=${duration}`,
      '-c:a', 'libmp3lame', '-b:a', '16k', '-ar', '16000', '-ac', '1',
      '-metadata', `title=Radio Tower preview tone — ${track.title}`, tmp], { maxBuffer: 1 << 20 });
    await fsp.rename(tmp, cached);
  }
  return cached;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

async function walk(dir, rel = '') {
  const out = [];
  for (const e of await fsp.readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await walk(dir, r));
    else out.push(r);
  }
  return out;
}

/** Everything the Artifact tool must send, and whether it fits one publish. */
export async function inventory(dir = OUT) {
  const all = (await walk(dir)).filter((f) => !f.startsWith('.'));
  const files = all.filter((f) => f !== 'index.html').sort();
  let bytes = 0;
  const problems = [];
  for (const f of all) {
    const size = fs.statSync(path.join(dir, f)).size;
    bytes += size;
    if (size > (TEXT.test(f) ? LIMITS.text : LIMITS.binary)) problems.push(`${f} is ${(size / 1048576).toFixed(1)} MB`);
    if (/\.html$/i.test(f) && f !== 'index.html') problems.push(`${f}: a second HTML page would be served without the skeleton`);
  }
  if (files.length > LIMITS.files) problems.push(`${files.length} files (max ${LIMITS.files})`);
  if (bytes > LIMITS.bytes) problems.push(`${(bytes / 1048576).toFixed(1)} MB (max 64)`);
  return { files, bytes, problems };
}

export async function buildPreview({ quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };
  await build({ base: '/', dist: OUT, shells: false, quiet: true });

  // 1. the page
  const shell = await fsp.readFile(path.join(OUT, 'index.html'), 'utf8');
  await fsp.writeFile(path.join(OUT, 'index.html'), toArtifactPage(shell));

  // 2. the tones
  const libPath = path.join(OUT, 'station/library.json');
  const lib = JSON.parse(await fsp.readFile(libPath, 'utf8'));
  const audioDir = path.join(OUT, 'station/preview-audio');
  await fsp.mkdir(audioDir, { recursive: true });
  const t0 = Date.now();
  await pool(lib.tracks, Math.max(1, Math.min(4, os.cpus().length)), async (t) => {
    await fsp.copyFile(await tone(t), path.join(audioDir, `${t.id}.mp3`));
  });
  lib._readme = 'PREVIEW BUILD (scripts/site-preview.mjs): the same programme as site/station/library.json, but every source is a generated test tone of the track\'s exact length. Never publish this file as the station.';
  lib.tracks = lib.tracks.map((t) => ({ ...t, sources: [`station/preview-audio/${t.id}.mp3`] }));
  await fsp.writeFile(libPath, JSON.stringify(lib, null, 2) + '\n');
  log(`  ✓ ${lib.tracks.length} test tones (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

  // 3. config: the shared database, hash routes, and the honest note
  const cfgPath = path.join(OUT, 'config.json');
  const cfg = JSON.parse(await fsp.readFile(cfgPath, 'utf8'));
  cfg.mode = 'cloud';
  cfg.control = 'artifact';
  cfg.router = 'hash';
  cfg.github = { ...cfg.github, owner: '', repo: '' };
  cfg.tower = { url: '', allowed: [] };
  cfg.preview = { note: PREVIEW_NOTE, foot: 'claude.ai preview — test tones in place of the music' };
  await fsp.writeFile(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  await fsp.rm(path.join(OUT, '.nojekyll'), { force: true });

  // 4. does it fit?
  const inv = await inventory(OUT);
  if (inv.problems.length) throw new Error(`the preview does not fit one publish:\n  ${inv.problems.join('\n  ')}`);
  log(`  ✓ dist-preview/ ready — index.html + ${inv.files.length} files, ${(inv.bytes / 1048576).toFixed(1)} MB`);
  return inv;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const inv = await buildPreview();
  if (process.argv.includes('--files')) console.log(JSON.stringify(inv.files.map((p) => ({ path: p }))));
}
