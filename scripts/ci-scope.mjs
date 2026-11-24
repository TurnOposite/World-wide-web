#!/usr/bin/env node
/**
 * Which run a push needs (.github/workflows/ci.yml, step « What changed »; docs/plans/LIGHTER-2026-11-24.md, step 1).
 *
 * A push whose files differ from the last commit that passed the self-test on its branch only in the docs runs the
 * unit tests and none of the browser stages: nothing a browser loads, nor any stage of build-test.sh, is read from
 * there, and the one test that reads a doc (fire-cloud, docs/FIRE-FROM-CLOUD.md) is a unit test. About one commit
 * in six is a worklog line, and each cost the full seven minutes.
 *
 * Compared with the last *green* run, never with the push before: a code push whose run was cancelled by a docs
 * push right after it (ci.yml cancels a run in progress on the same branch) is still in the difference, so it still
 * gets the browsers. And so, by the same rule, a green docs-only run stands for exactly the code of a full run.
 *
 * Anything it cannot settle — a run started by hand, a pull request, no green run yet, an answer it cannot read, a
 * commit it cannot fetch, no difference at all — is a full run: the safe answer is the slow one.
 *
 *   node scripts/ci-scope.mjs                  # in CI (GITHUB_*, GH_TOKEN): writes full=yes|no to $GITHUB_OUTPUT
 *   node scripts/ci-scope.mjs --against <sha>  # here: what a push of HEAD would get, the last green being <sha>
 *   node scripts/ci-scope.mjs --gate           # the `test` job: NEEDS='<toJSON(needs)>', exits 1 unless all is green
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** What a push may change and still skip the browsers. control.json is ci.yml's paths-ignore: a DJ's queue, not code. */
export const SKIPPABLE = [/^docs\//, /^[^/]+\.md$/, /^site\/station\/control\.json$/];

/** True when there is at least one changed file and every one is skippable. Pure. */
export function docsOnly(files) {
  const list = files.filter(Boolean);
  return list.length > 0 && list.every((f) => SKIPPABLE.some((re) => re.test(f)));
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The files whose content differs between `base` and HEAD. --no-renames: a file moved into docs/ is also a deletion. */
export function changedSince(base, cwd = process.cwd()) {
  try {
    git(cwd, 'cat-file', '-e', `${base}^{commit}`);
  } catch {
    // CI checks out one commit only: bring the other one, alone.
    git(cwd, 'fetch', '-q', '--depth=1', 'origin', base);
  }
  return git(cwd, 'diff', '--no-renames', '--name-only', base, 'HEAD').split('\n').filter(Boolean);
}

/** The commit of the last push to `branch` whose self-test passed, or null when there is none yet. */
export async function lastGreen({ repo, branch, token, fetchImpl = fetch }) {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(branch)}&event=push&status=success&per_page=1`;
  const res = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error(`GitHub's runs API answered ${res.status}`);
  return (await res.json()).workflow_runs?.[0]?.head_sha || null;
}

/** { full, why } for this run. Never throws: whatever goes wrong is a full run, and says why. */
export async function decide({ event, repo, branch, token, against = null, cwd = process.cwd(), fetchImpl = fetch } = {}) {
  if (event !== 'push') return { full: true, why: event === 'workflow_dispatch' ? 'started by hand' : `a ${event || 'local'} run` };
  let base = against;
  try {
    base ||= await lastGreen({ repo, branch, token, fetchImpl });
  } catch (err) {
    return { full: true, why: `the last green run could not be read (${err.message})` };
  }
  if (!base) return { full: true, why: `no green run on ${branch} yet` };
  let files;
  try {
    files = changedSince(base, cwd);
  } catch {
    return { full: true, why: `the last green commit ${base.slice(0, 7)} could not be fetched` };
  }
  if (!files.length) return { full: true, why: `no difference from ${base.slice(0, 7)}` };
  if (docsOnly(files)) return { full: false, why: `docs only since the last green commit ${base.slice(0, 7)} (${files.length} file${files.length > 1 ? 's' : ''}): the unit tests, not the browser stages`, files };
  return { full: true, why: `code changed since the last green commit ${base.slice(0, 7)}`, files };
}

/**
 * The `test` job's verdict (ci.yml, step 2 of the plan): green only when every job it stands for is. `needs` is
 * GitHub's own `toJSON(needs)`: { scope, 'self-test', site } with their `result` and the scope's `outputs.full`.
 * The site's parts may be skipped only on a short run that scope asked for in so many words; a part that was
 * cancelled, skipped on a full run or never reported is red. Pure.
 */
export function gate(needs = {}) {
  const result = (job) => needs[job]?.result || 'missing';
  if (result('scope') !== 'success') return { ok: false, why: `the scope job: ${result('scope')}` };
  if (result('self-test') !== 'success') return { ok: false, why: `the self-test: ${result('self-test')}` };
  const short = needs.scope.outputs?.full === 'no';
  const site = result('site');
  if (site === 'success') return { ok: true, why: 'the self-test and every part of the site smoke passed' };
  if (short && site === 'skipped') return { ok: true, why: 'a short run (docs only): the unit tests passed' };
  return { ok: false, why: `the site smoke: ${site}${short ? '' : ' on a full run'}` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes('--gate')) {
  let needs;
  try { needs = JSON.parse(process.env.NEEDS || '{}'); } catch { needs = {}; }
  const g = gate(needs);
  console.log(`${g.ok ? 'Green' : 'Red'}: ${g.why}.`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${g.ok ? 'Green' : 'Red'}: ${g.why}.\n`);
  process.exit(g.ok ? 0 : 1);
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--against');
  const local = i > 0;
  const env = process.env;
  const d = await decide(local
    ? { event: 'push', against: process.argv[i + 1] }
    : { event: env.GITHUB_EVENT_NAME, repo: env.GITHUB_REPOSITORY, branch: env.GITHUB_REF_NAME, token: env.GH_TOKEN });
  const line = `${d.full ? 'A full run' : 'A short run'}: ${d.why}.`;
  console.log(line);
  if (env.GITHUB_OUTPUT && !local) fs.appendFileSync(env.GITHUB_OUTPUT, `full=${d.full ? 'yes' : 'no'}\n`);
  if (env.GITHUB_STEP_SUMMARY && !local) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`);
}
