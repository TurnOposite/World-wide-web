#!/usr/bin/env node
/**
 * Is the published site actually working? One command, after going live.
 *
 *   node scripts/cloud-live-check.mjs https://YOUR-NAME.github.io/radio-tower/
 *
 * The build container that wrote this site could never reach github.io or
 * static.wixstatic.com, so the two things the self-test cannot prove —
 * the real Pages deploy and the real audio host — are exactly what this
 * checks, from wherever it is run (the laptop, a phone-tethered terminal, a
 * Claude session with network):
 *
 *   - the page, a deep link, and the link-preview picture;
 *   - config.json names the repository the booth writes to;
 *   - library.json is valid;
 *   - every track's audio answers a byte-range request, as an <audio
 *     crossorigin> element will ask for it, with the CORS header the
 *     visualiser needs — the one thing most likely to go wrong (Wix
 *     bandwidth, hotlink protection);
 *   - control.json, and the GitHub API the booth and listeners read it through.
 *
 * Prints PASS / WARN / FAIL with what to do; exits 1 on any FAIL. Changes
 * nothing anywhere: every request is a GET.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLibrary } from './cloud-library.mjs';

const TIMEOUT_MS = 15_000;

async function get(fetchImpl, url, headers = {}) {
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  return fetchImpl(url, { headers, redirect: 'follow', signal });
}

const hdr = (res, k) => res.headers.get(k) ?? res.headers.get(k.toLowerCase()) ?? null;

/** One track source, asked for the way the browser's <audio crossorigin> will ask. */
export async function checkAudio(fetchImpl, url, origin) {
  let res;
  try {
    res = await get(fetchImpl, url, { Range: 'bytes=0-1', Origin: origin });
  } catch (err) {
    return { ok: false, why: `no answer (${err.name === 'TimeoutError' ? 'timed out' : err.message})` };
  }
  if (res.status === 403 || res.status === 429) return { ok: false, why: `${res.status} — the host refused (Wix: monthly bandwidth used up, or hotlinking blocked)` };
  if (res.status === 404) return { ok: false, why: '404 — the file is gone from the host' };
  if (res.status !== 206 && res.status !== 200) return { ok: false, why: `HTTP ${res.status}` };
  const acao = hdr(res, 'Access-Control-Allow-Origin');
  if (!acao || (acao !== '*' && acao !== origin)) return { ok: false, why: 'no CORS header — the browser will refuse it (the player asks with crossorigin, for the visualiser)' };
  const type = hdr(res, 'Content-Type') || '';
  if (type && !/^audio\/|octet-stream/.test(type)) return { ok: false, why: `served as ${type}, not audio` };
  if (res.status === 200) return { ok: true, warn: 'no byte ranges (200, not 206): joining mid-track downloads from the start' };
  return { ok: true };
}

