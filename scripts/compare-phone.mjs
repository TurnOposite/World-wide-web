#!/usr/bin/env node
/**
 * The phone version, next to the desktop (the 2026-11-16 handoff; Ortis,
 * 2026-11-10: the core must be clear on a phone « without crowding the
 * screen »). Every route of the site at three sizes, side by side on one
 * page, with what a glance would miss flagged per route:
 *
 *   - sideways overflow (the page, or the page inside its window);
 *   - the title, and the main action, under the first screen;
 *   - text smaller than 12 px;
 *   - errors in the console.
 *
 * Run it before and after any change to what the site looks like, and attach
 * the page to the report:
 *
 *   node scripts/compare-phone.mjs                      this copy of the site (a local server), live tower
 *   node scripts/compare-phone.mjs --label before       …into docs/screenshots/compare-<date>-before/
 *   node scripts/compare-phone.mjs --url https://globe-trotter-ochre.vercel.app   the site as published
 *   node scripts/compare-phone.mjs --routes radio,antenna,booth
 *
 * It writes docs/screenshots/compare-<date>[-label]/index.html and one JPEG
 * per route and size (git-ignored: a working file, not history). Exit 0 with
 * no flag, 1 with any — a flag is something to look at, not a verdict: the
 * page says which and where.
 *
 * Needs a browser: Playwright's, or TOWER_BROWSER_EXECUTABLE / CHROME_PATH
 * (Chrome or Edge is found by itself on Windows). What emulation cannot
 * settle — iOS audio, the lock screen, the Home Screen — is the
 * tower-mobile-check skill's checklist, on a real phone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every address a listener can land on (the site smoke's phone list, kept in step by tests/compare-phone.test.js). */
export const ROUTES = ['', 'radio', 'ondes', 'playlists', 'antenna', 'booth', 'echo', 'echo/articles', 'echo/dont-shoot-the-pianist', 'echo/lectures', 'echo/lectures/voyages',
  'echo/presse/2024-07-22-p12', 'echo/archives', 'atlas', 'portfolio', 'portfolio/photos', 'portfolio/crates', 'ecrits', 'ecrits/l-ascenceur-tombe'];

export const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop 1440×900', width: 1440, height: 900, mobile: false },
  { id: 'phone', label: 'Phone 390×844', width: 390, height: 844, mobile: true },
  { id: 'small', label: 'Small phone 375×667', width: 375, height: 667, mobile: true },
];

export const MIN_TEXT_PX = 12;

