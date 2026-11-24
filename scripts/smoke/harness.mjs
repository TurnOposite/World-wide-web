/**
 * What every part of the site smoke shares: the fixture audio, the dev server over it, one browser with Spotify
 * stubbed, the check reporter, the console watch, axe, the témoin. scripts/site-smoke.mjs opens it once and hands it
 * to each part (scripts/smoke/<part>.mjs) in turn.
 *
 * Split out of the one 2 300-line file on 2026-11-24 (docs/plans/LIGHTER-2026-11-24.md, step 2) so that GitHub can
 * run the parts side by side, each in its own job: none reads a value another part made (checked on the parse tree,
 * docs/DECISIONS.md 2026-11-24).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSiteServer } from '../site-serve.mjs';
import { build as buildEchoData } from '../site-echo.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

export const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

/** Everything a part may use; null when there is no ffmpeg for the fixtures (the stage is skipped, as before). */
export async function open({ towerUrl = null } = {}) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };

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

  const launchOpts = { args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--mute-audio'] };
  const exe = process.env.TOWER_BROWSER_EXECUTABLE || process.env.CHROME_PATH;
  if (exe) launchOpts.executablePath = exe;

  let fixtures;
  try {
    fixtures = makeFixtures();
  } catch (err) {
    console.log(`SKIP  site stage needs ffmpeg for its test audio (${err.message.split('\n')[0]})`);
    return null;
  }

  const devServer = await createSiteServer({ fixtures, fakeGithub: true, base: '/' });
  const devPort = await listen(devServer);
  const dev = `http://127.0.0.1:${devPort}/`;

  const browser = await chromium.launch(launchOpts);
  // Spotify's player is someone else's page: the smoke proves the site asks for
  // it, not that Spotify answers, and it must pass offline without Spotify's own
  // console noise. Every context gets a stub that records what was asked for.
  const SPOTIFY = 'https://open.spotify.com/embed/playlist/';
  const spotifyAsked = [];
  const coversAsked = [];
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (o) => {
    const c = await newContext(o);
    await c.route('https://open.spotify.com/**', (r) => {
      spotifyAsked.push(r.request().url());
      return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Spotify stub</title><p>stub</p>' });
    });
    // The playlists' covers (2026-11-03) come from Spotify's image CDN: the same rule, a stand-in image offline.
    await c.route(/^https:\/\/image-cdn-[a-z]+\.spotifycdn\.com\//, (r) => {
      coversAsked.push(r.request().url());
      return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
    });
    return c;
  };
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

  // The témoin (« une place, un après-midi ») carried every element of an article; it left the site on 2026-11-03 and is a
  // fixture now (tests/fixtures/echo). The pages that check an article's every element are served it in place of echo.json.
  const TEMOIN_DIR = path.join(ROOT, 'tests/fixtures/echo');
  const TEMOIN = buildEchoData({ src: TEMOIN_DIR }).articles.find((x) => x.slug === 'article-temoin');
  async function serveTemoin(target) {
    await target.route('**/data/echo.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ articles: [TEMOIN] }) }));
    await target.route('**/assets/echo/temoin.svg', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: fs.readFileSync(path.join(TEMOIN_DIR, 'temoin.svg')) }));
  }

  /** Sub-menus are closed until a half is opened: hover its half, then click the link. */
  const tab = async (pg, href) => {
    const half = await pg.evaluateHandle((h) => document.querySelector(`.tabs a[href="${h}"]`).closest('.half'), href);
    await pg.mouse.move(2, 300); // leave first: pointerenter only fires on entering
    await half.asElement().hover();
    await pg.click(`.tabs a[href="${href}"]`);
  };

  async function close() {
    await browser.close();
    devServer.close();
    fs.rmSync(fixtures, { recursive: true, force: true });
  }

  return { ROOT, towerUrl, results, check, AXE, axeRun, listen, fixtures, devServer, dev, browser, SPOTIFY, spotifyAsked, coversAsked, errors, watch, serveTemoin, tab, close };
}
