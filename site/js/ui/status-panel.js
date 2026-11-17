/**
 * The Booth's « Status » side: where everything stands, on one screen, for
 * a phone (Ortis's handoff of 2026-11-16, « live status »). Behind the key.
 *
 * Three places hold the code — GitHub `main`, the website (Vercel) and the
 * tower — and they should be on the same commit. This asks each one itself:
 * GitHub's public API, the site's own config.json, and the tower's
 * /api/status (the only one that needs the key). Then the tower's health,
 * what is on air, the line, the notifications, when the day turns.
 *
 * `npm run status` (scripts/status.mjs) prints the same from a terminal and
 * shares the functions at the top of this file, which are pure (no DOM) so
 * node:test can check them.
 */

export const short = (sha) => (typeof sha === 'string' && sha.length >= 7 ? sha.slice(0, 7) : '—');

/** GitHub's verdict on a commit from its workflow runs: success | failure | pending | none (no run: nothing ran on it). */
export function ciOf(runs, workflow = 'self-test') {
  const ours = (Array.isArray(runs) ? runs : []).filter((r) => r?.name === workflow)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || (b.run_attempt || 0) - (a.run_attempt || 0));
  if (!ours.length) return 'none';
  if (ours[0].status !== 'completed') return 'pending';
  return ours[0].conclusion === 'success' ? 'success' : 'failure';
}

/**
 * The three lamps (Ortis, 2026-11-17): GitHub, the site, the tower — each green when it is on the commit GitHub's
 * main is on, red when it is on another, grey when it could not be read.
 */
export function lamps({ github = null, site = null, tower = null } = {}) {
  const lamp = (name, sha, ref) => ({ name, sha, state: !sha ? 'unknown' : !ref || sha === ref ? 'ok' : 'behind' });
  return [lamp('GitHub', github, github), lamp('Site', site, github), lamp('Tower', tower, github)];
}

export const CI_WORDS = Object.freeze({ success: 'self-test passed', failure: 'self-test FAILED', pending: 'self-test running', none: 'no self-test ran on it', unknown: 'self-test not read' });

/**
 * Are the three on the same commit? `level`: 'ok' (all three), 'behind' (one or more is on another commit),
 * 'unknown' (one could not be read). `text` says it in one sentence.
 */
export function compareCommits({ github = null, site = null, tower = null, ci = 'unknown' } = {}) {
  const named = [['GitHub', github], ['the site', site], ['the tower', tower]];
  const missing = named.filter(([, sha]) => !sha).map(([n]) => n);
  const known = named.filter(([, sha]) => sha);
  const same = known.length > 0 && known.every(([, sha]) => sha === known[0][1]);
  if (missing.length === 3) return { level: 'unknown', text: 'None of the three could be read.' };
  if (same && !missing.length) return { level: 'ok', text: `GitHub, the site and the tower are all on ${short(github)}.` };
  if (same) return { level: 'unknown', text: `${known.map(([n]) => n).join(' and ')} on ${short(known[0][1])}; commit not known for ${missing.join(' and ')}.` };
  const where = known.map(([n, sha]) => `${n} ${short(sha)}`).join(', ');
  // Why a place is behind, when GitHub's own verdict explains it.
  const why = github && (site !== github || tower !== github)
    ? ci === 'failure' ? ' GitHub\'s self-test failed on that commit: the site and the tower will not take it.'
      : ci === 'pending' ? ' GitHub\'s self-test is still running: the site follows when it is green.'
        : site === github && tower && tower !== github ? ' The tower takes main at about 04:20 UTC, or at once with fire.' : ''
    : '';
  return { level: 'behind', text: `Not the same commit: ${where}${missing.length ? ` (${missing.join(' and ')} not read)` : ''}.${why}` };
}

/** 290000 seconds → « 3 d 8 h »; 4000 → « 1 h 6 min »; 50 → « under a minute ». */
export function duration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} d ${hh} h`;
  if (hh) return `${hh} h ${m} min`;
  return m ? `${m} min` : 'under a minute';
}

/** The rows of the status, as [label, text, tone] — the same for the terminal and the page. */
export function statusRows({ github = {}, site = {}, tower = null, towerError = null, repeats = null, now = Date.now() } = {}) {
  const rows = [];
  const cmp = compareCommits({ github: github.sha, site: site.commit, tower: tower?.commit, ci: github.ci });
  rows.push(['In step?', cmp.text, cmp.level === 'ok' ? 'ok' : cmp.level === 'behind' ? 'bad' : '']);
  rows.push(['GitHub main', github.error ? `not read (${github.error})` : `${short(github.sha)} · ${CI_WORDS[github.ci] || CI_WORDS.unknown}${github.message ? ` · « ${github.message} »` : ''}`, github.ci === 'failure' ? 'bad' : '']);
  rows.push(['The site', site.error ? `not read (${site.error})` : `${short(site.commit)}${site.builtAt ? ` · built ${new Date(site.builtAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}`, '']);
  if (!tower) {
    rows.push(['The tower', `not read (${towerError || 'no answer'})`, 'bad']);
    return rows;
  }
  const state = { on_air: 'on air', scanning: 'starting (scanning the library)', no_tracks: 'NO TRACKS' }[tower.status] || tower.status || '?';
  rows.push(['The tower', `${short(tower.commit)} · ${state} · up ${duration(tower.uptimeSeconds)}${tower.memoryMb ? ` · ${tower.memoryMb} MB` : ''}${tower.node ? ` · Node ${tower.node}` : ''}`, tower.status === 'on_air' ? 'ok' : 'bad']);
  if (tower.onAir || tower.tracks != null) rows.push(['On air', `${tower.onAir ? `${tower.onAir.title}${tower.onAir.artist ? ` — ${tower.onAir.artist}` : ''} · ` : ''}${tower.tracks ?? '?'} tracks · ${tower.listeners ?? 0} listening`, '']);
  if (tower.line) {
    const l = tower.line;
    const turn = Number.isFinite(l.nextReset) ? ` · empties in ${duration((l.nextReset - now) / 1000)}` : '';
    rows.push(['The line', `${l.today} message${l.today === 1 ? '' : 's'} today${l.silenced ? ` · ${l.silenced} silenced` : ''}${turn}${l.keepDays != null ? ` · log kept ${l.keepDays ? `${l.keepDays} days` : 'until full'}` : ''}`, '']);
  }
  if (tower.notifications) {
    const n = tower.notifications;
    rows.push(['Notifications', `your phone: ${n.ortis ? 'on' : 'not set up (docs/NOTIFICATIONS.md)'} · listeners who asked: ${n.listeners == null ? 'off' : n.listeners}`, '']);
  }
  if (repeats) rows.push(['Same song twice', repeats.text, repeats.warn ? 'bad' : '']);
  return rows;
}

