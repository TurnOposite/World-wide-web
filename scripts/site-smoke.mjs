#!/usr/bin/env node
/**
 * The static site, driven in a real browser — the cloud half of the self-test.
 *
 * What it proves, each as a check that can fail:
 *   - the station runs in the browser and plays (generated audio, served with
 *     ranges + CORS like the Wix CDN), within a second of the clock;
 *   - the music keeps playing across page changes (the reason the site is a
 *     single-page app);
 *   - two listeners who never talk to each other are on the same track, same
 *     second;
 *   - the full-page visualiser actually covers the page (roadmap #28's
 *     failable goal: ≥25% of samples outside the on-air card carry paint),
 *     and the Visuals panel can switch it off and back;
 *   - the booth, holding a token, commits a reorder to (a stand-in for) the
 *     GitHub contents API, and a second listener adopts it;
 *   - Atlas, Écrits and the three Portfolio rooms render their content;
 *   - nothing overflows a 390 px phone;
 *   - the built dist/ works under a repository sub-path on a cold deep link;
 *   - pointed at a real Radio Tower server (`?tower=`), the same front end
 *     shows the server's programme.
 *
 * Usage: node scripts/site-smoke.mjs [towerUrl]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSiteServer } from './site-serve.mjs';
import { build } from './site-build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const towerUrl = process.argv[2]?.startsWith('http') ? process.argv[2] : null;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/* ------------------------------------------------------------ fixtures -- */
function makeFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-fx-'));
  const specs = [['01 Carrier Wave', 110, 26, 0.5], ['02 Night Shift', 98, 34, 0.6], ['03 Tower Light', 130.8, 22, 0.45], ['04 Low Band', 82, 30, 0.55]];
  for (const [name, root, dur, beat] of specs) {
    const expr = `0.55*sin(2*PI*55*t)*exp(-9*mod(t,${beat}))+0.22*(random(0)*2-1)*exp(-45*mod(t+${beat}/2,${beat}))+0.09*(sin(2*PI*${root}*2*t)+sin(2*PI*${root}*2.52*t)+sin(2*PI*${root}*3*t))*(0.6+0.4*sin(2*PI*0.25*t))+0.25*sin(2*PI*${root}/2*t)`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=${dur}`, '-ac', '2',
      '-metadata', `title=${name.slice(3)}`, '-metadata', 'artist=Self Test', '-metadata', 'album=Fixtures', '-b:a', '128k', path.join(dir, `${name}.mp3`)]);
  }
  return dir;
}

// Accessibility: axe-core (devDependency) on every page the phone visits and on
// the unlocked booth. Minor findings are reported, not failed.
let AXE = null;
try { AXE = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8'); } catch { /* not installed: the check says so */ }
async function axeRun(page) {
  if (!AXE) return null;
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact !== 'minor')
    .map((v) => `${v.id} (${v.impact}) ${v.nodes[0]?.target.join(' ')}`));
}

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

const launchOpts = { args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--mute-audio'] };
const exe = process.env.TOWER_BROWSER_EXECUTABLE || process.env.CHROME_PATH;
if (exe) launchOpts.executablePath = exe;

let fixtures;
try {
  fixtures = makeFixtures();
} catch (err) {
  console.log(`SKIP  site stage needs ffmpeg for its test audio (${err.message.split('\n')[0]})`);
  process.exit(0);
}

const devServer = await createSiteServer({ fixtures, fakeGithub: true, base: '/' });
const devPort = await listen(devServer);
const dev = `http://127.0.0.1:${devPort}/`;

const browser = await chromium.launch(launchOpts);
const errors = [];
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  // A repository that does not exist yet answers 404 from api.github.com and
  // the site falls back to its own copy of control.json — expected, not a bug.
  page.on('console', (m) => {
    const where = m.location?.()?.url || '';
    if (m.type() === 'error' && !/api\.github\.com/.test(`${where} ${m.text()}`)) errors.push(`${tag}: ${m.text()} ${where}`);
  });
};

