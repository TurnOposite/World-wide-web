#!/usr/bin/env node
/**
 * Serve the static site locally — for working on it, and for the e2e tests.
 *
 *   node scripts/site-serve.mjs                      # site/ on :8090, like Pages at a domain root
 *   node scripts/site-serve.mjs --dist --base /radio-tower/   # the built dist/, like Pages under a repo path
 *   node scripts/site-serve.mjs --fixtures DIR       # play DIR/*.mp3 instead of the Wix tracks
 *   node scripts/site-serve.mjs --fake-github        # a local stand-in for the GitHub contents API
 *
 * Serving site/ (not --dist), it is also the Atelier's workbench
 * (docs/ATELIER.md): the versions of the past answer at /past/<id>/ straight
 * from past/<id>/ (scripts/site-past.mjs devPastFile — the build's overlay,
 * without a build), and the Atelier's « Enregistrer dans le dépôt » writes
 * site/data/layout.json through PUT /__atelier/layout — from this machine
 * only, and only a map with no errors.
 *
 * No dependencies (node:http only) so it runs anywhere Node does. It behaves
 * like GitHub Pages where it matters: unknown extensionless paths get the app
 * shell, every response carries a `Date` header (the site's clock-skew
 * source), and audio answers byte ranges with CORS, like the Wix CDN does.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isPrivatePath } from '../server/lib/collections.js';
import { devPastFile } from './site-past.mjs';
import { checkLayout, resolveLayout, stringifyLayout } from '../site/js/world/model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

export function parseArgs(argv) {
  const a = { port: 8090, dist: false, base: '/', fixtures: null, fakeGithub: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--port') a.port = Number(argv[++i]);
    else if (k === '--dist') a.dist = true;
    else if (k === '--base') a.base = argv[++i];
    else if (k === '--fixtures') a.fixtures = path.resolve(argv[++i]);
    else if (k === '--fake-github') a.fakeGithub = true;
    else if (k === '--quiet') a.quiet = true;
  }
  if (!a.base.startsWith('/')) a.base = `/${a.base}`;
  if (!a.base.endsWith('/')) a.base += '/';
  return a;
}

/** A library.json for local fixture audio, same shape as the real one. */
async function fixtureLibrary(dir, base) {
  const { parseFile } = await import('music-metadata');
  const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.mp3')).sort();
  const tracks = [];
  for (const [i, f] of files.entries()) {
    const meta = await parseFile(path.join(dir, f), { duration: true });
    tracks.push({
      crate: i % 2 ? 'Night' : 'Day',
      id: crypto.createHash('sha1').update(f).digest('hex').slice(0, 12),
      title: meta.common.title || f.replace(/\.mp3$/, ''),
      artist: meta.common.artist || 'Fixture',
      album: meta.common.album || null,
      duration: Math.round(meta.format.duration * 1000) / 1000,
      sources: [`${base}__fixtures/${encodeURIComponent(f)}`],
      art: null, genreSlug: 'unsorted', genreLabel: 'Unsorted', genreAccent: 210,
    });
  }
  return { name: 'Radio Tower (fixtures)', tagline: 'Self-test signal', epoch: '2026-01-01T00:00:00Z', shuffle: false, gapSeconds: 0, tracks };
}

export async function sendFile(req, res, abs, { cors = false, noCache = true } = {}) {
  let st;
  try { st = await fsp.stat(abs); } catch { return false; }
  if (!st.isFile()) return false;
  const type = TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes' };
  if (cors) headers['Access-Control-Allow-Origin'] = '*';
  headers['Cache-Control'] = noCache && /(html|javascript|css|json)/.test(type) ? 'no-cache' : 'public, max-age=600';
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    let start = range[1] === '' ? st.size - Number(range[2]) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : st.size - 1;
    end = Math.min(end, st.size - 1);
    if (!(start >= 0 && start <= end)) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); res.end(); return true; }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end(), true;
    fs.createReadStream(abs, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(abs).pipe(res);
  return true;
}

/** A request from this machine: the Atelier's save is never open to the network. */
const loopback = (req) => /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(req.socket.remoteAddress || '');

