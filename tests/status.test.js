/**
 * Live status: the commit in /api/health, the station's /api/status, the
 * functions `npm run status` and the Booth's Status side share
 * (site/js/ui/status-panel.js), and reading a commit from git's own files
 * (server/lib/commit.js).
 *
 * What must hold:
 *   - the commit is read without running git, from a checkout, a worktree, a
 *     packed ref or a detached HEAD — and is null, never a guess, elsewhere;
 *   - « in step » is said only when all three are known and equal; a place
 *     that is behind is named, with the reason GitHub's verdict gives;
 *   - a part that does not answer is « not read », and the rest still is;
 *   - /api/health says the commit to anyone; /api/status only to the key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rt-status-'));
const KEY = 'right-key-0123456789';
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
Object.assign(process.env, {
  MUSIC_DIR: dir,
  CACHE_FILE: path.join(dir, '.cache', 'l.json'),
  TELEGRAPH_LOG: path.join(dir, 'line', 'telegraph.jsonl'),
  AUTO_RESCAN_MINUTES: '0',
  STATION_KEY: KEY,
  TOWER_COMMIT: A,
});
const { readCommit, readRepo } = await import('../server/lib/commit.js');
const { ciOf, compareCommits, duration, statusRows, readGithub, readSite, short } = await import('../site/js/ui/status-panel.js');
const { parseArgs, readTowerPublic, readClone, cloneRows } = await import('../scripts/status.mjs');

const put = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

test('the commit is read from git\'s own files: a branch, a packed ref, a detached HEAD, a worktree — and null anywhere else', () => {
  const repo = path.join(dir, 'repo');
  put(path.join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  put(path.join(repo, '.git', 'refs', 'heads', 'main'), `${A}\n`);
  put(path.join(repo, '.git', 'config'), '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/TurnOposite/World-wide-web.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n');
  assert.equal(readCommit(repo, {}), A);
  assert.equal(readRepo(repo), 'TurnOposite/World-wide-web');

  fs.rmSync(path.join(repo, '.git', 'refs', 'heads', 'main'));
  put(path.join(repo, '.git', 'packed-refs'), `# pack-refs with: peeled fully-peeled sorted\n${B} refs/heads/main\n${A} refs/remotes/origin/other\n`);
  assert.equal(readCommit(repo, {}), B, 'a ref git has packed away');

  put(path.join(repo, '.git', 'HEAD'), `${A}\n`);
  assert.equal(readCommit(repo, {}), A, 'a detached HEAD (what the tower\'s updater leaves after `reset --hard <sha>` on a tag)');

  const wt = path.join(dir, 'worktree');
  put(path.join(wt, '.git'), `gitdir: ${path.join(repo, '.git', 'worktrees', 'wt')}\n`);
  put(path.join(repo, '.git', 'worktrees', 'wt', 'HEAD'), 'ref: refs/heads/main\n');
  put(path.join(repo, '.git', 'worktrees', 'wt', 'commondir'), '../..\n');
  assert.equal(readCommit(wt, {}), B, 'a worktree: its own HEAD, the shared refs');
  assert.equal(readRepo(wt), 'TurnOposite/World-wide-web');

  assert.equal(readCommit(path.join(dir, 'nowhere'), {}), null);
  put(path.join(dir, 'odd', '.git', 'HEAD'), 'ref: ../../../etc/passwd\n');
  assert.equal(readCommit(path.join(dir, 'odd'), {}), null, 'a ref that climbs out is not followed');
  assert.equal(readCommit(path.join(dir, 'nowhere'), { TOWER_COMMIT: B.toUpperCase() }), B, 'a build stamped another way says so itself');
  assert.equal(readCommit(repo, { TOWER_COMMIT: 'main' }), A, '…but only with a real commit');
  assert.equal(readRepo(path.join(dir, 'nowhere')), null);
});

test('GitHub\'s verdict on a commit: the newest run of the self-test', () => {
  const run = (o) => ({ name: 'self-test', status: 'completed', conclusion: 'success', created_at: '2026-11-16T10:00:00Z', ...o });
  assert.equal(ciOf([run()]), 'success');
  assert.equal(ciOf([run({ conclusion: 'failure' })]), 'failure');
  assert.equal(ciOf([run({ conclusion: 'cancelled' })]), 'failure');
  assert.equal(ciOf([run({ status: 'in_progress', conclusion: null })]), 'pending');
  assert.equal(ciOf([run({ conclusion: 'failure' }), run({ created_at: '2026-11-16T11:00:00Z' })]), 'success', 'a re-run that passed is the verdict');
  assert.equal(ciOf([run({ name: 'repeats', conclusion: 'failure' })]), 'none', 'another workflow is not the self-test');
  assert.equal(ciOf([]), 'none');
  assert.equal(ciOf(undefined), 'none');
});

test('« in step » only when all three are known and equal; a place that is behind is named, with why', () => {
  assert.deepEqual(compareCommits({ github: A, site: A, tower: A, ci: 'success' }), { level: 'ok', text: 'GitHub, the site and the tower are all on aaaaaaa.' });
  const night = compareCommits({ github: B, site: B, tower: A, ci: 'success' });
  assert.equal(night.level, 'behind');
  assert.match(night.text, /GitHub bbbbbbb, the site bbbbbbb, the tower aaaaaaa/);
  assert.match(night.text, /04:20 UTC, or at once with fire/);
  assert.match(compareCommits({ github: B, site: A, tower: A, ci: 'failure' }).text, /self-test failed.*will not take it/);
  assert.match(compareCommits({ github: B, site: A, tower: A, ci: 'pending' }).text, /still running/);
  const partial = compareCommits({ github: A, site: A, tower: null });
  assert.equal(partial.level, 'unknown', 'two that agree and one unknown is not « in step »');
  assert.match(partial.text, /GitHub and the site on aaaaaaa; commit not known for the tower/);
  assert.equal(compareCommits({}).level, 'unknown');
  assert.equal(compareCommits({ github: B, tower: A }).level, 'behind');
  assert.equal(short(A), 'aaaaaaa');
  assert.equal(short(null), '—');
});

test('durations read as a person says them', () => {
  assert.equal(duration(290_000), '3 d 8 h');
  assert.equal(duration(4000), '1 h 6 min');
  assert.equal(duration(600), '10 min');
  assert.equal(duration(50), 'under a minute');
  assert.equal(duration(-5), 'under a minute');
});

test('the rows: everything on one screen; a part that did not answer is « not read » and the rest still is', () => {
  const now = Date.parse('2026-11-16T22:00:00Z');
  const tower = {
    commit: A, status: 'on_air', uptimeSeconds: 290_000, memoryMb: 128, node: 'v22.1.0', tracks: 3174, listeners: 2,
    onAir: { title: 'zanzibar', artist: 'Someone' },
    line: { today: 3, silenced: 1, keepDays: 0, nextReset: Date.parse('2026-11-17T04:00:00Z') },
    notifications: { ortis: false, listeners: 4 },
  };
  const rows = statusRows({ github: { sha: A, ci: 'success', message: 'A commit' }, site: { commit: A, builtAt: '2026-11-16T20:00:00.000Z' }, tower, now });
  const by = Object.fromEntries(rows.map(([label, text, tone]) => [label, { text, tone }]));
  assert.deepEqual(by['In step?'], { text: 'GitHub, the site and the tower are all on aaaaaaa.', tone: 'ok' });
  assert.equal(by['GitHub main'].text, 'aaaaaaa · self-test passed · « A commit »');
  assert.equal(by['The site'].text, 'aaaaaaa · built 2026-11-16 20:00 UTC');
  assert.equal(by['The tower'].text, 'aaaaaaa · on air · up 3 d 8 h · 128 MB · Node v22.1.0');
  assert.equal(by['On air'].text, 'zanzibar — Someone · 3174 tracks · 2 listening');
  assert.equal(by['The line'].text, '3 messages today · 1 silenced · empties in 6 h 0 min · log kept until full');
  assert.equal(by.Notifications.text, 'your phone: not set up (docs/NOTIFICATIONS.md) · listeners who asked: 4');

  const down = statusRows({ github: { error: 'GitHub answered 403' }, site: { commit: A }, tower: null, towerError: 'fetch failed', now });
  assert.deepEqual(down.map(([label]) => label), ['In step?', 'GitHub main', 'The site', 'The tower']);
  assert.match(down[1][1], /not read \(GitHub answered 403\)/);
  assert.deepEqual(down[3], ['The tower', 'not read (fetch failed)', 'bad']);
  assert.equal(down[2][1], 'aaaaaaa', 'the site was read and is shown');
  const off = statusRows({ github: { sha: A, ci: 'failure' }, site: { commit: A }, tower: { ...tower, status: 'no_tracks' }, now });
  assert.equal(off.find(([l]) => l === 'The tower')[2], 'bad');
  assert.equal(off.find(([l]) => l === 'GitHub main')[2], 'bad');
  const warned = statusRows({ github: { sha: A }, site: { commit: A }, tower, repeats: { warn: true, text: '2 within 3 hours' }, now });
  assert.deepEqual(warned.at(-1), ['Same song twice', '2 within 3 hours', 'bad']);
});

test('reading GitHub, the site and the tower: each from its own public address, each failing on its own', async () => {
  const asked = [];
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const fetchImpl = async (url) => {
    asked.push(String(url));
    if (/\/commits\/main$/.test(url)) return json({ sha: B, commit: { message: 'The headline\n\nbody', committer: { date: '2026-11-16T20:00:00Z' } } });
    if (/\/actions\/runs\?head_sha=/.test(url)) return json({ workflow_runs: [{ name: 'self-test', status: 'completed', conclusion: 'success', created_at: 'x' }] });
    if (/config\.json$/.test(url)) return json({ commit: A, builtAt: '2026-11-16T20:00:00.000Z', github: { owner: 'x' } });
    if (/\/api\/health$/.test(url)) return json({ ok: true, status: 'on_air', commit: A, uptimeSeconds: 100, tracks: 4, listeners: 1, memoryMb: 90, node: 'v22.0.0', musicDir: '/srv/radio/music' });
    if (/\/api\/station$/.test(url)) return json({ onAir: { id: 't1', title: 'Carrier Wave', artist: 'Self Test', url: '/api/track/t1/stream' } });
    if (/\/api\/telegraph$/.test(url)) return json({ enabled: true, messages: [{ id: 1 }, { id: 2 }], day: Date.parse('2026-11-16T04:00:00Z') });
    return json({}, 404);
  };
  assert.deepEqual(await readGithub('TurnOposite/World-wide-web', { fetchImpl }), { sha: B, message: 'The headline', date: '2026-11-16T20:00:00Z', ci: 'success' });
  assert.ok(asked.every((u) => u.startsWith('https://api.github.com/repos/TurnOposite/World-wide-web/')));
  assert.deepEqual(await readGithub(null, { fetchImpl }), { error: 'no repository known' });
  assert.deepEqual(await readGithub('a/b', { fetchImpl: async () => json({}, 403) }), { error: 'GitHub answered 403' });
  assert.deepEqual(await readGithub('a/b', { fetchImpl: async () => { throw new Error('offline'); } }), { error: 'offline' });
  assert.deepEqual(await readSite('https://site.example/config.json', { fetchImpl }), { commit: A, builtAt: '2026-11-16T20:00:00.000Z' });
  assert.deepEqual(await readSite('https://site.example/nothing', { fetchImpl }), { error: 'the site answered 404' });

  const tower = await readTowerPublic('https://tower.example', { fetchImpl });
  assert.deepEqual(tower, {
    commit: A, status: 'on_air', uptimeSeconds: 100, memoryMb: 90, node: 'v22.0.0', tracks: 4, listeners: 1,
    onAir: { id: 't1', title: 'Carrier Wave', artist: 'Self Test' },
    line: { today: 2, dayStarted: Date.parse('2026-11-16T04:00:00Z'), nextReset: Date.parse('2026-11-17T04:00:00Z') },
  });
  const old = await readTowerPublic('https://tower.example', { fetchImpl: async (url) => (/health/.test(url) ? json({ status: 'on_air', tracks: 1 }) : json({}, 404)) });
  assert.equal(old.commit, null, 'a tower from before 2026-11-16 does not say its commit: unknown, not invented');
  assert.equal('line' in old, false);
  await assert.rejects(readTowerPublic('https://tower.example', { fetchImpl: async () => json({}, 502) }), /\/api\/health answered 502/);
});

test('this clone against GitHub: behind, ahead, uncommitted, and what arrived since the last look', () => {
  const git = (answers) => (args) => {
    const k = args.join(' ');
    if (!(k in answers)) throw new Error(`git ${k}: not expected`);
    if (answers[k] instanceof Error) throw answers[k];
    return answers[k];
  };
  const base = { 'rev-parse HEAD': A, 'fetch --quiet origin': '', 'rev-list --left-right --count origin/main...HEAD': '2\t1', 'status --porcelain': ' M a.js\n?? b.js', 'rev-parse origin/main': B };
  const clone = readClone('.', { git: git({ ...base, [`log --oneline --no-decorate ${A}..origin/main`]: 'bbbbbbb Second\nccccccc First' }), lastSeen: A });
  assert.deepEqual(clone, { head: A, ahead: 1, behind: 2, dirty: 2, since: ['bbbbbbb Second', 'ccccccc First'], fetched: true, remote: B });
  const rows = cloneRows(clone, A);
  assert.equal(rows[0][1], 'aaaaaaa · 2 behind GitHub — pull before you build · 1 commit not pushed · 2 files changed and not committed');
  assert.equal(rows[0][2], 'bad', 'a clone behind GitHub is the trap the sessions fell in: it shows red');
  assert.deepEqual(rows.slice(1).map((r) => r[1]), ['2 commits on GitHub since aaaaaaa:', 'bbbbbbb Second', 'ccccccc First']);

  const offline = readClone('.', { git: git({ ...base, 'fetch --quiet origin': new Error('no network'), 'rev-list --left-right --count origin/main...HEAD': '0\t0', 'status --porcelain': '' }), lastSeen: B });
  assert.equal(offline.fetched, false);
  assert.match(cloneRows(offline, B)[0][1], /could not be fetched.*level with GitHub/);
  assert.equal(cloneRows(offline, B)[1][1], 'nothing new on GitHub');
  assert.match(cloneRows(readClone('.', { git: git({ 'rev-parse HEAD': new Error('not a repo') }) }), null)[0][1], /not a git clone/);

  assert.deepEqual(parseArgs(['--json', '--repeats', '14', '--keep']), { json: true, keep: true, repeats: 14 });
  assert.deepEqual(parseArgs([]), { json: false, keep: false, repeats: 0 });
  assert.throws(() => parseArgs(['--fire']), /unknown option/);
});

/* ------------------------------------------------------------- over HTTP -- */
const { createApp } = await import('../server/index.js');
const app = createApp();
let server;
let base;
test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));

test('the tower says its commit to anyone, and its status only to the key', async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.commit, A, 'the commit it was started on');
  assert.equal((await fetch(`${base}/api/status`)).status, 401);
  assert.equal((await fetch(`${base}/api/status`, { headers: { 'x-station-key': 'wrong' } })).status, 401);

  await fetch(`${base}/api/telegraph`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ada', text: 'for the count' }) });
  const res = await fetch(`${base}/api/status`, { headers: { 'x-station-key': KEY } });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const s = await res.json();
  assert.equal(s.ok, true);
  assert.equal(s.commit, A);
  assert.ok(s.uptimeSeconds >= 0 && s.memoryMb > 0 && /^v\d+/.test(s.node));
  assert.equal(s.line.today, 1);
  assert.equal(s.line.silenced, 0);
  assert.equal(s.line.keepDays, 0);
  assert.ok(s.line.nextReset > s.now && s.line.nextReset - s.line.dayStarted >= 23 * 3600_000 && s.line.nextReset - s.line.dayStarted <= 25 * 3600_000, 'the next 05:00 Paris');
  assert.deepEqual(s.notifications, { ortis: false, listeners: 0 });
  assert.doesNotMatch(JSON.stringify(s), new RegExp(KEY), 'and never the key itself');
});
