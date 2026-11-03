#!/usr/bin/env node
/**
 * fire — publish now (docs/ATELIER.md). Run on the laptop, in a clone of
 * World-wide-web: GitHub, then Vercel, then the Oracle tower, without
 * waiting for the tower's night (~04:20 UTC).
 *
 *   fire.cmd                              double-click (or .\fire.cmd in PowerShell)
 *   node scripts/fire.mjs                 the whole procedure; asks before anything leaves the laptop
 *   node scripts/fire.mjs --dry-run       says what it would do; commits nothing, sends nothing
 *   node scripts/fire.mjs --yes           no question: for a terminal that has already decided
 *   node scripts/fire.mjs --no-tower      GitHub and Vercel only; the tower takes it tonight
 *   node scripts/fire.mjs --skip-tests    not even the unit tests first (CI still runs the whole self-test)
 *
 * Each step stops the procedure when it fails, and says what to do:
 *   1. the map — site/data/layout.json is checked; if the Atelier or
 *      `npm run layout` changed it, it is committed at step 5, once FIRE is
 *      typed. The only file fire ever commits; any other uncommitted work is
 *      listed and left out of the publish.
 *   2. GitHub — fetched; its main must be behind this commit, never beside it
 *      (nothing is ever forced: a push that would lose GitHub's work stops here).
 *   3. the unit tests (npm test).
 *   4. what goes live, and the question: type FIRE.
 *   5. the map's commit, if any; git push origin HEAD:main.
 *   6. GitHub's self-test on that commit — Vercel waits for it, and the tower
 *      refuses a commit it failed.
 *   7. Vercel serving it (config.json's `commit`, stamped by site-build.mjs).
 *   8. the tower: ssh, and its own updater run now (deploy/cloud/update.sh —
 *      the same CI check, the same rollback of a commit that does not answer).
 *   9. the tower serving it, and answering /api/health.
 *
 * The addresses are in deploy/fire.json. The SSH key is the one docs/LIVE.md
 * names; fire passes its path to ssh and never opens it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORLD } from '../site/js/world/layout.js';
import { checkLayout, resolveLayout, worldHeight } from '../site/js/world/model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAYOUT = 'site/data/layout.json';

export function parseArgs(argv) {
  const o = { dryRun: false, yes: false, tower: true, tests: true };
  for (const a of argv) {
    if (a === '--dry-run' || a === '-n') o.dryRun = true;
    else if (a === '--yes' || a === '-y') o.yes = true;
    else if (a === '--no-tower') o.tower = false;
    else if (a === '--skip-tests') o.tests = false;
    else throw new Error(`unknown option ${a} (--dry-run, --yes, --no-tower, --skip-tests)`);
  }
  return o;
}

export function loadConfig(root = ROOT) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'deploy/fire.json'), 'utf8'));
  const raw = String(cfg.tower?.key || '');
  const key = /^~[/\\]/.test(raw) ? path.join(os.homedir(), raw.slice(2)) : raw;
  return { branch: 'main', workflow: 'self-test', ...cfg, tower: { ...cfg.tower, key } };
}

/** owner/repo from the origin's URL (https or ssh). */
export function repoSlug(url) {
  const m = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  if (!m) throw new Error(`origin is not a GitHub repository: ${url}`);
  return `${m[1]}/${m[2]}`;
}

/** What changed on the map between two files, in a few words (the commit message). */
export function mapChanges(before, after) {
  const a = new Map(resolveLayout(before, { all: true }).pages.map((p) => [p.id, p]));
  const out = { moved: [], status: [] };
  for (const p of resolveLayout(after, { all: true }).pages) {
    const q = a.get(p.id);
    if (!q) { out.moved.push(p.id); continue; }
    if (['x', 'y', 'w', 'h', 'rot'].some((k) => q[k] !== p[k]) || q.tag.join() !== p.tag.join()) out.moved.push(p.id);
    if (q.status !== p.status) out.status.push(`${p.id} ${p.status}`);
  }
  const parts = [];
  if (out.moved.length) parts.push(`moved ${out.moved.join(', ')}`);
  if (out.status.length) parts.push(out.status.join(', '));
  return parts.join('; ') || 'tidied';
}

