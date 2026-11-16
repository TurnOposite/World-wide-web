#!/usr/bin/env node
/**
 * status — where everything stands, on one screen (the 2026-11-16 handoff,
 * « live status »). What to read at the start of a session and after every
 * publish:
 *
 *   - GitHub `main`, and whether its self-test passed;
 *   - the commit the website (Vercel) serves;
 *   - the tower: its commit, on air or not, uptime, tracks, listeners, the
 *     telegraph line today, when the day turns (05:00 Paris);
 *   - this clone against GitHub, and the commits since you last looked.
 *
 *   npm run status                    the screen
 *   npm run status -- --repeats 14    …and the same-song-twice warnings over 14 days (slower)
 *   npm run status -- --json          the same, for a program
 *   npm run status -- --keep          do not move the « last seen » mark
 *
 * Reads only what is public (GitHub's API, the site's config.json, the
 * tower's open endpoints): it needs no key and holds none. A part that does
 * not answer is reported as not read; the others still are. The same rows,
 * with the key, are the Booth's « Status » side (site/js/ui/status-panel.js),
 * whose functions this shares.
 *
 * Exit 0: the three are on the same commit and the tower is on air.
 * Exit 1: something is behind, failed, or off air. Exit 2: nothing could be read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareCommits, readGithub, readSite, short, statusRows } from '../site/js/ui/status-panel.js';
import { dailyReset } from '../server/lib/telegraph.js';
import { readCommit, readRepo } from '../server/lib/commit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const o = { json: false, keep: false, repeats: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--keep') o.keep = true;
    else if (a === '--repeats') { o.repeats = Math.max(1, Number.parseInt(argv[++i], 10) || 7); }
    else throw new Error(`unknown option ${a} (--json, --keep, --repeats <days>)`);
  }
  return o;
}

/** The tower as its open endpoints tell it, in the shape of /api/status (what the key adds is left out, not guessed). */
export async function readTowerPublic(base, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const get = async (p) => {
    const res = await fetchImpl(`${base}${p}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${p} answered ${res.status}`);
    return res.json();
  };
  const health = await get('/api/health');
  const tower = { commit: health.commit ?? null, status: health.status, uptimeSeconds: health.uptimeSeconds, memoryMb: health.memoryMb, node: health.node, tracks: health.tracks, listeners: health.listeners };
  try {
    const st = await get('/api/station');
    if (st.onAir) tower.onAir = { id: st.onAir.id, title: st.onAir.title, artist: st.onAir.artist };
  } catch { /* the health already said what matters */ }
  try {
    const line = await get('/api/telegraph');
    if (line.enabled !== false) {
      const day = Number.isFinite(line.day) ? line.day : null;
      const turn = dailyReset('05:00', 'Europe/Paris');
      tower.line = { today: line.messages?.length ?? 0, dayStarted: day, nextReset: day === null ? null : turn(day + 26 * 3600_000) };
    }
  } catch { /* a tower without a line */ }
  return tower;
}

/** This clone against GitHub: ahead, behind, uncommitted work, and what arrived since the last look. */
export function readClone(root, { git, lastSeen = null } = {}) {
  const out = { head: null, ahead: 0, behind: 0, dirty: 0, since: [], fetched: true };
  try { out.head = git(['rev-parse', 'HEAD']); } catch { return { ...out, error: 'not a git clone here (or git is not on PATH)' }; }
  try { git(['fetch', '--quiet', 'origin']); } catch { out.fetched = false; }
  try {
    const [behind, ahead] = git(['rev-list', '--left-right', '--count', 'origin/main...HEAD']).split(/\s+/).map(Number);
    Object.assign(out, { ahead, behind });
    out.dirty = git(['status', '--porcelain']).split('\n').filter(Boolean).length;
    out.remote = git(['rev-parse', 'origin/main']);
    if (lastSeen && lastSeen !== out.remote) {
      try { out.since = git(['log', '--oneline', '--no-decorate', `${lastSeen}..origin/main`]).split('\n').filter(Boolean); } catch { /* a mark from another history */ }
    }
  } catch (err) { out.error = err.message.split('\n')[0]; }
  return out;
}