export async function liveCheck(siteUrl, { fetchImpl = globalThis.fetch, concurrency = 4, log = () => {} } = {}) {
  const results = [];
  const add = (level, name, detail = '', fix = '') => { const r = { level, name, detail, fix }; results.push(r); log(r); return r; };
  const root = new URL(siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`);
  const origin = root.origin;
  const at = (p) => new URL(p, root).href;

  // 1. the page
  let html = '';
  try {
    const res = await get(fetchImpl, root.href);
    html = await res.text();
    if (!res.ok) add('FAIL', 'the site answers', `HTTP ${res.status}`, 'Settings → Pages → Source: GitHub Actions, then Actions → pages → Run workflow (GO-LIVE step 3).');
    else add('PASS', 'the site answers', root.href);
  } catch (err) {
    add('FAIL', 'the site answers', err.message, 'Check the address; a new Pages site can take a few minutes to appear.');
    return results;
  }
  const base = html.match(/<base href="([^"]*)">/)?.[1];
  if (base === root.pathname) add('PASS', 'the site knows where it lives', `<base href="${base}">`);
  else add('FAIL', 'the site knows where it lives', `<base href="${base}"> but the address path is ${root.pathname}`, 'Re-run the pages workflow; it sets the base from the repository name.');

  try {
    const res = await get(fetchImpl, at('atlas'));
    if (res.ok) add('PASS', 'a deep link opens (…/atlas)');
    else add('FAIL', 'a deep link opens (…/atlas)', `HTTP ${res.status}`, 'The build writes a page at every route; re-run the pages workflow.');
  } catch (err) { add('FAIL', 'a deep link opens (…/atlas)', err.message); }

  const og = html.match(/<meta property="og:image" content="([^"]+)">/)?.[1];
  if (!og) add('WARN', 'the link-preview picture', 'no og:image in the page');
  else if (!/^https?:\/\//.test(og)) add('WARN', 'the link-preview picture', `relative (${og}): chat apps will not show it`, 'The pages workflow passes SITE_URL; re-run it.');
  else {
    try {
      const res = await get(fetchImpl, og);
      if (res.ok && /^image\//.test(hdr(res, 'Content-Type') || '')) add('PASS', 'the link-preview picture', og);
      else add('WARN', 'the link-preview picture', `HTTP ${res.status} ${hdr(res, 'Content-Type') || ''}`);
    } catch (err) { add('WARN', 'the link-preview picture', err.message); }
  }

  // 2. config
  let config = {};
  try {
    config = await (await get(fetchImpl, at('config.json'))).json();
    const gh = config.github || {};
    if (gh.owner && gh.repo) add('PASS', 'the booth knows its repository', `${gh.owner}/${gh.repo}`);
    else add('WARN', 'the booth knows its repository', 'config.json has no github.owner/repo — the booth is read-only', 'Built outside GitHub Actions? The pages workflow fills these in.');
  } catch (err) { add('FAIL', 'config.json', err.message); }

  // 3. library
  let lib = null;
  try {
    lib = await (await get(fetchImpl, at('station/library.json'))).json();
    const problems = validateLibrary(lib);
    if (problems.length) add('FAIL', 'the library is valid', problems.slice(0, 3).join('; '), 'node scripts/cloud-library.mjs check, locally, shows every problem.');
    else add('PASS', 'the library is valid', `${lib.tracks.length} tracks`);
  } catch (err) { add('FAIL', 'the library is valid', err.message); }

  // 4. the audio — every source of every track
  if (lib?.tracks?.length) {
    const jobs = lib.tracks.flatMap((t) => (t.sources || []).map((s, i) => ({ t, i, url: new URL(s, root).href })));
    const out = new Array(jobs.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (next < jobs.length) { const k = next++; out[k] = { ...jobs[k], ...(await checkAudio(fetchImpl, jobs[k].url, origin)) }; }
    }));
    // A track plays if any of its sources plays.
    const byTrack = new Map();
    for (const r of out) { const a = byTrack.get(r.t.id) || []; a.push(r); byTrack.set(r.t.id, a); }
    const dead = [...byTrack.values()].filter((rs) => !rs.some((r) => r.ok));
    const warns = out.filter((r) => r.ok && r.warn);
    const hosts = [...new Set(jobs.map((j) => new URL(j.url).host))].join(', ');
    if (!dead.length) add(warns.length ? 'WARN' : 'PASS', 'every track\'s audio loads in a browser', `${byTrack.size}/${byTrack.size} tracks from ${hosts}${warns.length ? ` — ${warns[0].warn}` : ''}`);
    else {
      const first = dead[0][0];
      add('FAIL', 'every track\'s audio loads in a browser', `${byTrack.size - dead.length}/${byTrack.size} play; e.g. “${first.t.title}”: ${first.why}`,
        /bandwidth|refused/.test(first.why) ? 'Wix dashboard → Media → usage. GO-LIVE "Bandwidth": add a second source per track (Cloudflare R2).' : 'Check that source URL in site/station/library.json.');
    }
  }

  // 5. control.json and the GitHub API
  try {
    const res = await get(fetchImpl, at('station/control.json'));
    JSON.parse(await res.text());
    add(res.ok ? 'PASS' : 'FAIL', 'the queue file is published', res.ok ? 'station/control.json' : `HTTP ${res.status}`);
  } catch (err) { add('FAIL', 'the queue file is published', err.message); }

  const gh = config.github || {};
  if (gh.owner && gh.repo) {
    const api = (gh.api || 'https://api.github.com').replace(/\/$/, '');
    const p = (gh.controlPath || 'site/station/control.json').split('/').map(encodeURIComponent).join('/');
    try {
      const res = await get(fetchImpl, `${api}/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}/contents/${p}?ref=${encodeURIComponent(gh.branch || 'main')}`, { Accept: 'application/vnd.github+json' });
      const left = hdr(res, 'X-RateLimit-Remaining');
      if (res.ok) add('PASS', 'listeners can read the queue through GitHub', `${left != null ? `${left} API calls left this hour from here` : 'ok'}`);
      else if (res.status === 404) add('WARN', 'listeners can read the queue through GitHub', '404 — the repository is private, or the file is missing', 'A private repo still works, but listeners only hear a reorder after each redeploy (1–2 min). Make it public for live changes.');
      else if (res.status === 403 || res.status === 429) add('WARN', 'listeners can read the queue through GitHub', `${res.status} — rate limited from this network`, 'Normal on a busy network: listeners fall back to the Pages copy.');
      else add('WARN', 'listeners can read the queue through GitHub', `HTTP ${res.status}`);
    } catch (err) { add('WARN', 'listeners can read the queue through GitHub', err.message); }
  }
  return results;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const url = process.argv[2];
  if (!url || !/^https?:\/\//.test(url)) {
    console.log('Usage: node scripts/cloud-live-check.mjs https://YOUR-NAME.github.io/radio-tower/');
    process.exit(2);
  }
  console.log(`Checking ${url}\n`);
  const results = await liveCheck(url, {
    log: (r) => {
      console.log(`${r.level.padEnd(4)}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
      if (r.fix && r.level !== 'PASS') console.log(`      → ${r.fix}`);
    },
  });
  const fails = results.filter((r) => r.level === 'FAIL').length;
  const warns = results.filter((r) => r.level === 'WARN').length;
  console.log(`\n${fails ? `${fails} problem(s) to fix` : 'The station is on the air.'}${warns ? ` ${warns} warning(s).` : ''}`);
  process.exit(fails ? 1 : 0);
}
