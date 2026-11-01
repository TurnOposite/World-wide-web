/**
 * `fire` (scripts/fire.mjs, docs/ATELIER.md) end to end, with nothing real
 * leaving the machine: a scratch repository pushes to a bare one standing in
 * for GitHub; the Actions API, Vercel and the tower are answers the test
 * gives; ssh is a recorded call. What is real is git — the commit of the
 * map, the refusal to publish beside GitHub's work, the push itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { fire, loadConfig, mapChanges, mapErrors, parseArgs, repoSlug, verdict } from '../scripts/fire.mjs';
import { layoutFile, resolveLayout, stringifyLayout } from '../site/js/world/model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP = fs.readFileSync(path.join(ROOT, 'site/data/layout.json'), 'utf8');
const LAYOUT = 'site/data/layout.json';

function sh(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** A clone with one commit (the map), its origin a bare repository: GitHub, as far as fire can tell. */
function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-'));
  const origin = path.join(dir, 'origin.git');
  const work = path.join(dir, 'work');
  sh(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  sh(dir, 'init', '-q', '-b', 'main', work);
  for (const [k, v] of [['user.email', 't@t'], ['user.name', 'Test']]) sh(work, 'config', k, v);
  fs.mkdirSync(path.join(work, 'site/data'), { recursive: true });
  fs.writeFileSync(path.join(work, LAYOUT), MAP);
  sh(work, 'add', '.');
  sh(work, 'commit', '-qm', 'the map');
  sh(work, 'remote', 'add', 'origin', origin);
  sh(work, 'push', '-q', 'origin', 'main');
  return { dir, origin, work, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Move a window in the scratch clone's map, the way the Atelier's save would. */
function moveAtlas(work, x) {
  const pages = resolveLayout(JSON.parse(fs.readFileSync(path.join(work, LAYOUT), 'utf8')), { all: true }).pages;
  pages.find((p) => p.id === 'atlas').x = x;
  fs.writeFileSync(path.join(work, LAYOUT), stringifyLayout(layoutFile(pages)));
}

const CFG = {
  branch: 'main', workflow: 'self-test', slug: 'test/world', site: 'https://site.test', api: 'https://api.test',
  tower: { url: 'https://tower.test', ssh: 'ubuntu@tower.test', key: '/keys/radio-tower', update: 'sudo /usr/local/bin/radio-tower-update' },
  ciEveryMs: 1, siteEveryMs: 1, towerEveryMs: 1,
};

/**
 * Everything outside git, scripted: `ci` is the run's life (pending, then its
 * verdict); Vercel and the tower start on the old commit and serve the new
 * one after a poll or two, as they would.
 */
function fakes(work, { ci = ['pending', 'success'], answer = 'FIRE', sshExit = 0, keyExists = true } = {}) {
  const calls = { ssh: [], tests: 0, asked: 0, ci: 0, site: 0, tower: 0 };
  const lines = [];
  let clock = 0;
  const deps = {
    git: (args) => sh(work, ...args),
    run: async (cmd, args) => {
      if (cmd === 'git') { try { sh(work, ...args); return 0; } catch { return 1; } }
      if (cmd === process.execPath) { calls.tests++; return 0; }
      calls.ssh.push([cmd, ...args]);
      return sshExit;
    },
    getJson: async (url) => {
      const head = sh(work, 'rev-parse', 'HEAD');
      if (url.startsWith(CFG.api)) {
        assert.ok(url.includes(`head_sha=${head}`), 'asks GitHub about the commit it pushed');
        const state = ci[Math.min(calls.ci++, ci.length - 1)];
        if (state === 'none') return { status: 200, json: { workflow_runs: [] } };
        const run = { name: 'self-test', created_at: '2026-10-26T00:00:00Z', status: state === 'pending' ? 'in_progress' : 'completed', conclusion: state === 'pending' ? null : state };
        return { status: 200, json: { workflow_runs: [run, { name: 'pages', status: 'completed', conclusion: 'failure', created_at: '2026-10-26T00:00:01Z' }] } };
      }
      if (url.startsWith(`${CFG.site}/config.json`)) return { status: 200, json: { commit: calls.site++ < 1 ? 'old' : head } };
      if (url.startsWith(`${CFG.tower.url}/config.json`)) return { status: 200, json: { commit: calls.tower++ < 1 ? 'old' : head } };
      if (url === `${CFG.tower.url}/api/health`) return { status: 200, json: { ok: true } };
      throw new Error(`unexpected ${url}`);
    },
    ask: async () => { calls.asked++; return answer; },
    sleep: async () => { clock += 1000; },
    exists: () => keyExists,
    readFile: (f) => fs.readFileSync(path.join(work, f), 'utf8'),
    log: (s) => lines.push(s),
    now: () => clock,
  };
  return { deps, calls, lines, said: () => lines.join('\n') };
}

const opts = (o = {}) => ({ ...parseArgs([]), ...o });

test('fire publishes: the map committed after FIRE, pushed, CI waited for, Vercel and the tower checked', async () => {
  const s = scratch();
  try {
    moveAtlas(s.work, 2780);
    fs.writeFileSync(path.join(s.work, 'notes.txt'), 'not for the site');
    const f = fakes(s.work);
    const out = await fire(opts(), f.deps, CFG);
    const head = sh(s.work, 'rev-parse', 'HEAD');
    assert.deepEqual(out, { ok: true, sha: head });
    assert.equal(sh(s.origin, 'rev-parse', 'main'), head, 'GitHub’s main is the new commit');
    assert.equal(sh(s.work, 'log', '-1', '--format=%s'), 'Atelier: the map — moved atlas');
    assert.deepEqual(sh(s.work, 'show', '--name-only', '--format=', 'HEAD').split('\n'), [LAYOUT], 'the map and nothing else');
    assert.match(sh(s.work, 'status', '--porcelain'), /\?\? notes\.txt/, 'other work stays out, uncommitted');
    assert.match(f.said(), /left out of this publish[\s\S]*notes\.txt/);
    assert.equal(f.calls.tests, 1);
    assert.equal(f.calls.asked, 1);
    assert.deepEqual(f.calls.ssh, [['ssh', '-i', '/keys/radio-tower', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'StrictHostKeyChecking=accept-new', 'ubuntu@tower.test', 'sudo /usr/local/bin/radio-tower-update']]);
    assert.ok(f.calls.site >= 2 && f.calls.tower >= 2, 'waited until both served the commit');
    assert.match(f.said(), /\[9\/9\][\s\S]*Fired: [0-9a-f]{7} is live/);
  } finally { s.done(); }
});

test('saying anything but FIRE sends nothing and leaves the repository as it was', async () => {
  const s = scratch();
  try {
    moveAtlas(s.work, 2780);
    const before = sh(s.work, 'rev-parse', 'HEAD');
    const f = fakes(s.work, { answer: 'fire' });
    await assert.rejects(fire(opts(), f.deps, CFG), /not fired — nothing was sent/);
    assert.equal(sh(s.work, 'rev-parse', 'HEAD'), before, 'the map is not even committed');
    assert.equal(sh(s.origin, 'rev-parse', 'main'), before);
    assert.match(sh(s.work, 'status', '--porcelain'), /M site\/data\/layout\.json/);
    assert.equal(f.calls.ssh.length, 0);
  } finally { s.done(); }
});

test('a dry run says what would happen and does none of it', async () => {
  const s = scratch();
  try {
    moveAtlas(s.work, 2780);
    const before = sh(s.work, 'rev-parse', 'HEAD');
    const f = fakes(s.work);
    assert.deepEqual(await fire(opts({ dryRun: true }), f.deps, CFG), { ok: true, dryRun: true });
    assert.equal(sh(s.work, 'rev-parse', 'HEAD'), before);
    assert.equal(sh(s.origin, 'rev-parse', 'main'), before);
    assert.deepEqual([f.calls.asked, f.calls.tests, f.calls.ssh.length, f.calls.ci], [0, 0, 0, 0]);
    assert.match(f.said(), /\(to commit\) Atelier: the map — moved atlas/);
    assert.match(f.said(), /dry run: stopping here/);
  } finally { s.done(); }
});

test('GitHub ahead of this copy: fire stops — it never forces, never merges for you', async () => {
  const s = scratch();
  try {
    const other = path.join(s.dir, 'other');
    execFileSync('git', ['clone', '-q', s.origin, other]);
    for (const [k, v] of [['user.email', 'o@o'], ['user.name', 'Other']]) sh(other, 'config', k, v);
    fs.writeFileSync(path.join(other, 'from-elsewhere.txt'), 'pushed from another machine');
    sh(other, 'add', '.');
    sh(other, 'commit', '-qm', 'elsewhere');
    sh(other, 'push', '-q', 'origin', 'main');
    const theirs = sh(other, 'rev-parse', 'HEAD');
    moveAtlas(s.work, 2780);
    const f = fakes(s.work);
    await assert.rejects(fire(opts({ yes: true }), f.deps, CFG), /has commits this copy does not[\s\S]*Nothing is ever forced/);
    assert.equal(sh(s.origin, 'rev-parse', 'main'), theirs, 'GitHub untouched');
    assert.equal(f.calls.asked + f.calls.tests, 0);
  } finally { s.done(); }
});

test('a map with an error is never published', async () => {
  const s = scratch();
  try {
    moveAtlas(s.work, 3900); // on top of Lectures: two windows would cover each other
    const f = fakes(s.work);
    await assert.rejects(fire(opts({ yes: true }), f.deps, CFG), /the map has errors[\s\S]*lectures: on top of atlas/);
    assert.equal(f.calls.tests, 0);
  } finally { s.done(); }
});

test('CI red: Vercel and the tower are left alone, and fire says so', async () => {
  const s = scratch();
  try {
    moveAtlas(s.work, 2780);
    const f = fakes(s.work, { ci: ['pending', 'failure'] });
    await assert.rejects(fire(opts({ yes: true }), f.deps, CFG), /self-test failed on [0-9a-f]{7}: Vercel does not deploy it and the tower refuses it/);
    assert.equal(f.calls.site, 0);
    assert.equal(f.calls.ssh.length, 0);
  } finally { s.done(); }
});

test('--no-tower stops at Vercel; no key, or the updater failing, stops at the tower with the site already live', async () => {
  const s = scratch();
  try {
    moveAtlas(s.work, 2780);
    const a = fakes(s.work);
    await fire(opts({ yes: true, tower: false }), a.deps, CFG);
    assert.equal(a.calls.ssh.length, 0);
    assert.match(a.said(), /skipped \(--no-tower\)/);

    moveAtlas(s.work, 2770);
    const b = fakes(s.work, { keyExists: false });
    await assert.rejects(fire(opts({ yes: true }), b.deps, CFG), /no SSH key at \/keys\/radio-tower[\s\S]*The site is live/);

    moveAtlas(s.work, 2750);
    const c = fakes(s.work, { sshExit: 255 });
    await assert.rejects(fire(opts({ yes: true }), c.deps, CFG), /updater did not finish \(exit 255\)/);
  } finally { s.done(); }
});

test('nothing new to push: fire still makes sure the site and the tower serve GitHub’s main', async () => {
  const s = scratch();
  try {
    const f = fakes(s.work, { ci: ['success'] });
    const out = await fire(opts({ yes: true }), f.deps, CFG);
    assert.equal(out.sha, sh(s.origin, 'rev-parse', 'main'));
    assert.match(f.said(), /nothing new/);
    assert.match(f.said(), /nothing to push/);
    assert.equal(f.calls.ssh.length, 1);
  } finally { s.done(); }
});

test('the pieces: options, the origin’s name, GitHub’s verdict, what changed on the map, the config', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--yes', '--no-tower', '--skip-tests']), { dryRun: true, yes: true, tower: false, tests: false });
  assert.throws(() => parseArgs(['--force']), /unknown option --force/);
  assert.equal(repoSlug('https://github.com/TurnOposite/World-wide-web.git'), 'TurnOposite/World-wide-web');
  assert.equal(repoSlug('git@github.com:TurnOposite/World-wide-web.git'), 'TurnOposite/World-wide-web');
  assert.throws(() => repoSlug('https://gitlab.com/a/b'), /not a GitHub repository/);
  const run = (status, conclusion, created_at = '2026-10-26T00:00:00Z', run_attempt = 1) => ({ name: 'self-test', status, conclusion, created_at, run_attempt });
  assert.equal(verdict([], 'self-test'), 'none');
  assert.equal(verdict([run('queued', null)], 'self-test'), 'pending');
  assert.equal(verdict([run('completed', 'failure'), run('completed', 'success', '2026-10-26T00:00:00Z', 2)], 'self-test'), 'success', 'a re-run that passed');
  assert.equal(verdict([{ name: 'pages', status: 'completed', conclusion: 'success' }], 'self-test'), 'none');
  const before = JSON.parse(MAP);
  const after = JSON.parse(MAP);
  after.pages.find((p) => p.id === 'atlas').x += 10;
  after.pages.find((p) => p.id === 'v1').status = 'offline';
  assert.equal(mapChanges(before, after), 'moved atlas; v1 offline');
  assert.equal(mapChanges(before, before), 'tidied');
  assert.deepEqual(mapErrors(before), []);
  const cfg = loadConfig(ROOT);
  assert.equal(cfg.branch, 'main');
  assert.equal(cfg.workflow, 'self-test', 'the name of .github/workflows/ci.yml');
  assert.match(fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'), /^name: self-test$/m);
  assert.ok(path.isAbsolute(cfg.tower.key) && cfg.tower.key.endsWith(path.join('.ssh', 'radio-tower')), 'the ~ is the user’s home');
  assert.match(cfg.tower.update, /radio-tower-update$/, 'the same updater the night runs (deploy/cloud/update.sh)');
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/config.json'), 'utf8'));
  assert.equal(cfg.tower.url, site.tower.url, 'fire and the site name the same tower');
});
