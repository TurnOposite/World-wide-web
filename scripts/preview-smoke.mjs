#!/usr/bin/env node
/**
 * Drive the claude.ai preview build (dist-preview/) in a real browser, the
 * way the artifact host will serve it:
 *
 *   - the page content wrapped in the host's skeleton (doctype, a charset and
 *     viewport meta, the small reset), with every other file next to it;
 *   - a stand-in for the host's `window.claude.use('db')`: one shared store
 *     per browser context (localStorage + BroadcastChannel), which answers
 *     late like the real one, and can be made to refuse writes the way it
 *     does for a viewer below Contributor (?fakedb=ro) or be absent
 *     (?fakedb=none, i.e. any other host).
 *
 * What only claude.ai can prove — its CSP, its real database — is checked
 * once by hand after publishing (docs/CLOUD.md, phase 8).
 *
 *   node scripts/preview-smoke.mjs        (builds dist-preview/ first; tones are cached)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPreview, inventory, LIMITS, PREVIEW_TITLE } from './site-preview.mjs';
import { sendFile } from './site-serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.PREVIEW_DIST || path.join(ROOT, 'dist-preview'));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!process.argv.includes('--no-build')) await buildPreview({ quiet: true });
const inv = await inventory(OUT);
const content = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');

check('the page is page content: no doctype, html, head, body or base of its own', !/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]|<base\s/i.test(content));
check('its <title> is a name, in the first 8 KB', content.slice(0, 8192).includes(`<title>${PREVIEW_TITLE}</title>`));
check('it fits one publish', inv.problems.length === 0 && inv.files.length <= LIMITS.files, `index.html + ${inv.files.length} files, ${(inv.bytes / 1048576).toFixed(1)} MB${inv.problems.length ? ` — ${inv.problems.join('; ')}` : ''}`);
const lib = JSON.parse(fs.readFileSync(path.join(OUT, 'station/library.json'), 'utf8'));
check('every track plays a file that ships with the preview (no outside host)', lib.tracks.every((t) => t.sources.length === 1 && fs.existsSync(path.join(OUT, t.sources[0]))), `${lib.tracks.length} tones`);

/* The host's skeleton (the Artifact tool's description), plus the stand-in db. */
const FAKE_CLAUDE = `
(() => {
  const mode = new URLSearchParams(location.search).get('fakedb') || 'rw';
  const KEY = 'fakedb:';
  const ch = new BroadcastChannel('fakedb');
  const subs = new Map();
  const snap = (p) => {
    const t = localStorage.getItem(KEY + p);
    const d = t ? Object.freeze(JSON.parse(t)) : undefined;
    return Object.freeze({ id: p.split('/').pop(), exists: Boolean(t), data: () => d, metadata: { fromCache: false, hasPendingWrites: false } });
  };
  const fire = (p) => (subs.get(p) || []).forEach((fn) => fn(snap(p)));
  ch.onmessage = (e) => fire(e.data);
  const db = Object.freeze({
    doc(p) {
      if (p.split('/').length % 2) throw new TypeError('a document path has an even number of segments');
      return Object.freeze({
        id: p.split('/').pop(), path: p,
        get: async () => snap(p),
        set: async (data) => {
          if (mode === 'ro') throw { code: 'invalid_argument', message: 'below the write level' };
          window.__fakedbWrites = (window.__fakedbWrites || 0) + 1;
          localStorage.setItem(KEY + p, JSON.stringify(data));
          fire(p);
          ch.postMessage(p);
        },
        onSnapshot(next) {
          const list = subs.get(p) || [];
          list.push(next);
          subs.set(p, list);
          setTimeout(() => next(snap(p)), 30);
          return () => subs.set(p, (subs.get(p) || []).filter((f) => f !== next));
        },
      });
    },
  });
  // Like the real one: the namespace arrives after the page's first run.
  window.claude = Object.freeze({ use: (name) => new Promise((r) => setTimeout(() => r(name === 'db' && mode !== 'none' ? db : null), 400)) });
})();`;
const skeleton = (body) => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#fafaf9}img{max-width:100%}[hidden]{display:none!important}</style><script>${FAKE_CLAUDE}</script></head><body>${body}</body></html>`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/' || u.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(skeleton(content));
  }
  const abs = path.join(OUT, decodeURIComponent(u.pathname));
  if (!abs.startsWith(OUT + path.sep) || !(await sendFile(req, res, abs))) { res.writeHead(404); res.end('not found'); }
});
const port = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const site = `http://127.0.0.1:${port}/`;