/**
 * The Atelier's save: a map that resolves with no problem and has no error
 * (model.js checkLayout), written one page per line. Returns [status, body].
 */
export async function saveLayout(text, file) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return [400, { error: 'not JSON' }]; }
  const { pages, problems } = resolveLayout(parsed, { all: true });
  const errors = [...problems, ...checkLayout(pages).filter((p) => p.level === 'error').map((p) => `${p.id}: ${p.msg}`)];
  if (errors.length) return [422, { error: errors.join(' · '), errors }];
  await fsp.writeFile(file, stringifyLayout({ ...parsed, updatedAt: new Date().toISOString() }));
  return [200, { ok: true, file: path.relative(ROOT, file).split(path.sep).join('/'), pages: pages.length }];
}

export async function createSiteServer(opts) {
  const o = { ...parseArgs([]), ...opts };
  const siteDir = path.join(ROOT, o.dist ? 'dist' : 'site');
  const lib = o.fixtures ? await fixtureLibrary(o.fixtures, o.base) : null;
  // Where the Atelier saves (tests point it at a scratch copy), and what /data/layout.json then serves.
  const layoutPath = o.layoutFile || path.join(ROOT, 'site/data/layout.json');

  // The fake GitHub: one file, ETags, sha checks — what GitHubControl relies on.
  const gh = { text: await fsp.readFile(path.join(siteDir, 'station/control.json'), 'utf8').catch(() => '{"version":1,"override":null,"look":null}'), sha: 'sha-0', n: 0, puts: 0 };
  const etag = () => `"${gh.sha}"`;

  const json = (res, status, body, extra = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Expose-Headers': 'ETag', ...extra });
    res.end(JSON.stringify(body));
  };

  const shell = async () => {
    let html = await fsp.readFile(path.join(siteDir, 'index.html'), 'utf8');
    return html.replace(/<base href="[^"]*">/, `<base href="${o.base}">`);
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let p = decodeURIComponent(url.pathname);

      if (o.fakeGithub && p.startsWith('/__gh/')) {
        if (req.method === 'OPTIONS') return json(res, 204, {});
        if (!/\/contents\//.test(p)) return json(res, 404, { message: 'Not Found' });
        if (req.method === 'GET') {
          if (req.headers['if-none-match'] === etag()) { res.writeHead(304, { ETag: etag(), 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag' }); return res.end(); }
          return json(res, 200, { sha: gh.sha, content: Buffer.from(gh.text).toString('base64'), encoding: 'base64' }, { ETag: etag() });
        }
        if (req.method === 'PUT') {
          if (!/^Bearer .+/.test(req.headers.authorization || '')) return json(res, 401, { message: 'Bad credentials' });
          let body = '';
          for await (const c of req) body += c;
          const b = JSON.parse(body);
          if (b.sha !== gh.sha) return json(res, 409, { message: 'sha does not match' });
          gh.text = Buffer.from(b.content, 'base64').toString('utf8');
          gh.n++; gh.puts++;
          gh.sha = `sha-${gh.n}`;
          return json(res, 200, { content: { sha: gh.sha }, commit: { sha: `commit-${gh.n}` } });
        }
        return json(res, 405, { message: 'method' });
      }

      if (!p.startsWith(o.base)) {
        if (p === o.base.slice(0, -1)) { res.writeHead(301, { Location: o.base }); return res.end(); }
        res.writeHead(404); return res.end('not under base');
      }
      p = '/' + p.slice(o.base.length);

      if (lib && p === '/__fixtures/' + p.slice('/__fixtures/'.length) && p.startsWith('/__fixtures/')) {
        const f = path.join(o.fixtures, path.basename(p));
        if (await sendFile(req, res, f, { cors: true })) return;
      }
      if (lib && (p === '/station/library.json' || /^\/past\/[a-z0-9-]+\/station\/library\.json$/.test(p))) return json(res, 200, lib);
      const todayConfig = async () => {
        const cfg = JSON.parse(await fsp.readFile(path.join(siteDir, 'config.json'), 'utf8'));
        if (o.fakeGithub) cfg.github = { ...cfg.github, owner: 'test', repo: 'radio-tower', api: `http://${req.headers.host}/__gh` };
        // Fixture audio is an in-browser station by definition: whatever
        // tower the real site is pointed at (site/config.json), local tests
        // play the fixtures — a test that wants a tower asks with ?tower=.
        if (lib) cfg.mode = 'cloud';
        return cfg;
      };
      if (p === '/config.json' && (o.fakeGithub || lib)) return json(res, 200, await todayConfig());
      // A built version's config, under the same rule: fixture audio means no tower, whatever the build took from today's.
      if (o.dist && lib && /^\/past\/[a-z0-9-]+\/config\.json$/.test(p)) {
        const cfg = JSON.parse(await fsp.readFile(path.join(siteDir, p), 'utf8'));
        return json(res, 200, { ...cfg, mode: 'cloud' });
      }

      // The Atelier's workbench (docs/ATELIER.md): only when serving site/, only from this machine.
      if (p === '/__atelier/ping') return json(res, 200, { writable: !o.dist && loopback(req) });
      if (p === '/__atelier/layout' && req.method === 'PUT') {
        if (o.dist || !loopback(req)) return json(res, 403, { error: 'the Atelier saves only to a site/ served on this machine' });
        let body = '';
        for await (const c of req) { body += c; if (body.length > 512 * 1024) return json(res, 413, { error: 'too large' }); }
        const [status, out] = await saveLayout(body, layoutPath);
        return json(res, status, out);
      }
      if (!o.dist && p === '/data/layout.json' && o.layoutFile) {
        res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-cache' });
        return res.end(await fsp.readFile(layoutPath));
      }
      // A version of the past, straight from its snapshot (the build's overlay, without a build).
      const past = !o.dist && /^\/past\/([a-z0-9-]+)(?:\/(.*))?$/.exec(p);
      if (past && past[1] !== 'bar.js') {
        if (past[2] === undefined) { res.writeHead(301, { Location: `${o.base}past/${past[1]}/` }); return res.end(); }
        const hit = await devPastFile(past[1], past[2], { base: o.base, today: await todayConfig() });
        if (hit?.json) return json(res, 200, hit.json);
        if (hit?.html) { res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' }); return res.end(hit.html); }
        if (hit?.collections !== undefined) p = `/collections/${hit.collections}`;
        else if (hit?.file && await sendFile(req, res, hit.file)) return;
        else if (hit?.file || !hit) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      }
      if (o.fakeGithub && p === '/station/control.json') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
        return res.end(gh.text);
      }
      // Dev: the portfolio's files straight from the repo, private folders refused.
      if (!o.dist && p.startsWith('/collections/')) {
        const rel = p.slice('/collections/'.length);
        if (isPrivatePath(rel)) { res.writeHead(404); return res.end(); }
        if (await sendFile(req, res, path.join(ROOT, 'collections', rel))) return;
        res.writeHead(404); return res.end();
      }

      const abs = path.join(siteDir, p);
      if (!abs.startsWith(siteDir)) { res.writeHead(403); return res.end(); }
      if (p.endsWith('/') || p === '') {
        const idx = path.join(abs, 'index.html');
        if (fs.existsSync(idx)) {
          const html = p === '/' ? await shell() : (await fsp.readFile(idx, 'utf8'));
          res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
          return res.end(html);
        }
      } else if (await sendFile(req, res, abs)) return;
      // A folder with its own shell (a version of the past's routes in dist/): served as the hosts do.
      else if (!path.extname(p) && fs.existsSync(path.join(abs, 'index.html'))) {
        res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
        return res.end(await fsp.readFile(path.join(abs, 'index.html')));
      }

      // SPA fallback, like Pages' 404.html but with a 200.
      if (!path.extname(p)) {
        res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
        return res.end(await shell());
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    } catch (err) {
      res.writeHead(500);
      res.end(String(err?.stack || err));
    }
  });
  server.fakeGithub = gh;
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  const server = await createSiteServer(o);
  server.listen(o.port, () => {
    if (!o.quiet) console.log(`  site on http://localhost:${o.port}${o.base}  (${o.dist ? 'dist/' : 'site/'}${o.fixtures ? ', fixture audio' : ''}${o.fakeGithub ? ', fake GitHub' : ''})`);
  });
}