export function parseArgs(argv) {
  const o = { url: null, label: '', routes: ROUTES, out: null, date: new Date().toISOString().slice(0, 10) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') o.url = String(argv[++i] || '').replace(/\/+$/, '');
    else if (a === '--label') o.label = String(argv[++i] || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    else if (a === '--routes') o.routes = String(argv[++i] || '').split(',').map((r) => r.trim().replace(/^\/+|\/+$/g, '')).filter((r, j, all) => all.indexOf(r) === j);
    else if (a === '--out') o.out = path.resolve(argv[++i]);
    else throw new Error(`unknown option ${a} (--url, --label, --routes a,b, --out DIR)`);
  }
  if (o.url && !/^https?:\/\//.test(o.url)) throw new Error('--url wants a full address (https://…)');
  o.out ??= path.join(ROOT, 'docs', 'screenshots', `compare-${o.date}${o.label ? `-${o.label}` : ''}`);
  return o;
}

/** A route as a file name: '' → home, echo/articles → echo--articles. */
export const fileOf = (route, viewport) => `${(route || 'home').replace(/\//g, '--').replace(/[^a-z0-9._-]+/gi, '-')}.${viewport}.jpg`;

/**
 * What to flag, from what was measured on a page (see `measure` below).
 * @returns {{id: string, text: string}[]}
 */
export function flagsFor(m) {
  const flags = [];
  if (!m || m.error) return [{ id: 'load', text: `did not load: ${m?.error || 'no measurement'}` }];
  if (m.overflowDoc > 1) flags.push({ id: 'overflow', text: `the page runs ${Math.round(m.overflowDoc)} px off the side` });
  if (m.overflowBox > 1) flags.push({ id: 'overflow', text: `the page runs ${Math.round(m.overflowBox)} px off the side of its window` });
  if (m.title === null) flags.push({ id: 'title', text: 'no title (h1) on the page' });
  else if (m.title.bottom > m.fold) flags.push({ id: 'title', text: `the title ends ${Math.round(m.title.bottom - m.fold)} px under the first screen` });
  if (m.action && m.action.bottom > m.fold) flags.push({ id: 'action', text: `« ${m.action.text} » ends ${Math.round(m.action.bottom - m.fold)} px under the first screen` });
  if (m.small?.count) flags.push({ id: 'small', text: `${m.small.count} piece${m.small.count === 1 ? '' : 's'} of text under ${MIN_TEXT_PX} px (smallest ${m.small.min} px: ${m.small.samples.map((s) => `« ${s} »`).join(', ')})` });
  if (m.errors?.length) flags.push({ id: 'console', text: `${m.errors.length} console error${m.errors.length === 1 ? '' : 's'}: ${m.errors[0].slice(0, 140)}` });
  return flags;
}

/**
 * Runs in the page. The page in view: the world's current window, or the classic shell's #view. The first screen
 * ends where the mini-player begins. Only what is shown counts (display, visibility, size).
 */
/* c8 ignore start */
export function measure(minPx) {
  const world = window.radioTower?.world;
  const box = world?.current ? document.querySelector(`#w-${world.current} .w-box`) : null;
  const page = box || document.getElementById('view') || document.body;
  const bar = document.getElementById('minibar');
  const barTop = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : innerHeight;
  const fold = Math.min(innerHeight, barTop > 0 ? barTop : innerHeight);
  const shown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
  const h1 = [...page.querySelectorAll('h1')].find(shown);
  const main = [...page.querySelectorAll('.btn.primary, button.primary, [data-main-action]')].find(shown);
  // Text under the minimum: elements that hold text of their own, shown, inside the first two screens.
  const small = [];
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.trim();
    const el = n.parentElement;
    if (text.length < 2 || !el || seen.has(el) || el.closest('[aria-hidden="true"], svg, canvas, script, style')) continue;
    seen.add(el);
    const size = parseFloat(getComputedStyle(el).fontSize);
    // The window may be drawn smaller than 1:1 (the world fits a page to its window): what the eye gets is the scaled size.
    const scale = box ? box.getBoundingClientRect().width / (box.offsetWidth || 1) : 1;
    const seenPx = Math.round(size * scale * 10) / 10;
    if (seenPx < minPx && shown(el) && el.getBoundingClientRect().top < innerHeight * 2) small.push({ px: seenPx, text: text.slice(0, 28) });
  }
  small.sort((a, b) => a.px - b.px);
  return {
    at: world?.current || null,
    path: location.pathname,
    fold: Math.round(fold),
    overflowDoc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    overflowBox: box ? box.scrollWidth - box.clientWidth : 0,
    title: h1 ? { text: h1.textContent.trim().slice(0, 60), ...rectOf(h1) } : null,
    action: main ? { text: main.textContent.trim().slice(0, 40), ...rectOf(main) } : null,
    small: { count: small.length, min: small[0]?.px ?? null, samples: [...new Set(small.slice(0, 3).map((s) => s.text))] },
  };
}
/* c8 ignore stop */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The one page: a summary of what is flagged, then every route with its three sizes side by side. */
export function reportHtml(results, { source, date, label = '', commit = null } = {}) {
  const flagged = results.filter((r) => r.shots.some((s) => s.flags.length));
  const count = results.reduce((n, r) => n + r.shots.reduce((k, s) => k + s.flags.length, 0), 0);
  const name = (route) => `/${route}`;
  const anchor = (route) => `r-${(route || 'home').replace(/[^a-z0-9]+/gi, '-')}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Phone next to desktop — ${esc(date)}${label ? ` (${esc(label)})` : ''}</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;padding:20px 16px 60px;background:#0b0d10;color:#e8edf2;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:34px 0 10px;padding-top:12px;border-top:1px solid #232a33}
  p,li{max-width:80ch} .dim{color:#96a1ae} code{font:13px ui-monospace,Consolas,monospace;color:#cbd5e1}
  .ok{color:#34d399} .flag{color:#ffb454}
  ul{padding-left:20px;margin:6px 0}
  .shots{display:grid;grid-template-columns:minmax(0,2.4fr) minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}
  figure{margin:0} figcaption{font-size:13px;margin-bottom:6px}
  img{display:block;width:100%;height:auto;border:1px solid #232a33;border-radius:8px;background:#000}
  figure ul{font-size:13px}
  a{color:#7dd3fc}
  @media (max-width:760px){.shots{grid-template-columns:1fr 1fr}.shots figure:first-child{grid-column:1/-1}}
</style></head><body>
<h1>Phone next to desktop</h1>
<p class="dim">${esc(date)}${label ? ` · ${esc(label)}` : ''} · ${esc(source)}${commit ? ` · commit <code>${esc(String(commit).slice(0, 7))}</code>` : ''} · ${results.length} routes × ${VIEWPORTS.length} sizes</p>
${count
    ? `<p class="flag"><b>${count} flag${count === 1 ? '' : 's'} on ${flagged.length} route${flagged.length === 1 ? '' : 's'}.</b> A flag is something to look at, not a verdict.</p>
<ul>${flagged.map((r) => `<li><a href="#${anchor(r.route)}"><code>${esc(name(r.route))}</code></a> — ${r.shots.filter((s) => s.flags.length).map((s) => `${esc(s.viewport.id)}: ${s.flags.map((f) => esc(f.text)).join('; ')}`).join(' · ')}</li>`).join('\n')}</ul>`
    : '<p class="ok"><b>Nothing flagged.</b> No overflow, every title and main action on the first screen, no text under 12 px, no console error.</p>'}
<p class="dim">Checked on each: sideways overflow · the title and the main action above the fold (the first screen ends where the mini-player begins) · text under ${MIN_TEXT_PX} px, as drawn · console errors. Emulation only: iOS audio, the lock screen and the Home Screen need the real phone (<code>tower-mobile-check</code>).</p>
${results.map((r) => `<h2 id="${anchor(r.route)}"><code>${esc(name(r.route))}</code></h2>
<div class="shots">
${r.shots.map((s) => `<figure><figcaption>${esc(s.viewport.label)} ${s.flags.length ? `<span class="flag">· ${s.flags.length} flag${s.flags.length === 1 ? '' : 's'}</span>` : '<span class="ok">· clear</span>'}</figcaption>
${s.file ? `<a href="${esc(s.file)}"><img src="${esc(s.file)}" alt="${esc(name(r.route))} at ${esc(s.viewport.label)}" loading="lazy" width="${s.viewport.width}" height="${s.viewport.height}"></a>` : '<p class="flag">no picture</p>'}
${s.flags.length ? `<ul class="flag">${s.flags.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>` : ''}</figure>`).join('\n')}
</div>`).join('\n')}
</body></html>
`;
}

/** A system browser when Playwright's own is not installed (the laptop): Chrome, then Edge. */
function findBrowser() {
  const env = process.env.TOWER_BROWSER_EXECUTABLE || process.env.CHROME_PATH;
  if (env) return env;
  const candidates = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : [];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

async function main(argv) {
  const opts = parseArgs(argv);
  const { chromium } = await import('playwright');
  let server = null;
  let base = opts.url;
  if (!base) {
    const { createSiteServer } = await import('./site-serve.mjs');
    server = await createSiteServer({ base: '/', quiet: true });
    const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
    base = `http://127.0.0.1:${port}`;
  }
  fs.mkdirSync(opts.out, { recursive: true });
  const exe = findBrowser();
  const browser = await chromium.launch({ args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'], ...(exe ? { executablePath: exe } : {}) });
  const results = opts.routes.map((route) => ({ route, shots: [] }));
  try {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1 });
      // Spotify's players are someone else's pages: a stand-in, so the picture does not depend on them.
      await ctx.route('https://open.spotify.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Spotify</title><body style="margin:0;background:#121212;color:#b3b3b3;font:13px sans-serif;display:grid;place-items:center;height:100vh">Spotify player</body>' }));
      for (const r of results) {
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error' && !/api\.github\.com|spotify|favicon/.test(`${m.text()} ${m.location?.()?.url || ''}`)) errors.push(m.text()); });
        const file = fileOf(r.route, vp.id);
        let m;
        try {
          await page.goto(`${base}/${r.route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          // The page is there, in its window, and the camera has stopped.
          await page.waitForFunction(() => {
            const w = window.radioTower?.world;
            if (w) return w.current && !w.camera.moving && (document.querySelector(`#w-${w.current} .w-box > .page`)?.textContent.trim().length ?? 0) > 20;
            return Boolean(window.radioTower) && (document.getElementById('view')?.textContent.trim().length ?? 0) > 20;
          }, null, { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(900);
          m = { ...(await page.evaluate(measure, MIN_TEXT_PX)), errors };
          await page.screenshot({ path: path.join(opts.out, file), type: 'jpeg', quality: 72, scale: 'css' });
        } catch (err) {
          m = { error: err.message.split('\n')[0] };
        }
        const flags = flagsFor(m);
        r.shots.push({ viewport: vp, file: m.error ? null : file, flags, measured: m });
        console.log(`${flags.length ? 'FLAG' : ' ok '}  ${vp.id.padEnd(7)} /${r.route}${flags.length ? ` — ${flags.map((f) => f.text).join('; ')}` : ''}`);
        await page.close();
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server?.close();
  }
  let commit = null;
  try { commit = (await import('../server/lib/commit.js')).readCommit(ROOT); } catch { /* not a checkout */ }
  const html = reportHtml(results, { source: opts.url || 'this copy of the site (local server)', date: opts.date, label: opts.label, commit });
  fs.writeFileSync(path.join(opts.out, 'index.html'), html);
  fs.writeFileSync(path.join(opts.out, 'flags.json'), `${JSON.stringify(results.map((r) => ({ route: r.route, shots: r.shots.map((s) => ({ viewport: s.viewport.id, flags: s.flags, measured: s.measured })) })), null, 1)}\n`);
  const count = results.reduce((n, r) => n + r.shots.reduce((k, s) => k + s.flags.length, 0), 0);
  console.log(`\n${count ? `${count} flag(s)` : 'nothing flagged'} — ${path.relative(ROOT, path.join(opts.out, 'index.html')).split(path.sep).join('/')}`);
  return count ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(err.message); process.exit(2); });
}
