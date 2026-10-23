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
 *   - Atlas, Écrits and the three Portfolio rooms render their content (the
 *     Atlas postcards and the Novo Hamburgo clippings, the pond, the 3D shelf);
 *   - nothing overflows a 390 px phone;
 *   - the built dist/ works under a repository sub-path on a cold deep link;
 *   - pointed at a real Radio Tower server (`?tower=`), the same front end
 *     shows the server's programme;
 *   - the world shell (docs/WORLD.md) stays off unless asked for, and with
 *     ?world=1 the camera flies to each route's district while the radio
 *     plays on, by tag, arrow key, minimap, switch and Back; each page opens
 *     in its district's window at 1:1, every route answers on a cold link,
 *     20 pans never cut the radio, and Tab follows the camera.
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
import { liveCheck } from './cloud-live-check.mjs';

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
// Spotify's player is someone else's page: the smoke proves the site asks for
// it, not that Spotify answers, and it must pass offline without Spotify's own
// console noise. Every context gets a stub that records what was asked for.
const SPOTIFY = 'https://open.spotify.com/embed/playlist/';
const spotifyAsked = [];
const newContext = browser.newContext.bind(browser);
browser.newContext = async (o) => {
  const c = await newContext(o);
  await c.route('https://open.spotify.com/**', (r) => {
    spotifyAsked.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Spotify stub</title><p>stub</p>' });
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

/** Sub-menus are closed until a half is opened: hover its half, then click the link. */
const tab = async (pg, href) => {
  const half = await pg.evaluateHandle((h) => document.querySelector(`.tabs a[href="${h}"]`).closest('.half'), href);
  await pg.mouse.move(2, 300); // leave first: pointerenter only fires on entering
  await half.asElement().hover();
  await pg.click(`.tabs a[href="${href}"]`);
};

try {
  /* --------------------------------------------------------- listener A -- */
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const a = await ctxA.newPage();
  watch(a, 'A');
  await a.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await a.waitForFunction(() => window.radioTower?.player?.onAir, null, { timeout: 15000 });
  const tabs = await a.$$eval('.tabs a', (els) => els.map((e) => e.textContent.trim()));
  check('the site shell has two halves: Zone (radio) and Echo (journal)', tabs.join(',') === 'Radio,Ondes,Zone,Playlists,Atlas,Portfolio,Une,Articles,Lectures', tabs.join(', '));
  check('…each under its own label', (await a.$$eval('.half-btn', (els) => els.map((e) => e.textContent.trim()))).join() === 'Zone,Echo');
  // The banner: two doors only; hover, focus, tap, Esc, outside tap.
  const open = () => a.$$eval('.half.open', (e) => e.map((x) => x.dataset.half).join());
  check('banner: both menus closed at rest', (await open()) === '');
  await a.hover('.half-zone .half-btn');
  check('banner: hovering ZONE opens its sub-menu (and only it)', (await open()) === 'zone' && await a.isVisible('.half-zone .half-menu a[href="playlists"]') && !(await a.isVisible('.half-echo .half-menu a')));
  await a.hover('.half-echo .half-btn');
  check('banner: hovering ECHO opens ECHO, closes ZONE', (await open()) === 'echo');
  await a.mouse.move(5, 400);
  check('banner: leaving closes it', (await open()) === '');
  await a.focus('.half-zone .half-btn'); await a.keyboard.press('Shift+Tab'); await a.keyboard.press('Tab');
  check('banner: keyboard focus opens it', (await open()) === 'zone');
  await a.keyboard.press('ArrowDown');
  check('banner: arrows move into the menu', await a.evaluate(() => document.activeElement?.getAttribute('href') === 'radio'));
  await a.keyboard.press('Escape');
  check('banner: Esc closes and returns to the word', (await open()) === '' && await a.evaluate(() => document.activeElement?.id === 'halfZone'));
  await a.mouse.move(5, 400);
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

  /* ------------------------------------------------ Canopy (call map) -- */
  // Ortis 2026-10-12: a birdsong-style 3D map of the sounds on air, live, as
  // a look of the radio page — big behind it or small in front. The fixture
  // beat is a low kick and a noise hat, so a working map must find calls on
  // the onsets and at least two kinds of sound.
  await a.keyboard.press('v');
  await a.waitForSelector('#visualsPanel:not([hidden])', { timeout: 3000 });
  await a.click('#visualsPanel [data-look="canopy"]');
  await a.waitForTimeout(6000);
  const cm = await a.evaluate(() => {
    const map = window.radioTower.stage.callmap;
    const pts = map ? map.layout() : [];
    return {
      exists: Boolean(map), demo: map?.demo, calls: map?.calls.length ?? 0, kinds: map?.clusterCount() ?? 0,
      inCube: pts.every((p) => p.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)),
      playing: !document.getElementById('audio').paused, path: location.pathname,
    };
  });
  check('Canopy maps the music live on the radio page: calls on the onsets, sorted into kinds, inside the cube',
    cm.exists && !cm.demo && cm.calls >= 6 && cm.kinds >= 2 && cm.inCube && cm.playing && cm.path === '/radio',
    `${cm.calls} calls, ${cm.kinds} kinds`);
  await a.click('#visualsPanel [data-canopy="front"]');
  await a.waitForTimeout(700);
  const front = await a.evaluate(() => {
    const el = document.getElementById('stageFront');
    const r = el.getBoundingClientRect();
    const mb = document.getElementById('minibar').getBoundingClientRect();
    const px = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
    let lit = 0;
    for (let i = 3; i < px.length; i += 4 * 97) if (px[i] > 8) lit++;
    return { shown: !el.hidden && r.width > 100, aboveBar: r.bottom <= mb.top, lit, clicks: getComputedStyle(el).pointerEvents };
  });
  check('…and small in front, above the page, clear of the mini-player, never in the way of a click',
    front.shown && front.aboveBar && front.lit > 20 && front.clicks === 'none', JSON.stringify(front));
  await a.click('#visualsPanel [data-look="stage"]');
  await a.waitForTimeout(300);
  check('…and gone with any other look', await a.evaluate(() => document.getElementById('stageFront').hidden));
  await a.keyboard.press('Escape');
  const bar = await a.evaluate(() => ({
    mb: document.getElementById('mbTitle').textContent, card: document.getElementById('rTitle').textContent,
    shown: getComputedStyle(document.querySelector('.minibar .mb-meta')).visibility !== 'hidden',
  }));
  check('on a desktop the mini-player names the song, on the radio page too', bar.shown && bar.mb === bar.card, bar.mb);

  /* ---------------------------------------------------- Ondes, its own page -- */
  // Ortis 2026-10-19: Up next, Just played and the next hours left /radio
  // for /ondes. Radio keeps the card, the channels and the queue.
  const radioRest = await a.evaluate(() => ({
    lists: ['rNext', 'rRecent', 'rGuide', 'rTz'].filter((id) => document.getElementById(id)).concat(document.querySelector('#view .echoes, #view .guide') ? ['.echoes'] : []),
    queue: Boolean(document.querySelector('#rQueue .tracklist, #rQueue li')),
    link: Boolean(document.querySelector('#view a[href="ondes"]')),
  }));
  check('Radio keeps the on-air card and the queue, and no longer carries Ondes (a link to it instead)', radioRest.lists.length === 0 && radioRest.queue && radioRest.link, radioRest.lists.join(', ') || 'card + queue + link');
  await a.evaluate(() => { window.__sameAudio = document.getElementById('audio'); });
  await tab(a, 'ondes');
  await a.waitForSelector('#eGuide li .at', { timeout: 8000 }).catch(() => {});
  const echoes = await a.evaluate(() => {
    const { player } = window.radioTower;
    const au = document.getElementById('audio');
    const titles = (sel) => [...document.querySelectorAll(`${sel} li:not(.empty):not(.guide-day) .t`)].map((n) => n.textContent);
    return {
      path: location.pathname, tab: document.querySelector('.tabs a[aria-current="page"]')?.textContent,
      now: document.getElementById('eTitle')?.textContent, onAir: player.onAir?.title,
      next: titles('#eNext'), wantNext: (player.data?.upcoming || []).map((t) => t.title),
      recent: titles('#eRecent'), guide: titles('#eGuide'),
      times: [...document.querySelectorAll('#eGuide li .at')].map((n) => n.textContent),
      tz: document.getElementById('eTz')?.textContent, wantTz: Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' '),
      same: au === window.__sameAudio, paused: au.paused, drift: au.currentTime - player.livePosition(),
    };
  });
  check('Ondes: its own tab, the track on air in one line', echoes.path === '/ondes' && echoes.tab === 'Ondes' && echoes.now === echoes.onAir, echoes.now);
  check('Ondes: Up next is the station\'s next tracks, Just played is filled', echoes.next.length >= 2 && echoes.next.join() === echoes.wantNext.join() && echoes.recent.length >= 1,
    `${echoes.next.length} next, ${echoes.recent.length} played`);
  check('Ondes: the next hours, timed in the listener\'s own zone', echoes.guide.length >= 5 && echoes.times.every((t) => /\d{1,2}[:.h]\d{2}/.test(t)) && echoes.tz === echoes.wantTz,
    `${echoes.guide.length} rows, ${echoes.tz}`);
  check('…and the music did not stop to show it', echoes.same && !echoes.paused && Math.abs(echoes.drift) < 1.5, `drift ${echoes.drift.toFixed(2)}s`);

  // The old address still answers, and lands on the new one.
  await a.evaluate(() => window.radioTower.router.go('echoes'));
  await a.waitForFunction(() => location.pathname.endsWith('/ondes'), null, { timeout: 5000 }).catch(() => {});
  check('the old /echoes address answers and moves to /ondes', (await a.evaluate(() => location.pathname)).endsWith('/ondes'));

  /* ---------------------------- Playlists: every one plays in the one Spotify player -- */
  // 2026-10-20: the player was a lazy frame that never loaded (a blank box on
  // the live site). Now it must be *requested*, and a card must swap it.
  await tab(a, 'playlists');
  await a.waitForSelector('.sp-pick', { timeout: 8000 }).catch(() => {});
  const asked = (id) => spotifyAsked.some((u) => u.startsWith(SPOTIFY + id));
  const deckState = () => a.evaluate(() => ({
    picks: [...document.querySelectorAll('#view .sp-pick')].map((b) => ({ id: b.dataset.id, on: b.getAttribute('aria-pressed') === 'true', title: b.querySelector('b').textContent })),
    iframes: [...document.querySelectorAll('#view iframe')].map((f) => f.src), lazy: document.querySelector('#view .sp-frame')?.loading,
    now: document.querySelector('#view .sp-title')?.textContent, open: document.querySelector('#view .sp-open')?.href,
    playing: !document.getElementById('audio').paused,
  }));
  await a.waitForTimeout(800); // the frame's request reaches the stub
  const pl = await deckState();
  const firstId = pl.picks[0]?.id;
  check('Playlists: one Spotify player, loaded (not lazy), with every playlist as a card', pl.picks.length >= 60 && pl.iframes.length === 1 && pl.iframes[0].startsWith(SPOTIFY + firstId) && pl.lazy !== 'lazy' && asked(firstId) && pl.picks[0].on,
    `${pl.picks.length} cards, ${pl.iframes.join()}, asked ${spotifyAsked.length}`);
  const picked = pl.picks[2];
  await a.click(`#view .sp-pick[data-id="${picked.id}"]`);
  await a.waitForTimeout(800);
  const pl2 = await deckState();
  check('Playlists: a card loads its playlist into the same player, and the radio plays on', pl2.iframes.length === 1 && pl2.iframes[0].startsWith(SPOTIFY + picked.id) && asked(picked.id)
    && pl2.now === picked.title && pl2.open === `https://open.spotify.com/playlist/${picked.id}` && pl2.picks.filter((p) => p.on).map((p) => p.id).join() === picked.id && pl2.playing,
    `${picked.title} → ${pl2.iframes.join()}`);

  /* ------------------------------------------- music survives navigation -- */
  const audioBefore = await a.evaluate(() => { window.__sameAudio = document.getElementById('audio'); return document.getElementById('audio').currentTime; });
  await tab(a, 'atlas');
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
  const places = await a.$$eval('.mapbox .pin', (ps) => ps.map((p) => p.getAttribute('aria-label')));
  // Geneva came off the map at Ortis's request (2026-10-13).
  check('Atlas: the cities lived in are on the map (Kuala Lumpur, Stockholm, Novo Hamburgo), Geneva is not',
    ['Kuala Lumpur', 'Stockholm', 'Novo Hamburgo'].every((c) => places.some((l) => l.startsWith(c))) && !places.some((l) => /Gen[eè]v/.test(l)), `${places.length} places`);
  await a.focus('.mapbox .pin[data-slug="novo-hamburgo"]');
  await a.waitForSelector('#aDossier.open .clip', { timeout: 3000 }).catch(() => {});
  const nh = await a.evaluate(async () => {
    const card = document.getElementById('aDossier');
    const clips = [...card.querySelectorAll('.clip')];
    const first = clips[0]?.getAttribute('href');
    const res = first ? await fetch(new URL(first, document.baseURI), { method: 'HEAD' }) : null;
    return { clips: clips.length, stations: card.querySelectorAll('.rer li').length, picture: Boolean(card.querySelector('.pc-pic svg, .pc-pic img')), pdf: res?.ok && /pdf/.test(res.headers.get('content-type') || ''), first };
  });
  check('Atlas: Novo Hamburgo\'s postcard unfolds to the newspaper columns, and they open', nh.picture && nh.clips >= 20 && nh.stations === 4 && nh.pdf,
    `${nh.clips} columns, ${nh.stations} metro stops, ${nh.first}`);

  /* ---------------------------------------------------------------- Zone -- */
  // DESIGN-BRIEF §2 / roadmap #21: the green point sits where config.json
  // says (x = lon + 180, y = 90 − lat on the world's viewBox, measured on
  // screen), and no listener point exists without a geo source.
  await tab(a, 'zone');
  await a.waitForSelector('#zMap svg.zone-map .zone-origin', { timeout: 5000 }).catch(() => {});
  const zone = await a.evaluate(() => {
    const svg = document.querySelector('#zMap svg.zone-map');
    const core = svg?.querySelector('.zone-origin .zo-core');
    const o = window.radioTower.client.config.station?.origin;
    if (!svg || !core || !o) return { svg: Boolean(svg), core: Boolean(core), origin: o || null };
    const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const s = svg.getBoundingClientRect();
    const c = core.getBoundingClientRect();
    const want = { x: s.left + ((o.lon + 180 - vx) / vw) * s.width, y: s.top + ((90 - o.lat - vy) / vh) * s.height };
    const got = { x: c.left + c.width / 2, y: c.top + c.height / 2 };
    return {
      svg: true, core: true, origin: o, land: svg.querySelectorAll('.zone-land path').length,
      off: Math.hypot(got.x - want.x, got.y - want.y), waves: svg.querySelectorAll('.zone-origin .zw').length,
      place: document.getElementById('zPlace')?.textContent, listener: Boolean(svg.querySelector('.zone-listener')),
      playing: !document.getElementById('audio').paused, path: location.pathname,
    };
  });
  check('Zone: the world map renders, and the tower\'s green point lands on the configured lat/lon', zone.land > 50 && zone.off < 1.5 && zone.waves === 3 && zone.place === zone.origin?.place && zone.path === '/zone',
    zone.core ? `${zone.place} (${zone.origin.lat}, ${zone.origin.lon}) ${zone.off.toFixed(2)}px off, ${zone.land} land paths` : JSON.stringify(zone));
  check('Zone: no listener point without a geo source, and the music plays on', zone.core && !zone.listener && zone.playing);
  await a.waitForSelector('#zDeck .sp-pick', { timeout: 5000 }).catch(() => {});
  const zdeck = await a.evaluate(() => ({
    iframes: [...document.querySelectorAll('#view iframe')].map((f) => f.src), chips: document.querySelectorAll('#zDeck .sp-pick').length,
    compact: Boolean(document.querySelector('#zDeck .sp-deck.compact')),
  }));
  check('Zone: the playlists are there too, in one Spotify player', zdeck.compact && zdeck.chips >= 60 && zdeck.iframes.length === 1 && zdeck.iframes[0].startsWith(SPOTIFY),
    `${zdeck.chips} chips, ${zdeck.iframes.join()}`);

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

  /* ---------------------------------------------------- channels (dial) -- */
  // Every channel is its own clock (server/lib/channels.js). Turning the dial
  // must land this listener on that channel's track *and* second, touch no
  // one else, and be remembered — then B goes back to the default for the
  // booth checks below, which expect both listeners on the same channel.
  await b.waitForSelector('#rChannels button[data-ch]', { timeout: 8000 }).catch(() => {});
  const dial = await b.$$eval('#rChannels button[data-ch]', (bs) => bs.map((x) => ({ slug: x.dataset.ch, on: x.getAttribute('aria-pressed') === 'true' })));
  const homeCh = dial.find((d) => d.on)?.slug;
  check('the dial offers every channel and marks the one on air here', dial.length >= 2 && dial.filter((d) => d.on).length === 1 && homeCh === 'mashup',
    dial.map((d) => d.slug + (d.on ? '*' : '')).join(' '));
  const target = dial.find((d) => !d.on && d.slug !== 'all')?.slug || dial.find((d) => !d.on)?.slug;
  if (target) {
    await b.click(`#rChannels button[data-ch="${target}"]`);
    await b.waitForFunction((ch) => window.radioTower.player.data?.station?.channel === ch, target, { timeout: 8000 }).catch(() => {});
    await b.waitForFunction(() => { const au = document.getElementById('audio'); return !au.paused && au.readyState >= 2; }, null, { timeout: 8000 }).catch(() => {});
    await b.waitForTimeout(400);
    const tuned = await b.evaluate((ch) => {
      const c = window.radioTower.client;
      const p = window.radioTower.player;
      const want = c.engine.get(`/api/station?channel=${ch}`).body.onAir;
      const au = document.getElementById('audio');
      return { ch: c.channel, id: p.onAir?.id, want: want?.id, src: decodeURI(au.src), wantSrc: decodeURI(c.sourcesFor(want?.id)[0] || ''), ct: au.currentTime, pos: p.livePosition() };
    }, target);
    check('turning the dial plays that channel — its track, its file, its second', tuned.ch === target && tuned.id === tuned.want && tuned.src === tuned.wantSrc && Math.abs(tuned.ct - tuned.pos) < 2,
      `${target}: ${tuned.ct.toFixed(1)}s vs clock ${tuned.pos?.toFixed(1)}s`);
    const aCh = await a.evaluate(() => window.radioTower.client.channel);
    check('…for this listener only', aCh === homeCh, `A still on ${aCh}`);
    await b.reload({ waitUntil: 'domcontentloaded' });
    await b.waitForFunction(() => window.radioTower?.player?.onAir, null, { timeout: 15000 });
    check('…and remembered by this browser', (await b.evaluate(() => window.radioTower.client.channel)) === target);
    await b.evaluate((ch) => window.radioTower.client.setChannel(ch), homeCh);
    await b.waitForFunction((ch) => window.radioTower.player.data?.station?.channel === ch, homeCh, { timeout: 8000 }).catch(() => {});
  }

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
  // One override per channel since 2026-10-07: the booth edits the channel it is tuned to.
  const boothCh = await booth.evaluate(() => window.radioTower.client.channel);
  const committedOv = boothCh === 'all' ? committed.override : committed.overrides?.[boothCh];
  check('the reorder is committed through the contents API', puts >= 1 && Array.isArray(committedOv?.ids), `${puts} commit(s), channel ${boothCh}`);
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
  // On every Echo route Zone's visuals are gone: no visible visualiser canvas, the engine paused, no full-page overlay.
  const echoClean = () => a.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const canvases = [...document.querySelectorAll('#stage, #stageFront, #mbSpec')].filter(vis).map((c) => c.id);
    const veils = [...document.querySelectorAll('body *')].filter((el) => {
      const cs = getComputedStyle(el); if (cs.position !== 'fixed' || !vis(el)) return false;
      const r = el.getBoundingClientRect(); return r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
    }).map((el) => el.id || el.className);
    return { canvases, veils, running: window.radioTower.stage.running, onEcho: document.body.classList.contains('on-echo') };
  });
  await tab(a, 'echo');
  await a.waitForSelector('.echo-foot a[href="echo/lectures"]', { timeout: 5000 });
  await a.click('.echo-foot a[href="echo/lectures"]');
  await a.waitForSelector('.echo-list li', { timeout: 5000 });
  check('Lectures lists the six texts, one per line between thin rules', (await a.$$('.echo-list li')).length === 6 && await a.$eval('.echo-list li', (li) => getComputedStyle(li).borderBottomWidth === '1px'));
  const lect = await echoClean();
  check('Lectures: no Zone visualiser, no overlay, a non-empty list', lect.onEcho && lect.canvases.length === 0 && lect.veils.length === 0 && lect.running === false, JSON.stringify(lect));
  await a.click('.echo-list a[href="echo/lectures/voyages"]');
  await a.waitForSelector('.reading .body.verse p', { timeout: 5000 });
  check('a poem opens verbatim, set as verse, with its score', /toits d.ardoise/.test(await a.textContent('.reading .body')) && Boolean(await a.$('#scoreBox:not([hidden])')));

  await a.click('.echo-znav a[href="echo"]');
  await a.waitForSelector('.echo-card', { timeout: 5000 });
  check('Echo lists its articles and filters by tag', (await a.$$('.echo-card')).length >= 1);
  check('Echo front page is a newspaper: masthead, lead with title link, side silhouettes, ash canvas', Boolean(
    await a.$('.echo-front .echo-mast h1') && await a.$('.echo-lead h2 a[href^="echo/"]') && (await a.$$('.echo-side .sil')).length >= 6 && await a.$('canvas.echo-ash')));
  const frontPage = await echoClean();
  check('Echo front page: no Zone visualiser drawn or running, no full-page overlay', frontPage.onEcho && frontPage.canvases.length === 0 && frontPage.veils.length === 0 && frontPage.running === false, JSON.stringify(frontPage));
  check('Echo front page: thin 1 px ink rules (nav, masthead, lead text, footer) on a white paper', await a.evaluate(() => {
    const w = (sel, side) => getComputedStyle(document.querySelector(sel))[`border${side}Width`];
    return w('.echo-znav', 'Bottom') === '1px' && w('.echo-mast', 'Bottom') === '1px' && w('.echo-lead-txt', 'Top') === '1px' && w('.echo-foot', 'Top') === '1px'
      && getComputedStyle(document.querySelector('.echo-col')).backgroundColor === 'rgb(245, 244, 241)';
  }));
  await a.click('.echo-card');
  await a.waitForSelector('.echo-article .echo-body .pull', { timeout: 5000 });
  const art = await echoClean();
  check('Echo article page: no Zone visualiser, no overlay, nameplate links back to /echo', art.canvases.length === 0 && art.veils.length === 0 && art.running === false && await a.$('.echo-mast-small a.echo-name[href="echo"]') !== null, JSON.stringify(art));
  check('an Echo article opens: standfirst, hero with credit, pull quote, notes', Boolean(await a.$('.echo-standfirst') && await a.$('.echo-hero figcaption') && await a.$('.echo-notes li')));
  await a.click('.echo-znav a[href="echo/archives"]');
  await a.waitForSelector('.echo-archives .echo-press-list li', { timeout: 5000 }).catch(() => {});
  const archC = { ...(await echoClean()), ...(await a.evaluate(() => ({
    press: document.querySelectorAll('.echo-press-list li a[href$=".pdf"]').length, tags: document.querySelectorAll('.echo-tag-list a[href^="echo/"]').length,
    feed: document.querySelector('.echo-archives a[href="echo/feed.xml"]') !== null, on: document.querySelector('.echo-znav a.on')?.getAttribute('href'),
    paper: getComputedStyle(document.querySelector('.echo-col')).backgroundColor, path: location.pathname,
  }))) };
  check('Archives (since the world\'s phase 4, on the classic site too): the press, every article by tag, the feed — on the Gazette paper, no Zone visualiser',
    archC.path === '/echo/archives' && archC.press >= 26 && archC.tags >= 1 && archC.feed && archC.on === 'echo/archives' && archC.paper === 'rgb(245, 244, 241)'
    && archC.onEcho && archC.canvases.length === 0 && archC.veils.length === 0 && archC.running === false, JSON.stringify(archC));

  await a.click('.echo-znav a[href="portfolio"]');
  await a.waitForSelector('.room .book', { timeout: 8000 });
  const books = (await a.$$('.room .book')).length;
  check('Portfolio: the library puts every book on a shelf', books >= 20, `${books} spines`);
  const covers = await a.$$eval('.room .book', (bs) => bs.filter((b) => b.querySelector('.bcover .cv-art svg') && b.querySelector('.spine')).length);
  check('Portfolio: every book is a volume with a cover drawn for it, the thesis face-out', covers === books && Boolean(await a.$('.room .book.thesis.face-out')), `${covers}/${books} covers`);
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

  // Two clicks in quick succession: the page that finishes loading last must
  // not cover the one the reader asked for last, nor leave its state behind.
  const race = await a.evaluate(async () => {
    const { router, client } = window.radioTower;
    // The portfolio's data arrives slowly (a phone on a bad network).
    const get = client.get.bind(client);
    client.get = (p) => (p.startsWith('/api/collections') ? new Promise((r) => setTimeout(r, 700)).then(() => get(p)) : get(p));
    router.go('portfolio/library');
    router.go('echo/lectures/voyages');
    router.go('radio');
    await new Promise((r) => setTimeout(r, 1500));
    const onRadio = { path: location.pathname, radio: Boolean(document.querySelector('#view #rTitle')), pages: document.querySelectorAll('#view > .page').length, flag: document.body.classList.contains('on-radio') };
    await router.go('atlas');
    await new Promise((r) => setTimeout(r, 400));
    client.get = get;
    return { ...onRadio, flagAfter: document.body.classList.contains('on-radio') };
  });
  check('fast clicks: the last page asked for is the one shown, and the others leave nothing behind', race.path === '/radio' && race.radio && race.pages === 1 && race.flag && !race.flagAfter, JSON.stringify(race));

  // A new track noticed by a refresh other than the rollover (a DJ's control
  // document, a tab coming back) must switch the audio too, not leave the old
  // file playing under the new title.
  const switched = await a.evaluate(async () => {
    const p = window.radioTower.player;
    const au = document.getElementById('audio');
    const right = p._sources[p._sourceIndex];
    const other = window.radioTower.client.engine.library.tracks.map((t) => p.client.sourcesFor(t.id)[0]).find((u) => u && u !== right);
    au.src = other;                                   // the old file…
    p.data = { ...p.data, onAir: { ...p.data.onAir, startsAt: p.data.onAir.startsAt - 1 } }; // …under stale data
    window.radioTower.client.emit('control', { doc: null, status: 'applied' });
    for (let i = 0; i < 40 && au.src !== right; i++) await new Promise((r) => setTimeout(r, 50));
    return { ok: au.src === right, src: au.src.split('/').pop() };
  });
  check('a track change seen through the DJ\'s channel switches the audio, not just the title', switched.ok, switched.src);

  // When the place the music lives stops answering (Wix bandwidth), every
  // track fails: after the second in a row the listener is told plainly.
  const outage = await a.evaluate(async () => {
    const p = window.radioTower.player;
    const bad = 'data:audio/mpeg;base64,AAAAAAAA';
    const fail = () => new Promise((resolve) => {
      p._sources = [bad]; p._sourceIndex = 0; p._unavailableUntil = 0;
      document.getElementById('audio').addEventListener('error', () => setTimeout(resolve, 50), { once: true });
      p.join({ force: true });
    });
    await fail();
    const first = p.status;
    await fail();
    const second = p.status;
    p._failStreak = 0; p._unavailableUntil = 0; p._onTrackChange(); p.join({ force: true });
    return { first, second };
  });
  check('one track that will not load waits for the next; two in a row say the music is unreachable', /will not load/.test(outage.first) && /not reachable/.test(outage.second), outage.second);

  /* ------------------------------------- the world shell (docs/WORLD.md) -- */
  // Phase 1: behind a flag. Off, the classic site above never loaded any of it.
  check('world shell: off by default — no world, no world.css on the classic site', await a.evaluate(() => !document.querySelector('.w-root')
    && !document.documentElement.classList.contains('world-on') && ![...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href.includes('world.css'))));
  const wctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const w = await wctx.newPage();
  watch(w, 'world');
  const settled = (id) => w.waitForFunction((i) => window.radioTower?.world?.current === i && !window.radioTower.world.camera.moving, id, { timeout: 8000 }).catch(() => {});
  const shot = (id) => w.evaluate((i) => {
    const r = document.getElementById(`w-${i}`).getBoundingClientRect();
    return {
      path: location.pathname, current: document.querySelector('.w-tag[aria-current="true"]')?.dataset.go,
      centre: Math.round(Math.abs(r.left + r.width / 2 - innerWidth / 2)), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0,
      filter: document.querySelector('.w-plane').style.filter, echo: document.body.classList.contains('on-echo'),
      mix: getComputedStyle(document.querySelector('.w-root')).getPropertyValue('--w-mix').trim(),
      pressed: document.querySelector('.w-switch button[aria-pressed="true"]')?.textContent,
    };
  }, id);
  await w.goto(dev + 'radio?world=1', { waitUntil: 'domcontentloaded' });
  await w.waitForFunction(() => window.radioTower?.world?.current === 'radio' && window.radioTower.player?.onAir, null, { timeout: 10000 });
  const landed = { ...(await shot('radio')), tags: await w.$$eval('.w-tags .w-tag', (els) => els.length) };
  check('world shell (?world=1): eleven tags, Radio current, the camera already there — no flight on a cold link', landed.tags === 11 && landed.current === 'radio'
    && landed.centre < 30 && landed.inside && landed.filter === '' && landed.pressed === 'Zone' && !landed.echo, JSON.stringify(landed));
  // Phase 2: the page opens in its district's window, at 1:1 on screen (the box's zoom undoes the camera's scale).
  const hosting = () => w.evaluate(() => {
    const boxes = [...document.querySelectorAll('.w-district .w-box')];
    const live = boxes.filter((b) => b.querySelector(':scope > .page'));
    const page = live[0]?.querySelector(':scope > .page');
    const v = document.getElementById('view');
    return {
      live: live.map((b) => b.closest('.w-district').dataset.d), doors: boxes.filter((b) => b.querySelector(':scope > .w-rest')).length,
      asleep: boxes.filter((b) => b.inert || b.getAttribute('aria-hidden')).length,
      text: page ? page.textContent.trim().length : 0, scale: page ? page.getBoundingClientRect().width / page.offsetWidth : 0,
      main: v.children.length === 0 && v.inert && getComputedStyle(v).visibility === 'hidden',
    };
  });
  const hosted = { ...(await hosting()), onair: await w.evaluate(() => Boolean(document.querySelector('#w-radio .w-box .onair'))) };
  check('…the page opens in its district: Radio\'s window holds the on-air card at 1:1, ten doors elsewhere, <main> empty and inert', hosted.live.join() === 'radio'
    && hosted.onair && hosted.doors === 10 && hosted.asleep === 0 && Math.abs(hosted.scale - 1) < 0.05 && hosted.main, JSON.stringify(hosted));

  // Phase 3: the Zone skin — its own faces, clear glass over the visualiser, bubbles, the plane crisp at rest.
  const skin = await w.evaluate(async () => {
    await document.fonts.ready;
    const loaded = (fam) => [...document.fonts].filter((f) => f.family.replace(/"/g, '') === fam && f.status === 'loaded').map((f) => f.weight);
    const res = performance.getEntriesByType('resource').map((e) => new URL(e.name));
    const b = window.radioTower.world.bubbles;
    const f0 = b.frames;
    // The loop runs if it draws at all; a busy machine right after a load may give it only a few frames a second.
    await new Promise((r) => { const t0 = performance.now(); const tick = () => (b.frames - f0 >= 3 || performance.now() - t0 > 3000 ? r() : setTimeout(tick, 50)); tick(); });
    return {
      chakra: loaded('Chakra Petch'), plex: loaded('IBM Plex Mono'),
      woff2: res.filter((u) => u.pathname.endsWith('.woff2')).map((u) => (u.origin === location.origin ? u.pathname.split('/').pop() : u.href)),
      tab: getComputedStyle(document.querySelector('#w-radio .w-wt')).fontFamily.split(',')[0], page: getComputedStyle(document.querySelector('#w-radio .w-box')).fontFamily.split(',')[0],
      glass: getComputedStyle(document.querySelector('#w-radio .w-win')).backdropFilter, willChange: getComputedStyle(document.querySelector('.w-plane')).willChange,
      stage: window.radioTower.stage.running, bubbles: b.list.length, drawn: b.frames - f0, bg: document.querySelector('.w-root').dataset.wBg,
      scan: getComputedStyle(document.querySelector('.w-scan')).display, classicScan: getComputedStyle(document.querySelector('.scanlines')).display,
    };
  });
  check('Zone skin: Chakra Petch and Plex Mono self-hosted (no font CDN), on the window tabs and in the page', skin.chakra.length >= 1 && skin.plex.length >= 1
    && skin.woff2.some((f) => f.startsWith('ChakraPetch-')) && skin.woff2.every((f) => !/^https?:/.test(f)) && /Chakra Petch/.test(skin.tab) && /Chakra Petch/.test(skin.page),
    JSON.stringify({ chakra: skin.chakra, plex: skin.plex, woff2: skin.woff2, tab: skin.tab, page: skin.page }));
  check('…clear glass over the station\'s visualiser (running behind Zone; no backdrop blur, it halved the frame rate), ten bubbles drifting, the world\'s scan lines instead of the classic ones, the plane crisp at rest',
    skin.glass === 'none' && skin.stage && skin.bubbles === 10 && skin.drawn >= 3 && skin.bg === 'grid' && skin.scan === 'block' && skin.classicScan === 'none'
    && skin.willChange === 'auto', JSON.stringify({ glass: skin.glass, stage: skin.stage, bubbles: skin.bubbles, drawn: skin.drawn, bg: skin.bg, scan: skin.scan, willChange: skin.willChange }));

  await w.click('#mbTune');
  await w.waitForFunction(() => { const au = document.getElementById('audio'); return !au.paused && au.currentTime > 0.3; }, null, { timeout: 10000 }).catch(() => {});
  await w.evaluate(() => { window.__worldAudio = document.getElementById('audio'); });
  await w.click('.w-tag[data-go="une"]');
  await w.waitForFunction(() => window.radioTower.world.current === 'une', null, { timeout: 8000 }).catch(() => {});
  const midFlight = await w.evaluate(() => ({ moving: window.radioTower.world.camera.moving, filter: document.querySelector('.w-plane').style.filter,
    layer: document.querySelector('.w-plane').style.willChange }));
  await settled('une');
  const une = await shot('une');
  const rest = await w.evaluate(async () => {
    const b = window.radioTower.world.bubbles;
    const f0 = b.frames;
    await new Promise((r) => setTimeout(r, 500));
    return { layer: document.querySelector('.w-plane').style.willChange, running: b.running, drawn: b.frames - f0 };
  });
  check('…while it flies the plane gets its own layer; landed on Echo, the layer is dropped and the bubbles stop',
    midFlight.layer === 'transform' && rest.layer === '' && !rest.running && rest.drawn === 0, JSON.stringify({ midFlight, rest }));
  check('the Une tag flies the camera to Echo: a real address, the motion blur only while moving', midFlight.moving && /wBlur/.test(midFlight.filter)
    && une.path === '/echo' && une.current === 'une' && une.centre < 30 && une.inside && une.filter === '', JSON.stringify({ midFlight, une }));
  check('…across the seam: the paper fades in, the switch reads Echo, Zone\'s visualiser rests', une.mix === '1.000' && une.echo && une.pressed === 'Echo'
    && await w.evaluate(() => window.radioTower.stage.running === false), JSON.stringify(une));
  const heard = await w.evaluate(() => {
    const au = document.getElementById('audio');
    return { same: au === window.__worldAudio, paused: au.paused, d: au.currentTime - window.radioTower.player.livePosition() };
  });
  check('…and the radio plays on through the flight, on the station\'s second', heard.same && !heard.paused && Math.abs(heard.d) < 1.5, `drift ${heard.d.toFixed(2)}s`);

  await w.keyboard.press('ArrowRight');
  await settled('articles');
  const walk1 = await shot('articles');
  await w.keyboard.press('ArrowRight');
  await settled('lectures');
  const walk2 = await shot('lectures');
  check('→ walks the map: Articles moves only the camera, Lectures opens its address', walk1.current === 'articles' && walk1.path === '/echo' && walk1.centre < 30
    && walk2.current === 'lectures' && walk2.path === '/echo/lectures' && walk2.centre < 30, `${walk1.path} → ${walk2.path}`);

  await w.reload({ waitUntil: 'domcontentloaded' });
  await w.waitForFunction(() => window.radioTower?.world?.current === 'lectures', null, { timeout: 10000 }).catch(() => {});
  const reloaded = await shot('lectures');
  check('a reload keeps the world for the tab and lands without a flight', reloaded.current === 'lectures' && reloaded.centre < 30 && reloaded.filter === ''
    && await w.evaluate(() => !window.radioTower.world.camera.moving), JSON.stringify(reloaded));
  await w.goBack({ waitUntil: 'domcontentloaded' });
  await settled('radio');
  const back = await shot('radio');
  check('Back flies back to where the reader was', back.current === 'radio' && back.path === '/radio' && back.centre < 30, back.path);

  const atlasAt = await w.evaluate(() => {
    const r = document.querySelector('.w-minimap').getBoundingClientRect();
    return { x: r.left + r.width * (1330 / 5200), y: r.top + r.height * (1430 / 2600) };
  });
  await w.mouse.click(atlasAt.x, atlasAt.y);
  await settled('atlas');
  const viaMap = await shot('atlas');
  await w.click('.w-switch button:nth-of-type(2)');
  await settled('une');
  const viaSwitch = await shot('une');
  check('the minimap and the Zone ⇄ Echo switch fly there too', viaMap.path === '/atlas' && viaMap.current === 'atlas' && viaSwitch.path === '/echo' && viaSwitch.pressed === 'Echo',
    `${viaMap.path}, ${viaSwitch.path}`);

  // The radio through 20 pans — quick ones that cut flights short and slow ones that land — never cut.
  // (The reload above started a new page: tune in again.)
  if (!(await w.evaluate(() => window.radioTower.player.playing))) await w.click('#mbTune');
  await w.waitForFunction(() => { const au = document.getElementById('audio'); return !au.paused && au.currentTime > 0.3; }, null, { timeout: 10000 }).catch(() => {});
  await w.evaluate(() => {
    const au = document.getElementById('audio');
    window.__worldAudio = au;
    window.__worldMuted = 0;
    window.radioTower.player.addEventListener('playing', (e) => { if (!e.detail) window.__worldMuted += 1; });
    // The player's own track change: the track ends (the element pauses until the station's clock rolls over — up to
    // ~1 s, measured on the code before the Zone skin too), a new src is loaded, and the element waits for its metadata, paused.
    window.__worldSwap = -1e9;
    window.__worldSwaps = 0;
    for (const ev of ['ended', 'emptied', 'loadstart']) au.addEventListener(ev, () => { window.__worldSwap = performance.now(); window.__worldSwaps += ev === 'loadstart' ? 1 : 0; });
  });
  const pans = ['ondes', 'zone', 'atlas', 'une', 'articles', 'lectures', 'portfolio', 'playlists', 'radio', 'archives',
    'booth', 'une', 'radio', 'lectures', 'atlas', 'ondes', 'une', 'zone', 'articles', 'radio'];
  let tunedThrough = 0;
  for (const [i, id] of pans.entries()) {
    await w.click(`.w-tag[data-go="${id}"]`);
    if (i % 4 === 3) await settled(id); else await w.waitForTimeout(260);
    if (await w.evaluate(() => {
      const au = document.getElementById('audio');
      return window.radioTower.player.playing && (!au.paused || performance.now() - window.__worldSwap < 1500);
    })) tunedThrough += 1;
  }
  await settled('radio');
  await w.waitForFunction(() => document.querySelector('#w-radio .w-box > .page .onair') && !document.querySelector('.w-box[aria-hidden]'), null, { timeout: 8000 }).catch(() => {});
  const after20 = { ...(await hosting()), ...(await w.evaluate(() => {
    const au = document.getElementById('audio');
    return { same: au === window.__worldAudio, paused: au.paused, d: au.currentTime - window.radioTower.player.livePosition(), muted: window.__worldMuted, path: location.pathname,
      swaps: window.__worldSwaps };
  })) };
  check('20 pans, half of them cut short: the radio never stops (same <audio>, never muted, playing at every pan but a track change, on the station\'s second)',
    tunedThrough === 20 && after20.same && !after20.paused && after20.muted === 0 && Math.abs(after20.d) < 1.5,
    `${tunedThrough}/20 tuned, ${after20.swaps} track change(s), drift ${after20.d.toFixed(2)}s`);
  check('…and one page is live at the end — Radio\'s, in its window; every page left behind is a door again', after20.path === '/radio' && after20.live.join() === 'radio'
    && after20.doors === 10 && after20.asleep === 0, JSON.stringify(after20));

  // Tab follows the camera: past the live page's last control is the next district's door.
  await w.evaluate(() => {
    const f = [...document.querySelectorAll('#w-radio .w-box a[href], #w-radio .w-box button, #w-radio .w-box input, #w-radio .w-box select')]
      .filter((e) => !e.disabled && e.getClientRects().length && !e.closest('[inert]'));
    f.at(-1).focus();
  });
  let tabbedTo = null;
  for (let i = 0; i < 4 && !tabbedTo; i++) {
    await w.keyboard.press('Tab');
    tabbedTo = await w.evaluate(() => { const d = document.activeElement?.closest('.w-district')?.dataset.d; return d && d !== 'radio' ? d : null; });
  }
  if (tabbedTo) await settled(tabbedTo);
  const tabbed = tabbedTo ? { ...(await shot(tabbedTo)), door: await w.evaluate(() => document.activeElement.closest('.w-door') ? document.activeElement.getAttribute('href') : null) } : {};
  check('Tab follows the camera: past Radio\'s last control, focus reaches the next door and the camera flies there (the address stays)', tabbedTo === 'ondes'
    && tabbed.door === 'ondes' && tabbed.current === 'ondes' && tabbed.centre < 30 && tabbed.path === '/radio', JSON.stringify({ tabbedTo, ...tabbed }));
  await w.keyboard.press('Enter');
  await w.waitForFunction(() => location.pathname === '/ondes' && document.querySelector('#w-ondes .w-box > .page'), null, { timeout: 8000 }).catch(() => {});
  const opened = await hosting();
  check('…and Enter opens it in place: /ondes, its page live in Z-02', await w.evaluate(() => location.pathname) === '/ondes' && opened.live.join() === 'ondes' && opened.text > 30,
    JSON.stringify(opened));

  // Every route answers on a cold link, already in its district (no flight), the page live in its window.
  const coldRoutes = [['', 'radio'], ['radio', 'radio'], ['ondes', 'ondes'], ['echoes', 'ondes'], ['zone', 'zone'], ['atlas', 'atlas'], ['portfolio', 'portfolio'],
    ['portfolio/photos', 'portfolio'], ['playlists', 'playlists'], ['booth', 'booth'], ['echo', 'une'], ['echo/article-temoin', 'articles'],
    ['echo/lectures', 'lectures'], ['ecrits', 'lectures'], ['echo/archives', 'archives'], ['nulle-part', null]];
  const coldMiss = [];
  for (const [route, id] of coldRoutes) {
    await w.goto(dev + route + '?world=1', { waitUntil: 'domcontentloaded' });
    await w.waitForFunction((i) => {
      const t = window.radioTower?.world;
      if (!t?.current || t.camera.moving) return false;
      const box = i ? document.querySelector(`#w-${i} .w-box`) : document.querySelector('.w-lost .w-box');
      return box?.querySelector(':scope > .page')?.textContent.trim().length > 20;
    }, id, { timeout: 10000 }).catch(() => {});
    const r = await w.evaluate((i) => {
      const t = window.radioTower.world;
      const lost = document.querySelector('.w-lost');
      const pages = document.querySelectorAll('.w-box > .page').length;
      const s = i ? document.getElementById(`w-${i}`).getBoundingClientRect() : null;
      return { current: t.current, pages, lost: !lost.hidden, centre: s ? Math.abs(s.left + s.width / 2 - innerWidth / 2) : 0,
        text: (i ? document.querySelector(`#w-${i} .w-box > .page`) : lost.querySelector('.page'))?.textContent.trim().length || 0 };
    }, id);
    const ok = id ? r.current === id && !r.lost && r.centre < 30 : r.lost && /Rien ici/.test(await w.textContent('.w-lost'));
    if (!ok || r.pages !== 1 || r.text <= 20) coldMiss.push(`/${route} ${JSON.stringify(r)}`);
  }
  check(`every route answers on a cold link, in its district, its page the only one live (${coldRoutes.length} addresses; an unknown one opens over the map)`, coldMiss.length === 0,
    coldMiss.slice(0, 2).join(' | '));

  const worldA11y = [];
  for (const v of (await axeRun(w)) || []) worldA11y.push(`desktop: ${v}`);

  // Phase 4: the Echo skin — the Gazette in its windows, its figures and ash on the paper, the torn seam,
  // the links that cross it, and Archives.
  await w.goto(dev + 'echo?world=1', { waitUntil: 'domcontentloaded' });
  await w.waitForFunction(() => window.radioTower?.world?.current === 'une' && !window.radioTower.world.camera.moving && window.radioTower.player.onAir
    && document.querySelector('#w-une [data-onair-title]')?.textContent.length > 1, null, { timeout: 10000 }).catch(() => {});
  await w.evaluate(() => {
    // A sample of the ash canvas's alpha: how much ash is drawn, and a fingerprint to see it move. (The crossing below is no reload.)
    window.__ink = () => {
      const c = document.querySelector('.w-ash');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      let h = 0;
      for (let i = 3; i < d.length; i += 4 * 61) { if (d[i]) n++; h = (h * 31 + d[i]) % 1000003; }
      return { n, h };
    };
  });
  const echoSkin = await w.evaluate(async () => {
    const ink = window.__ink;
    const box = document.querySelector('#w-une .w-box');
    const st = box.querySelector('.echo-stage');
    const col = box.querySelector('.echo-col');
    const a0 = ink();
    await new Promise((r) => setTimeout(r, 400));
    const a1 = ink();
    return {
      bare: st?.classList.contains('echo-in-world'), own: box.querySelectorAll('.echo-side, .echo-ash, .echo-znav').length,
      stage: `${getComputedStyle(st).backgroundImage} ${getComputedStyle(st).backgroundColor}`, col: `${getComputedStyle(col).boxShadow} ${getComputedStyle(col).marginTop}`,
      mast: Boolean(box.querySelector('h1.echo-name')), lead: Boolean(box.querySelector('.echo-lead h2 a[href^="echo/"]')),
      onair: box.querySelector('[data-onair-title]')?.textContent, playing: window.radioTower.player.onAir?.title,
      go: box.querySelector('.echo-onair a.echo-go')?.getAttribute('href'), teaser: box.querySelectorAll('.echo-teaser a[href^="echo/lectures/"]').length,
      cols: getComputedStyle(box.querySelector('.echo-cols')).gridTemplateColumns.split(' ').length,
      tab: getComputedStyle(document.querySelector('#w-une .w-wt')).fontFamily.split(',')[0],
      figures: document.querySelectorAll('.w-figures .w-fig use').length, ash: window.radioTower.world.ash, drawn: a1.n, moved: a0.h !== a1.h,
      ground: getComputedStyle(document.querySelector('.w-ground')).opacity, tear: getComputedStyle(document.querySelector('.w-tear:not(.w-rim)')).opacity,
    };
  });
  check('Echo skin: the Une opens as the bare Gazette in its window — masthead and lead, no night sides, ash or Zone/Média line of its own; the window is the sheet',
    echoSkin.bare && echoSkin.own === 0 && echoSkin.stage === 'none rgba(0, 0, 0, 0)' && /^none 0px$/.test(echoSkin.col) && echoSkin.mast && echoSkin.lead
    && /Old Standard TT/.test(echoSkin.tab), JSON.stringify(echoSkin));
  check('…beside the lead, « À l\'antenne »: what Zone plays right now and the way back to the radio, and three Lectures', echoSkin.onair === echoSkin.playing
    && echoSkin.go === 'radio' && echoSkin.teaser === 3 && echoSkin.cols === 2, JSON.stringify({ onair: echoSkin.onair, playing: echoSkin.playing, go: echoSkin.go, teaser: echoSkin.teaser, cols: echoSkin.cols }));
  check('…the Gazette\'s silhouettes stand on Echo\'s paper and its ash falls behind the windows (the plane\'s paper has faded into the far layer)',
    echoSkin.figures === 6 && echoSkin.ash && echoSkin.drawn > 2 && echoSkin.moved && echoSkin.ground === '0' && echoSkin.tear === '0', JSON.stringify(echoSkin));

  if (!(await w.evaluate(() => window.radioTower.player.playing))) await w.click('#mbTune');
  await w.waitForFunction(() => { const au = document.getElementById('audio'); return !au.paused && au.currentTime > 0.3; }, null, { timeout: 10000 }).catch(() => {});
  await w.evaluate(() => { window.__worldAudio = document.getElementById('audio'); });
  await w.click('#w-une .echo-onair a.echo-go');
  await settled('radio');
  await w.waitForFunction(() => !window.radioTower.world.ash, null, { timeout: 3000 }).catch(() => {});
  const crossed = { ...(await shot('radio')), ...(await w.evaluate(() => {
    const au = document.getElementById('audio');
    return { same: au === window.__worldAudio, paused: au.paused, d: au.currentTime - window.radioTower.player.livePosition(), ash: window.radioTower.world.ash,
      left: window.__ink().n, ground: getComputedStyle(document.querySelector('.w-ground')).opacity,
      tear: getComputedStyle(document.querySelector('.w-tear:not(.w-rim)')).opacity, rim: getComputedStyle(document.querySelector('.w-rim')).backgroundColor,
      mask: /svg/.test(getComputedStyle(document.querySelector('.w-tear')).maskImage || getComputedStyle(document.querySelector('.w-tear')).webkitMaskImage) };
  })) };
  check('« Aller à la radio » crosses the seam: the camera flies back to Radio, the radio plays on, the ash is gone once Zone is in view',
    crossed.path === '/radio' && crossed.current === 'radio' && crossed.centre < 30 && crossed.same && !crossed.paused && Math.abs(crossed.d) < 1.5 && !crossed.ash && crossed.left === 0,
    JSON.stringify(crossed));
  check('…seen from Zone, Echo\'s paper is the ground again, its edge torn over a thin red rim', crossed.ground === '1' && crossed.tear === '1' && crossed.mask
    && crossed.rim === 'rgb(163, 22, 31)', JSON.stringify({ ground: crossed.ground, tear: crossed.tear, mask: crossed.mask, rim: crossed.rim }));

  await w.click('.w-tag[data-go="archives"]');
  await settled('archives');
  await w.waitForFunction(() => document.querySelector('#w-archives .w-box .echo-press-list li'), null, { timeout: 8000 }).catch(() => {});
  const arch = { ...(await shot('archives')), ...(await w.evaluate(async () => {
    const places = (await (await fetch('data/places.json')).json()).places;
    const want = places.reduce((n, p) => n + (p.press?.column?.items?.length || 0) + (p.press?.series?.items?.length || 0), 0);
    const box = document.querySelector('#w-archives .w-box');
    return { want, press: box.querySelectorAll('.echo-press-list a[href$=".pdf"][target="_blank"]').length, tags: box.querySelectorAll('.echo-tag-list a[href^="echo/"]').length,
      atlas: box.querySelector('a[href="atlas#novo-hamburgo"]') !== null, feed: box.querySelector('a[href="echo/feed.xml"]') !== null,
      portfolio: box.querySelector('a[href="portfolio"]') !== null, bare: Boolean(box.querySelector('.echo-in-world')) };
  })) };
  check('Archives (E-04) has an address since phase 4: its tag opens /echo/archives — every piece of press on the Atlas\'s cards, the articles by tag, the feed',
    arch.path === '/echo/archives' && arch.current === 'archives' && arch.centre < 30 && arch.want >= 26 && arch.press === arch.want && arch.tags >= 1 && arch.atlas
    && arch.feed && arch.portfolio && arch.bare, JSON.stringify(arch));
  await w.click('#w-archives .w-box a[href="portfolio"]');
  await settled('portfolio');
  const toPortfolio = { ...(await shot('portfolio')), ...(await w.evaluate(() => {
    const au = document.getElementById('audio');
    return { same: au === window.__worldAudio, paused: au.paused, live: Boolean(document.querySelector('#w-portfolio .w-box > .page')) };
  })) };
  check('…and « Ouvrir le Portfolio » crosses back to Zone\'s collections, the radio still playing', toPortfolio.path === '/portfolio' && toPortfolio.current === 'portfolio'
    && toPortfolio.centre < 30 && toPortfolio.live && toPortfolio.same && !toPortfolio.paused, JSON.stringify(toPortfolio));

  // R9's own check for this phase: an article prints from the world as it does from the classic site. Measured at the
  // paper's width (A4 at 96 dpi), then printed to PDF.
  const printOf = async (q) => {
    const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 } });
    const p = await ctx.newPage();
    watch(p, `print, ${q}`);
    await p.goto(dev + 'echo/article-temoin?' + q, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.querySelector('.echo-article .echo-body')?.textContent.trim().length > 50 && window.radioTower?.router?.current, null, { timeout: 10000 })
      .catch(() => {});
    await p.evaluate(() => document.fonts.ready);
    await p.emulateMedia({ media: 'print' });
    const r = await p.evaluate(() => {
      // Measured from the printed article's own corner: the classic <main> may still carry its entrance animation's 6 px.
      const art = document.querySelector('.echo-article').getBoundingClientRect();
      const box = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.left - art.left, b.top - art.top, b.width, b.height].map(Math.round).join(); };
      const shown = [...document.querySelectorAll('.w-hud, .w-tags, .w-far, .w-ground, .w-seam, .w-figures, .w-bar, .w-code, .w-district:not(.here), .minibar, .masthead, canvas')]
        .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map((e) => e.className);
      return { article: [art.left, art.width].map(Math.round).join(), h1: box('.echo-article h1'), body: box('.echo-article .echo-body'), notes: box('.echo-notes'), size: getComputedStyle(document.querySelector('.echo-article h1')).fontSize, shown,
        world: document.documentElement.classList.contains('world-on') };
    });
    r.pages = ((await p.pdf({ format: 'A4' })).toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
    await ctx.close();
    return r;
  };
  const printClassic = await printOf('world=0');
  const printWorld = await printOf('world=1');
  check('R9\'s check: an article prints from the world as from the classic site — the same column, headline, body and notes laid out alike, the same pages, nothing of the world on paper',
    printWorld.world && !printClassic.world && printWorld.article === printClassic.article && printWorld.h1 === printClassic.h1 && printWorld.body === printClassic.body && printWorld.notes === printClassic.notes
    && printWorld.size === printClassic.size && printWorld.shown.length === 0 && printClassic.shown.length === 0 && printWorld.pages === printClassic.pages && printWorld.pages >= 1,
    JSON.stringify({ classic: printClassic, world: printWorld }));

  await w.goto(dev + 'echo?world=1', { waitUntil: 'domcontentloaded' });
  await settled('une');
  for (const v of (await axeRun(w)) || []) worldA11y.push(`desktop, une: ${v}`);
  await w.goto(dev + 'radio?world=1', { waitUntil: 'domcontentloaded' });
  await settled('radio');
  for (const v of (await axeRun(w)) || []) worldA11y.push(`desktop, radio: ${v}`);

  // « Écran »: the screen menu — four radio groups, arrows stay inside it, the choices apply at once and are remembered.
  await w.click('.w-screen-btn');
  const opened3 = await w.evaluate(() => {
    const p = document.getElementById('wScreen');
    return { shown: !p.hidden && p.getBoundingClientRect().height > 100, expanded: document.querySelector('.w-screen-btn').getAttribute('aria-expanded'),
      groups: p.querySelectorAll('[role="radiogroup"]').length, radios: p.querySelectorAll('[role="radio"]').length,
      focus: document.activeElement?.dataset.val || null, checked: document.activeElement?.getAttribute('aria-checked') };
  });
  await w.keyboard.press('ArrowRight');
  await w.keyboard.press('ArrowDown');
  const arrows = await w.evaluate(() => ({ focus: document.activeElement?.dataset.val, current: window.radioTower.world.current, path: location.pathname }));
  for (const v of (await axeRun(w)) || []) worldA11y.push(`desktop, Écran: ${v}`);
  check('« Écran » opens from the HUD: 4 groups, 10 choices, focus on the current one; ← → ↑ ↓ move inside it and never walk the map',
    opened3.shown && opened3.expanded === 'true' && opened3.groups === 4 && opened3.radios === 10 && opened3.focus === 'grid' && opened3.checked === 'true'
    && arrows.focus === 'void' && arrows.current === 'radio' && arrows.path === '/radio', JSON.stringify({ opened3, arrows }));
  for (const [set, val] of [['bg', 'rain'], ['list', 'stack'], ['bub', 'none'], ['scan', 'off']]) await w.click(`.w-opt[data-set="${set}"][data-val="${val}"]`);
  const screened = () => w.evaluate(() => {
    const root = document.querySelector('.w-root');
    const tags = [...document.querySelectorAll('.w-tag')].map((b) => b.getBoundingClientRect());
    const xs = tags.map((r) => r.left);
    return {
      bg: root.dataset.wBg, list: root.dataset.wList, bub: root.dataset.wBub, scan: root.dataset.wScan,
      rain: getComputedStyle(document.querySelector('.w-dark'), '::after').animationName,
      stacked: Math.max(...xs) - Math.min(...xs) <= 24 && Math.max(...tags.map((r) => r.right)) < 300 && tags.every((r, i) => i === 0 || r.top > tags[i - 1].top),
      bubbles: window.radioTower.world.bubbles.running, scanShown: getComputedStyle(document.querySelector('.w-scan')).display !== 'none',
      checked: [...document.querySelectorAll('.w-opt[aria-checked="true"]')].map((b) => b.dataset.val).join(),
    };
  });
  const chosen = await screened();
  await w.keyboard.press('Escape');
  const closed = await w.evaluate(() => ({ hidden: document.getElementById('wScreen').hidden, focus: document.activeElement?.classList.contains('w-screen-btn') }));
  check('…Pluie, Pile, no bubbles, no scan lines: each applies at once (rain falls, the tags stack down the left, the bubbles stop); Esc closes it back onto its button',
    chosen.bg === 'rain' && chosen.rain === 'w-rain' && chosen.list === 'stack' && chosen.stacked && chosen.bub === 'none' && !chosen.bubbles && chosen.scan === 'off'
    && !chosen.scanShown && chosen.checked === 'rain,none,stack,off' && closed.hidden && closed.focus, JSON.stringify({ chosen, closed }));
  await w.reload({ waitUntil: 'domcontentloaded' });
  await settled('radio');
  const kept = await screened();
  check('…and remembered by this browser after a reload', kept.bg === 'rain' && kept.list === 'stack' && kept.stacked && !kept.bubbles && !kept.scanShown, JSON.stringify(kept));
  await w.evaluate(() => localStorage.removeItem('gt.world.screen'));

  await w.goto(dev + 'radio?world=0', { waitUntil: 'domcontentloaded' });
  await w.waitForFunction(() => window.radioTower?.router?.current, null, { timeout: 10000 });
  await w.goto(dev + 'atlas', { waitUntil: 'domcontentloaded' });
  await w.waitForFunction(() => window.radioTower?.router?.current, null, { timeout: 10000 });
  check('?world=0 turns it off, and the next page stays classic', await w.evaluate(() => !document.querySelector('.w-root') && window.radioTower.world === null
    && getComputedStyle(document.getElementById('view')).visibility === 'visible'));
  await wctx.close();

  const still = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' })).newPage();
  watch(still, 'world, reduced motion');
  await still.goto(dev + 'radio?world=1', { waitUntil: 'domcontentloaded' });
  await still.waitForFunction(() => window.radioTower?.world?.current === 'radio', null, { timeout: 10000 });
  await still.click('.w-tag[data-go="lectures"]');
  await still.waitForFunction(() => window.radioTower.world.current === 'lectures', null, { timeout: 8000 }).catch(() => {});
  const cut = await still.evaluate(() => {
    const r = document.getElementById('w-lectures').getBoundingClientRect();
    return { moving: window.radioTower.world.camera.moving, filter: document.querySelector('.w-plane').style.filter, centre: Math.abs(r.left + r.width / 2 - innerWidth / 2) };
  });
  check('reduced motion: a cut, not a pan — no flight, no blur', !cut.moving && cut.filter === '' && cut.centre < 30, JSON.stringify(cut));
  await still.click('.w-tag[data-go="ondes"]');
  await still.waitForFunction(() => window.radioTower.world.current === 'ondes', null, { timeout: 8000 }).catch(() => {});
  const calm = await still.evaluate(async () => {
    document.querySelector('.w-root').dataset.wBg = 'rain';
    await new Promise((r) => setTimeout(r, 400));
    // The world's own ambient loops — its frame, not the pages inside the windows, which follow their own reduced-motion
    // rules; the camera's 160 ms crossfade is the reduced-motion cut itself, not a loop.
    const moving = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity
      && a.effect.target?.closest?.('.w-root') && !a.effect.target.closest('.w-box'))
      .map((a) => `${a.animationName || 'script'}@${a.effect.target.className}${a.effect.pseudoElement || ''}`);
    return { moving, bubbles: window.radioTower.world.bubbles.list.length, running: window.radioTower.world.bubbles.running };
  });
  check('…and nothing in the world loops on its own: no bubbles, no light sweep, no rain', calm.moving.length === 0 && calm.bubbles === 0 && !calm.running, JSON.stringify(calm));
  await still.click('.w-tag[data-go="une"]');
  await still.waitForFunction(() => window.radioTower.world.current === 'une', null, { timeout: 8000 }).catch(() => {});
  const stillAsh = await still.evaluate(async () => {
    const c = document.querySelector('.w-ash');
    const print = () => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; let n = 0; for (let i = 3; i < d.length; i += 4 * 61) { if (d[i]) n++; h = (h * 31 + d[i]) % 1000003; } return { h, n }; };
    await new Promise((r) => setTimeout(r, 200));
    const a = print();
    await new Promise((r) => setTimeout(r, 500));
    const b = print();
    return { drawn: a.n, still: a.h === b.h };
  });
  check('…and on Echo the ash lies still: drawn once, never moving', stillAsh.drawn > 0 && stillAsh.still, JSON.stringify(stillAsh));
  await still.context().close();

  const wm = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  watch(wm, 'world, phone');
  await wm.goto(dev + 'radio?world=1', { waitUntil: 'domcontentloaded' });
  await wm.waitForFunction(() => window.radioTower?.world?.current === 'radio', null, { timeout: 10000 });
  const strip = await wm.evaluate(() => {
    const nav = document.querySelector('.w-tags');
    const tops = new Set([...nav.querySelectorAll('.w-tag')].map((b) => Math.round(b.getBoundingClientRect().top)));
    return { rows: tops.size, scrolls: nav.scrollWidth > nav.clientWidth, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, minimap: getComputedStyle(document.querySelector('.w-minimap')).display };
  });
  await wm.tap('.w-tag[data-go="une"]');
  await wm.waitForFunction(() => window.radioTower.world.current === 'une' && !window.radioTower.world.camera.moving, null, { timeout: 8000 }).catch(() => {});
  const flewTo = await wm.evaluate(() => ({ path: location.pathname, here: document.querySelector('.w-tag[aria-current="true"]')?.dataset.go }));
  check('world shell on a phone: the tags are one strip that scrolls, nothing overflows, a tap flies', strip.rows === 1 && strip.scrolls && strip.overflow <= 1
    && strip.minimap === 'none' && flewTo.path === '/echo' && flewTo.here === 'une', JSON.stringify({ ...strip, ...flewTo }));
  const phoneSkin = await wm.evaluate(() => {
    const btn = document.querySelector('.w-screen-btn').getBoundingClientRect();
    return { btnIn: btn.left >= 0 && btn.right <= innerWidth && btn.width >= 32, glass: getComputedStyle(document.querySelector('#w-radio .w-win')).backdropFilter,
      bubbles: window.radioTower.world.bubbles.list.length, name: document.querySelector('.w-screen-btn').textContent.trim() };
  });
  check('…the Zone skin on a phone: « Écran » fits the header as an icon (its name still read out), clear glass, half the bubbles', phoneSkin.btnIn
    && phoneSkin.name === 'Écran' && phoneSkin.glass === 'none' && phoneSkin.bubbles === 5, JSON.stringify(phoneSkin));
  await wm.waitForFunction(() => document.querySelector('#w-une .w-box > .page')?.textContent.trim().length > 20, null, { timeout: 8000 }).catch(() => {});
  const phoneFrame = await wm.evaluate(() => {
    const s = document.getElementById('w-une').getBoundingClientRect();
    const box = document.querySelector('#w-une .w-box');
    const page = box.querySelector(':scope > .page');
    return { left: Math.round(s.left), right: Math.round(innerWidth - s.right), boxW: Math.round(box.getBoundingClientRect().width), zoom: box.style.zoom,
      scale: page ? page.getBoundingClientRect().width / page.offsetWidth : 0, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check('…and on a phone the frame is the screen: the page fills it at 1:1, no zoom, nothing overflows', phoneFrame.left >= 0 && phoneFrame.left <= 16 && phoneFrame.right >= 0
    && phoneFrame.right <= 16 && phoneFrame.boxW >= 320 && phoneFrame.zoom === '' && Math.abs(phoneFrame.scale - 1) < 0.02 && phoneFrame.overflow <= 1, JSON.stringify(phoneFrame));
  const phoneUne = await wm.evaluate(() => {
    const cols = document.querySelector('#w-une .echo-cols');
    const lead = cols?.querySelector('.echo-lead')?.getBoundingClientRect();
    const side = cols?.querySelector('.echo-aside')?.getBoundingClientRect();
    return { cols: cols ? getComputedStyle(cols).gridTemplateColumns.split(' ').length : 0, under: Boolean(lead && side && side.top >= lead.bottom - 1) };
  });
  check('…the Une\'s « À l\'antenne » column goes under the lead on a phone', phoneUne.cols === 1 && phoneUne.under, JSON.stringify(phoneUne));
  for (const v of (await axeRun(wm)) || []) worldA11y.push(`phone: ${v}`);
  if (AXE) check('world shell: no accessibility violations above minor (desktop + phone)', worldA11y.length === 0, worldA11y.slice(0, 3).join(' | ') || 'names, roles, landmarks, contrast');
  await wm.context().close();

  /* ------------------------------------------------------------- phone -- */
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await phone.newPage();
  watch(m, 'phone');
  const overflow = [];
  const a11y = [];
  for (const r of ['', 'radio', 'ondes', 'playlists', 'atlas', 'zone', 'ecrits', 'ecrits/l-ascenceur-tombe', 'echo/lectures', 'echo/lectures/voyages', 'echo', 'echo/article-temoin', 'echo/archives', 'portfolio', 'portfolio/photos', 'portfolio/crates', 'booth']) {
    await m.goto(dev + r, { waitUntil: 'domcontentloaded' });
    await m.waitForFunction(() => window.radioTower?.router?.current, null, { timeout: 10000 });
    await m.waitForTimeout(700);
    const o = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 1) overflow.push(`/${r} ${o}px`);
    for (const v of (await axeRun(m)) || []) a11y.push(`/${r}: ${v}`);
  }
  // Touch: a tap opens a half's menu, a second tap closes it, a tap outside closes it.
  await m.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await m.waitForFunction(() => window.radioTower?.router?.current, null, { timeout: 10000 });
  const mopen = () => m.$$eval('.half.open', (e) => e.length);
  await m.tap('.half-zone .half-btn');
  check('banner (touch): a tap opens the half\'s menu', (await mopen()) === 1 && await m.isVisible('.half-zone .half-menu a[href="playlists"]'));
  await m.tap('.half-zone .half-btn');
  check('banner (touch): a second tap closes it', (await mopen()) === 0);
  await m.tap('.half-echo .half-btn');
  await m.tap('.brand-text');
  check('banner (touch): a tap outside closes it', (await mopen()) === 0);
  check('nothing overflows a 390 px phone', overflow.length === 0, overflow.join(', ') || 'every page fits');
  if (AXE) {
    for (const v of (await axeRun(booth)) || []) a11y.push(`booth (unlocked): ${v}`);
    check('no accessibility violations above minor (axe-core, every page + the unlocked booth)', a11y.length === 0, a11y.slice(0, 3).join(' | ') || 'contrast, names, roles, headings');
  } else console.log('SKIP  accessibility (axe-core not installed — npm install)');
  check('the mini-player stays on screen on a phone', await m.$eval('#minibar', (el) => el.getBoundingClientRect().bottom <= innerHeight + 1 && el.offsetHeight > 40));

  // A tap, not a click: the gesture path a phone takes (tower-mobile-check).
  // Chromium in a phone-shaped window — not iOS Safari; see that skill.
  await m.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await m.waitForFunction(() => window.radioTower?.player?.onAir, null, { timeout: 10000 });
  await m.tap('#mbTune');
  await m.waitForFunction(() => { const au = document.getElementById('audio'); return !au.paused && au.currentTime > 0.3; }, null, { timeout: 10000 }).catch(() => {});
  const tapped = await m.evaluate(() => ({ paused: document.getElementById('audio').paused, d: document.getElementById('audio').currentTime - window.radioTower.player.livePosition() }));
  check('on a phone, a tap on the mini-player tunes in on the station\'s second', !tapped.paused && Math.abs(tapped.d) < 1.5, `drift ${tapped.d.toFixed(2)}s`);
  // Back from a locked screen: the re-join's play() is refused (no tap).
  // The player must say so and give the button back, not pretend to play.
  await m.evaluate(() => {
    HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('needs a tap', 'NotAllowedError')); };
    window.radioTower.player.join({ force: true });
  });
  await m.waitForFunction(() => !window.radioTower.player.playing, null, { timeout: 5000 }).catch(() => {});
  const refused = await m.evaluate(() => ({ playing: window.radioTower.player.playing, status: window.radioTower.player.status, label: document.getElementById('mbTune').getAttribute('aria-label') }));
  check('a re-join the phone refuses gives the Tune in button back instead of faking play', !refused.playing && refused.label === 'Tune in' && /tap Tune in/.test(refused.status), refused.status);

  /* -------------------------------------- dist/ under a repo sub-path ---- */
  await build({ base: '/radio-tower/', repo: 'ortis/radio-tower', quiet: true });
  const distServer = await createSiteServer({ dist: true, base: '/radio-tower/', fixtures });
  const distPort = await listen(distServer);
  const d = await (await browser.newContext()).newPage();
  watch(d, 'dist');
  await d.goto(`http://127.0.0.1:${distPort}/radio-tower/ecrits/opal-orre`, { waitUntil: 'domcontentloaded' });
  await d.waitForSelector('.reading h1', { timeout: 10000 }).catch(() => {});
  const dh = await d.textContent('.reading h1').catch(() => '');
  check('the old /ecrits address still opens the text and moves to /echo/lectures', dh === 'Opal Orre' && d.url().endsWith('/radio-tower/echo/lectures/opal-orre'), d.url());
  const cfg = await d.evaluate(() => window.radioTower?.client?.config?.github);
  check('the built site answers a cold deep link under /<repo>/', dh === 'Opal Orre', dh || 'no heading');
  check('…and knows which repository its booth writes to', cfg?.owner === 'ortis' && cfg?.repo === 'radio-tower');
  // The go-live checker (GO-LIVE §4) against the same build on a Pages-shaped
  // server with a stand-in GitHub API: nothing to fail on a site that works.
  const liveServer = await createSiteServer({ dist: true, base: '/radio-tower/', fixtures, fakeGithub: true });
  const livePort = await listen(liveServer);
  const live = await liveCheck(`http://127.0.0.1:${livePort}/radio-tower/`);
  liveServer.close();
  const liveFails = live.filter((r) => r.level === 'FAIL');
  check('the go-live checker passes a working build, audio and queue included', liveFails.length === 0 && live.some((r) => /audio/.test(r.name) && r.level === 'PASS'),
    liveFails.map((r) => `${r.name}: ${r.detail}`).join(' | ') || `${live.filter((r) => r.level === 'PASS').length} pass, ${live.filter((r) => r.level === 'WARN').length} warn`);
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
      shown = await t.evaluate(() => ({ mode: window.radioTower?.client?.mode, id: window.radioTower?.player?.onAir?.id, pill: document.getElementById('rMode')?.textContent, ch: window.radioTower?.client?.channel }));
      // The same channel the page is tuned to (the tower's default: Mashup).
      server = await (await fetch(`${towerUrl}/api/station${shown.ch ? `?channel=${encodeURIComponent(shown.ch)}` : ''}`)).json();
      if (shown.id === server.onAir?.id) break;
      await t.waitForTimeout(700);
    }
    check('pointed at a Radio Tower server, the same front end plays its programme', shown.mode === 'tower' && shown.id === server.onAir?.id, `${server.onAir?.title}`);
    check('…and shows the server\'s real listener count', /listening/.test(shown.pill || ''), (shown.pill || '').trim());
    // Ondes in tower mode: the lists and the guide come from the server.
    await tab(t, 'ondes');
    await t.waitForSelector('#eGuide li .at', { timeout: 8000 }).catch(() => {});
    const tEcho = await t.evaluate(() => ({
      next: document.querySelectorAll('#eNext li:not(.empty)').length,
      guide: document.querySelectorAll('#eGuide li .at').length,
      empty: document.querySelector('#eGuide .empty')?.textContent || '',
    }));
    check('…and its Ondes page reads Up next and the next hours from the tower', tEcho.next >= 1 && tEcho.guide >= 5, tEcho.empty || `${tEcho.next} next, ${tEcho.guide} in the guide`);

    // Zone on a tower: the tower's own origin (STATION_LAT/LON/PLACE, set by
    // build-test.sh) wins over config.json's; a tower that names none leaves
    // config.json's in place.
    await tab(t, 'zone');
    await t.waitForSelector('#zMap .zone-origin', { timeout: 5000 }).catch(() => {});
    const tz = await t.evaluate(() => {
      const g = document.querySelector('#zMap .zone-origin');
      return { lat: Number(g?.dataset.lat), lon: Number(g?.dataset.lon), place: document.getElementById('zPlace')?.textContent, cfg: window.radioTower.client.config.station?.origin };
    });
    const so = server.station?.origin;
    const wantZ = so || tz.cfg;
    check(`Zone on a tower shows ${so ? 'the tower\'s own origin, not config.json\'s' : 'config.json\'s origin (this tower names none)'}`, Boolean(wantZ) && tz.lat === wantZ.lat && tz.lon === wantZ.lon && tz.place === wantZ.place, `${tz.place} (${tz.lat}, ${tz.lon})`);

    // The booth on a tower (2026-10-13): the Desktop shortcut's #key unlocks
    // it without staying on the address bar; remembering is opt-in and per
    // station; a key the tower refuses is forgotten, not replayed.
    const keyCtx = await browser.newContext();
    const bk = await keyCtx.newPage();
    watch(bk, 'booth-key');
    const boothAt = `${dev}booth?tower=${encodeURIComponent(towerUrl)}`;
    const authOf = () => bk.evaluate(() => ({
      url: location.href,
      unlocked: window.radioTower?.client?.canWrite,
      text: document.querySelector('#bAuth')?.textContent || '',
      stored: localStorage.getItem('radiotower.stationKeys'),
    }));
    await bk.goto(`${boothAt}#key=selftest-key`, { waitUntil: 'domcontentloaded' });
    await bk.waitForSelector('#bAuth .qstate.ok', { timeout: 10000 }).catch(() => {});
    const arrived = await authOf();
    check('the shortcut\'s #key unlocks the booth on a tower, and is gone from the address bar', arrived.unlocked === true && !arrived.url.includes('#'), arrived.url.replace(dev, '/'));
    check('…without being remembered unless asked', arrived.stored === null && /for this visit/.test(arrived.text));
    await bk.click('#bKeep');
    await bk.goto(boothAt, { waitUntil: 'domcontentloaded' });
    await bk.waitForSelector('#bAuth .qstate.ok', { timeout: 10000 }).catch(() => {});
    const back = await authOf();
    const keptFor = Object.keys(JSON.parse(back.stored || '{}'));
    check('"Remember on this computer": a plain /booth opens unlocked, for this station only', back.unlocked === true && /remembered/.test(back.text) && keptFor.join() === new URL(towerUrl).origin, keptFor.join());
    await bk.click('#bLock');
    const locked = await authOf();
    check('…and "Lock and forget" leaves nothing in the browser', locked.unlocked === false && locked.stored === null && /Station key/.test(locked.text));

    // Not watched for console errors: the browser logs the tower's 401 itself.
    const bad = await keyCtx.newPage();
    bad.on('pageerror', (e) => errors.push(`booth-bad-key: ${e.message}`));
    await bad.goto(boothAt, { waitUntil: 'domcontentloaded' });
    await bad.waitForSelector('#bKey', { timeout: 10000 });
    await bad.fill('#bKey', 'not-the-station-key');
    await bad.check('#bKeyKeep');
    await bad.click('#bKeyForm button[type=submit]');
    const refused = await bad.evaluate(async () => {
      const c = window.radioTower.client;
      const keptBefore = Boolean(localStorage.getItem('radiotower.stationKeys'));
      let err = '';
      try { await c.clear(); } catch (e) { err = e.message; }
      await new Promise((r) => setTimeout(r, 150));
      return { keptBefore, err, unlocked: c.canWrite, stored: localStorage.getItem('radiotower.stationKeys'), text: document.querySelector('#bAuth')?.textContent || '' };
    });
    check('a key the tower refuses is forgotten, not replayed: the booth asks again', refused.keptBefore && /refused/.test(refused.err) && refused.unlocked === false && refused.stored === null && /refused/.test(refused.text), refused.err);
    await keyCtx.close();
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