export function cloneRows(clone, lastSeen) {
  if (clone.error && !clone.head) return [['This clone', clone.error, '']];
  const bits = [short(clone.head)];
  if (!clone.fetched) bits.push('GitHub could not be fetched: compared with the last fetch');
  if (clone.behind) bits.push(`${clone.behind} behind GitHub — pull before you build`);
  if (clone.ahead) bits.push(`${clone.ahead} commit${clone.ahead === 1 ? '' : 's'} not pushed`);
  if (!clone.behind && !clone.ahead) bits.push('level with GitHub');
  if (clone.dirty) bits.push(`${clone.dirty} file${clone.dirty === 1 ? '' : 's'} changed and not committed`);
  const rows = [['This clone', bits.join(' · '), clone.behind ? 'bad' : '']];
  if (clone.since.length) rows.push(['Since last look', `${clone.since.length} commit${clone.since.length === 1 ? '' : 's'} on GitHub since ${short(lastSeen)}:`, ''], ...clone.since.slice(0, 15).map((l) => ['', l, '']));
  else if (lastSeen) rows.push(['Since last look', 'nothing new on GitHub', '']);
  return rows;
}

async function main(argv) {
  const opts = parseArgs(argv);
  const fire = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy', 'fire.json'), 'utf8'));
  const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  // The mark of the last look, in the git-ignored cache: this machine's, never the repository's.
  const seenFile = path.join(ROOT, '.cache', 'status-last-seen');
  const lastSeen = (() => { try { return fs.readFileSync(seenFile, 'utf8').trim() || null; } catch { return null; } })();

  const repo = readRepo(ROOT);
  const now = Date.now();
  const [github, site, towerRead] = await Promise.all([
    readGithub(repo),
    readSite(`${fire.site}/config.json`),
    readTowerPublic(fire.tower.url, { now }).then((tower) => ({ tower }), (err) => ({ towerError: err.message })),
  ]);
  const clone = readClone(ROOT, { git, lastSeen });
  if (!clone.head) clone.head = readCommit(ROOT);

  let repeats = null;
  if (opts.repeats && towerRead.tower) {
    try {
      const { readTower, findRepeats } = await import('./repeats.mjs');
      const data = await readTower(fire.tower.url, { days: opts.repeats, now });
      const found = findRepeats(data.library, data.items);
      repeats = { warn: found.length > 0, count: found.length, text: found.length ? `${found.length} within 3 hours over the next ${opts.repeats} days — npm run repeats -- --days ${opts.repeats} lists them` : `none within 3 hours over the next ${opts.repeats} days` };
    } catch (err) { repeats = { warn: false, text: `not read (${err.message})` }; }
  }

  const rows = [...statusRows({ github, site, ...towerRead, repeats, now }), ...cloneRows(clone, lastSeen)];
  const cmp = compareCommits({ github: github.sha, site: site.commit, tower: towerRead.tower?.commit, ci: github.ci });
  const nothing = github.error && site.error && !towerRead.tower;
  const good = cmp.level === 'ok' && towerRead.tower?.status === 'on_air' && github.ci !== 'failure';

  if (opts.json) {
    console.log(JSON.stringify({ at: new Date(now).toISOString(), repo, github, site, ...towerRead, clone, repeats, verdict: cmp }, null, 1));
  } else {
    const paint = { ok: '\x1b[32m', bad: '\x1b[31m', '': '' };
    const tty = process.stdout.isTTY;
    console.log(`\n  Radio Tower — ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC\n`);
    for (const [label, text, tone] of rows) console.log(`  ${label.padEnd(16)} ${tty && tone ? paint[tone] : ''}${text}${tty && tone ? '\x1b[0m' : ''}`);
    console.log('');
  }
  if (!opts.keep && clone.remote) {
    try { fs.mkdirSync(path.dirname(seenFile), { recursive: true }); fs.writeFileSync(seenFile, `${clone.remote}\n`); } catch { /* a mark that cannot be kept: the next run lists nothing as new */ }
  }
  return nothing ? 2 : good ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(err.message); process.exit(2); });
}