/** The map's errors, if any (model.js checkLayout), as lines. */
export function mapErrors(file) {
  const { pages, problems } = resolveLayout(file, { all: true });
  WORLD.h = worldHeight(pages);
  return [...problems, ...checkLayout(pages).filter((i) => i.level === 'error').map((i) => `${i.id}: ${i.msg}`)];
}

/** GitHub's verdict on a commit, from its Actions runs: success | failure | pending | none. */
export function verdict(runs, workflow) {
  const ours = (runs || []).filter((r) => r.name === workflow)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || (b.run_attempt || 0) - (a.run_attempt || 0));
  if (!ours.length) return 'none';
  if (ours[0].status !== 'completed') return 'pending';
  return ours[0].conclusion === 'success' ? 'success' : 'failure';
}

/**
 * On Windows the unit tests run the tower's shell scripts with bash, which Git for Windows ships but seldom
 * puts on PATH: a double-clicked fire.cmd then stopped at « the unit tests fail — nothing was sent » (41
 * tests, `spawn bash ENOENT`, 2026-11-02). The PATH to run them with: Git's own bin and usr/bin first, found
 * from `git --exec-path` (<git>/mingw64/libexec/git-core), else a portable Git beside the repository, else the
 * usual install. null when nothing is to change (not Windows, bash already found, or no Git bash anywhere).
 * Pure: tests/fire.test.js checks it.
 */
export function bashPath({ platform = process.platform, pathVar = '', execPath = '', root = ROOT, exists = fs.existsSync } = {}) {
  if (platform !== 'win32') return null;
  const w = path.win32;
  const dirs = String(pathVar).split(';').filter(Boolean);
  if (dirs.some((d) => exists(w.join(d, 'bash.exe')))) return null;
  const roots = [];
  if (execPath) roots.push(w.resolve(execPath.trim(), '..', '..', '..'));
  roots.push(w.resolve(root, '..', 'Git'), 'C:\\Program Files\\Git');
  for (const r of roots) {
    const bin = w.join(r, 'bin');
    if (exists(w.join(bin, 'bash.exe'))) return [bin, w.join(r, 'usr', 'bin'), ...dirs].join(';');
  }
  return null;
}

