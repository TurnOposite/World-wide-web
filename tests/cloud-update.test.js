/**
 * deploy/cloud/update.sh — the nightly update on the Oracle tower, run as
 * root against the code everyone listens to. Driven here against real git
 * repositories in a temporary folder, with npm, systemctl and curl swapped
 * for stubs (TOWER_NPM, TOWER_SYSTEMCTL, TOWER_CURL) — the method of
 * tests/pi-anywhere.test.js. What must hold (docs/DECISIONS.md 2026-10-13):
 *   - code CI failed, or has not finished checking, never goes on air;
 *   - a night whose build failed half-way is retried, not taken for done;
 *   - a commit that does not come up is rolled back, and not retried;
 *   - a quiet night is a no-op, and a good update refreshes the updater.
 * What it cannot prove: systemd, Caddy and Oracle themselves.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
const UPDATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'deploy', 'cloud', 'update.sh');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' }).trim();

async function stub(dir, name, body) {
  const file = path.join(dir, name);
  await fsp.writeFile(file, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  return file;
}

/**
 * One origin for every test: commit A, then commit B. The nights only ever
 * fetch from it, so each test copies the tower's clone (made at A) instead
 * of building repositories again — git on Windows makes that the slow part.
 */
async function makeOrigin() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-update-origin-'));
  const origin = path.join(root, 'origin.git');
  const src = path.join(root, 'src');
  const app = path.join(root, 'app');
  for (const d of [origin, src]) await fsp.mkdir(d, { recursive: true });
  git(origin, 'init', '--quiet', '--bare');
  const url = pathToFileURL(origin).href;
  git(src, 'init', '--quiet');
  git(src, 'remote', 'add', 'origin', url);
  await fsp.mkdir(path.join(src, 'scripts'), { recursive: true });
  await fsp.mkdir(path.join(src, 'deploy', 'cloud'), { recursive: true });
  // The "site build": writes down which version it built; the health stub reads it.
  await fsp.writeFile(path.join(src, 'scripts', 'site-build.mjs'), [
    "import fs from 'node:fs';",
    'fs.mkdirSync(process.env.SITE_DIST, { recursive: true });',
    "fs.writeFileSync(process.env.SITE_DIST + '/built.txt', fs.readFileSync('version.txt', 'utf8').trim());",
    '',
  ].join('\n'));
  const commit = async (v) => {
    await fsp.writeFile(path.join(src, 'version.txt'), v);
    await fsp.writeFile(path.join(src, 'deploy', 'cloud', 'update.sh'), `# the updater, version ${v}\n`);
    git(src, 'add', '-A');
    git(src, 'commit', '--quiet', '-m', v);
    git(src, 'push', '--quiet', 'origin', 'HEAD:main');
    return git(src, 'rev-parse', 'HEAD');
  };
  const A = await commit('A');
  git(root, 'clone', '--quiet', '--depth', '1', '--branch', 'main', url, app);
  const B = await commit('B');
  return { app, A, B };
}
const ORIGIN = await makeOrigin();

/**
 * A tower at A (cloned, and DEPLOYED says so) with B waiting on the origin.
 * Returns the paths and a night() that runs one update with a given CI answer.
 */
