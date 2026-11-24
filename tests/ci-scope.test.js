/**
 * scripts/ci-scope.mjs — which pushes may skip the browser stages on GitHub (docs/plans/LIGHTER-2026-11-24.md).
 *
 * The danger it guards against is a code change that reaches production without the browsers ever seeing it, so
 * most of these are the cases that must give a full run: code after the last green commit even when the last push
 * was only docs, a file moved out of the code into docs/, anything it cannot read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { docsOnly, decide, gate } from '../scripts/ci-scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('only docs/, the Markdown at the root and the DJ queue may skip the browsers', () => {
  for (const files of [['docs/WORKLOG.md'], ['README.md', 'docs/plans/x.md'], ['docs/screenshots/a.png'], ['site/station/control.json']]) {
    assert.equal(docsOnly(files), true, files.join(' '));
  }
  for (const files of [[], ['docs/WORKLOG.md', 'site/js/main.js'], ['writing/globe-trotter/a.md'], ['site/data/texts.md'],
    ['.github/workflows/ci.yml'], ['scripts/ci-scope.mjs'], ['package.json'], ['docs'], ['site/station/other.json']]) {
    assert.equal(docsOnly(files), false, files.join(' ') || '(nothing)');
  }
});

/** A throwaway repository: write files, commit, give back the commit. */
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-scope-'));
  const g = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...a], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  g('init', '-q');
  const commit = (files, msg = 'c') => {
    for (const [f, body] of Object.entries(files)) {
      const p = path.join(dir, f);
      if (body === null) { g('rm', '-q', f); continue; }
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body);
      g('add', f);
    }
    g('commit', '-q', '-m', msg);
    return g('rev-parse', 'HEAD');
  };
  return { dir, g, commit, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** GitHub's runs API, answering that `sha` is the last green push (or nothing, or an error). */
const runsApi = (sha, status = 200) => async (url, opts) => {
  assert.match(url, /\/actions\/workflows\/ci\.yml\/runs\?branch=main&event=push&status=success&per_page=1$/);
  assert.equal(opts.headers.authorization, 'Bearer tok');
  return { ok: status === 200, status, json: async () => ({ workflow_runs: sha ? [{ head_sha: sha }] : [] }) };
};
const push = (r, fetchImpl) => decide({ event: 'push', repo: 'o/r', branch: 'main', token: 'tok', cwd: r.dir, fetchImpl });

test('a push of docs only, since the last green commit, gets the short run', async () => {
  const r = repo();
  try {
    const green = r.commit({ 'site/js/main.js': 'a', 'docs/WORKLOG.md': '1' });
    r.commit({ 'docs/WORKLOG.md': '2', 'README.md': 'x' });
    const d = await push(r, runsApi(green));
    assert.equal(d.full, false, d.why);
    assert.deepEqual(d.files.sort(), ['README.md', 'docs/WORKLOG.md']);
  } finally { r.done(); }
});

test('code pushed after the last green commit gets the full run, even when the last push was only docs', async () => {
  const r = repo();
  try {
    const green = r.commit({ 'site/js/main.js': 'a' });
    r.commit({ 'site/js/main.js': 'b' }, 'code — its run was cancelled by the next push');
    r.commit({ 'docs/WORKLOG.md': 'the worklog line' });
    const d = await push(r, runsApi(green));
    assert.equal(d.full, true);
    assert.match(d.why, /code changed/);
  } finally { r.done(); }
});

test('a file moved from the code into docs/ is a code change', async () => {
  const r = repo();
  try {
    const green = r.commit({ 'site/data/notes.md': 'served by the site' });
    fs.mkdirSync(path.join(r.dir, 'docs'));
    r.g('mv', 'site/data/notes.md', 'docs/notes.md');
    r.g('commit', '-q', '-m', 'move');
    assert.equal((await push(r, runsApi(green))).full, true);
  } finally { r.done(); }
});

test('whatever cannot be settled is a full run: by hand, a pull request, no green run, the API down, an unknown commit, no difference', async () => {
  const r = repo();
  try {
    const green = r.commit({ 'docs/a.md': '1' });
    assert.equal((await decide({ event: 'workflow_dispatch' })).full, true);
    assert.equal((await decide({ event: 'pull_request' })).full, true);
    assert.equal((await push(r, runsApi(null))).full, true, 'no green run yet');
    const down = await push(r, runsApi(green, 503));
    assert.equal(down.full, true);
    assert.match(down.why, /503/);
    assert.equal((await push(r, runsApi('0123456789abcdef0123456789abcdef01234567'))).full, true, 'a commit there is no fetching');
    assert.equal((await push(r, runsApi(green))).full, true, 'HEAD is the green commit itself: nothing to compare');
  } finally { r.done(); }
});

// Only GitHub runs ci.yml, so its wiring is read as text (docs/TESTS-REVIEW.md §3 keeps text checks for exactly this).
// The short run only on an explicit « full=no »: a scope step that answered nothing must give the full run.
test('ci.yml: the browsers and the self-test unless told « short », the unit tests then, and the check still named test', () => {
  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const setup = fs.readFileSync(path.join(ROOT, '.github/actions/tower-setup/action.yml'), 'utf8');
  const stepOf = (text, indent) => (name) => {
    const at = text.indexOf(`- name: ${name}`);
    assert.ok(at > 0, name);
    const end = text.indexOf(`\n${indent}- `, at + 1);
    return text.slice(at, end < 0 ? undefined : end);
  };
  const step = stepOf(ci, '      ');
  const setupStep = stepOf(setup, '    ');
  assert.match(ci, /^ {2}test:$/m, 'the job Vercel\'s Deployment Checks wait for');
  assert.match(step('What changed'), /id: scope[\s\S]*node scripts\/ci-scope\.mjs/);
  assert.match(ci, /^ {6}full: \$\{\{ steps\.scope\.outputs\.full \}\}$/m, 'the scope job hands its answer on');
  assert.match(step('Self-test'), /if: needs\.scope\.outputs\.full != 'no'\n/);
  assert.match(ci, /browser: \$\{\{ needs\.scope\.outputs\.full != 'no' \}\}/, 'the self-test job finds a browser unless told « short »');
  assert.match(setupStep('A browser for the browser stages'), /if: inputs\.browser == 'true'\n/);
  assert.match(step('Unit tests (a docs-only push)'), /if: needs\.scope\.outputs\.full == 'no'\n[\s\S]*npm test/);
  assert.match(setupStep('ffmpeg (fixture audio for the live stages)'), /SHA256: [0-9a-f]{64}\n[\s\S]*sha256sum -c/, 'the static build is checked against its sum');
  for (const text of [ci, setup]) assert.doesNotMatch(text, /^\s*-?\s*run: npx playwright install/m, 'Playwright\'s download only as the fallback');
});

// The site smoke's parts (scripts/site-smoke.mjs) are split between the self-test job and the site job's matrix:
// each must run in exactly one, or a part added later would silently run nowhere on GitHub.
test('ci.yml: every part of the site smoke runs on GitHub, once, and the `test` job is the verdict of all', () => {
  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const smoke = fs.readFileSync(path.join(ROOT, 'scripts/site-smoke.mjs'), 'utf8');
  const parts = /export const PARTS = \[([^\]]*)\]/.exec(smoke)[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
  const inSelfTest = /SITE_SMOKE_ONLY: ([\w,]+)/.exec(ci)[1].split(',');
  const inMatrix = /part: \[([^\]]*)\]/.exec(ci)[1].split(',').map((s) => s.trim());
  assert.deepEqual([...inSelfTest, ...inMatrix].sort(), [...parts].sort());
  assert.ok(inSelfTest.includes('tower'), 'tower mode needs the live server only the self-test starts');
  assert.match(ci, /^ {2}site:\n {4}needs: scope\n {4}if: needs\.scope\.outputs\.full != 'no'\n/m);
  assert.match(ci, /--only \$\{\{ matrix\.part \}\}/);
  const gateJob = ci.slice(ci.indexOf('\n  test:\n'));
  assert.match(gateJob, /needs: \[scope, self-test, site\]\n {4}if: always\(\)\n/, 'it reports even when a job it waits for did not run');
  assert.match(gateJob, /NEEDS: \$\{\{ toJSON\(needs\) \}\}\n\s+run: node scripts\/ci-scope\.mjs --gate/);
});

test('the `test` job: green only when every job is, the site skipped only on a run scope called short', () => {
  const ok = (r) => ({ result: r });
  const needs = (scope, self, site, full = 'yes') => ({ scope: { result: scope, outputs: { full } }, 'self-test': ok(self), site: ok(site) });
  for (const [n, want] of [
    [needs('success', 'success', 'success'), true],
    [needs('success', 'success', 'skipped', 'no'), true],
    [needs('success', 'success', 'success', 'no'), true],
    [needs('success', 'success', 'skipped'), false], // a full run whose site parts never ran
    [needs('success', 'success', 'skipped', ''), false], // scope answered nothing: that is a full run
    [needs('success', 'success', 'failure'), false],
    [needs('success', 'success', 'cancelled'), false],
    [needs('success', 'failure', 'success'), false],
    [needs('success', 'skipped', 'success'), false],
    [needs('failure', 'skipped', 'skipped', 'no'), false],
    [{}, false],
  ]) assert.equal(gate(n).ok, want, JSON.stringify(n));
  assert.match(gate(needs('success', 'success', 'failure')).why, /site smoke: failure/);
});