function realDeps(root) {
  return {
    git: (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
    bashPath: () => {
      let execPath = '';
      try { execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* no git: the other places */ }
      return bashPath({ pathVar: process.env.PATH || '', execPath, root });
    },
    run: (cmd, args, { cwd = root } = {}) => new Promise((resolve) => {
      const p = spawn(cmd, args, { cwd, stdio: 'inherit', shell: false });
      p.on('error', (err) => { console.log(`  ${err.message}`); resolve(127); });
      p.on('close', (code) => resolve(code ?? 1));
    }),
    getJson: async (url, headers = {}) => {
      const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache', ...headers }, cache: 'no-store' });
      return { status: r.status, json: r.ok ? await r.json().catch(() => null) : null };
    },
    ask: async (q) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try { return await rl.question(q); } finally { rl.close(); }
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    exists: (f) => fs.existsSync(f),
    readFile: (f) => fs.readFileSync(path.join(root, f), 'utf8'),
    log: (s) => console.log(s),
    now: () => Date.now(),
  };
}

class Stop extends Error {}

/**
 * The procedure. Every outside effect goes through `deps`, which is how
 * tests/fire.test.js drives it against a scratch repository, a fake GitHub,
 * a fake Vercel and a fake tower.
 */
export async function fire(o, deps, cfg) {
  const { git, log } = deps;
  const t0 = deps.now();
  const say = (n, s) => log(`\n[${n}/9] ${s}`);
  const stop = (msg) => { throw new Stop(msg); };
  const wait = async (what, everyMs, maxMs, probe) => {
    const until = deps.now() + maxMs;
    for (;;) {
      const r = await probe();
      if (r) return r;
      if (deps.now() >= until) stop(`gave up waiting for ${what} after ${Math.round(maxMs / 60000)} min`);
      await deps.sleep(everyMs);
    }
  };

  // 1. the map
  say(1, 'The map (site/data/layout.json)');
  // « XY path » lines, the path read past the status: git's output may come trimmed of the first line's space.
  const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean).map((l) => ({ line: l.trim(), file: l.replace(/^\s*\S{1,2}\s+/, '') }));
  const mapDirty = dirty.some((d) => d.file === LAYOUT);
  const errs = mapErrors(JSON.parse(deps.readFile(LAYOUT)));
  if (errs.length) stop(`the map has errors — fix them in the Atelier or with npm run layout:\n    ${errs.join('\n    ')}`);
  // Committed only once FIRE is typed (step 5): saying no leaves the repository as it was.
  let mapMsg = null;
  if (mapDirty) {
    let before = null;
    try { before = JSON.parse(git(['show', `HEAD:${LAYOUT}`])); } catch { before = { pages: [] }; }
    mapMsg = `Atelier: the map — ${mapChanges(before, JSON.parse(deps.readFile(LAYOUT)))}`;
    log(`  ✓ sound; changed since the last commit — to be committed with the publish: « ${mapMsg} »`);
  } else log('  ✓ sound, and already committed');
  const others = dirty.filter((d) => d.file !== LAYOUT);
  if (others.length) log(`  ! left out of this publish (not committed):\n${others.map((d) => `      ${d.line}`).join('\n')}`);

  // 2. GitHub
  say(2, `GitHub (${cfg.slug}, ${cfg.branch})`);
  git(['fetch', '--quiet', 'origin', cfg.branch]);
  const remote = git(['rev-parse', `origin/${cfg.branch}`]);
  try { git(['merge-base', '--is-ancestor', `origin/${cfg.branch}`, 'HEAD']); } catch {
    stop(`GitHub's ${cfg.branch} has commits this copy does not (${remote.slice(0, 7)}). Bring them in first — git pull --ff-only — then fire again. Nothing is ever forced.`);
  }
  const ahead = git(['log', '--oneline', `origin/${cfg.branch}..HEAD`]).split('\n').filter(Boolean);
  if (mapMsg) ahead.unshift(`(to commit) ${mapMsg}`);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  log(ahead.length ? `  ${ahead.length} commit${ahead.length > 1 ? 's' : ''} to publish, from ${branch}:\n${ahead.slice(0, 15).map((l) => `      ${l}`).join('\n')}${ahead.length > 15 ? `\n      … and ${ahead.length - 15} more` : ''}`
    : `  nothing new: GitHub's ${cfg.branch} is this commit — fire will make sure Vercel and the tower serve it`);

  // 3. tests
  say(3, 'Unit tests');
  if (!o.tests) log('  skipped (--skip-tests) — CI still runs the whole self-test');
  else if (o.dryRun) log('  would run npm test');
  else {
    // Windows: the tests need Git's bash, which is rarely on PATH (bashPath).
    const withBash = deps.bashPath?.();
    if (withBash) { process.env.PATH = withBash; log(`  bash: Git's (${withBash.split(';')[0]}), for the tests that run the tower's shell scripts`); }
    if ((await deps.run(process.execPath, ['--test', 'tests/*.test.js'])) !== 0) stop('the unit tests fail — nothing was sent');
    log('  ✓ green');
  }

  // 4. the question
  say(4, 'Publish');
  const where = [`GitHub ${cfg.slug} ${cfg.branch}`, `the site ${cfg.site}`, o.tower ? `the tower ${cfg.tower.url} (now, not tonight)` : null].filter(Boolean);
  log(`  This goes live on: ${where.join(' → ')}`);
  if (o.dryRun) {
    log(`  dry run: stopping here. Then: ${ahead.length ? 'git push origin HEAD:main, ' : ''}GitHub's ${cfg.workflow}, Vercel${o.tower ? `, ssh ${cfg.tower.ssh} ${cfg.tower.update}` : ''}.`);
    return { ok: true, dryRun: true };
  }
  if (!o.yes && (await deps.ask('  Type FIRE to publish (anything else stops): ')).trim() !== 'FIRE') stop('not fired — nothing was sent');

  // 5. push
  say(5, 'Push');
  if (mapMsg) {
    git(['add', '--', LAYOUT]);
    git(['commit', '-m', mapMsg, '--', LAYOUT]);
    log(`  ✓ committed: « ${mapMsg} »`);
  }
  const sha = git(['rev-parse', 'HEAD']);
  const pushedAt = deps.now();
  if (ahead.length) {
    if ((await deps.run('git', ['push', 'origin', `HEAD:${cfg.branch}`])) !== 0) stop('git push failed — see above (signed in to GitHub? on the network?)');
    log(`  ✓ ${sha.slice(0, 7)} is GitHub's ${cfg.branch}`);
  } else log('  nothing to push');

  // 6. CI
  say(6, `GitHub's ${cfg.workflow}`);
  const api = `${cfg.api || 'https://api.github.com'}/repos/${cfg.slug}/actions/runs?head_sha=${sha}&per_page=20`;
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  let seen = false;
  const ci = await wait(`GitHub's ${cfg.workflow}`, cfg.ciEveryMs ?? 30_000, cfg.ciMaxMs ?? 25 * 60_000, async () => {
    const r = await deps.getJson(api, headers).catch(() => ({ status: 0 }));
    const v = r.json ? verdict(r.json.workflow_runs, cfg.workflow) : 'unknown';
    if (v === 'success' || v === 'failure') return v;
    // A commit only control.json changed never gets a run (ci.yml paths-ignore); anything else does, within a minute or two.
    if (v === 'none' && seen === false && deps.now() - pushedAt > (cfg.ciNoneMs ?? 6 * 60_000)) return 'none';
    if (v === 'pending' && !seen) { seen = true; log('  running…'); }
    return null;
  });
  if (ci === 'failure') stop(`the self-test failed on ${sha.slice(0, 7)}: Vercel does not deploy it and the tower refuses it. The site is unchanged. Fix, commit, fire again (https://github.com/${cfg.slug}/actions).`);
  log(ci === 'none' ? '  no run for this commit (only control.json changed?) — going on' : '  ✓ green');

  // 7. Vercel
  say(7, `The site (${cfg.site})`);
  await wait('Vercel', cfg.siteEveryMs ?? 15_000, cfg.siteMaxMs ?? 12 * 60_000, async () => {
    const r = await deps.getJson(`${cfg.site}/config.json?fire=${deps.now()}`).catch(() => ({ status: 0 }));
    return r.json?.commit === sha;
  });
  log(`  ✓ ${cfg.site} serves ${sha.slice(0, 7)}`);

  // 8–9. the tower
  if (!o.tower) {
    say(8, 'The tower'); log('  skipped (--no-tower) — it takes main tonight, ~04:20 UTC');
    say(9, 'Done');
  } else {
    say(8, `The tower (${cfg.tower.ssh})`);
    if (!deps.exists(cfg.tower.key)) stop(`no SSH key at ${cfg.tower.key} (docs/LIVE.md, « Getting into the server »). The site is live; the tower takes it tonight.`);
    const args = ['-i', cfg.tower.key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'StrictHostKeyChecking=accept-new', cfg.tower.ssh, cfg.tower.update];
    const code = await deps.run(cfg.tower.sshCommand || 'ssh', args);
    if (code !== 0) stop(`the tower's updater did not finish (exit ${code}). The site is live; the tower keeps what it had, and tries again tonight. docs/LIVE.md says how to look.`);
    say(9, `The tower serving ${sha.slice(0, 7)}`);
    await wait('the tower', cfg.towerEveryMs ?? 5_000, cfg.towerMaxMs ?? 4 * 60_000, async () => {
      const [c, h] = await Promise.all([
        deps.getJson(`${cfg.tower.url}/config.json?fire=${deps.now()}`).catch(() => ({ status: 0 })),
        deps.getJson(`${cfg.tower.url}/api/health`).catch(() => ({ status: 0 })),
      ]);
      return c.json?.commit === sha && h.status === 200;
    });
    log(`  ✓ ${cfg.tower.url} serves ${sha.slice(0, 7)} and answers`);
  }
  const secs = Math.round((deps.now() - t0) / 1000);
  log(`\n  Fired: ${sha.slice(0, 7)} is live — ${cfg.site}${o.tower ? ` and ${cfg.tower.url}` : ''} (${Math.floor(secs / 60)} min ${secs % 60} s).`);
  return { ok: true, sha };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (err) { console.error(`  ✗ ${err.message}`); process.exit(2); }
  const root = (() => { try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ROOT; } })();
  const deps = realDeps(root);
  const cfg = loadConfig(root);
  try {
    cfg.slug = repoSlug(deps.git(['remote', 'get-url', 'origin']));
    console.log(`\n  fire — ${o.dryRun ? 'dry run: nothing is committed or sent' : 'publish now'}  ·  ${root}`);
    await fire(o, deps, cfg);
  } catch (err) {
    console.error(`\n  ✗ ${err instanceof Stop ? err.message : `${err.message}\n${err.stack}`}`);
    process.exit(1);
  }
}

