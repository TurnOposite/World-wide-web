#!/usr/bin/env node
/**
 * Serve the static site locally — for working on it, and for the e2e tests.
 *
 *   node scripts/site-serve.mjs                      # site/ on :8090, like Pages at a domain root
 *   node scripts/site-serve.mjs --dist --base /radio-tower/   # the built dist/, like Pages under a repo path
 *   node scripts/site-serve.mjs --fixtures DIR       # play DIR/*.mp3 instead of the Wix tracks
 *   node scripts/site-serve.mjs --fake-github        # a local stand-in for the GitHub contents API
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
  for (const f of files) {
    const meta = await parseFile(path.join(dir, f), { duration: true });
    tracks.push({
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

async function sendFile(req, res, abs, { cors = false, noCache = true } = {}) {
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

export async function createSiteServer(opts) {
  const o = { ...parseArgs([]), ...opts };
  const siteDir = path.join(ROOT, o.dist ? 'dist' : 'site');
  const lib = o.fixtures ? await fixtureLibrary(o.fixtures, o.base) : null;

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
      if (lib && p === '/station/library.json') return json(res, 200, lib);
      if (p === '/config.json' && (o.fakeGithub || lib)) {
        const cfg = JSON.parse(await fsp.readFile(path.join(siteDir, 'config.json'), 'utf8'));
        if (o.fakeGithub) cfg.github = { ...cfg.github, owner: 'test', repo: 'radio-tower', api: `http://${req.headers.host}/__gh` };
        return json(res, 200, cfg);
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
