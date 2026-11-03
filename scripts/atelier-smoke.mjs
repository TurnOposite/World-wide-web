#!/usr/bin/env node
/**
 * The map as data, driven in a real browser (docs/ATELIER.md) — the Atelier
 * stage of the self-test. What it proves, each a check that can fail:
 *   - the public world carries none of the past (2026-11-01: a private view's);
 *   - the private view (?atelier=1) reads site/data/layout.json: the versions of the past online
 *     have a window and a tag, an offline one has neither;
 *   - a version opens in its window, framed, silent and bar-less, while the
 *     radio plays on through the flight there and back;
 *   - a version on its own (/past/<id>/…) boots the old site under the bar,
 *     whose links lead to today's pages, the same page in the other versions
 *     and « this page today »;
 *   - short links: go/<code> lands on the page, go/<version>/<page> on the old
 *     site, an offline or unknown one says why; a gt: link in a page gets
 *     today's address and the router takes it;
 *   - the Atelier (?atelier=1): the whole map, a window dragged, the error it
 *     makes shown, undone; a version switched off; the map saved through the
 *     local server; and nobody who did not ask ever loads it;
 *   - the built dist/, under a repository sub-path: a version's cold deep link,
 *     its portfolio images reaching today's copy, a short link, a window;
 *   - a 390 px phone: the version's window fits, its tag is in the strip.
 *
 * Silent MP3 frames stand in for music (no ffmpeg needed).
 *
 *   node scripts/atelier-smoke.mjs [towerUrl]
 *
 * With a Radio Tower server's address (build-test.sh passes the one it
 * started), an old page in tower mode is checked too: the files the tower's
 * portfolio answer names must be today's copy, not one under past/<id>/.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSiteServer } from './site-serve.mjs';
import { build } from './site-build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const towerUrl = process.argv[2]?.startsWith('http') ? process.argv[2].replace(/\/$/, '') : null;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Silent MPEG-1 Layer III frames (as tests/programme.test.js): a duration the scanner reads, no ffmpeg. */
function fixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-fx-'));
  const frame = Buffer.alloc(417);
  frame.writeUInt32BE(0xfffb9064, 0);
  for (const [name, s] of [['01 First Light', 40], ['02 Second Wind', 36], ['03 Third Rail', 44]]) {
    fs.writeFileSync(path.join(dir, `${name}.mp3`), Buffer.concat(Array(Math.round((s * 44100) / 1152)).fill(frame)));
  }
  return dir;
}