/* --------------------------------------------------------------- reading -- */

/** GitHub `main` and the self-test's verdict on it, from the public API (no token: 60 requests an hour from one address). */
export async function readGithub(repo, { fetchImpl = globalThis.fetch, branch = 'main', workflow = 'self-test' } = {}) {
  if (!repo) return { error: 'no repository known' };
  try {
    const api = `https://api.github.com/repos/${repo}`;
    const head = { headers: { Accept: 'application/vnd.github+json' } };
    const c = await fetchImpl(`${api}/commits/${branch}`, head);
    if (!c.ok) return { error: `GitHub answered ${c.status}` };
    const commit = await c.json();
    const out = { sha: commit.sha, message: String(commit.commit?.message || '').split('\n')[0].slice(0, 90), date: commit.commit?.committer?.date || null, ci: 'unknown' };
    const r = await fetchImpl(`${api}/actions/runs?head_sha=${commit.sha}&per_page=20`, head);
    if (r.ok) out.ci = ciOf((await r.json()).workflow_runs, workflow);
    return out;
  } catch (err) { return { error: err?.message || String(err) }; }
}

/** What the website serves: the commit its build stamped in config.json. */
export async function readSite(url, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await fetchImpl(url, { cache: 'no-store' });
    if (!res.ok) return { error: `the site answered ${res.status}` };
    const cfg = await res.json();
    return { commit: cfg.commit || null, builtAt: cfg.builtAt || null };
  } catch (err) { return { error: err?.message || String(err) }; }
}

/* ------------------------------------------------------------------ DOM -- */
export class StatusPanel {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root
   * @param {object} o.client  the tower client, unlocked
   */
  constructor({ root, client }) {
    this.root = root;
    this.client = client;
    this._alive = true;
    root.classList.add('stat');
    root.innerHTML = `
      <div class="panel-head"><h2 id="statH">Status</h2><button class="btn small" type="button" id="statAgain">Read again</button></div>
      <p class="queue-note">GitHub, the website and the tower should be on the same commit. Each is asked directly, now.</p>
      <div class="stat-lamps" id="statLamps" role="list" aria-label="Which commit each place is on"></div>
      <p class="stat-say" id="statSay"></p>
      <dl class="stat-rows" id="statRows" aria-labelledby="statH"></dl>
      <p class="qstate" id="statState" aria-live="polite"></p>`;
    root.querySelector('#statAgain').addEventListener('click', () => this.load());
    this.load();
  }

  async load() {
    if (!this._alive || this._busy) return;
    this._busy = true;
    const state = this.root.querySelector('#statState');
    state.textContent = 'Reading…';
    state.className = 'qstate';
    try {
      let tower = null;
      let towerError = null;
      try { tower = await this.client.towerStatus(); } catch (err) { towerError = err.status === 404 ? 'it runs a version from before the status existed' : err.message; }
      const gh = this.client.config?.github || {};
      const repo = tower?.repo || (gh.owner && gh.repo ? `${gh.owner}/${gh.repo}` : null);
      const [github, site] = await Promise.all([readGithub(repo), readSite(new URL('config.json', document.baseURI))]);
      if (!this._alive) return;
      this.paint(statusRows({ github, site, tower, towerError }), lamps({ github: github.sha, site: site.commit, tower: tower?.commit }));
      state.textContent = `Read at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`;
    } finally { this._busy = false; }
  }

  paint(rows, lit = []) {
    const box = this.root.querySelector('#statLamps');
    box.replaceChildren();
    for (const l of lit) {
      const p = document.createElement('span');
      p.className = `pill stat-lamp stat-${l.state}`;
      p.setAttribute('role', 'listitem');
      p.title = { ok: 'on GitHub\'s commit', behind: 'on another commit', unknown: 'could not be read' }[l.state];
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.setAttribute('aria-hidden', 'true');
      const b = document.createElement('b');
      b.textContent = l.name;
      p.append(dot, b, ` ${short(l.sha)}`);
      box.append(p);
    }
    // The first row says in a sentence what the lamps show: it goes under them, the rest stay a list.
    const [first, ...rest] = rows;
    const say = this.root.querySelector('#statSay');
    say.textContent = first?.[0] === 'In step?' ? first[1] : '';
    say.className = `stat-say${first?.[2] ? ` stat-${first[2]}` : ''}`;
    const dl = this.root.querySelector('#statRows');
    dl.replaceChildren();
    for (const [label, text, tone] of first?.[0] === 'In step?' ? rest : rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = text;
      if (tone) dd.className = `stat-${tone}`;
      dl.append(dt, dd);
    }
  }

  destroy() {
    this._alive = false;
    this.root.replaceChildren();
    this.root.classList.remove('stat');
  }
}

export default StatusPanel;