const launchOpts = { args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--mute-audio'] };
const exe = process.env.TOWER_BROWSER_EXECUTABLE || process.env.CHROME_PATH;
if (exe) launchOpts.executablePath = exe;
const browser = await chromium.launch(launchOpts);
const errors = [];
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()} ${m.location?.()?.url || ''}`); });
};
const booted = (p) => p.waitForFunction(() => window.radioTower?.player?.onAir, null, { timeout: 15000 });

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const a = await ctx.newPage();
  watch(a, 'A');
  await a.goto(site, { waitUntil: 'domcontentloaded' });
  await booted(a);
  const note = await a.textContent('#previewNote').catch(() => '');
  check('the page says it is a preview with test tones, before anything plays', /test tone/.test(note) && /preview/.test(await a.textContent('#footMode')), note.slice(0, 60));
  check('the site\'s own dark ground wins over the host\'s reset', await a.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(11, 13, 16)'));

  await a.click('.tabs a[href="radio"]');
  await a.waitForSelector('#rTitle, .onair', { timeout: 8000 }).catch(() => {});
  const loc = await a.evaluate(() => ({ path: location.pathname, hash: location.hash }));
  check('a tab changes the route after #/, never the page\'s own address', loc.path === '/' && loc.hash === '#/radio', `${loc.path}${loc.hash}`);
  const onAir = await a.evaluate(() => ({ shown: window.radioTower.player.onAir.id, clock: window.radioTower.client.engine.station.at(window.radioTower.client.now()).track.id }));
  check('the in-browser clock picks the same track as the station would', onAir.shown === onAir.clock);

  await a.click('#mbTune');
  await a.waitForFunction(() => { const el = document.getElementById('audio'); return !el.paused && el.currentTime > 0.3; }, null, { timeout: 10000 }).catch(() => {});
  const play = await a.evaluate(() => { const el = document.getElementById('audio'); const p = window.radioTower.player; return { paused: el.paused, src: el.currentSrc, ct: el.currentTime, pos: p.livePosition(), id: p.onAir.id }; });
  check('Tune in plays that track\'s test tone', !play.paused && play.src.endsWith(`station/preview-audio/${play.id}.mp3`), play.src.split('/').pop());
  check('…on the station\'s second', Math.abs(play.ct - play.pos) < 1.2, `drift ${(play.ct - play.pos).toFixed(2)} s`);

  // A cold load straight onto a route.
  const deep = await ctx.newPage();
  watch(deep, 'deep');
  await deep.goto(`${site}#/ecrits/opal-orre`, { waitUntil: 'domcontentloaded' });
  await deep.waitForSelector('.reading h1', { timeout: 10000 }).catch(() => {});
  check('a cold #/ecrits/opal-orre opens the text', (await deep.textContent('.reading h1').catch(() => '')) === 'Opal Orre');
  await deep.close();

  /* ------------------------------------------ the booth, shared database -- */
  const b = await ctx.newPage();
  watch(b, 'B');
  await b.goto(site, { waitUntil: 'domcontentloaded' });
  await booted(b);
  await a.click('footer a[href="booth"]');
  await a.waitForFunction(() => /Shared preview/.test(document.querySelector('#bPlane')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  check('the booth finds the shared database (it arrives after the page started)', /Shared preview/.test(await a.textContent('#bPlane')), (await a.textContent('#bPlane')).trim().slice(0, 60));
  await a.waitForSelector('#bQueue li[data-movable="1"]', { timeout: 8000 }).catch(() => {});
  const movable = await a.$$('#bQueue li[data-movable="1"]');
  const beforeIds = await b.evaluate(() => window.radioTower.client.engine.get('/api/queue').body.slots.map((s) => s.id));
  if (movable.length >= 2) {
    await movable[1].focus();
    await a.keyboard.press('ArrowUp');
    await a.waitForFunction(() => /On air/.test(document.querySelector('#bQueue .qstate')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  }
  const saved = await a.evaluate(() => ({ writes: window.__fakedbWrites || 0, doc: JSON.parse(localStorage.getItem('fakedb:station/control') || 'null') }));
  check('a reorder is saved to the preview\'s database', saved.writes >= 1 && Array.isArray(saved.doc?.override?.ids), `${saved.writes} write(s)`);
  // No manual poll: the second listener hears it through its subscription.
  await b.waitForFunction((ids) => window.radioTower.client.engine.get('/api/queue').body.slots.map((s) => s.id).join() !== ids, beforeIds.join(), { timeout: 5000 }).catch(() => {});
  const afterIds = await b.evaluate(() => window.radioTower.client.engine.get('/api/queue').body.slots.map((s) => s.id));
  check('another listener hears it live, without waiting for a poll', afterIds.join() !== beforeIds.join() && [...afterIds].sort().join() === [...beforeIds].sort().join(), await b.evaluate(() => window.radioTower.client.controlStatus));

  /* ------------------------------------------------------- view-only ----- */
  const vctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const v = await vctx.newPage();
  watch(v, 'viewer');
  await v.goto(`${site}?fakedb=ro#/booth`, { waitUntil: 'domcontentloaded' });
  await booted(v);
  await v.waitForSelector('#bQueue li[data-movable="1"]', { timeout: 8000 }).catch(() => {});
  const vm = await v.$$('#bQueue li[data-movable="1"]');
  if (vm.length >= 2) { await vm[1].focus(); await v.keyboard.press('ArrowUp'); }
  await v.waitForFunction(() => /view-only/.test(document.querySelector('#bPlane')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const vText = `${await v.textContent('#bPlane')} ${await v.textContent('#bQueue .qstate')}`;
  check('a viewer below Contributor is told the preview is view-only for them', /view-only/.test(vText), vText.trim().replace(/\s+/g, ' ').slice(0, 90));

  /* ---------------------------------------------- any other host (no db) -- */
  const n = await (await browser.newContext()).newPage();
  watch(n, 'no-db');
  await n.goto(`${site}?fakedb=none#/booth`, { waitUntil: 'domcontentloaded' });
  await booted(n);
  await n.waitForTimeout(900);
  check('without the database the booth says changes stay in this browser', /in this browser only/.test(await n.textContent('#bPlane')));

  /* --------------------------------------------------------- the rooms --- */
  await a.click('.tabs a[href="portfolio"]');
  await a.waitForSelector('.room .book', { timeout: 8000 });
  const roomHash = await a.evaluate(() => location.hash);
  await a.click('a[data-maps]').catch(() => {});
  await a.waitForTimeout(500);
  check('an in-page link (#maps) keeps the reader in the library', (await a.evaluate(() => location.hash)) === roomHash && Boolean(await a.$('.room .book')), roomHash);

  check('no console errors anywhere', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  check('preview smoke ran to completion', false, err.stack?.split('\n').slice(0, 3).join(' '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} preview checks passed`);
process.exit(failed ? 1 : 0);