// Accessibility, as the site smoke runs it: axe-core, violations above minor. The old site under the bar is checked
// for the bar alone (its own pages are frozen as they were; site-smoke checked them when they were today's).
let AXE = null;
try { AXE = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8'); } catch { /* not installed */ }
async function axeRun(page, include = null) {
  if (!AXE) return [];
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async (inc) => (await window.axe.run(inc ? { include: [[inc]] } : document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact !== 'minor').map((v) => `${v.id} (${v.impact}) ${v.nodes[0]?.target.join(' ')}`), include);
}

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const launchOpts = { args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--mute-audio'] };
const exe = process.env.TOWER_BROWSER_EXECUTABLE || process.env.CHROME_PATH;
if (exe) launchOpts.executablePath = exe;

const MAP = fs.readFileSync(path.join(ROOT, 'site/data/layout.json'), 'utf8');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-map-'));
const layoutFile = path.join(scratch, 'layout.json');
fs.writeFileSync(layoutFile, MAP);
const fx = fixtures();
const devServer = await createSiteServer({ fixtures: fx, base: '/', layoutFile });
const dev = `http://127.0.0.1:${await listen(devServer)}/`;
const browser = await chromium.launch(launchOpts);
const errors = [];
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const w = await ctx.newPage();
  watch(w, 'world');
  const ready = () => w.waitForFunction(() => window.radioTower?.world?.current && !window.radioTower.world.camera.moving, null, { timeout: 15000 });
  const settled = (id) => w.waitForFunction((i) => window.radioTower?.world?.current === i && !window.radioTower.world.camera.moving, id, { timeout: 10000 }).catch(() => {});

  // ---- the map
  await w.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await ready();
  const map = await w.evaluate(() => ({
    tags: [...document.querySelectorAll('.w-tag')].map((b) => b.dataset.go),
    past: [...document.querySelectorAll('.w-tag-past')].map((b) => b.dataset.go),
    plane: parseFloat(document.querySelector('.w-plane').style.height),
    band: !document.querySelector('.w-strata').hidden && getComputedStyle(document.querySelector('.w-strata')).display !== 'none',
    atelier: Boolean(document.querySelector('.at-panel')) || [...document.querySelectorAll('link')].some((l) => l.href.includes('atelier.css')),
  }));
  // The versions of the past are the private view's since 2026-11-01: a visitor's world has no tag, no window, no band for them.
  check('the public world carries none of the past: no tag, no window, no band', map.past.length === 0 && !map.tags.some((t) => /^(v1|v2|wix)$/.test(t))
    && map.plane === 2600 && !map.band, JSON.stringify(map));
  check('nobody who did not ask loads the Atelier', !map.atelier);

  // ---- the private view: the Atelier's tab
  await w.goto(dev + 'radio?atelier=1', { waitUntil: 'domcontentloaded' });
  await w.waitForFunction(() => window.radioTower?.atelier && window.radioTower.world?.current && !window.radioTower.world.camera.moving, null, { timeout: 15000 }).catch(() => {});
  const priv = await w.evaluate(() => ({
    past: [...document.querySelectorAll('.w-tag-past')].map((b) => b.dataset.go),
    wix: document.querySelector('.w-tag[data-go="wix"]')?.classList.contains('w-off') ?? null,
    plane: parseFloat(document.querySelector('.w-plane').style.height),
    band: !document.querySelector('.w-strata').hidden,
    mini: document.querySelector('.w-minimap').viewBox.baseVal.height,
  }));
  check('the private view reads the map: Version 1 and 2 have a tag and a window under both halves; Wix (offline) only greyed',
    priv.past.join() === 'v1,v2,wix' && priv.wix === true && priv.plane > 2600 && priv.band && priv.mini === priv.plane, JSON.stringify(priv));

  // ---- a version in its window, the radio playing through
  if (!(await w.evaluate(() => window.radioTower.player.playing))) await w.click('#mbTune');
  await w.waitForFunction(() => window.radioTower.player.playing && !document.getElementById('audio').paused, null, { timeout: 10000 }).catch(() => {});
  await w.click('.w-tag[data-go="v1"]');
  await settled('v1');
  await w.waitForFunction(() => document.querySelector('#w-v1 .v-frame')?.contentWindow?.radioTower?.router, null, { timeout: 15000 }).catch(() => {});
  const framed = await w.evaluate(() => {
    const f = document.querySelector('#w-v1 .v-frame');
    const d = f?.contentDocument;
    const r = f?.getBoundingClientRect();
    return {
      path: location.pathname, src: f?.getAttribute('src'), h: Math.round(r?.height || 0),
      embedded: d?.documentElement.classList.contains('gt-embedded'), bar: Boolean(d?.querySelector('.gt-past-bar')),
      minibar: d && getComputedStyle(d.getElementById('minibar')).display, oldAudio: d?.getElementById('audio')?.paused,
      base: d?.baseURI, text: d?.getElementById('view')?.textContent.trim().length || 0,
      playing: window.radioTower.player.playing && !document.getElementById('audio').paused,
    };
  });
  check('a version opens in its window: the old site framed, silent, without the bar — the world all around it', framed.path === '/versions/v1'
    && framed.src === 'past/v1/?embed=1' && framed.h > 300 && framed.embedded && !framed.bar && framed.minibar === 'none' && framed.oldAudio !== false
    && framed.base.endsWith('/past/v1/') && framed.text > 40, JSON.stringify({ ...framed, base: undefined }));
  // The old player refuses to play inside the world: tuning in there must not start a second radio.
  const second = await w.evaluate(async () => {
    const d = document.querySelector('#w-v1 .v-frame').contentDocument;
    d.getElementById('mbTune')?.click();
    await new Promise((r) => setTimeout(r, 600));
    return { old: d.getElementById('audio').paused, ours: !document.getElementById('audio').paused };
  });
  check('…and its own tune-in plays nothing: the world’s mini-player stays the one radio', second.old && second.ours, JSON.stringify(second));
  const a11yWindow = await axeRun(w);
  check('no accessibility violations above minor with a version open in its window (and the doors’ short links)', a11yWindow.length === 0, a11yWindow.slice(0, 3).join(' | '));
  // Radio's tag: in the private view the Atelier's panel stands over Echo's tags, on the right.
  await w.click('.w-tag[data-go="radio"]');
  await settled('radio');
  const left = await w.evaluate(() => ({ frame: Boolean(document.querySelector('#w-v1 .v-frame')), playing: window.radioTower.player.playing && !document.getElementById('audio').paused }));
  check('leaving it: the frame is gone (nothing of the old site keeps running) and the radio played on through both flights', !left.frame && framed.playing && left.playing, JSON.stringify(left));

  // ---- a version on its own, under the bar
  const old = await ctx.newPage();
  watch(old, 'past');
  await old.goto(dev + 'past/v1/ecrits', { waitUntil: 'domcontentloaded' });
  await old.waitForSelector('.gt-past-bar', { timeout: 10000 }).catch(() => {});
  await old.waitForFunction(() => document.title.startsWith('Écrits'), null, { timeout: 10000 }).catch(() => {});
  const bar = await old.evaluate(() => Object.fromEntries([...document.querySelectorAll('.gt-past-bar a')].map((a) => [a.textContent.replace(/[→↗←]/g, '').trim(), new URL(a.href).pathname])));
  check('a version on its own boots the old site under the bar: today’s pages, the same page in v2, « this page today »',
    bar.Atlas === '/atlas' && bar.Une === '/echo' && bar['Version 2'] === '/past/v2/ecrits' && bar['Cette page aujourd’hui'] === '/echo/lectures'
    && bar['Le monde d’aujourd’hui'] === '/versions/v1', JSON.stringify(bar));
  const a11yBar = await axeRun(old, '.gt-past-bar');
  check('the bar passes axe (names, contrast)', a11yBar.length === 0, a11yBar.slice(0, 3).join(' | '));
  await old.click('.gt-past-bar a[href$="/atlas"]:not(.gt-here)');
  await old.waitForFunction(() => window.radioTower?.world?.current === 'atlas', null, { timeout: 15000 }).catch(() => {});
  check('…and its link to a page of today lands in today’s world', await old.evaluate(() => location.pathname === '/atlas' && window.radioTower?.world?.current === 'atlas'));
  // Tower mode, as the live site runs: the old page asks the tower for the portfolio instead of its frozen data;
  // the files it names must still be today's copy, never one under past/v1/ (which does not exist).
  if (towerUrl) {
    await old.goto(`${dev}past/v1/portfolio/library?tower=${encodeURIComponent(towerUrl)}`, { waitUntil: 'domcontentloaded' });
    await old.waitForFunction(() => /collections\//.test(document.querySelector('#view')?.innerHTML || ''), null, { timeout: 15000 }).catch(() => {});
    const towered = await old.evaluate(async () => {
      const f = (document.querySelector('#view').innerHTML.match(/(?:\.\.\/)*\/?collections\/[^"') &]+/) || [])[0] || null;
      const url = f ? new URL(f, document.baseURI) : null;
      return { mode: window.radioTower?.client?.mode, file: f, path: url?.pathname, ok: url ? (await fetch(url, { method: 'HEAD' })).ok : false };
    });
    check('an old page in tower mode: the tower’s portfolio answer reaches today’s files, not a copy under past/v1/', towered.mode !== 'cloud'
      && /^\/collections\//.test(towered.path || '') && towered.ok, JSON.stringify(towered));
  } else console.log('SKIP  tower mode for an old page (no tower address given)');
  await old.close();

  // ---- short links
  const go = async (ref) => {
    await w.goto(dev + `go/${ref}`, { waitUntil: 'domcontentloaded' });
    // Followed (another address, the page booted and the camera landed — or another app's page loaded), or explained over the world.
    await w.waitForFunction(() => document.querySelector('meta[name="gt-past"]') && document.title !== 'Globe Trotter — Radio Tower'
      || (!location.pathname.startsWith('/go/') && window.radioTower?.world?.current && !window.radioTower.world.camera.moving)
      || document.querySelector('.w-lost:not([hidden]) .page h1'), null, { timeout: 15000 }).catch(() => {});
    return w.evaluate(() => ({ path: location.pathname, here: window.radioTower?.world?.current, said: document.querySelector('.w-lost:not([hidden]) .page h1')?.textContent || null, past: document.querySelector('meta[name="gt-past"]')?.content || null }));
  };
  const z04 = await go('Z-04');
  const art = await go('E-02/article-temoin');
  const v2atlas = await go('v2/atlas');
  const off = await go('wix');
  const none = await go('nulle-part');
  check('short links: go/Z-04 (retired onto Echo’s Atlas) is the Atlas, go/E-02/<slug> an article, go/v2/atlas the v2 site’s own Atlas',
    z04.path === '/atlas' && z04.here === 'atlas' && art.path === '/echo/article-temoin' && art.here === 'articles' && v2atlas.path === '/past/v2/atlas' && v2atlas.past === 'v2',
    JSON.stringify({ z04, art, v2atlas }));
  check('…an offline version and an unknown ref each say why, over the world', /Wix est hors ligne/.test(off.said || '') && /ne mène nulle part/.test(none.said || ''), `${off.said} | ${none.said}`);
  await w.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await ready();
  const rewritten = await w.evaluate(async () => {
    const a = document.createElement('a');
    a.href = 'gt:Z-04';
    a.id = 'refTest';
    a.textContent = 'la Zone';
    document.querySelector('#w-radio .w-box .page').append(a);
    await new Promise((r) => setTimeout(r, 50));
    return { href: a.getAttribute('href'), ref: a.dataset.ref };
  });
  await w.click('#refTest');
  await settled('atlas');
  // Z-04, the merged Atlas of 2026-11-01's afternoon, moved to Echo's side that evening: a link handed out before still lands, on the map's Atlas.
  check('a gt: link gets today’s address as it enters the page, and the router takes the click — a retired code too', rewritten.href === 'atlas' && rewritten.ref === 'Z-04'
    && await w.evaluate(() => location.pathname === '/atlas' && window.radioTower.world.current === 'atlas'), JSON.stringify(rewritten));

  // ---- the Atelier
  const at = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  watch(at, 'atelier');
  await at.goto(dev + 'atlas?atelier=1', { waitUntil: 'domcontentloaded' });
  await at.waitForFunction(() => window.radioTower?.atelier && window.radioTower.world.current === 'atlas', null, { timeout: 15000 });
  const opened = await at.evaluate(() => ({
    rows: document.querySelectorAll('.at-pick').length, switches: [...document.querySelectorAll('.at-status')].map((b) => b.textContent),
    wix: document.getElementById('w-wix')?.classList.contains('w-off'), picked: document.querySelector('.at-item.on code')?.textContent,
    state: document.querySelector('.at-state').textContent,
  }));
  check('the Atelier lists every page, today’s and the past’s, an online/offline switch on each version, the page in view chosen',
    // 11 pages of today (the Bibliothèque, E-06, since 2026-11-03) + 3 of the past
    opened.rows === 14 && opened.switches.join() === 'En ligne,En ligne,Hors ligne' && opened.wix && opened.picked === 'E-05' && /Identique/.test(opened.state), JSON.stringify(opened));
  const a11yPanel = await axeRun(at, '.at-panel');
  check('the Atelier’s panel passes axe', a11yPanel.length === 0, a11yPanel.slice(0, 3).join(' | '));
  await at.click('.at-tools button:first-child');
  await at.waitForSelector('.at-grip[data-id="atlas"]');
  const grip = await at.evaluate(() => {
    const r = document.querySelector('.at-grip[data-id="atlas"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 3, s: window.radioTower.world.camera.cam.s, all: [...document.querySelectorAll('.at-grip')].every((g) => { const b = g.getBoundingClientRect(); return b.right <= innerWidth && b.bottom <= innerHeight && b.left >= 0; }) };
  });
  // Echo's Atlas dragged 1320 px left lands on the Booth, on Zone's side.
  const dx = -Math.round(1320 * grip.s);
  await at.mouse.move(grip.x, grip.y);
  await at.mouse.down();
  await at.mouse.move(grip.x + dx / 2, grip.y, { steps: 4 });
  await at.mouse.move(grip.x + dx, grip.y, { steps: 4 });
  await at.mouse.up();
  const dragged = await at.evaluate(() => ({
    left: parseFloat(document.getElementById('w-atlas').style.left),
    problems: [...document.querySelectorAll('.at-prob')].map((b) => b.textContent),
    draft: JSON.parse(localStorage.getItem('gt.atelier.draft') || 'null')?.pages.find((p) => p.id === 'atlas')?.x,
    save: document.querySelector('.at-primary')?.disabled,
  }));
  check('the whole map fits the screen; dragging Atlas moves its window at once, flags it on top of the Booth, keeps the draft, and will not save it',
    grip.all && Math.abs(dragged.left - 1440) <= 20 && dragged.problems.some((p) => /Booth — on top of atlas/.test(p)) && dragged.draft === dragged.left && dragged.save === true,
    JSON.stringify({ ...dragged, s: grip.s }));
  await at.click('text=↶ Annuler');
  const undone = await at.evaluate(() => ({ left: document.getElementById('w-atlas').style.left, problems: document.querySelectorAll('.at-prob').length, draft: localStorage.getItem('gt.atelier.draft') }));
  check('↶ puts it back, and the draft goes with it', undone.left === '2760px' && undone.problems === 0 && undone.draft === null, JSON.stringify(undone));
  await at.click('.at-status[aria-label^="Version 2"]');
  const switched = await at.evaluate(() => ({ win: document.getElementById('w-v2').classList.contains('w-off'), tag: document.querySelector('.w-tag[data-go="v2"]').classList.contains('w-off'), label: document.querySelector('.at-status[aria-label^="Version 2"]').textContent }));
  check('a version switched off greys at once in the Atelier (window and tag)', switched.win && switched.tag && switched.label === 'Hors ligne', JSON.stringify(switched));
  const save = await at.evaluate(async () => {
    const b = document.querySelector('.at-primary');
    const shown = !b.hidden;
    b.click();
    await new Promise((r) => setTimeout(r, 800));
    return { shown, toast: document.getElementById('toast').textContent, state: document.querySelector('.at-state').textContent };
  });
  const saved = JSON.parse(fs.readFileSync(layoutFile, 'utf8')).pages.find((p) => p.id === 'v2');
  check('« Enregistrer dans le dépôt » writes the map through the local server, and the Atelier then matches it', save.shown && saved.status === 'offline'
    && /Enregistré dans/.test(save.toast) && /Identique/.test(save.state), JSON.stringify({ ...save, v2: saved.status }));
  await w.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await ready();
  check('…and a reload gets the saved map: Version 2 offline (greyed in the private view), Version 1 on', await w.evaluate(() => document.querySelector('.w-tag[data-go="v2"]')?.classList.contains('w-off')
    && !document.querySelector('.w-tag[data-go="v1"]')?.classList.contains('w-off')));
  fs.writeFileSync(layoutFile, MAP);

  // ---- the built site, under a repository sub-path
  // No repository (2026-11-03): in CI, GITHUB_REPOSITORY made this dist's booth poll api.github.com, which GitHub's
  // runners were refused that night (a CORS-less 403, red on 8b5cb71 re-run too). Nothing checked here is the booth's.
  const dist = await build({ base: '/radio-tower/', quiet: true, repo: '' });
  check('the build lays out the versions online, and only those', dist.past.join() === 'v1,v2' && !fs.existsSync(path.join(ROOT, 'dist/past/wix')), JSON.stringify(dist.past));
  const distServer = await createSiteServer({ dist: true, base: '/radio-tower/', fixtures: fx });
  const sub = `http://127.0.0.1:${await listen(distServer)}/radio-tower/`;
  const d = await ctx.newPage();
  watch(d, 'dist');
  await d.goto(sub + 'past/v1/portfolio/library', { waitUntil: 'domcontentloaded' });
  // The library draws its covers as images or CSS backgrounds: any address of a portfolio file in the page will do.
  await d.waitForFunction(() => document.querySelector('.gt-past-bar') && /collections\//.test(document.querySelector('#view')?.innerHTML || ''), null, { timeout: 15000 }).catch(() => {});
  const lib = await d.evaluate(async () => {
    const img = (document.querySelector('#view').innerHTML.match(/(?:\.\.\/)*collections\/[^"') &]+/) || [])[0] || null;
    const url = img ? new URL(img, document.baseURI).href : null;
    return { base: document.baseURI, img, url, ok: url ? (await fetch(url, { method: 'HEAD' })).ok : false, bar: new URL(document.querySelector('.gt-past-bar .gt-back').href).pathname };
  });
  check('dist/ under /radio-tower/: a cold deep link into v1 boots under its own base, the bar knows the sub-path, its portfolio images reach today’s copy',
    lib.base.endsWith('/radio-tower/past/v1/') && lib.bar === '/radio-tower/versions/v1' && lib.ok && /\/radio-tower\/collections\//.test(lib.url || ''), JSON.stringify(lib));
  await d.goto(sub + 'go/P-02?atelier=1', { waitUntil: 'domcontentloaded' });
  await d.waitForFunction(() => window.radioTower?.world?.current === 'v2' && document.querySelector('#w-v2 .v-frame'), null, { timeout: 15000 }).catch(() => {});
  check('…a short link answers cold and, in the private view, opens Version 2 in its window', await d.evaluate(() => location.pathname === '/radio-tower/versions/v2' && Boolean(document.querySelector('#w-v2 .v-frame'))));
  await d.close();
  distServer.close();

  // ---- a phone
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  watch(p, 'phone');
  await p.goto(dev + 'versions/v2?atelier=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.radioTower?.world?.current === 'v2' && !window.radioTower.world.camera.moving, null, { timeout: 15000 }).catch(() => {});
  const phone = await p.evaluate(() => {
    const f = document.querySelector('#w-v2 .v-frame')?.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, frame: f && f.left >= 0 && f.right <= innerWidth + 1 && f.height > 200,
      strip: [...document.querySelectorAll('.w-tags .w-tag')].some((b) => b.dataset.go === 'v2') };
  });
  check('a 390 px phone, private view: the version’s window fits the screen, its tag is in the strip, nothing overflows', phone.frame && phone.strip && phone.overflow <= 1, JSON.stringify(phone));

  check('no page errors anywhere (world, the old site on its own, the Atelier, dist, phone)', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  check('atelier smoke ran to completion', false, err.message.split('\n')[0]);
} finally {
  await browser.close();
  devServer.close();
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.rmSync(fx, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} atelier checks passed`);
process.exit(failed.length ? 1 : 0);
