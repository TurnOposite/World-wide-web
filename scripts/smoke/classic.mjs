/**
 * The site smoke, classic: the classic shell (?classic=1): listener A — the stage, Canopy, Ondes, Playlists, the music across pages, the Antenna —, listener B and the channels dial, the booth over a stand-in GitHub, the rooms (Écrits, Atlas, Portfolio).
 * One part of scripts/site-smoke.mjs (`--only classic` runs it alone); scripts/smoke/harness.mjs is what it is handed.
 */
export default async function classic({ check, AXE, axeRun, devServer, dev, browser, SPOTIFY, spotifyAsked, coversAsked, watch, serveTemoin, tab }) {
  /* --------------------------------------------------------- listener A -- */
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const a = await ctxA.newPage();
  watch(a, 'A');
  // The classic shell, kept one release behind ?classic=1 since the world became the default (phase 5b):
  // every check down to the world shell's section runs on it.
  await a.goto(dev + 'radio?classic=1', { waitUntil: 'domcontentloaded' });
  await a.waitForFunction(() => window.radioTower?.player?.onAir, null, { timeout: 15000 });
  const tabs = await a.$$eval('.tabs a', (els) => els.map((e) => e.textContent.trim()));
  // Since 2026-11-01 Zone's half is Radio, Ondes, Playlists, Atlas: the Zone page is part of the Atlas, the Portfolio off Zone's side.
  // One Atlas since 2026-11-10, Echo's: the window Zone's stood in is the Antenna (the streams, the telegraph line).
  // The Bibliothèque (the Portfolio) among Echo's since 2026-11-03, renamed the Archive that evening, in Archives' place;
  // Lectures went into the Livre miroir.
  check('the site shell has two halves: Zone (radio) and Echo (journal)', tabs.join(',') === 'Radio,Ondes,Playlists,Antenna,Une,Articles,Archive,Atlas', tabs.join(', '));
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
  const readMap = () => a.evaluate(() => {
    const map = window.radioTower.stage.callmap;
    const pts = map ? map.layout() : [];
    return {
      exists: Boolean(map), demo: map?.demo, calls: map?.calls.length ?? 0, kinds: map?.clusterCount() ?? 0,
      inCube: pts.every((p) => p.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)),
      playing: !document.getElementById('audio').paused, path: location.pathname,
    };
  });
  // 2026-11-11: failed once in fifteen runs with « 25 calls, 4 kinds » — everything the map is asked for was
  // there. The one thing read at a single instant is whether the audio is playing, and the fixture changes
  // track every half minute: the read had landed in the blink between two files. Same conditions, together,
  // given up to 6 s more; and the line now says which one is missing.
  const mapOk = (m) => ({ exists: m.exists, live: !m.demo, calls: m.calls >= 6, kinds: m.kinds >= 2, inCube: m.inCube, playing: m.playing, path: m.path === '/radio' });
  let cm = await readMap();
  for (let waited = 0; waited < 6000 && !Object.values(mapOk(cm)).every(Boolean); waited += 200) { await a.waitForTimeout(200); cm = await readMap(); }
  const cmOk = mapOk(cm);
  check('Canopy maps the music live on the radio page: calls on the onsets, sorted into kinds, inside the cube',
    Object.values(cmOk).every(Boolean),
    `${cm.calls} calls, ${cm.kinds} kinds${Object.values(cmOk).every(Boolean) ? '' : ` — missing: ${Object.keys(cmOk).filter((k) => !cmOk[k]).join(', ')}`}`);
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
  // for /ondes; 2026-11-01: the queue left too (the Booth rearranges it) — Radio is the card and the channels.
  const radioRest = await a.evaluate(() => ({
    lists: ['rNext', 'rRecent', 'rGuide', 'rTz'].filter((id) => document.getElementById(id)).concat(document.querySelector('#view .echoes, #view .guide') ? ['.echoes'] : []),
    queue: Boolean(document.querySelector('#rQueue .tracklist, #rQueue li')),
    link: Boolean(document.querySelector('#view a[href="ondes"]')),
  }));
  check('Radio is the on-air card: no Ondes lists, no queue, nothing to scroll to', radioRest.lists.length === 0 && !radioRest.queue && !radioRest.link && Boolean(await a.$('#rTitle')),
    radioRest.lists.join(', ') || JSON.stringify(radioRest));
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
  // Read once, the drift was a coin toss on a loaded laptop (a seek, or a seam, still settling): now playing and within
  // 1.5 s of the clock within three seconds. The same <audio> is still the proof it never restarted.
  const steady = await a.waitForFunction(() => {
    const au = document.getElementById('audio');
    return !au.paused && Math.abs(au.currentTime - window.radioTower.player.livePosition()) < 1.5;
  }, null, { timeout: 3000 }).then(() => true, () => false);
  const drift = await a.evaluate(() => document.getElementById('audio').currentTime - window.radioTower.player.livePosition());
  check('…and the music did not stop to show it', echoes.same && steady, `drift ${drift.toFixed(2)}s (first read ${echoes.drift.toFixed(2)}s${echoes.paused ? ', paused' : ''})`);

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
  // Since 2026-11-03 the cards run most-saved first and the player opens on the featured playlist, wherever its card sits.
  const onAir = pl.picks.filter((p) => p.on);
  const firstId = onAir[0]?.id;
  check('Playlists: one Spotify player, loaded (not lazy), with every playlist as a card', pl.picks.length >= 50 && pl.iframes.length === 1 && onAir.length === 1 && pl.iframes[0].startsWith(SPOTIFY + firstId) && pl.lazy !== 'lazy' && asked(firstId) && pl.now === onAir[0].title,
    `${pl.picks.length} cards, ${pl.iframes.join()}, asked ${spotifyAsked.length}`);
  // His Bandcamp at the end of the window (2026-11-22, « much simpler »): the logo, a link to his profile in a new tab,
  // and his sentence; the logo loads.
  await a.waitForFunction(() => document.querySelector('#view .bc-logo')?.complete, null, { timeout: 8000 }).catch(() => {});
  const bcl = await a.evaluate(() => {
    const s = document.querySelector('#view .bc-links');
    const deck = document.querySelector('#view .sp-deck');
    const img = s?.querySelector('img.bc-logo');
    return s && { links: [...s.querySelectorAll('a')].map((x) => ({ href: x.href, blank: x.target === '_blank', safe: /noopener/.test(x.rel) })), after: Boolean(deck && (deck.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING)),
      logo: img ? { alt: img.alt, w: img.naturalWidth } : null, text: s.querySelector('.bc-text')?.textContent };
  });
  check('Playlists: at the end, the Bandcamp logo links to his profile, with his sentence', Boolean(bcl) && bcl.after && bcl.links.length === 1
    && bcl.links[0].href === 'https://bandcamp.com/turnoposite' && bcl.links[0].blank && bcl.links[0].safe && bcl.logo?.alt === 'Bandcamp' && bcl.logo.w > 0
    && bcl.text === 'Check out more playlists and albums on my Bandcamp page!', JSON.stringify(bcl));
  const picked = pl.picks.find((p, i) => i >= 2 && !p.on);
  await a.click(`#view .sp-pick[data-id="${picked.id}"]`);
  // 2026-11-11: this check failed 1 run in 3 on untouched code. It read the page a fixed 800 ms after the click,
  // and two things it asks for are not instant: the frame's request reaching the stub, and — the fixture's tracks
  // being half a minute long — the radio being between two tracks at that very moment (paused for a blink while
  // the next file loads). The same things must still hold, together; they are given up to 6 s to.
  const swapped = (d) => ({
    frame: d.iframes.length === 1 && d.iframes[0].startsWith(SPOTIFY + picked.id), asked: asked(picked.id), title: d.now === picked.title,
    open: d.open === `https://open.spotify.com/playlist/${picked.id}`, card: d.picks.filter((p) => p.on).map((p) => p.id).join() === picked.id, playing: d.playing,
  });
  let pl2 = await deckState();
  for (let waited = 0; waited < 6000 && !Object.values(swapped(pl2)).every(Boolean); waited += 150) { await a.waitForTimeout(150); pl2 = await deckState(); }
  const sw = swapped(pl2);
  check('Playlists: a card loads its playlist into the same player, and the radio plays on', Object.values(sw).every(Boolean),
    `${picked.title} → ${pl2.iframes.join()}${Object.values(sw).every(Boolean) ? '' : ` — missing: ${Object.keys(sw).filter((k) => !sw[k]).join(', ')}`}`);
  const vign = await a.evaluate(() => ({ cards: document.querySelectorAll('#view .sp-pick .pl-cover').length, imgs: document.querySelectorAll('#view .sp-pick .pl-cover img').length }));
  check('Playlists: every card has its vignette, and the covers are Ortis\'s photos from Spotify\'s CDN', vign.cards === pl.picks.length && vign.imgs >= 40 && coversAsked.length > 0,
    `${vign.cards} vignettes, ${vign.imgs} covers, ${coversAsked.length} asked`);

  /* ------------------------------------------- music survives navigation -- */
  // Read the player away from a track change. At a change the <audio> is between two tracks for an instant: paused,
  // or still on the old one's last second while the clock is on the new one's first. On GitHub (2026-11-17, 2fc0529)
  // both reads below landed there: « 24.4 s → 26.0 s », the end of a 26 s fixture, and « playing: false ». The wait
  // is for the clock, never for the music: a player that stopped is still paused when it is read.
  const awayFromChange = (p) => p.waitForFunction(() => {
    const pl = window.radioTower.player, t = pl.onAir, pos = pl.livePosition();
    return t && pos != null && pos > 2 && (t.duration || 0) - pos > 2;
  }, null, { timeout: 15000 }).catch(() => {});
  const audioBefore = await a.evaluate(() => { window.__sameAudio = document.getElementById('audio'); return document.getElementById('audio').currentTime; });
  await tab(a, 'atlas');
  await a.waitForSelector('.mapbox svg .pin', { timeout: 5000 });
  await a.waitForTimeout(1200);
  await awayFromChange(a);
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
  // The one Atlas (2026-11-10): the map of the places. The tower's own point is not drawn in the world for now.
  check('Atlas (the map of the places): no tower point and no playlists on it', !(await a.$('.mapbox .tower-pin')) && !(await a.$('#view .sp-deck')));
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

  /* ------------------------------------------------ the Antenna: /antenna -- */
  // Ortis, 2026-11-10: « remove the Atlas from the Zone side… the streams and telegraph lines will use the window
  // currently used by the atlas of the Zone side. Call that window Antenna. » The dial lives here now; the
  // telegraph line runs through the tower, so on this site without one it says so and offers nothing to fill in.
  // /zone, the window's address until then, still opens it.
  await a.evaluate(() => window.radioTower.router.go('zone'));
  await a.waitForFunction(() => location.pathname === '/zone' && document.querySelector('#view #anDial button[data-ch]') && document.querySelector('#view .tg-log li'), null, { timeout: 8000 }).catch(() => {});
  const oldAddr = await a.evaluate(() => ({ title: document.querySelector('#view h1')?.textContent, tab: document.title }));
  await a.evaluate(() => window.radioTower.router.go('antenna'));
  await a.waitForFunction(() => location.pathname === '/antenna' && document.querySelector('#view #anDial button[data-ch]') && document.querySelector('#view .tg-log li'), null, { timeout: 8000 }).catch(() => {});
  await awayFromChange(a); // « the music plays on » is read below
  const zone = await a.evaluate(() => ({
    path: location.pathname, title: document.querySelector('#view h1')?.textContent,
    dial: [...document.querySelectorAll('#view #anDial button[data-ch]')].map((x) => x.dataset.ch),
    on: document.querySelectorAll('#view #anDial button[aria-pressed="true"]').length,
    line: document.querySelector('#view .tg-log')?.textContent || '',
    join: Boolean(document.querySelector('#view .tg-join, #view .tg-say, #view .tg-joinform')),
    map: Boolean(document.querySelector('#view svg.world-map, #view .tower-pin')), deck: Boolean(document.querySelector('#view .sp-deck')),
    playing: !document.getElementById('audio').paused,
    menu: [...document.querySelectorAll('.half-zone .half-menu a')].map((x) => x.getAttribute('href')),
    echoMenu: [...document.querySelectorAll('.half-echo .half-menu a')].map((x) => x.getAttribute('href')),
  }));
  check('the Antenna (/antenna): the streams\' dial, one marked on air here; /zone, its old address, opens the same window', zone.path === '/antenna' && zone.title === 'Antenna'
    && zone.dial.length >= 2 && zone.on === 1 && oldAddr.title === 'Antenna', JSON.stringify({ ...zone, line: undefined, oldAddr }));
  check('…the telegraph line says it runs through the tower, and offers nothing to fill in without one', /through the tower/.test(zone.line) && !zone.join, zone.line);
  check('…no map and no playlists in it, and the music plays on', !zone.map && !zone.deck && zone.playing, JSON.stringify({ map: zone.map, deck: zone.deck, playing: zone.playing }));
  // Since 2026-11-03 (evening): Echo's menu is the Une, Articles (its own list now), the Archive, the map's Atlas.
  check('the menus: Zone\'s is Radio, Ondes, Playlists and the Antenna; Echo\'s is the Une, Articles, the Archive and the Atlas', zone.menu?.join() === 'radio,ondes,playlists,antenna' && zone.echoMenu?.join() === 'echo,echo/articles,portfolio,atlas',
    JSON.stringify({ zone: zone.menu, echo: zone.echoMenu }));

  /* --------------------------------------------------------- listener B -- */
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const b = await ctxB.newPage();
  watch(b, 'B');
  await b.goto(dev + 'radio?classic=1', { waitUntil: 'domcontentloaded' });
  await b.waitForFunction(() => window.radioTower?.player?.onAir, null, { timeout: 15000 });
  await b.click('#rTune');
  await b.waitForFunction(() => { const au = document.getElementById('audio'); return !au.paused && au.currentTime > 0.5; }, null, { timeout: 15000 }).catch(() => {});
  const snap = (p) => p.evaluate(() => ({ id: window.radioTower.player.onAir?.id, pos: window.radioTower.player.livePosition(), ct: document.getElementById('audio').currentTime, at: Date.now() }));
  // Read both away from a track change. On GitHub (2026-11-22, 25cf7ce) the two were read across one: A 0.30 s into
  // the new track, B's audio still on the old one's last second. Every player hands over at its own pace there, so
  // the comparison waits until both are on air 2 s or more from either end of the same track; the tolerance is unchanged.
  await Promise.all([awayFromChange(a), awayFromChange(b)]);
  let [sa, sb] = await Promise.all([snap(a), snap(b)]);
  if (sa.id !== sb.id) { await Promise.all([awayFromChange(a), awayFromChange(b)]); [sa, sb] = await Promise.all([snap(a), snap(b)]); }
  check('two listeners, no server between them, are on the same track', sa.id === sb.id);
  check('…and the same second', Math.abs(sa.ct - sb.ct - (sa.at - sb.at) / 1000) < 1, `A ${sa.ct.toFixed(2)}s · B ${sb.ct.toFixed(2)}s`);

  /* ---------------------------------------------------- channels (dial) -- */
  // Every channel is its own clock (server/lib/channels.js). Turning the dial
  // must land this listener on that channel's track *and* second, touch no
  // one else, and be remembered — then B goes back to the default for the
  // booth checks below, which expect both listeners on the same channel.
  // The dial stands in the Antenna since 2026-11-10. Since 2026-11-17 (Ortis: « from radio we can also change the
  // stream ») /radio has a switch of the streams' names; what each is playing stays the Antenna's.
  await b.waitForFunction(() => document.querySelectorAll('#rStream button[data-ch]').length >= 2, null, { timeout: 8000 }).catch(() => {});
  const lead = await b.evaluate(() => ({ chs: [...document.querySelectorAll('#rStream button[data-ch]')].map((x) => x.dataset.ch + (x.getAttribute('aria-pressed') === 'true' ? '*' : '')),
    dial: Boolean(document.querySelector('#view .dial')) }));
  check('/radio has a switch of the streams, the one on air here marked; the dial with what each plays is not on it', lead.chs.length >= 2 && lead.chs.filter((c) => c.endsWith('*')).length === 1 && !lead.dial, JSON.stringify(lead));
  const fromRadio = lead.chs.find((c) => !c.endsWith('*'));
  if (fromRadio) {
    await b.click(`#rStream button[data-ch="${fromRadio}"]`);
    await b.waitForFunction((ch) => window.radioTower.player.data?.station?.channel === ch, fromRadio, { timeout: 8000 }).catch(() => {});
    const switched = await b.evaluate(() => ({ ch: window.radioTower.client.channel, on: window.radioTower.player.data?.station?.channel, pressed: document.querySelector('#rStream [aria-pressed="true"]')?.dataset.ch }));
    check('…a tap on it changes the stream from Radio', switched.ch === fromRadio && switched.on === fromRadio && switched.pressed === fromRadio, JSON.stringify(switched));
    const back = lead.chs.find((c) => c.endsWith('*')).slice(0, -1);
    await b.evaluate((ch) => window.radioTower.client.setChannel(ch), back);
    await b.waitForFunction((ch) => window.radioTower.player.data?.station?.channel === ch, back, { timeout: 8000 }).catch(() => {});
  }
  await b.evaluate(() => window.radioTower.router.go('antenna'));
  await b.waitForSelector('#anDial button[data-ch]', { timeout: 8000 }).catch(() => {});
  const dial = await b.$$eval('#anDial button[data-ch]', (bs) => bs.map((x) => ({ slug: x.dataset.ch, on: x.getAttribute('aria-pressed') === 'true' })));
  const homeCh = dial.find((d) => d.on)?.slug;
  check('the dial offers every channel and marks the one on air here', dial.length >= 2 && dial.filter((d) => d.on).length === 1 && homeCh === 'mashup',
    dial.map((d) => d.slug + (d.on ? '*' : '')).join(' '));
  const target = dial.find((d) => !d.on && d.slug !== 'all')?.slug || dial.find((d) => !d.on)?.slug;
  if (target) {
    await b.click(`#anDial button[data-ch="${target}"]`);
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
    // The lane select (MB-02): every lane a card with its emblem and its own accent; ▼ tunes to the next lane on air.
    await b.waitForSelector('#anDial [data-cycle="1"]', { timeout: 8000 }).catch(() => {});
    const lanes = await b.evaluate(() => ({ cards: document.querySelectorAll('#anDial .ch').length, emblems: document.querySelectorAll('#anDial .ch .ch-emblem svg').length,
      accents: new Set([...document.querySelectorAll('#anDial .ch')].map((c) => c.style.getPropertyValue('--lane'))).size }));
    const laneBefore = await b.evaluate(() => window.radioTower.client.channel);
    await b.click('#anDial [data-cycle="1"]');
    await b.waitForFunction((ch) => window.radioTower.client.channel !== ch, laneBefore, { timeout: 8000 }).catch(() => {});
    await b.waitForTimeout(300);
    const laneAfter = await b.evaluate(() => ({ ch: window.radioTower.client.channel, on: document.querySelector('#anDial .ch.on')?.dataset.ch }));
    check('the streams as a lane select (MB-02): each lane its emblem and its own accent, and ▼ tunes to the next one on air',
      lanes.cards >= 2 && lanes.emblems === lanes.cards && lanes.accents === lanes.cards && laneAfter.ch !== laneBefore && laneAfter.on === laneAfter.ch, JSON.stringify({ lanes, laneBefore, laneAfter }));
    await b.evaluate((ch) => window.radioTower.client.setChannel(ch), homeCh);
    await b.waitForFunction((ch) => window.radioTower.player.data?.station?.channel === ch, homeCh, { timeout: 8000 }).catch(() => {});
  }

  /* --------------------------------------- the booth, over "GitHub" ------ */
  const booth = await ctxA.newPage();
  watch(booth, 'booth');
  await booth.goto(dev + 'booth?classic=1', { waitUntil: 'domcontentloaded' });
  await booth.waitForSelector('#bTok', { timeout: 8000 });
  check('the booth is read-only until a token is saved', (await booth.$$('#bQueue li[data-movable="1"]')).length === 0);
  await booth.fill('#bTok', 'github_pat_selftest');
  await booth.click('#bTokForm button[type=submit]');
  await booth.waitForSelector('#bQueue li[data-movable="1"]', { timeout: 8000 }).catch(() => {});
  const movable = await booth.$$('#bQueue li[data-movable="1"]');
  check('with a token, the movable part of the queue gets handles', movable.length >= 2, `${movable.length} movable`);
  let lockedCount = await booth.$$eval('#bQueue li.locked', (els) => els.length);
  let beforeIds = await b.evaluate(() => window.radioTower.client.engine.get('/api/queue').body.slots.map((s) => s.id));
  // 2026-11-11: this failed 1 full run in 6 with « 0 commit(s) ». The row was found, then focused, then moved — and
  // the list is redrawn whenever the programme advances (a track ends every half minute on the fixture), so now
  // and then the row in hand was no longer on the page, the key went nowhere and nothing was committed. As in
  // browser-smoke's drag: the programme moving under the hand is a reason to try again, not a pass and not a
  // failure. The last movable row is the one moved (the first is the one about to cross the fence), found and
  // moved in one step on the page, and what counts is a commit reaching « GitHub ».
  const putsBefore = devServer.fakeGithub.puts;
  for (let attempt = 0; attempt < 4 && devServer.fakeGithub.puts === putsBefore && movable.length >= 2; attempt++) {
    // The fence is counted at the same moment as the queue it fences: it grows as the programme runs, and an attempt
    // can come up to 18 s after the first (2026-11-24; red once on GitHub with « slid 0 », 3711442).
    beforeIds = await b.evaluate(() => window.radioTower.client.engine.get('/api/queue').body.slots.map((s) => s.id));
    lockedCount = await booth.$$eval('#bQueue li.locked', (els) => els.length);
    await booth.evaluate(() => { const rows = document.querySelectorAll('#bQueue li[data-movable="1"]'); rows[rows.length - 1]?.focus(); });
    await booth.keyboard.press('ArrowUp');
    for (let waited = 0; waited < 6000 && devServer.fakeGithub.puts === putsBefore; waited += 150) await booth.waitForTimeout(150);
  }
  await booth.waitForFunction(() => /On air/.test(document.querySelector('#bQueue .qstate')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const puts = devServer.fakeGithub.puts - putsBefore;
  const committed = JSON.parse(devServer.fakeGithub.text);
  // One override per channel since 2026-10-07: the booth edits the channel it is tuned to.
  const boothCh = await booth.evaluate(() => window.radioTower.client.channel);
  const committedOv = boothCh === 'all' ? committed.override : committed.overrides?.[boothCh];
  check('the reorder is committed through the contents API', puts >= 1 && Array.isArray(committedOv?.ids), `${puts} commit(s), channel ${boothCh}`);
  await b.evaluate(() => window.radioTower.client.pollControl());
  await b.waitForFunction(() => window.radioTower.client.controlStatus === 'applied', null, { timeout: 3000 }).catch(() => {});
  const afterIds = await b.evaluate(() => window.radioTower.client.engine.get('/api/queue').body.slots.map((s) => s.id));
  const status = await b.evaluate(() => window.radioTower.client.controlStatus);
  // A track ends every half minute on the fixture, and now and then one ended between the two reads: the window
  // slid by one, and « nothing added, nothing removed » went red on a queue that was right (2026-11-17). Compare
  // what both reads cover: `slid` tracks have left the front, as many new ones joined the back.
  const slid = Math.max(0, beforeIds.indexOf(afterIds[0]));
  const span = afterIds.length - slid;
  const sameMultiset = [...beforeIds.slice(slid)].sort().join() === [...afterIds.slice(0, span)].sort().join();
  const fenced = afterIds.slice(0, Math.max(0, lockedCount - slid)).join() === beforeIds.slice(slid, lockedCount).join();
  check('a second listener adopts it on its next poll', status === 'applied' && afterIds.join() !== beforeIds.join(), `status ${status}`);
  check('…and it is a permutation: nothing added, nothing removed, the fence untouched', beforeIds.includes(afterIds[0]) && slid <= 1 && sameMultiset && fenced,
    `slid ${slid}, ${afterIds.length} slots, fence ${lockedCount}${beforeIds.includes(afterIds[0]) && slid <= 1 && sameMultiset && fenced ? ''
      : ` — before ${beforeIds.join(' ')} · after ${afterIds.join(' ')} · multiset ${sameMultiset} · fence kept ${fenced}`}`);

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
  await a.waitForSelector('.echo-front .echo-lead', { timeout: 5000 });
  // Since 2026-11-03 (evening) the Lectures window is gone: the texts are found in the Livre miroir, on the Archive's
  // top shelf, on purpose a little harder to come upon — the Une no longer points at them.
  const uneC = await a.evaluate(() => ({
    lectures: document.querySelectorAll('#view a[href^="echo/lectures"]').length,
    groups: [...document.querySelectorAll('.echo-groups .echo-group')].map((g) => ({ href: g.getAttribute('href'), name: g.querySelector('b')?.textContent, fan: g.querySelectorAll('.echo-fan img').length })),
    cards: document.querySelectorAll('.echo-card').length,
  }));
  check('the Une: no way to the texts any more, and the press as two groups — the metro walk, then the Olympics — each a fan of its pages',
    uneC.lectures === 0 && uneC.groups.map((g) => g.href).join() === 'echo/articles#metro,echo/articles#jogos' && uneC.groups[0].name === 'Um passeio de metrô por Paris'
    && uneC.groups[1].name === 'Jogos Olímpicos' && uneC.groups.every((g) => g.fan === 3), JSON.stringify(uneC));
  check('Echo lists its articles and filters by tag', uneC.cards >= 1);
  check('Echo front page is a newspaper: masthead, lead with title link, side silhouettes, ash canvas', Boolean(
    await a.$('.echo-front .echo-mast h1') && await a.$('.echo-lead h2 a[href^="echo/"]') && (await a.$$('.echo-side .sil')).length >= 6 && await a.$('canvas.echo-ash')));
  const frontPage = await echoClean();
  check('Echo front page: no Zone visualiser drawn or running, no full-page overlay', frontPage.onEcho && frontPage.canvases.length === 0 && frontPage.veils.length === 0 && frontPage.running === false, JSON.stringify(frontPage));
  check('Echo front page: thin 1 px ink rules (nav, masthead, lead text, footer) on a white paper', await a.evaluate(() => {
    const w = (sel, side) => getComputedStyle(document.querySelector(sel))[`border${side}Width`];
    return w('.echo-znav', 'Bottom') === '1px' && w('.echo-mast', 'Bottom') === '1px' && w('.echo-lead-txt', 'Top') === '1px' && w('.echo-foot', 'Top') === '1px'
      && getComputedStyle(document.querySelector('.echo-col')).backgroundColor === 'rgb(245, 244, 241)';
  }));
  // A group opens Articles at its series: every clipping is there, under the series' name, in a box of its own.
  await a.click('.echo-group[href="echo/articles#jogos"]');
  await a.waitForSelector('.echo-articles .echo-series#jogos .echo-clip', { timeout: 5000 }).catch(() => {});
  await a.waitForFunction(() => { const r = document.querySelector('.echo-series#jogos')?.getBoundingClientRect(); return r && r.top >= -2 && r.top < innerHeight / 2; }, null, { timeout: 3000 }).catch(() => {});
  const artsC = { ...(await echoClean()), ...(await a.evaluate(() => {
    const tableBox = (id) => document.querySelector(`.echo-series#${id}`);
    const r = tableBox('jogos')?.getBoundingClientRect();
    return {
      path: location.pathname, hash: location.hash, on: document.querySelector('.echo-znav a.on')?.getAttribute('href'),
      order: [...document.querySelectorAll('.echo-series')].map((x) => x.id), articles: document.querySelectorAll('.echo-articles .echo-grid .echo-card').length,
      metro: tableBox('metro')?.querySelectorAll('.echo-clip[href^="echo/presse/"]').length, jogos: tableBox('jogos')?.querySelectorAll('.echo-clip[href^="echo/presse/"]').length,
      names: [...document.querySelectorAll('.echo-series h2')].map((h) => h.textContent), framed: tableBox('metro') ? getComputedStyle(tableBox('metro')).borderTopWidth : null,
      atTop: r ? r.top < innerHeight / 2 : false,
    };
  })) };
  check('Articles: every article, then the metro walk and the Olympics, each clipping on its own under its series\' name, framed — opened at the series asked for',
    artsC.path === '/echo/articles' && artsC.hash === '#jogos' && artsC.on === 'echo/articles' && artsC.order.join() === 'metro,jogos' && artsC.articles >= 1 && artsC.metro === 4 && artsC.jogos === 26
    && artsC.names.join() === 'Um passeio de metrô por Paris,Jogos Olímpicos' && artsC.framed === '1px' && artsC.atTop && artsC.canvases.length === 0 && artsC.veils.length === 0, JSON.stringify(artsC));
  await a.click('.echo-series#metro .echo-clip[href="echo/presse/2024-07-22-p12"]');
  await a.waitForSelector('.echo-presse .echo-scan', { timeout: 5000 }).catch(() => {});
  const clipC = await a.evaluate(() => ({
    path: location.pathname, title: document.querySelector('.echo-presse h1')?.textContent, pages: document.querySelectorAll('.echo-presse .echo-scan object[data*=".pdf#toolbar=0"]').length,
    fallback: document.querySelectorAll('.echo-presse .echo-scan-alt[href$=".pdf"]').length, prev: document.querySelector('.echo-steps a[rel="prev"]')?.getAttribute('href'),
    next: document.querySelector('.echo-steps a[rel="next"]')?.getAttribute('href'), series: document.querySelector('.echo-presse .echo-kicker a')?.getAttribute('href'),
  }));
  check('…a clipping is an article: its page of the paper in the column (a link to the PDF where it cannot show), the episodes before and after',
    clipC.path === '/echo/presse/2024-07-22-p12' && clipC.title === 'Por dentro do coração de Paris' && clipC.pages === 2 && clipC.fallback === 2
    && clipC.prev === 'echo/presse/2024-07-19-p1' && clipC.next === 'echo/presse/2024-07-23-p12' && clipC.series === 'echo/articles#metro', JSON.stringify(clipC));
  await a.click('.echo-znav a[href="echo"]');
  await a.waitForSelector('.echo-lead h2 a[href^="echo/"]', { timeout: 5000 });
  await a.click('.echo-lead h2 a[href^="echo/"]');
  await a.waitForSelector('.echo-article .echo-body', { timeout: 5000 });
  const art = await echoClean();
  check('Echo article page: no Zone visualiser, no overlay, nameplate links back to /echo', art.canvases.length === 0 && art.veils.length === 0 && art.running === false && await a.$('.echo-mast-small a.echo-name[href="echo"]') !== null, JSON.stringify(art));
  // The témoin, served as the fixture it is now (serveTemoin): the reading page still sets every element.
  {
    const t = await ctxA.newPage();
    watch(t, 'A-témoin');
    await serveTemoin(t);
    await t.goto(dev + 'echo/article-temoin?classic=1', { waitUntil: 'domcontentloaded' });
    await t.waitForSelector('.echo-article .echo-body .pull', { timeout: 8000 }).catch(() => {});
    check('an Echo article opens: standfirst, hero with credit, pull quote, notes (the témoin, as a fixture)', Boolean(await t.$('.echo-standfirst') && await t.$('.echo-hero figcaption .credit') && await t.$('.echo-body .pull') && await t.$('.echo-notes li')));
    await t.close();
    await a.bringToFront();
  }
  // /echo/archives went into Articles and the Archive: its address leads to the Archive.
  await a.evaluate(() => window.radioTower.router.go('echo/archives'));
  await a.waitForFunction(() => location.pathname === '/portfolio' && document.querySelector('.room .book'), null, { timeout: 8000 }).catch(() => {});
  check('the old /echo/archives address answers and moves to the Archive', await a.evaluate(() => location.pathname === '/portfolio' && document.querySelector('.page-head h1')?.textContent === 'Archive'), await a.evaluate(() => location.pathname));
  await a.click('.echo-znav a[href="echo"]').catch(() => tab(a, 'echo'));
  await a.waitForSelector('.echo-znav', { timeout: 5000 });
  // The Portfolio left Zone's side (2026-11-01), came back on Echo's as the Bibliothèque (11-03) and became the Archive that evening.
  // One Atlas since 11-10, the map's (/atlas) among Echo's; beside Radio stands the Antenna.
  const rubriques = await a.$$eval('.echo-znav a', (as) => as.map((x) => x.getAttribute('href')));
  check('Echo\'s rubriques: Zone is Radio and the Antenna; Média is the Une, Articles, the Archive and the Atlas', rubriques.join() === 'radio,antenna,echo,echo/articles,portfolio,atlas', rubriques.join());
  await a.click('#view a[href="portfolio"]');
  await a.waitForSelector('.room .book', { timeout: 8000 });
  const books = (await a.$$('.room .book')).length;
  check('the Archive: the library puts every book on a shelf', books >= 20, `${books} spines`);
  const covers = await a.$$eval('.room .book', (bs) => bs.filter((b) => b.querySelector('.bcover .cv-art svg') && b.querySelector('.spine')).length);
  check('the Archive: every book is a volume with a cover drawn for it, the thesis face-out', covers === books && Boolean(await a.$('.room .book.thesis.face-out')), `${covers}/${books} covers`);
  const archHead = await a.evaluate(() => ({
    title: document.querySelector('.page-head h1')?.textContent, said: document.querySelectorAll('.page-head p:not(.pf-elsewhere), #libIntro, .room > .hint:not(#statusLine)').length, // the Elsewhere links are no description
    tabs: [...document.querySelectorAll('.room-tabs a')].map((x) => x.getAttribute('href')), card: Boolean(document.querySelector('.room > .thesis-card, .room > section.thesis-card')),
  }));
  check('the Archive: its name, two rooms (the Bibliothèque, the Crates — the Photos have no tab), no descriptions, no thesis card between the shelf and the maps',
    archHead.title === 'Archive' && archHead.said === 0 && archHead.tabs.join() === 'portfolio/library,portfolio/crates' && !archHead.card, JSON.stringify(archHead));
  // The thesisC, clicked, opens on its card (the boxed notice that stood under the shelf until 2026-11-03), not on the desk.
  await a.bringToFront();
  await a.click('.room .book.thesis');
  await a.waitForSelector('#thesisDesk[open] #thesisCard a.btn.gold[href$=".pdf"]', { timeout: 4000 }).catch(() => {});
  const thesisC = await a.evaluate(() => ({ open: document.getElementById('thesisDesk')?.open, desk: document.getElementById('desk')?.open, title: document.querySelector('#thesisDesk #thesisTitle')?.textContent, hash: location.hash }));
  check('the thesis opens on its card — the download, the title, the way to the maps — and not on the desk',
    thesisC.open && !thesisC.desk && /Platformized Music Subcultures/.test(thesisC.title || '') && thesisC.hash.startsWith('#book=') && Boolean(await a.$('#thesisDesk a[data-maps]')), JSON.stringify(thesisC));
  // "#maps" under <base href="/"> resolves to the site root: the router must keep the reader here.
  const roomPath = await a.evaluate(() => location.pathname);
  await a.click('#thesisDesk a[data-maps]').catch(() => {});
  await a.waitForTimeout(600);
  check('an in-page link (#maps) keeps the reader in the library, and puts the thesis back on the shelf', (await a.evaluate(() => location.pathname)) === roomPath && Boolean(await a.$('.room .book'))
    && !(await a.evaluate(() => document.getElementById('thesisDesk').open)), roomPath);
  // The map table under the bookcase: every map small on old paper; over the table the pointer is a loupe; a click lifts a
  // map up to the reader with what it shows and what the thesis draws from it.
  await a.locator('.room .maptable').scrollIntoViewIfNeeded();
  await a.waitForFunction(() => [...document.querySelectorAll('.room .mt-scene .mt-sheet img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }).catch(() => {});
  const tableC = await a.evaluate(() => {
    const sheets = [...document.querySelectorAll('.room .maptable > .mt-scene .mt-sheet')];
    const img = sheets[0]?.querySelector('img');
    const below = document.querySelector('.room .maptable').getBoundingClientRect().top >= document.querySelector('.room .bookcase').getBoundingClientRect().bottom - 2;
    return { sheets: sheets.length, small: sheets.every((s) => s.getBoundingClientRect().width < document.querySelector('.room .maptable').getBoundingClientRect().width / 3),
      thumbs: sheets.every((s) => /\/thumbs\//.test(s.querySelector('img').getAttribute('src'))), paper: img ? getComputedStyle(img).mixBlendMode : null,
      tilted: getComputedStyle(document.querySelector('.room .mt-table')).transform !== 'none', below };
  });
  const tableBox = await a.locator('.room .maptable > .mt-scene').boundingBox();
  await a.mouse.move(tableBox.x + 4, tableBox.y + tableBox.height - 6);
  const firstSheet = await a.locator('.room .maptable > .mt-scene .mt-sheet').first().boundingBox();
  await a.mouse.move(firstSheet.x + firstSheet.width / 2, firstSheet.y + firstSheet.height / 2, { steps: 4 });
  await a.waitForTimeout(250);
  const lensC = await a.evaluate(() => {
    const t = document.querySelector('.room .maptable');
    return { on: t.classList.contains('lensing'), shown: getComputedStyle(t.querySelector('.mt-loupe')).opacity, cursor: getComputedStyle(t.querySelector('.mt-scene')).cursor,
      copy: t.querySelectorAll('.mt-lens-in .mt-sheet img').length, zoom: t.querySelector('.mt-lens-in').style.transform, onSheet: t.querySelector('.mt-loupe').classList.contains('on-sheet') };
  });
  check('the map table: every map lies on it in small format, on old paper, under the bookcase and in perspective',
    tableC.sheets >= 8 && tableC.small && tableC.thumbs && tableC.paper === 'multiply' && tableC.tilted && tableC.below, JSON.stringify(tableC));
  check('…over it the pointer becomes a loupe that magnifies the maps under it', lensC.on && lensC.shown === '1' && lensC.cursor === 'none' && lensC.copy === tableC.sheets && /scale\(2/.test(lensC.zoom) && lensC.onSheet, JSON.stringify(lensC));
  const mapId = await a.locator('.room .maptable > .mt-scene .mt-sheet').first().getAttribute('data-id');
  await a.mouse.click(firstSheet.x + firstSheet.width / 2, firstSheet.y + firstSheet.height / 2);
  await a.waitForTimeout(120);
  const flying = await a.evaluate(() => document.querySelector('dialog.map-close .mc-sheet')?.getAnimations().length || 0);
  await a.waitForFunction(() => document.querySelector('dialog.map-close.is-up .mc-info h3') && !document.querySelector('dialog.map-close .mc-sheet').getAnimations().length, null, { timeout: 4000 }).catch(() => {});
  const upC = await a.evaluate(() => {
    const d = document.querySelector('dialog.map-close');
    const r = d.querySelector('.mc-sheet').getBoundingClientRect();
    return { open: d.open, title: d.querySelector('.mc-info h3')?.textContent, context: d.querySelector('.mc-context')?.textContent.length || 0, legend: d.querySelectorAll('.mc-legend li').length,
      big: r.width > innerWidth * 0.3, hash: location.hash, hidden: getComputedStyle(document.querySelector('.room .maptable > .mt-scene .mt-sheet.lifted')).visibility, dl: d.querySelector('.mc-dl')?.getAttribute('href') };
  });
  check('…a click lifts the map off the table and brings it close, beside its description and what the thesis draws from it',
    flying >= 1 && upC.open && upC.title === 'Co-commented videos' && upC.context > 200 && upC.legend >= 5 && upC.big && upC.hash === `#map=${mapId}` && upC.hidden === 'hidden' && /thesis-figure-1\.png$/.test(upC.dl || ''), JSON.stringify({ flying, ...upC }));
  await a.keyboard.press('Escape');
  await a.waitForFunction(() => !document.querySelector('dialog.map-close').open, null, { timeout: 3000 }).catch(() => {});
  check('…and Esc puts it back where it lay', await a.evaluate(() => !document.querySelector('dialog.map-close').open && location.hash === '' && !document.querySelector('.room .mt-sheet.lifted')));
  // The Livre miroir (2026-11-03): on the top shelf, pulled out under the pointer like the others; clicked, it opens on the
  // introduction (the Lectures window's, one sentence to a paragraph). Nothing says the page turns; the right-hand page's
  // edge lifts under the pointer, the corner more; a click on it turns it, and the pond with the six texts is under it.
  await a.evaluate(() => window.scrollTo(0, 0));
  const mirrorBtn = await a.$('.room .shelf:first-child .book.mirror');
  let mirror = { onTop: Boolean(mirrorBtn) };
  if (mirrorBtn) {
    // Listener B's page opened since: put this one back in front, or it draws no frames and no transition runs.
    await a.bringToFront();
    await mirrorBtn.hover();
    await a.waitForFunction(() => /^0px -1\d/.test(getComputedStyle(document.querySelector('.room .book.mirror .b3d')).translate), null, { timeout: 3000 }).catch(() => {});
    mirror.lift = await a.evaluate(() => getComputedStyle(document.querySelector('.room .book.mirror .b3d')).translate);
    await mirrorBtn.click();
    await a.waitForFunction(() => document.querySelector('dialog.mirror-book[open].is-ready .mb-pond a.stone'), null, { timeout: 8000 }).catch(() => {});
    mirror = { ...mirror, ...(await a.evaluate(() => {
      const d = document.querySelector('dialog.mirror-book');
      const intro = [...d.querySelectorAll('.mb-intro .mb-text > p, .mb-recto .mb-text > p')].map((p) => p.textContent);
      const said = d.textContent.replace(/\s+/g, ' ');
      return { open: Boolean(d?.open), paras: intro.length, first: intro[0]?.slice(0, 16), hash: location.hash, inert: d.querySelector('.mb-pool').inert,
        quiet: !/tourn|page suivante|→|›/i.test([...d.querySelectorAll('.mb-intro, .mb-recto')].map((x) => x.innerText).join(' ')) && !/tourner/i.test(said.replace(/aria-label="[^"]*"/g, '')) };
    })) };
    // the book still moving (a slow runner draws late) would put the corner somewhere else by the time the pointer arrives
    await a.waitForFunction(() => [...document.querySelectorAll('dialog.mirror-book .mb-book, dialog.mirror-book .mb-cover, dialog.mirror-book .mb-leaf')]
      .every((el) => !el.getAnimations().some((x) => x.playState === 'running')), null, { timeout: 4000 }).catch(() => {});
    const edgeBox = await a.locator('dialog.mirror-book .mb-corner').boundingBox();
    // what the pointer will meet there, for a red run's report
    mirror.under = await a.evaluate(([x, y]) => {
      const chain = (e) => { const out = []; for (let n = e; n && out.length < 4; n = n.parentElement) out.push(n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '')); return out.join(' < '); };
      return { at: [Math.round(x), Math.round(y)], hit: chain(document.elementFromPoint(x, y)), open: [...document.querySelectorAll('dialog[open]')].map((d) => d.className),
        path: location.pathname, vp: [innerWidth, innerHeight], book: (() => { const r = document.querySelector('dialog.mirror-book .mb-book').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })() };
    }, [edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2]);
    await a.mouse.move(edgeBox.x - 60, edgeBox.y - 60);
    await a.mouse.move(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2, { steps: 3 });
    await a.waitForTimeout(500);
    mirror.lift = { shelf: mirror.lift, ...(await a.evaluate(() => {
      const leaf = document.querySelector('dialog.mirror-book .mb-leaf');
      const m = new DOMMatrixReadOnly(getComputedStyle(leaf).transform);
      return { by: leaf.dataset.lift, curl: parseFloat(getComputedStyle(leaf.querySelector('.mb-recto'), '::after').width), m13: Number(m.m13.toFixed(3)) };
    })) };
    await a.mouse.click(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2);
    await a.waitForFunction(() => document.querySelector('dialog.mirror-book.is-turned') && !document.querySelector('dialog.mirror-book .mb-pool').inert, null, { timeout: 4000 }).catch(() => {});
    mirror = { ...mirror, ...(await a.evaluate(() => {
      const d = document.querySelector('dialog.mirror-book');
      const pond = d?.querySelector('.mb-pond');
      const r = pond?.getBoundingClientRect();
      return { turned: d.classList.contains('is-turned'), stones: pond?.querySelectorAll('a.stone[href^="echo/lectures/"]').length || 0, water: Boolean(pond?.querySelector('canvas.pond-water')),
        wide: r ? r.width > 300 && r.height > 200 : false, poolOpen: !d.querySelector('.mb-pool').inert };
    })) };
  }
  check('the Livre miroir lifts like the others and opens on the introduction, one sentence to a paragraph, with nothing that says the page turns',
    mirror.onTop && mirror.open && mirror.paras === 5 && mirror.first === 'Quelques projets' && mirror.hash === '#miroir' && mirror.inert && mirror.quiet, JSON.stringify(mirror));
  check('…the right-hand page lifts under the pointer, its bottom corner most; a click turns it, and under it the pond of the six texts',
    mirror.lift?.by === 'corner' && mirror.lift.curl > 30 && mirror.lift.m13 !== 0 && mirror.turned && mirror.poolOpen && mirror.stones === 6 && mirror.water && mirror.wide, JSON.stringify({ lift: mirror.lift, turned: mirror.turned, stones: mirror.stones, water: mirror.water, wide: mirror.wide, under: mirror.under }));
  // And back (2026-11-13): over the water, the left-hand page's bottom corner curls under the pointer; a click turns the
  // leaf back and the introduction is there again, its page ready to turn once more. Then the page is turned again.
  let turnBack = { tried: false };
  if (mirror.turned) {
    const bb = await a.evaluate(() => { const r = document.querySelector('dialog.mirror-book .mb-book').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const bx = bb.x + bb.w / 2 * 0.06;
    const by = bb.y + bb.h * 0.95;
    await a.mouse.move(bx + 30, by - 60, { steps: 2 });
    await a.mouse.move(bx, by, { steps: 3 });
    await a.waitForTimeout(450);
    turnBack = { tried: true, ...(await a.evaluate(() => {
      const d = document.querySelector('dialog.mirror-book');
      return { by: d.dataset.back || null, curl: parseFloat(getComputedStyle(d.querySelector('.mb-return'), '::after').width) };
    })) };
    await a.mouse.click(bx, by);
    await a.waitForFunction(() => { const d = document.querySelector('dialog.mirror-book'); return d && !d.classList.contains('is-turned') && !d.classList.contains('is-unturning'); }, null, { timeout: 4000 }).catch(() => {});
    turnBack = { ...turnBack, ...(await a.evaluate(() => {
      const d = document.querySelector('dialog.mirror-book');
      const leaf = d.querySelector('.mb-leaf');
      const m = new DOMMatrixReadOnly(getComputedStyle(leaf).transform);
      return { turnedBack: !d.classList.contains('is-turned'), poolInert: d.querySelector('.mb-pool').inert, open: d.open,
        flat: Math.abs(m.m11 - 1) < 0.02, intro: getComputedStyle(d.querySelector('.mb-intro')).visibility === 'visible' || getComputedStyle(d.querySelector('.mb-intro')).display === 'none',
        backBtn: d.querySelector('.mb-return-edge').hidden };
    })) };
    // → turns it again (the keyboard's way), and the pond is there for the stone below.
    await a.keyboard.press('ArrowRight');
    await a.waitForFunction(() => document.querySelector('dialog.mirror-book.is-turned') && !document.querySelector('dialog.mirror-book .mb-pool').inert, null, { timeout: 4000 }).catch(() => {});
    turnBack.again = await a.evaluate(() => document.querySelector('dialog.mirror-book').classList.contains('is-turned'));
  }
  check('…and back: over the water the left-hand page\'s corner curls under the pointer, a click turns the leaf back to the introduction, → turns it again',
    turnBack.tried && turnBack.by === 'corner' && turnBack.curl > 30 && turnBack.turnedBack && turnBack.poolInert && turnBack.open && turnBack.flat && turnBack.intro && turnBack.backBtn && turnBack.again, JSON.stringify(turnBack));
  // A stone opens its text: the book closes behind it, the text is a reading page of Echo, back to the book.
  if (mirror.turned) {
    await a.click('dialog.mirror-book .mb-pond a.stone[href="echo/lectures/voyages"]', { force: true });
    await a.waitForSelector('.reading .body.verse p', { timeout: 5000 }).catch(() => {});
  }
  const poem = await a.evaluate(() => ({ path: location.pathname, book: document.querySelector('dialog.mirror-book')?.open, back: document.querySelector('.reading a.back')?.getAttribute('href') }));
  check('a stone opens its text: a poem verbatim, set as verse, with its score, and the way back is the book',
    poem.path === '/echo/lectures/voyages' && !poem.book && poem.back === 'portfolio#miroir' && /toits d.ardoise/.test(await a.textContent('.reading .body').catch(() => '')) && Boolean(await a.$('#scoreBox:not([hidden])')), JSON.stringify(poem));
  const lect = await echoClean();
  check('the text\'s page: no Zone visualiser, no overlay', lect.onEcho && lect.canvases.length === 0 && lect.veils.length === 0 && lect.running === false, JSON.stringify(lect));
  // /echo/lectures alone, the list that was: it leads to the Archive with the book open.
  await a.evaluate(() => window.radioTower.router.go('echo/lectures'));
  await a.waitForFunction(() => location.pathname === '/portfolio' && document.querySelector('dialog.mirror-book')?.open, null, { timeout: 8000 }).catch(() => {});
  const oldLect = await a.evaluate(() => ({ path: location.pathname, hash: location.hash, book: Boolean(document.querySelector('dialog.mirror-book')?.open) }));
  check('the old /echo/lectures address leads to the Archive, the Livre miroir open', oldLect.path === '/portfolio' && oldLect.hash === '#miroir' && oldLect.book, JSON.stringify(oldLect));
  await a.keyboard.press('Escape');
  await a.waitForFunction(() => !document.querySelector('dialog.mirror-book')?.open && location.hash === '', null, { timeout: 3000 }).catch(() => {});
  check('…and Esc closes the book', await a.evaluate(() => !document.querySelector('dialog.mirror-book')?.open && location.hash === ''));
  await a.click('.room-tabs a[href="portfolio/crates"]');
  await a.waitForSelector('.room .sleeve', { timeout: 8000 });
  check('the Archive: crates render as sleeves, with no play button', (await a.$$('.room .sleeve')).length >= 1 && !(await a.$('.room .sleeve button.play')));
  // Racks of records in a drawer of folders (Ortis, 2026-11-24): the sleeves stand overlapped, and the one under the
  // pointer is picked up, its card (title, artist, when it plays) shown.
  const rack = await (async () => {
    // The first folder holding two records or more; the test library's crates may hold one record in all.
    const rows = await a.$$('.room .crate-row');
    const at = Math.max(0, await a.evaluate(() => [...document.querySelectorAll('.room .crate-row')].findIndex((r) => r.querySelectorAll('.sleeve').length >= 2)));
    const ss = rows[at] ? await rows[at].$$('.sleeve') : [];
    const s = ss[1] || ss[0]; if (!s) return null;
    await s.scrollIntoViewIfNeeded();
    const b0 = await s.boundingBox();
    await a.mouse.move(b0.x + 14, b0.y + b0.height * 0.6);
    await a.waitForTimeout(450);
    const b1 = await s.boundingBox();
    const seen = await a.evaluate((i) => {
      const [s0, s1] = document.querySelectorAll('.room .crate-row')[i].querySelectorAll('.sleeve'), r0 = s0.getBoundingClientRect(), r1 = s1?.getBoundingClientRect();
      return { drawer: Boolean(document.querySelector('.room .crate-drawer .category .crate-row')), overlap: r1 ? r1.left < r0.right - 20 : 'one record', card: +getComputedStyle((s1 || s0).querySelector('.s-cap')).opacity };
    }, at);
    await a.mouse.move(2, 2);
    return { ...seen, lift: Math.round(b0.y - b1.y) };
  })();
  check('…in a drawer of folders, standing overlapped like records in a rack; the one under the pointer is picked up, its card shown',
    Boolean(rack) && rack.drawer && rack.overlap !== false && rack.lift >= 12 && rack.card > 0.9, JSON.stringify(rack));
  // The photos keep their room and address, without a tab (Ortis: one day on the world map).
  await a.evaluate(() => window.radioTower.router.go('portfolio/photos'));
  await a.waitForSelector('.room .ph', { timeout: 8000 });
  check('the photos keep their room at their address, without a tab: they render as tiles', (await a.$$('.room .ph')).length >= 12);

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

  // The classic site above (?classic=1) never loaded any of it.
  check('the classic shell (?classic=1): no world, no world.css', await a.evaluate(() => !document.querySelector('.w-root')
    && !document.documentElement.classList.contains('world-on') && ![...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href.includes('world.css'))));

  // Until 2026-11-24 this was one check with the phone's pages (scripts/smoke/phone.mjs); the booth lives here.
  if (AXE) {
    const boothA11y = ((await axeRun(booth)) || []).map((v) => `booth (unlocked): ${v}`);
    check('no accessibility violations above minor on the unlocked booth (axe-core)', boothA11y.length === 0, boothA11y.slice(0, 3).join(' | ') || 'contrast, names, roles, headings');
  }
}