try {
  /* --------------------------------------------------------- listener A -- */
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const a = await ctxA.newPage();
  watch(a, 'A');
  await a.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await a.waitForFunction(() => window.radioTower?.player?.onAir, null, { timeout: 15000 });
  const tabs = await a.$$eval('.tabs a', (els) => els.map((e) => e.textContent.trim()));
  check('the site shell loads with its four sections', tabs.join(',') === 'Radio,Atlas,Écrits,Portfolio', tabs.join(', '));
  check('the mark is the green hybrid tower', await a.$eval('.brand .mark', (el) => getComputedStyle(el).color === 'rgb(52, 211, 153)'));

  const title = await a.textContent('#rTitle');
  const expected = await a.evaluate(() => window.radioTower.client.engine.station.at(window.radioTower.client.now()).track.title);
  check('the on-air card shows what the in-browser clock computes', title === expected, title);
  check('the station says it has no server rather than faking a listener count', /no server/.test(await a.textContent('#rMode')));

  await a.click('#rTune');
  await a.waitForFunction(() => { const au = document.getElementById('audio'); return !au.paused && au.currentTime > 0.5; }, null, { timeout: 15000 }).catch(() => {});
  const playA = await a.evaluate(() => {
    const au = document.getElementById('audio');
    const pos = window.radioTower.player.livePosition();
    return { paused: au.paused, ct: au.currentTime, pos, src: au.currentSrc };
  });
  check('Tune in plays the track the clock says is on air', !playA.paused && /__fixtures\//.test(playA.src), `t=${playA.ct.toFixed(1)}s`);
  check('playback is within a second of the station clock', Math.abs(playA.ct - playA.pos) < 1, `drift ${(playA.ct - playA.pos).toFixed(2)}s`);

  /* ----------------------------------------------- the full-page stage -- */
  await a.waitForTimeout(1500);
  const cov = await a.evaluate(() => {
    const card = document.querySelector('.onair').getBoundingClientRect();
    return window.radioTower.stage.coverage({ left: card.left, right: card.right, top: card.top, bottom: card.bottom }, 600);
  });
  check('the visualiser covers the page, not just the cover (roadmap #28)', cov >= 0.25, `${Math.round(cov * 100)}% of samples outside the card carry paint`);

  await a.keyboard.press('v');
  await a.waitForSelector('#visualsPanel:not([hidden])', { timeout: 3000 });
  await a.click('#visualsPanel [data-look="off"]');
  await a.waitForTimeout(400);
  const covOff = await a.evaluate(() => window.radioTower.stage.coverage(null, 600));
  check('the Visuals panel can switch the stage off', covOff < 0.02, `${Math.round(covOff * 100)}% painted`);
  await a.click('#visualsPanel [data-look="horizon"]');
  await a.waitForTimeout(800);
  const layers = await a.evaluate(() => window.radioTower.settings.effective.layers);
  check('a look sets its layers (Horizon)', layers.horizon && !layers.lattice);
  await a.click('#visualsPanel [data-look="stage"]');
  await a.keyboard.press('Escape');

  /* ------------------------------------------- music survives navigation -- */
  const audioBefore = await a.evaluate(() => { window.__sameAudio = document.getElementById('audio'); return document.getElementById('audio').currentTime; });
  await a.click('.tabs a[href="atlas"]');
  await a.waitForSelector('.mapbox svg .pin', { timeout: 5000 });
  await a.waitForTimeout(1200);
  // Compare against the clock, not the previous position: a short fixture can
  // roll over to the next track between the two readings, which is correct.
  const nav = await a.evaluate(() => {
    const au = document.getElementById('audio');
    return { same: au === window.__sameAudio, paused: au.paused, ct: au.currentTime, pos: window.radioTower.player.livePosition(), path: location.pathname };
  });
  check('the music keeps playing across page changes', nav.same && !nav.paused && Math.abs(nav.ct - nav.pos) < 1.5 && nav.path === '/atlas',
    `${audioBefore.toFixed(1)}s → ${nav.ct.toFixed(1)}s on ${nav.path}, same <audio>, on the clock`);

  const pins = await a.$$('.mapbox .pin');
  // Focus, not hover: Paris, Amsterdam and Copenhagen overlap at world scale,
  // and keyboard focus is the path every pin must support anyway.
  await pins[1].focus();
  const dossier = await a.textContent('#aDossier');
  check('Atlas: every place is a pin, and focusing one opens its dossier', pins.length >= 5 && /Paris/.test(dossier), `${pins.length} pins`);
  check('Atlas: the tower\'s origin pulses on the map', Boolean(await a.$('.mapbox .tower-pin')));

  /* --------------------------------------------------------- listener B -- */
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const b = await ctxB.newPage();
  watch(b, 'B');
  await b.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await b.waitForFunction(() => window.radioTower?.player?.onAir, null, { timeout: 15000 });
  await b.click('#rTune');
  await b.waitForFunction(() => { const au = document.getElementById('audio'); return !au.paused && au.currentTime > 0.5; }, null, { timeout: 15000 }).catch(() => {});
  const snap = (p) => p.evaluate(() => ({ id: window.radioTower.player.onAir?.id, pos: window.radioTower.player.livePosition(), ct: document.getElementById('audio').currentTime, at: Date.now() }));
  const [sa, sb] = await Promise.all([snap(a), snap(b)]);
  check('two listeners, no server between them, are on the same track', sa.id === sb.id);
  check('…and the same second', Math.abs(sa.ct - sb.ct - (sa.at - sb.at) / 1000) < 1, `A ${sa.ct.toFixed(2)}s · B ${sb.ct.toFixed(2)}s`);

  /* --------------------------------------- the booth, over "GitHub" ------ */
  const booth = await ctxA.newPage();
  watch(booth, 'booth');
  await booth.goto(dev + 'booth', { waitUntil: 'domcontentloaded' });
  await booth.waitForSelector('#bTok', { timeout: 8000 });
  check('the booth is read-only until a token is saved', (await booth.$$('#bQueue li[data-movable="1"]')).length === 0);
  await booth.fill('#bTok', 'github_pat_selftest');
  await booth.click('#bTokForm button[type=submit]');
  await booth.waitForSelector('#bQueue li[data-movable="1"]', { timeout: 8000 }).catch(() => {});
  const movable = await booth.$$('#bQueue li[data-movable="1"]');
  check('with a token, the movable part of the queue gets handles', movable.length >= 2, `${movable.length} movable`);
  const lockedCount = await booth.$$eval('#bQueue li.locked', (els) => els.length);
  const beforeIds = await b.evaluate(() => window.radioTower.client.engine.get('/api/queue').body.slots.map((s) => s.id));
  if (movable.length >= 2) {
    await movable[1].focus();
    await booth.keyboard.press('ArrowUp');
    await booth.waitForFunction(() => /On air/.test(document.querySelector('#bQueue .qstate')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  }
  const puts = devServer.fakeGithub.puts;
  const committed = JSON.parse(devServer.fakeGithub.text);
  check('the reorder is committed through the contents API', puts >= 1 && Array.isArray(committed.override?.ids), `${puts} commit(s)`);
  await b.evaluate(() => window.radioTower.client.pollControl());
  await b.waitForTimeout(300);
  const afterIds = await b.evaluate(() => window.radioTower.client.engine.get('/api/queue').body.slots.map((s) => s.id));
  const status = await b.evaluate(() => window.radioTower.client.controlStatus);
  const sameMultiset = [...beforeIds].sort().join() === [...afterIds].sort().join();
  check('a second listener adopts it on its next poll', status === 'applied' && afterIds.join() !== beforeIds.join(), `status ${status}`);
  check('…and it is a permutation: nothing added, nothing removed, the fence untouched', sameMultiset && afterIds.slice(0, lockedCount).join() === beforeIds.slice(0, lockedCount).join());

  await booth.click('#bMoods [data-mood]');
  await booth.waitForTimeout(800);
  const moodMsg = await booth.textContent('#bMoodState');
  check('a Spontaneous Emission answers (emitted, or says why not)', moodMsg.trim().length > 0, moodMsg.trim().slice(0, 70));

  /* ------------------------------------------------------ Écrits, rooms -- */
  await a.click('.tabs a[href="ecrits"]');
  await a.waitForSelector('.text-card', { timeout: 5000 });
  check('Écrits lists the six texts', (await a.$$('.text-card')).length === 6);
  await a.click('.text-card[href="ecrits/voyages"]');
  await a.waitForSelector('.reading .body.verse p', { timeout: 5000 });
  check('a poem opens verbatim, set as verse, with its score', /toits d.ardoise/.test(await a.textContent('.reading .body')) && Boolean(await a.$('#scoreBox:not([hidden])')));

  await a.click('.tabs a[href="portfolio"]');
  await a.waitForSelector('.room .book', { timeout: 8000 });
  const books = (await a.$$('.room .book')).length;
  check('Portfolio: the library puts every book on a shelf', books >= 20, `${books} spines`);
  // "#maps" under <base href="/"> resolves to the site root: the router must keep the reader here.
  const roomPath = await a.evaluate(() => location.pathname);
  await a.click('a[data-maps]').catch(() => {});
  await a.waitForTimeout(500);
  check('an in-page link (#maps) keeps the reader in the library', (await a.evaluate(() => location.pathname)) === roomPath && Boolean(await a.$('.room .book')), roomPath);
  await a.click('.room-tabs a[href="portfolio/photos"]');
  await a.waitForSelector('.room .ph', { timeout: 8000 });
  check('Portfolio: photos render as tiles', (await a.$$('.room .ph')).length >= 12);
  await a.click('.room-tabs a[href="portfolio/crates"]');
  await a.waitForSelector('.room .sleeve', { timeout: 8000 });
  check('Portfolio: crates render as sleeves, with no play button', (await a.$$('.room .sleeve')).length >= 1 && !(await a.$('.room .sleeve button.play')));

  /* ------------------------------------------------------------- phone -- */
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await phone.newPage();
  watch(m, 'phone');
  const overflow = [];
  const a11y = [];
  for (const r of ['', 'radio', 'atlas', 'ecrits', 'ecrits/l-ascenceur-tombe', 'portfolio', 'portfolio/photos', 'portfolio/crates', 'booth']) {
    await m.goto(dev + r, { waitUntil: 'domcontentloaded' });
    await m.waitForFunction(() => window.radioTower?.router?.current, null, { timeout: 10000 });
    await m.waitForTimeout(700);
    const o = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 1) overflow.push(`/${r} ${o}px`);
    for (const v of (await axeRun(m)) || []) a11y.push(`/${r}: ${v}`);
  }
  check('nothing overflows a 390 px phone', overflow.length === 0, overflow.join(', ') || 'every page fits');
  if (AXE) {
    for (const v of (await axeRun(booth)) || []) a11y.push(`booth (unlocked): ${v}`);
    check('no accessibility violations above minor (axe-core, every page + the unlocked booth)', a11y.length === 0, a11y.slice(0, 3).join(' | ') || 'contrast, names, roles, headings');
  } else console.log('SKIP  accessibility (axe-core not installed — npm install)');
  check('the mini-player stays on screen on a phone', await m.$eval('#minibar', (el) => el.getBoundingClientRect().bottom <= innerHeight + 1 && el.offsetHeight > 40));

  /* -------------------------------------- dist/ under a repo sub-path ---- */
  await build({ base: '/radio-tower/', repo: 'ortis/radio-tower', quiet: true });
  const distServer = await createSiteServer({ dist: true, base: '/radio-tower/', fixtures });
  const distPort = await listen(distServer);
  const d = await (await browser.newContext()).newPage();
  watch(d, 'dist');
  await d.goto(`http://127.0.0.1:${distPort}/radio-tower/ecrits/opal-orre`, { waitUntil: 'domcontentloaded' });
  await d.waitForSelector('.reading h1', { timeout: 10000 }).catch(() => {});
  const dh = await d.textContent('.reading h1').catch(() => '');
  const cfg = await d.evaluate(() => window.radioTower?.client?.config?.github);
  check('the built site answers a cold deep link under /<repo>/', dh === 'Opal Orre', dh || 'no heading');
  check('…and knows which repository its booth writes to', cfg?.owner === 'ortis' && cfg?.repo === 'radio-tower');
  distServer.close();

  /* -------------------------------------------------- tower mode ----------- */
  if (towerUrl) {
    const t = await (await browser.newContext()).newPage();
    watch(t, 'tower');
    await t.goto(`${dev}radio?tower=${encodeURIComponent(towerUrl)}`, { waitUntil: 'domcontentloaded' });
    await t.waitForFunction(() => window.radioTower?.player?.onAir, null, { timeout: 15000 }).catch(() => {});
    // The self-test's fixture tracks are 7–15 s long, so a reading can straddle
    // a rollover. Read both sides back to back, and retry across a boundary.
    let shown, server;
    for (let i = 0; i < 4; i++) {
      await t.evaluate(() => window.radioTower.player.refresh());
      shown = await t.evaluate(() => ({ mode: window.radioTower?.client?.mode, id: window.radioTower?.player?.onAir?.id, pill: document.getElementById('rMode')?.textContent }));
      server = await (await fetch(`${towerUrl}/api/station`)).json();
      if (shown.id === server.onAir?.id) break;
      await t.waitForTimeout(700);
    }
    check('pointed at a Radio Tower server, the same front end plays its programme', shown.mode === 'tower' && shown.id === server.onAir?.id, `${server.onAir?.title}`);
    check('…and shows the server\'s real listener count', /listening/.test(shown.pill || ''), (shown.pill || '').trim());
  }

  check('no console errors anywhere', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  check('site smoke ran to completion', false, err.stack?.split('\n').slice(0, 3).join(' '));
} finally {
  await browser.close();
  devServer.close();
  fs.rmSync(fixtures, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} site checks passed`);
process.exit(failed ? 1 : 0);