async function world() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-update-'));
  const app = path.join(root, 'app');
  const state = path.join(root, 'state');
  const stubs = path.join(root, 'stubs');
  for (const d of [state, stubs]) await fsp.mkdir(d, { recursive: true });
  await fsp.cp(ORIGIN.app, app, { recursive: true });
  const { A, B } = ORIGIN;
  await fsp.writeFile(path.join(state, 'deployed'), `${A}\n`);

  const log = path.join(root, 'calls.log');
  const ci = path.join(root, 'ci.json');
  const npmFails = path.join(root, 'npm-fails');
  const npm = await stub(stubs, 'npm', `echo "npm $*" >> "${log}"; [ -f "${npmFails}" ] && exit 1; exit 0`);
  const systemctl = await stub(stubs, 'systemctl', `echo "systemctl $*" >> "${log}"`);
  // GitHub's answer is ci.json (absent: as if GitHub were unreachable); the
  // station "answers" unless it is running the version named in BAD_VERSION.
  const curl = await stub(stubs, 'curl', [
    'for a in "$@"; do case "$a" in',
    `  *actions/runs*) cat "${ci}" 2>/dev/null || exit 22; exit 0 ;;`,
    `  *api/health*) v="$(cat "${path.join(app, 'dist-tower', 'built.txt')}" 2>/dev/null)"; [ -n "$BAD_VERSION" ] && [ "$v" = "$BAD_VERSION" ] && exit 7; exit 0 ;;`,
    'esac; done; exit 1',
  ].join('\n'));

  const night = async ({ verdict = 'success', bad = '' } = {}) => {
    if (verdict === 'unreachable') await fsp.rm(ci, { force: true });
    else {
      const runs = verdict === 'none' ? [] : [{
        name: 'self-test', created_at: '2026-10-13T02:00:00Z', run_attempt: 1,
        status: verdict === 'pending' ? 'in_progress' : 'completed',
        conclusion: verdict === 'pending' ? null : verdict,
      }];
      await fsp.writeFile(ci, JSON.stringify({ workflow_runs: runs }));
    }
    await fsp.writeFile(log, '');
    const env = {
      ...process.env,
      TOWER_APP: app, TOWER_DEPLOYED: path.join(state, 'deployed'), TOWER_REJECTED: path.join(state, 'rejected'),
      TOWER_UPDATER: path.join(state, 'radio-tower-update'), TOWER_NPM: npm, TOWER_SYSTEMCTL: systemctl, TOWER_CURL: curl,
      TOWER_HEALTH_TRIES: '2', TOWER_HEALTH_WAIT: '0', BAD_VERSION: bad,
    };
    let code = 0;
    let out = '';
    try {
      ({ stdout: out } = await run('bash', [UPDATE], { env }));
    } catch (err) {
      code = err.code;
      out = `${err.stdout}${err.stderr}`;
    }
    return { code, out, calls: fs.readFileSync(log, 'utf8') };
  };
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null);
  return {
    A, B, night, npmFails,
    deployed: () => read(path.join(state, 'deployed')),
    rejected: () => read(path.join(state, 'rejected')),
    head: () => git(app, 'rev-parse', 'HEAD'),
    built: () => read(path.join(app, 'dist-tower', 'built.txt')),
    updater: () => read(path.join(state, 'radio-tower-update')),
  };
}

test('a commit whose self-test passed goes on air, is recorded, and refreshes the updater', async () => {
  const w = await world();
  const r = await w.night({ verdict: 'success' });
  assert.equal(r.code, 0, r.out);
  assert.equal(w.deployed(), w.B);
  assert.equal(w.built(), 'B');
  assert.match(r.calls, /npm ci --omit=dev/);
  assert.match(r.calls, /systemctl restart radio-tower/);
  assert.equal(w.updater(), '# the updater, version B', 'tomorrow runs the updater this commit carries');
});

test('a commit CI failed, or is still checking, never goes on air', async () => {
  for (const verdict of ['failure', 'cancelled', 'pending']) {
    const w = await world();
    const r = await w.night({ verdict });
    assert.equal(r.code, 0, `${verdict}: a refusal is not an error — ${r.out}`);
    assert.match(r.out, /not updating/);
    assert.equal(w.deployed(), w.A);
    assert.equal(w.head(), w.A, `${verdict}: the code on disk is not even touched`);
    assert.doesNotMatch(r.calls, /npm|systemctl/);
  }
});

test('no CI run at all (a DJ commit), or GitHub out of reach, does not block the update', async () => {
  for (const verdict of ['none', 'unreachable']) {
    const w = await world();
    const r = await w.night({ verdict });
    assert.equal(r.code, 0, r.out);
    assert.equal(w.deployed(), w.B, verdict);
  }
});

test('a night whose build failed half-way is retried the next night, not taken for done', async () => {
  const w = await world();
  await fsp.writeFile(w.npmFails, '');
  const first = await w.night();
  assert.equal(first.code, 1);
  assert.equal(w.deployed(), w.A, 'nothing was put on air');
  assert.doesNotMatch(first.calls, /systemctl restart/, 'and nothing was restarted: the station kept playing');
  assert.equal(w.rejected(), null, 'a failed npm says nothing against the commit');
  await fsp.rm(w.npmFails);
  const second = await w.night();
  assert.equal(second.code, 0, second.out);
  assert.equal(w.deployed(), w.B, 'the next night finishes the job (git alone would have called it up to date)');
});

test('a commit that does not come up is rolled back, and not retried every night', async () => {
  const w = await world();
  const first = await w.night({ bad: 'B' });
  assert.equal(first.code, 1);
  assert.match(first.out, /did not come up/);
  assert.match(first.out, /back on air/);
  assert.equal(w.deployed(), w.A);
  assert.equal(w.head(), w.A, 'the previous code is back on disk');
  assert.equal(w.built(), 'A', 'and built');
  assert.equal(w.rejected(), w.B);
  const second = await w.night({ bad: 'B' });
  assert.equal(second.code, 0);
  assert.match(second.out, /waiting for a newer commit/);
  assert.doesNotMatch(second.calls, /systemctl restart/, 'no nightly outage retrying the same mistake');
});

test('a quiet night is a no-op', async () => {
  const w = await world();
  await w.night();
  const r = await w.night();
  assert.equal(r.code, 0);
  assert.match(r.out, /already up to date/);
  assert.equal(r.calls, '');
});
