/**
 * The site smoke, world: the world shell on a laptop (docs/WORLD.md): the camera, the districts, every cold link, the boat, the caption, print, reduced motion and the still pages.
 * One part of scripts/site-smoke.mjs (`--only world` runs it alone); scripts/smoke/harness.mjs is what it is handed.
 */
import fs from 'node:fs';
import path from 'node:path';

export default async function world({ ROOT, check, AXE, axeRun, dev, browser, watch, serveTemoin }) {
  /* ------------------------------------- the world shell (docs/WORLD.md) -- */
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
  // A bare address, in a tab that never chose: what the site ships.
  await w.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await w.waitForFunction(() => window.radioTower?.world?.current === 'radio' && window.radioTower.player?.onAir, null, { timeout: 10000 });
  const landed = { ...(await shot('radio')), tags: await w.$$eval('.w-tags .w-tag', (els) => els.length) };
  // One tag per window on the public map: today's pages as the published map lists them (ten since the evening of
  // 2026-11-01). The versions of the past are the private view's (the Atelier): no tag, no window here.
  const mapTags = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data/layout.json'), 'utf8')).pages.filter((p) => p.era !== 'past').length;
  check(`world shell, the default (a bare address): ${mapTags} tags, Radio current, the camera already there — no flight on a cold link`, landed.tags === mapTags && landed.current === 'radio'
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
      whole: live[0] ? live[0].scrollHeight <= live[0].clientHeight + 2 : false,
      main: v.children.length === 0 && v.inert && getComputedStyle(v).visibility === 'hidden',
    };
  });
  const hosted = { ...(await hosting()), onair: await w.evaluate(() => Boolean(document.querySelector('#w-radio .w-box .onair'))) };
  // Since 2026-11-01 a window shows its page whole: at 1:1 when it fits, drawn smaller when it does not — never below 0.62.
  check(`…the page opens in its district: Radio's window holds the whole on-air card, nothing to scroll (1:1, or smaller to fit, ≥ 0.62), a door in each of the ${mapTags - 1} others, <main> empty and inert`, hosted.live.join() === 'radio'
    && hosted.onair && hosted.doors === mapTags - 1 && hosted.asleep === 0 && hosted.scale >= 0.61 && hosted.scale <= 1.01 && hosted.whole && hosted.main, JSON.stringify(hosted));

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
    layer: document.querySelector('.w-plane').style.willChange, flip: document.querySelector('.w-flip')?.dataset.last, flipMs: Number(document.querySelector('.w-flip')?.dataset.ms) }));
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
  check('…and the crossing plays the channel flip (MB-05), toward Echo, under 300 ms, hidden from assistive technology', midFlight.flip === 'echo' && midFlight.flipMs > 0 && midFlight.flipMs <= 300
    && await w.evaluate(() => document.querySelector('.w-flip').getAttribute('aria-hidden') === 'true' && getComputedStyle(document.querySelector('.w-flip')).pointerEvents === 'none'), JSON.stringify({ flip: midFlight.flip, ms: midFlight.flipMs }));
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
  await settled('portfolio');
  const walk2 = await shot('portfolio');
  // Since 2026-11-03 Articles has an address of its own (its list), and the Archive follows it.
  check('→ walks the map: Articles opens its list, the Archive its address', walk1.current === 'articles' && walk1.path === '/echo/articles' && walk1.centre < 30
    && walk2.current === 'portfolio' && walk2.path === '/portfolio' && walk2.centre < 30, `${walk1.path} → ${walk2.path}`);

  await w.reload({ waitUntil: 'domcontentloaded' });
  await w.waitForFunction(() => window.radioTower?.world?.current === 'portfolio', null, { timeout: 10000 }).catch(() => {});
  const reloaded = await shot('portfolio');
  check('a reload keeps the world for the tab and lands without a flight', reloaded.current === 'portfolio' && reloaded.centre < 30 && reloaded.filter === ''
    && await w.evaluate(() => !window.radioTower.world.camera.moving), JSON.stringify(reloaded));
  await w.goBack({ waitUntil: 'domcontentloaded' });
  await settled('radio');
  const back = await shot('radio');
  check('Back flies back to where the reader was', back.current === 'radio' && back.path === '/radio' && back.centre < 30, back.path);

  // The plane is one board: beside Radio, the edge of Ondes shows. A click on it (not on its door's link) opens
  // Ondes itself, as its tag does — not the door that asks to open what is already in view (Ortis, 2026-11-03).
  const beside = await w.evaluate(() => {
    const win = document.getElementById('w-ondes');
    const r = win.getBoundingClientRect();
    for (let x = Math.min(innerWidth, r.right) - 12; x > Math.max(0, r.left); x -= 14) {
      for (let y = Math.max(80, r.top + 40); y < Math.min(innerHeight - 90, r.bottom); y += 23) {
        const hit = document.elementFromPoint(x, y);
        if (hit && win.contains(hit) && !hit.closest('.w-door a, .w-copy, .w-tag')) return { x, y, seen: true };
      }
    }
    return { seen: false };
  });
  if (beside.seen) {
    await w.mouse.click(beside.x, beside.y);
    await settled('ondes');
    await w.waitForFunction(() => document.querySelector('#w-ondes .w-box > .page'), null, { timeout: 8000 }).catch(() => {});
  }
  const besideOpen = { ...beside, ...(await shot('ondes')), ...(await w.evaluate(() => ({
    page: Boolean(document.querySelector('#w-ondes .w-box > .page')), door: Boolean(document.querySelector('#w-ondes .w-rest')),
    radioDoor: Boolean(document.querySelector('#w-radio .w-rest')) || Boolean(document.querySelector('#w-radio .w-box[inert]')),
  }))) };
  check('a click on the window beside the open one opens its page, as its tag does — not its door',
    besideOpen.seen && besideOpen.path === '/ondes' && besideOpen.current === 'ondes' && besideOpen.centre < 30 && besideOpen.page && !besideOpen.door && besideOpen.radioDoor, JSON.stringify(besideOpen));
  await w.goBack({ waitUntil: 'domcontentloaded' });
  await settled('radio');

  // The minimap and « Écran » are the private view's since 2026-11-01: none in the public world, both in the Atelier's tab.
  const publicHud = await w.evaluate(() => ({ minimap: getComputedStyle(document.querySelector('.w-minimap')).display, screen: getComputedStyle(document.querySelector('.w-screen-btn')).display,
    past: document.querySelectorAll('.w-past-d, .w-tag-past').length, band: !document.querySelector('.w-strata') || getComputedStyle(document.querySelector('.w-strata')).display === 'none' }));
  check('the public world has no minimap, no « Écran », no versions of the past', publicHud.minimap === 'none' && publicHud.screen === 'none' && publicHud.past === 0 && publicHud.band, JSON.stringify(publicHud));
  const pv = await wctx.newPage();
  watch(pv, 'private');
  await pv.goto(dev + 'radio?atelier=1', { waitUntil: 'domcontentloaded' });
  await pv.waitForFunction(() => window.radioTower?.world?.current === 'radio' && !window.radioTower.world.camera.moving, null, { timeout: 10000 }).catch(() => {});
  const atlasAt = await pv.evaluate(async () => {
    const m = document.querySelector('.w-minimap');
    const r = m.getBoundingClientRect();
    // Where the Atlas stands on the map as published (it moved under Playlists on 2026-11-01).
    const { byId, WORLD } = await import(new URL('js/world/layout.js', document.baseURI).href);
    const d = byId('atlas');
    // The world's height is the map's (taller with the past band): the minimap's own viewBox says it.
    return { x: r.left + r.width * ((d.x + d.w / 2) / WORLD.w), y: r.top + r.height * ((d.y + d.h / 2) / m.viewBox.baseVal.height) };
  });
  await pv.mouse.click(atlasAt.x, atlasAt.y);
  await pv.waitForFunction(() => window.radioTower?.world?.current === 'atlas' && !window.radioTower.world.camera.moving, null, { timeout: 8000 }).catch(() => {});
  const viaMap = await pv.evaluate(() => ({ path: location.pathname, current: window.radioTower.world.current }));
  await pv.close();
  await w.click('.w-switch button:nth-of-type(2)');
  await settled('une');
  const viaSwitch = await shot('une');
  check('the minimap (in the private view) and the Zone ⇄ Echo switch fly there too', viaMap.path === '/atlas' && viaMap.current === 'atlas' && viaSwitch.path === '/echo' && viaSwitch.pressed === 'Echo',
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
  const pans = ['ondes', 'playlists', 'atlas', 'une', 'articles', 'portfolio', 'booth', 'playlists', 'radio', 'portfolio',
    'booth', 'une', 'radio', 'articles', 'atlas', 'ondes', 'une', 'playlists', 'articles', 'radio'];
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
      swaps: window.__worldSwaps, sinceSwap: Math.round(performance.now() - window.__worldSwap) };
  })) };
  // The last reading follows the same rule as each pan: paused only counts as a cut away from a track change. On 25/10
  // it went red with every pan tuned and a drift of −0.47 s, which places the reading in the gap between a file's end
  // and the clock's rollover (the file a little shorter than its listed length): the player waiting by design, not a cut.
  check('20 pans, half of them cut short: the radio never stops (same <audio>, never muted, playing at every pan but a track change, on the station\'s second)',
    tunedThrough === 20 && after20.same && (!after20.paused || after20.sinceSwap < 1500) && after20.muted === 0 && Math.abs(after20.d) < 1.5,
    `${tunedThrough}/20 tuned, ${after20.swaps} track change(s), drift ${after20.d.toFixed(2)}s, ${after20.paused ? `paused ${after20.sinceSwap} ms after a track change` : 'playing'}`
      + `${after20.same ? '' : ', a new <audio>'}${after20.muted ? `, stopped ${after20.muted}×` : ''}`);
  check('…and one page is live at the end — Radio\'s, in its window; every page left behind is a door again', after20.path === '/radio' && after20.live.join() === 'radio'
    && after20.doors === mapTags - 1 && after20.asleep === 0, JSON.stringify(after20));

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
  // Since 2026-11-10 /antenna is the Antenna (and /zone, its old address, still lands in that window); /atlas is Echo's; since 11-03 the Portfolio is Echo's Archive, every room in its window;
  // Articles has its list, a clipping and a text open in it; the old Lectures and Archives addresses lead to the Archive.
  const coldRoutes = [['', 'radio'], ['radio', 'radio'], ['ondes', 'ondes'], ['echoes', 'ondes'], ['antenna', 'zone'], ['zone', 'zone'], ['atlas', 'atlas'], ['portfolio', 'portfolio'],
    ['portfolio/photos', 'portfolio'], ['playlists', 'playlists'], ['booth', 'booth'], ['echo', 'une'], ['echo/dont-shoot-the-pianist', 'articles'],
    ['echo/articles', 'articles'], ['echo/presse/2024-07-19-p1', 'articles'], ['echo/lectures/voyages', 'articles'],
    ['echo/lectures', 'portfolio'], ['ecrits', 'portfolio'], ['echo/archives', 'portfolio'], ['nulle-part', null]];
  const coldMiss = [];
  // axe on each of them too: since phase 5b these are the pages everyone gets on a laptop.
  const worldA11y = [];
  for (const [route, id, says = /Rien ici/] of coldRoutes) {
    await w.goto(dev + route, { waitUntil: 'domcontentloaded' });
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
    const ok = id ? r.current === id && !r.lost && r.centre < 30 : r.lost && says.test(await w.textContent('.w-lost'));
    if (!ok || r.pages !== 1 || r.text <= 20) coldMiss.push(`/${route} ${JSON.stringify(r)}`);
    for (const v of (await axeRun(w)) || []) worldA11y.push(`desktop /${route}: ${v}`);
  }
  check(`every route answers on a cold link with no query, in its district, its page the only one live (${coldRoutes.length} addresses; an unknown one opens over the map)`, coldMiss.length === 0,
    coldMiss.slice(0, 2).join(' | '));


  // Phase 4: the Echo skin — the Gazette in its windows, its figures and ash on the paper, the torn seam,
  // the links that cross it, and Archives.
  await w.goto(dev + 'echo', { waitUntil: 'domcontentloaded' });
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
      go: box.querySelector('.echo-onair a.echo-go')?.getAttribute('href'), teaser: box.querySelectorAll('a[href^="echo/lectures"]').length,
      groups: [...box.querySelectorAll('.echo-groups .echo-group')].map((g) => g.getAttribute('href')),
      cols: getComputedStyle(box.querySelector('.echo-cols')).gridTemplateColumns.split(' ').length,
      tab: getComputedStyle(document.querySelector('#w-une .w-wt')).fontFamily.split(',')[0],
      figures: document.querySelectorAll('.w-figures .w-fig use').length, ash: window.radioTower.world.ash, drawn: a1.n, moved: a0.h !== a1.h,
      ground: getComputedStyle(document.querySelector('.w-ground')).opacity, tear: getComputedStyle(document.querySelector('.w-tear:not(.w-rim)')).opacity,
    };
  });
  check('Echo skin: the Une opens as the bare Gazette in its window — masthead and lead, no night sides, ash or Zone/Média line of its own; the window is the sheet',
    echoSkin.bare && echoSkin.own === 0 && echoSkin.stage === 'none rgba(0, 0, 0, 0)' && /^none 0px$/.test(echoSkin.col) && echoSkin.mast && echoSkin.lead
    && /Old Standard TT/.test(echoSkin.tab), JSON.stringify(echoSkin));
  // Since 2026-11-03 (evening) the column no longer teases Lectures: the texts are found in the Livre miroir. Under the lead, the press series.
  check('…beside the lead, « À l\'antenne »: what Zone plays right now and the way back to the radio — no way to the texts; under it, the two press series', echoSkin.onair === echoSkin.playing
    && echoSkin.go === 'radio' && echoSkin.teaser === 0 && echoSkin.cols === 2 && echoSkin.groups.join() === 'echo/articles#metro,echo/articles#jogos',
    JSON.stringify({ onair: echoSkin.onair, playing: echoSkin.playing, go: echoSkin.go, teaser: echoSkin.teaser, cols: echoSkin.cols, groups: echoSkin.groups }));
  // The silhouettes came off on 2026-11-07 (Ortis: the flag beside the Atlas, the black shape beside the Une): plain paper.
  check('…Echo\'s paper is plain — no silhouettes on it — and its ash falls behind the windows (the plane\'s paper has faded into the far layer)',
    echoSkin.figures === 0 && echoSkin.ash && echoSkin.drawn > 2 && echoSkin.moved && echoSkin.ground === '0' && echoSkin.tear === '0', JSON.stringify(echoSkin));

  if (!(await w.evaluate(() => window.radioTower.player.playing))) await w.click('#mbTune');
  await w.waitForFunction(() => { const au = document.getElementById('audio'); return !au.paused && au.currentTime > 0.3; }, null, { timeout: 10000 }).catch(() => {});
  await w.evaluate(() => { window.__worldAudio = document.getElementById('audio'); });
  await w.click('#w-une .echo-onair a.echo-go');
  await settled('radio');
  await w.waitForFunction(() => !window.radioTower.world.ash, null, { timeout: 3000 }).catch(() => {});
  // The fixture's tracks last 22–34 s: read at a track change, the element is paused for the instant the next file
  // takes over (GitHub, 2026-11-17: « paused »: true at 0.17 s from the clock). Wait for it to be playing — four
  // seconds, the same element — then read; a radio that really stopped still fails (BACKLOG B5).
  await w.waitForFunction(() => { const au = document.getElementById('audio'); return au === window.__worldAudio && !au.paused; }, null, { timeout: 4000 }).catch(() => {});
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
  // The dials behind the side menus (2026-11-17): each centred on its screen edge, level with its own tags — the
  // live site once drew both 400 px low after a slow load. Measured as drawn, not as written.
  await w.waitForTimeout(2300); // past the dials' settling (dials.js settle)
  const dialsAt = await w.evaluate(() => {
    const span = (half) => {
      const r = [...document.querySelectorAll(`.w-tag[data-half="${half}"]:not(.w-tag-past):not(.w-off)`)].map((b) => b.getBoundingClientRect());
      return { top: Math.min(...r.map((b) => b.top)), bottom: Math.max(...r.map((b) => b.bottom)) };
    };
    const at = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b ? { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: Math.round(b.width) } : null; };
    const cur = document.querySelector('.w-tag[aria-current="true"]');
    const sh = cur && document.querySelector(`.w-shard[data-half="${cur.dataset.half}"]`);
    const mid = (b) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
    const shard = sh && (() => { const t = cur.firstElementChild.getBoundingClientRect(), b = sh.getBoundingClientRect(), m = mid(b);
      return { on: sh.classList.contains('on'), over: m.x >= t.left && m.x <= t.right && m.y >= t.top && m.y <= t.bottom, sel: cur.classList.contains('w-sel'), hidden: sh.getAttribute('aria-hidden') }; })();
    return { zone: at('.w-dial-zone .w-dial-rim'), echo: at('.w-dial-echo .w-dial-rim'), zoneTags: span('zone'), echoTags: span('echo'), width: innerWidth, hidden: document.querySelector('.w-dials')?.getAttribute('aria-hidden'),
      needles: document.querySelectorAll('.w-needle-turn').length, shard, amber: cur ? getComputedStyle(cur.firstElementChild).boxShadow : null };
  });
  const level = (d, s) => Boolean(d) && d.y >= s.top && d.y <= s.bottom;
  check("the dials behind the side menus: Zone's on the left edge and Echo's on the right, each level with its own tags, each with its needle, hidden from assistive technology",
    level(dialsAt.zone, dialsAt.zoneTags) && Math.abs(dialsAt.zone.x) <= 2 && level(dialsAt.echo, dialsAt.echoTags) && Math.abs(dialsAt.echo.x - dialsAt.width) <= 2 && dialsAt.hidden === 'true' && dialsAt.needles === 4,
    JSON.stringify(dialsAt));
  check("the current tag wears its half's shard (MB-01), drawn over it and hidden from assistive technology; the amber ring is gone",
    Boolean(dialsAt.shard?.on && dialsAt.shard.over && dialsAt.shard.sel) && dialsAt.shard.hidden === 'true' && !/196, 161, 96/.test(dialsAt.amber || ''), JSON.stringify({ shard: dialsAt.shard, amber: dialsAt.amber }));
  // The station clock in Zone's corner (MB-09) and the name running behind the open window's header (MB-04).
  const corner = await w.evaluate(() => ({ badge: document.querySelector('.w-badge')?.getAttribute('aria-label') || '', day: document.querySelector('.w-badge b')?.textContent,
    marq: getComputedStyle(document.querySelector('.w-district.here .w-marq span') || document.body).animationName, still: [...document.querySelectorAll('.w-district:not(.here) .w-marq span')].every((s) => getComputedStyle(s).animationName === 'none') }));
  check('Zone’s corner shows the station’s day (MB-09), and only the open window runs its name behind its header (MB-04)',
    /heure de Paris$/.test(corner.badge) && Number(corner.day) >= 1 && corner.marq === 'w-marq' && corner.still, JSON.stringify(corner));
  // The boat (F1), behind ?boat=1, on a page of its own: it stands instead of the map, the page opens on its thing,
  // Stop time freezes the scene and offers every place, and a place chosen there opens its page at its address.
  const aboard = await w.evaluate(() => document.querySelector('.w-aboard')?.getAttribute('href'));
  const boatCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bp = await boatCtx.newPage();
  watch(bp, 'the boat');
  // In front, or headless Chrome draws its frames seconds apart, as for any page behind another (2026-11-18).
  await bp.bringToFront();
  // Aboard by the map's own button, clicked (2026-11-22: the router caught that click and the boat never came; this
  // check used to open ?boat=1 directly and could not see it).
  await bp.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await bp.evaluate(() => { try { sessionStorage.setItem('gt.boat.seen', '1'); } catch { /* the arrival then plays: slower, still checked */ } });
  await bp.waitForSelector('.w-aboard', { timeout: 15000 }).catch(() => {});
  await bp.click('.w-aboard', { timeout: 15000 }).catch(() => {});
  await bp.waitForFunction(() => window.radioTower?.world?.current === 'radio' && document.querySelector('.b-panel') && !document.querySelector('.b-panel').hidden, null, { timeout: 45000 }).catch(() => {});
  const boat1 = await bp.evaluate(() => ({ root: Boolean(document.querySelector('.b-root')), map: Boolean(document.querySelector('.w-root')), page: Boolean(document.querySelector('.b-box .page')), place: window.radioTower.world.current }));
  await bp.keyboard.press('Escape');
  await bp.waitForFunction(() => document.querySelectorAll('.b-lb').length >= 7, null, { timeout: 45000 }).catch(() => {});
  const boat2 = await bp.evaluate(() => ({ frozen: document.querySelector('.b-root').classList.contains('frozen'), labels: document.querySelectorAll('.b-lb').length }));
  await bp.click('.b-lb[data-go="playlists"]', { timeout: 45000 }).catch(() => {});
  await bp.waitForFunction(() => location.pathname === '/playlists' && window.radioTower.world.current === 'playlists', null, { timeout: 45000 }).catch(() => {});
  const boat3 = await bp.evaluate(() => ({ path: location.pathname, place: window.radioTower.world.current, page: Boolean(document.querySelector('.b-box .page')) }));
  check('the boat, behind ?boat=1 (F1): the map\'s button takes you aboard; Radio opens on the laptop, Stop time freezes the scene and offers every place, Playlists opens on the phone at its address',
    aboard === '?boat=1' && boat1.root && !boat1.map && boat1.page && boat1.place === 'radio' && boat2.frozen && boat2.labels >= 7
    && boat3.path === '/playlists' && boat3.place === 'playlists' && boat3.page, JSON.stringify({ aboard, boat1, boat2, boat3 }));
  // No plane drawn across the eye, at any place (2026-11-22: near the little phone, planes straddling the camera were
  // drawn 380,000 px wide and an ordinary laptop drew one frame a second; CSS 3D has no near clipping of its own).
  await bp.evaluate(() => { const b = [...document.querySelectorAll('.b-dock button')].find((x) => /Resume/.test(x.textContent)); b?.click(); });
  const sizes = {}, onThing = {};
  for (const [r, k] of [['radio', 'radio'], ['playlists', 'playlists'], ['antenna', 'antenna'], ['ondes', 'ondes'], ['booth', 'booth'], ['echo', 'echo'], ['portfolio/crates', 'drawer']]) {
    await bp.evaluate((p) => window.radioTower.router.go('/' + p), r);
    await bp.waitForFunction((p) => window.radioTower.world.current === p && !document.querySelector('.b-panel').hidden, k, { timeout: 30000 }).catch(() => {});
    await bp.waitForTimeout(400);
    sizes[k] = await bp.evaluate(() => +[...document.querySelectorAll('.b-cam > *')].filter((e) => e.style.visibility !== 'hidden')
      .map((e) => e.getBoundingClientRect()).reduce((m, b) => Math.max(m, b.width / innerWidth, b.height / innerHeight), 0).toFixed(1));
    if (k === 'drawer') await bp.waitForSelector('.b-panel .crate-drawer .sleeve', { timeout: 10000 }).catch(() => {});
    onThing[k] = await bp.evaluate(() => {
      const p = document.querySelector('.b-panel'), b = p.getBoundingClientRect();
      return { on: p.classList.contains('on-thing') && /matrix3d/.test(p.style.transform), area: +(b.width * b.height / (innerWidth * innerHeight)).toFixed(2), racks: Boolean(p.querySelector('.crate-drawer .sleeve')) };
    });
  }
  check('…and at every place no plane of the boat is drawn wider or taller than eight screens (the near clipping)',
    Object.keys(sizes).length === 7 && Object.values(sizes).every((v) => v > 0 && v <= 8), JSON.stringify(sizes));
  // The windows on their things (Ortis, 2026-11-24: « make each window as big as possible … angle the windows to make it
  // seem the object they emanate from are really in this world »): each page is laid onto its thing's own surface, and
  // large; the Crates open in the drawer under Echo's desk, on their records. The phone's page stays flat (too small).
  check('…every page is laid onto its thing, at an angle and large (the laptop, the screen, the scroll, the lantern, the paper, the drawer of records)',
    ['radio', 'antenna', 'ondes', 'booth', 'echo', 'drawer'].every((k) => onThing[k]?.on && onThing[k].area >= 0.18) && !onThing.playlists?.on && onThing.drawer?.racks,
    JSON.stringify(onThing));
  // The Antenna's lever (2026-11-22): beside the page, in reach; pulled, the next stream, the lever at its angle.
  await bp.evaluate(() => window.radioTower.router.go('/antenna'));
  await bp.waitForFunction(() => window.radioTower.world.current === 'antenna' && !document.querySelector('.b-panel').hidden, null, { timeout: 30000 }).catch(() => {});
  await bp.waitForTimeout(600);
  // The camera may still be settling on a slow runner (red once on GitHub, 3711442, with the same boat green on 25cf7ce):
  // wait, up to 10 s, until the lever is the thing under its own handle, then read it. A lever that never comes into reach still fails.
  await bp.waitForFunction(() => {
    const p = document.querySelector('.rk-pull'); if (!p || p.hidden) return true;
    const r = p.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width * 0.2, r.y + r.height * 0.75);
    return Boolean(hit && p.contains(hit));
  }, null, { timeout: 10000 }).catch(() => {});
  const lever0 = await bp.evaluate(() => {
    const p = document.querySelector('.rk-pull'); if (!p) return null;
    const r = p.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width * 0.2, r.y + r.height * 0.75);
    return { hidden: p.hidden, reach: Boolean(hit && p.contains(hit)), arm: document.querySelector('.rk-lever').style.transform, label: p.getAttribute('aria-label'), ch: window.radioTower.client?.channel ?? null };
  });
  let lever1 = null;
  if (lever0 && !lever0.hidden) {
    await bp.evaluate(() => document.querySelector('.rk-pull').click());
    await bp.waitForFunction((was) => (window.radioTower.client?.channel ?? null) !== was, lever0.ch, { timeout: 10000 }).catch(() => {});
    await bp.waitForTimeout(300);
    lever1 = await bp.evaluate(() => ({ arm: document.querySelector('.rk-lever').style.transform, ch: window.radioTower.client?.channel ?? null, live: document.querySelector('.b-root').classList.contains('live'), say: document.querySelector('.b-say').textContent }));
  }
  check('…the Antenna\'s lever stands beside its page, in reach, and pulled it tunes the next stream and turns to it, the cables lit',
    Boolean(lever0) && (lever0.hidden ? /Streams lever/.test(lever0.label) : lever0.reach && lever1 && lever1.ch !== lever0.ch && lever1.arm !== lever0.arm && lever1.live && /^Now on /.test(lever1.say)),
    JSON.stringify({ lever0, lever1 }));
  // The things themselves (Ortis, 2026-11-22: « the boat button still doesn't work »): a real click on the little phone,
  // seen from the laptop, goes to Playlists. The lever, just pulled, left the Antenna where it was.
  const afterLever = await bp.evaluate(() => window.radioTower.world.current);
  await bp.evaluate(() => window.radioTower.router.go('/radio'));
  await bp.waitForFunction(() => window.radioTower.world.current === 'radio' && !document.querySelector('.b-panel').hidden, null, { timeout: 30000 }).catch(() => {});
  await bp.waitForTimeout(600);
  const phoneAt = await bp.evaluate(() => {
    const ph = document.querySelector('.b-cam .ph[data-go="playlists"]'); if (!ph) return null;
    const r = ph.getBoundingClientRect();
    for (let fy = 0.2; fy < 0.95; fy += 0.1) for (let fx = 0.2; fx < 0.9; fx += 0.15) {
      const x = r.x + r.width * fx, y = r.y + r.height * fy, hit = document.elementFromPoint(x, y);
      if (hit && ph.contains(hit)) return { x, y };
    }
    return { x: -1, y: -1 };
  });
  if (phoneAt && phoneAt.x >= 0) await bp.mouse.click(phoneAt.x, phoneAt.y);
  await bp.waitForFunction(() => window.radioTower.world.current === 'playlists', null, { timeout: 30000 }).catch(() => {});
  const byThing = await bp.evaluate(() => ({ place: window.radioTower.world.current, path: location.pathname, tagged: [...new Set([...document.querySelectorAll('.b-cam [data-go]')].map((e) => e.dataset.go))].sort().join(' ') }));
  check('…and the things themselves are the way in: a click on the little phone opens Playlists, every place has its thing, and the lever does not move you',
    afterLever === 'antenna' && Boolean(phoneAt) && phoneAt.x >= 0 && byThing.place === 'playlists' && byThing.path === '/playlists'
    && byThing.tagged === 'antenna booth drawer echo ondes playlists radio', JSON.stringify({ afterLever, phoneAt, byThing }));
  await boatCtx.close();
  // The sky on the station's clock (2026-11-22), at a night given by the address: the stars out, the boat in the dark,
  // the lake listening to the visualiser (which rests behind it).
  const nightCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const np2 = await nightCtx.newPage();
  watch(np2, 'the boat at night');
  await np2.bringToFront();
  await np2.goto(dev + 'radio?boat=1&sky=23:30', { waitUntil: 'domcontentloaded' });
  await np2.waitForFunction(() => window.radioTower?.world?.sky && window.radioTower.world.frames > 10, null, { timeout: 45000 }).catch(() => {});
  const night = await np2.evaluate(() => {
    const w = window.radioTower.world, heard = window.radioTower.stage?.listen?.(performance.now());
    return { star: w.sky?.star, cls: document.querySelector('.b-root').classList.contains('night'), filter: document.querySelector('.b-view').style.filter, err: w.lastError, heard: heard && typeof heard.low === 'number' && typeof heard.hit === 'number' };
  });
  await nightCtx.close();
  check('…and at 23:30 by the station\'s clock the night is out: the stars, the boat in the dark, the lake listening to the music, no error',
    night.star > 0.9 && night.cls && /brightness/.test(night.filter) && !night.err && night.heard, JSON.stringify(night));
  // The track-change caption (MB-03) and the drawn cover (MB-10), on a page of their own, so the made-up track
  // touches nothing else the smoke goes on to check.
  const capCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const cp = await capCtx.newPage();
  await cp.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await cp.waitForFunction(() => window.radioTower?.player?.onAir, null, { timeout: 10000 }).catch(() => {});
  const capd = await cp.evaluate(async () => {
    const p = window.radioTower.player;
    const el = document.querySelector('.cap');
    const send = (n) => p.dispatchEvent(new CustomEvent('track', { detail: { ...p.onAir, id: `smoke-caption-${n}`, title: 'Caption check', artist: 'Unknown artist', artUrl: null, hasArt: false, startsAt: Date.now() } }));
    send(0);
    // What the event sets at once, read before anything else can happen.
    const now = { shown: el.classList.contains('in'), who: el.querySelector('.cap-who').textContent, live: document.querySelector('.cap-live').textContent,
      blank: Boolean(el.querySelector('.cap-art svg.blank')), clicks: getComputedStyle(el).pointerEvents, hidden: el.getAttribute('aria-hidden') };
    // Then the scramble settles. The fixture tracks are short: a real change may take the caption first (2026-11-18,
    // « Low Band » replaced it); then the made-up track is sent again, three times at most. Waited on a condition.
    let settled = false;
    for (let n = 1; n <= 3 && !settled; n++) {
      for (let t = 0; t < 20 && !settled; t++) {
        await new Promise((r) => setTimeout(r, 100));
        if (el.querySelector('.cap-what b').textContent === 'Caption check') settled = true;
        else if (!document.querySelector('.cap-live').textContent.includes('Caption check')) break;
      }
      if (!settled) send(n);
    }
    return { ...now, settled };
  });
  await capCtx.close();
  check('a track change brings the caption (MB-03): the title settles, an unnamed artist is named, the drawn cover, read politely, no clicks taken',
    capd.shown && capd.settled && capd.who === 'Anonymous transmission' && capd.live === 'Now playing: Caption check, Anonymous transmission'
    && capd.blank && capd.clicks === 'none' && capd.hidden === 'true', JSON.stringify(capd));
  check('…seen from Zone, Echo\'s paper is the ground again, its edge torn over a thin red rim', crossed.ground === '1' && crossed.tear === '1' && crossed.mask
    && crossed.rim === 'rgb(163, 22, 31)', JSON.stringify({ ground: crossed.ground, tear: crossed.tear, mask: crossed.mask, rim: crossed.rim }));

  // Archives went into Articles (the press) and the Archive (the Bibliothèque renamed) on 2026-11-03 (evening).
  await w.click('.w-tag[data-go="articles"]');
  await settled('articles');
  await w.waitForFunction(() => document.querySelector('#w-articles .w-box .echo-series .echo-clip'), null, { timeout: 8000 }).catch(() => {});
  const arch = { ...(await shot('articles')), ...(await w.evaluate(async () => {
    const places = (await (await fetch('data/places.json')).json()).places;
    const want = places.reduce((n, p) => n + (p.press?.column?.items?.length || 0) + (p.press?.series?.items?.length || 0), 0);
    const box = document.querySelector('#w-articles .w-box');
    return { want, press: box.querySelectorAll('.echo-series .echo-clip[href^="echo/presse/"]').length, articles: box.querySelectorAll('.echo-grid .echo-card[href^="echo/"]').length,
      series: [...box.querySelectorAll('.echo-series h2')].map((h) => h.textContent).join(' | '), feed: box.querySelector('a[href="echo/feed.xml"]') !== null,
      bare: Boolean(box.querySelector('.echo-in-world')) };
  })) };
  check('Articles (E-02) has an address since 2026-11-03: its tag opens /echo/articles — every article, then every piece of press on the Atlas\'s cards under its series, the feed',
    arch.path === '/echo/articles' && arch.current === 'articles' && arch.centre < 30 && arch.want >= 26 && arch.press === arch.want && arch.articles >= 1
    && arch.series === 'Um passeio de metrô por Paris | Jogos Olímpicos' && arch.feed && arch.bare, JSON.stringify(arch));
  await w.click('#w-articles .w-box .echo-clip[href="echo/presse/2024-07-19-p1"]');
  await w.waitForFunction(() => location.pathname === '/echo/presse/2024-07-19-p1' && document.querySelector('#w-articles .w-box .echo-presse .echo-scan'), null, { timeout: 8000 }).catch(() => {});
  const clipW = await shot('articles');
  check('…a clipping opens in the same window, at its own address', clipW.current === 'articles' && clipW.path === '/echo/presse/2024-07-19-p1' && clipW.centre < 30, JSON.stringify(clipW));
  await w.click('.w-tag[data-go="portfolio"]');
  await w.waitForFunction(() => location.pathname === '/portfolio' && window.radioTower.world.current === 'portfolio' && !window.radioTower.world.camera.moving
    && document.querySelector('#w-portfolio .w-box > .page .room .book.mirror') && document.querySelector('#w-portfolio .w-box .maptable .mt-sheet'), null, { timeout: 10000 }).catch(() => {});
  const toPortfolio = await w.evaluate(() => {
    const au = document.getElementById('audio');
    const win = document.getElementById('w-portfolio');
    return { path: location.pathname, current: window.radioTower.world.current, same: au === window.__worldAudio, paused: au.paused,
      title: win?.querySelector('.w-wt')?.textContent, code: win?.querySelector('.w-cd')?.textContent, books: win?.querySelectorAll('.room .book').length || 0,
      table: win?.querySelectorAll('.maptable > .mt-scene .mt-sheet').length || 0, tabs: [...(win?.querySelectorAll('.room-tabs a') || [])].map((x) => x.textContent).join(),
      lost: !document.querySelector('.w-lost')?.hidden, echo: document.body.classList.contains('on-echo') };
  });
  // The Portfolio left Zone's side on 2026-11-01, came back on Echo's as the Bibliothèque (E-06) on 11-03, and that evening became the Archive (E-04).
  check('…and the Archive\'s tag flies to its window on Echo (E-04): the shelves, the map table under them, two rooms, the radio still playing', toPortfolio.path === '/portfolio'
    && toPortfolio.current === 'portfolio' && toPortfolio.title === 'Archive' && toPortfolio.code === 'E-04' && toPortfolio.books >= 20 && toPortfolio.table >= 8
    && toPortfolio.tabs === 'Bibliothèque,Crates' && !toPortfolio.lost && toPortfolio.echo && toPortfolio.same && !toPortfolio.paused, JSON.stringify(toPortfolio));

  // R9's own check: an article prints from the world as a plain column. Measured at the paper's width (A4 at 96 dpi), then
  // printed to PDF. Until 2026-11-25 the yardstick was the same article printed from the classic shell (?classic=1); the
  // numbers it gave that day are the yardstick now (PRINT_COLUMN), so a change to the print rules still shows.
  const printOf = async (q) => {
    const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 } });
    const p = await ctx.newPage();
    watch(p, `print, ${q || 'default'}`);
    // the témoin carries notes, which the print must lay out alike: served as its fixture (serveTemoin)
    await serveTemoin(p);
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
  const printWorld = await printOf('');
  // What the classic print gave, on every run of 2026-11-24/25 (and the world's the same): article 0,794; h1 0,38,794,45;
  // body 0,613,760,699; notes 0,1329,794,107; 42.876px; 2 pages. The heights hang on the fonts a machine renders, so the
  // yardstick is the part that does not: the column at the paper's edge and full width, the body's 760, the headline's
  // size, headline above body above notes.
  const at = (b) => b.split(',').map(Number);
  const [h1, body, notes] = [printWorld.h1, printWorld.body, printWorld.notes].map(at);
  const column = printWorld.article === '0,794' && h1[0] === 0 && h1[2] === 794 && body[0] === 0 && body[2] === 760 && notes[0] === 0 && notes[2] === 794
    && printWorld.size === '42.876px' && h1[1] < body[1] && body[1] < notes[1];
  check('R9\'s check: an article prints from the world as a plain column — the column, headline, body and notes where the classic site laid them, nothing of the world on paper',
    printWorld.world && column && printWorld.shown.length === 0 && printWorld.pages >= 1, JSON.stringify(printWorld));

  await w.goto(dev + 'echo', { waitUntil: 'domcontentloaded' });
  await settled('une');
  for (const v of (await axeRun(w)) || []) worldA11y.push(`desktop, une: ${v}`);
  await w.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await settled('radio');
  for (const v of (await axeRun(w)) || []) worldA11y.push(`desktop, radio: ${v}`);

  // « Écran »: the screen menu — private since 2026-11-01 (the Atelier's tab). Four radio groups, arrows stay inside it.
  const pe = await wctx.newPage();
  watch(pe, 'private, Écran');
  await pe.goto(dev + 'radio?atelier=1', { waitUntil: 'domcontentloaded' });
  await pe.waitForFunction(() => window.radioTower?.world?.current === 'radio' && !window.radioTower.world.camera.moving && window.radioTower.atelier, null, { timeout: 10000 }).catch(() => {});
  await pe.click('.w-screen-btn');
  const opened3 = await pe.evaluate(() => {
    const p = document.getElementById('wScreen');
    return { shown: !p.hidden && p.getBoundingClientRect().height > 100, expanded: document.querySelector('.w-screen-btn').getAttribute('aria-expanded'),
      groups: p.querySelectorAll('[role="radiogroup"]').length, radios: p.querySelectorAll('[role="radio"]').length,
      focus: document.activeElement?.dataset.val || null, checked: document.activeElement?.getAttribute('aria-checked') };
  });
  await pe.keyboard.press('ArrowRight');
  await pe.keyboard.press('ArrowDown');
  const arrows = await pe.evaluate(() => ({ focus: document.activeElement?.dataset.val, current: window.radioTower.world.current, path: location.pathname }));
  check('« Écran » opens from the private view\'s HUD: 4 groups, 10 choices, focus on the current one; ← → ↑ ↓ move inside it and never walk the map',
    opened3.shown && opened3.expanded === 'true' && opened3.groups === 4 && opened3.radios === 10 && opened3.focus === 'grid' && opened3.checked === 'true'
    && arrows.focus === 'void' && arrows.current === 'radio' && arrows.path === '/radio', JSON.stringify({ opened3, arrows }));
  await pe.keyboard.press('Escape');
  const closed = await pe.evaluate(() => ({ hidden: document.getElementById('wScreen').hidden, focus: document.activeElement?.classList.contains('w-screen-btn') }));
  await pe.close();

  // The same four settings are everyone's in the Booth's Lights (2026-11-01): each applies at once and is remembered.
  await w.goto(dev + 'booth', { waitUntil: 'domcontentloaded' });
  await settled('booth');
  await w.waitForSelector('#w-booth .v-screen [data-screen]', { timeout: 8000 }).catch(() => {});
  const lights = await w.evaluate(() => ({
    groups: document.querySelectorAll('#w-booth .v-screen [role="radiogroup"]').length, radios: document.querySelectorAll('#w-booth .v-screen [role="radio"]').length,
    layers: document.querySelectorAll('#w-booth #bVisuals [data-layer]').length, looks: document.querySelectorAll('#w-booth #bVisuals [data-look]').length,
    sliders: document.querySelectorAll('#w-booth #bVisuals input[type=range]').length, first: document.querySelector('#w-booth .page > section')?.classList.contains('booth-lights'),
  }));
  check('the Booth\'s Lights come first and carry every visual setting: the looks, the nine layers, the tuning and the screen\'s four (10 choices)',
    lights.first && lights.groups === 4 && lights.radios === 10 && lights.layers >= 9 && lights.looks >= 6 && lights.sliders >= 5, JSON.stringify(lights));
  for (const [set, val] of [['bg', 'rain'], ['list', 'stack'], ['bub', 'none'], ['scan', 'off']]) await w.click(`#w-booth .v-screen [data-screen="${set}"][data-val="${val}"]`);
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
      booth: [...document.querySelectorAll('#w-booth .v-screen [aria-checked="true"]')].map((b) => b.dataset.val).join(),
    };
  });
  const chosen = await screened();
  check('…Rain, Stack, no bubbles, no scan lines from the Booth: each applies at once (rain falls, the tags stack down the left, the bubbles stop), the same choice « Écran » holds; Esc closed « Écran » back onto its button',
    chosen.bg === 'rain' && chosen.rain === 'w-rain' && chosen.list === 'stack' && chosen.stacked && chosen.bub === 'none' && !chosen.bubbles && chosen.scan === 'off'
    && !chosen.scanShown && chosen.checked === 'rain,none,stack,off' && chosen.booth === 'rain,none,stack,off' && closed.hidden && closed.focus, JSON.stringify({ chosen, closed }));
  await w.reload({ waitUntil: 'domcontentloaded' });
  await settled('booth');
  const kept = await screened();
  check('…and remembered by this browser after a reload', kept.bg === 'rain' && kept.list === 'stack' && kept.stacked && !kept.bubbles && !kept.scanShown, JSON.stringify(kept));
  await w.evaluate(() => localStorage.removeItem('gt.world.screen'));
  await w.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await settled('radio');

  // A tap on a notification while the site is open (sw.js, run in tests/site-push.test.js): the worker posts { type: 'go' }
  // and the page goes there with its own router — no reload, so the music would play on. Until 2026-11-25 a unit test
  // read main.js for the words; here the page is sent the message the worker sends.
  const goMsg = await w.evaluate(async () => {
    const before = { audio: document.getElementById('audio'), boots: performance.getEntriesByType('navigation').length };
    if (!navigator.serviceWorker) return { none: true };
    navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'go', route: 'echo/articles' } }));
    const t0 = performance.now();
    while (location.pathname !== '/echo/articles' && performance.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 50));
    return { path: location.pathname, at: window.radioTower.world?.current, sameAudio: document.getElementById('audio') === before.audio,
      sameDocument: performance.getEntriesByType('navigation').length === before.boots };
  });
  check('a notification tapped while the site is open: the page goes to the route the worker names, with its own router, no reload',
    goMsg.path === '/echo/articles' && goMsg.sameAudio && goMsg.sameDocument, JSON.stringify(goMsg));

  // The classic shell was retired on 2026-11-25 (until then ?classic=1 opened it, remembered for the tab as gt.world = '0').
  // Links to it were handed out: one still opens the world, and so does a tab that remembered the choice from before.
  const shellNow = () => w.evaluate(() => ({ world: Boolean(document.querySelector('.w-root')) && Boolean(window.radioTower.world),
    at: window.radioTower.world?.current || null, view: getComputedStyle(document.getElementById('view')).visibility, path: location.pathname }));
  await w.goto(dev + 'antenna?classic=1', { waitUntil: 'domcontentloaded' });
  await w.waitForFunction(() => window.radioTower?.world?.current === 'zone', null, { timeout: 10000 }).catch(() => {});
  const oldLink = await shellNow();
  await w.evaluate(() => { try { sessionStorage.setItem('gt.world', '0'); } catch { /* blocked: nothing to remember */ } });
  await w.goto(dev + 'atlas', { waitUntil: 'domcontentloaded' });
  await w.waitForFunction(() => window.radioTower?.world?.current === 'atlas', null, { timeout: 10000 }).catch(() => {});
  const oldTab = await shellNow();
  check('an old ?classic=1 link opens the world, and so does a tab that remembered the classic shell from before', oldLink.world && oldLink.at === 'zone'
    && oldLink.view === 'hidden' && oldTab.world && oldTab.at === 'atlas' && oldTab.view === 'hidden', JSON.stringify({ oldLink, oldTab }));
  await wctx.close();

  const still = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' })).newPage();
  watch(still, 'world, reduced motion');
  await still.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await still.waitForFunction(() => window.radioTower?.world?.current === 'radio', null, { timeout: 10000 });
  await still.click('.w-tag[data-go="portfolio"]');
  await still.waitForFunction(() => window.radioTower.world.current === 'portfolio', null, { timeout: 8000 }).catch(() => {});
  const cut = await still.evaluate(() => {
    const r = document.getElementById('w-portfolio').getBoundingClientRect();
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

  // Until 2026-11-24 this check also held the phone's findings (scripts/smoke/phone.mjs has its own now).
  if (AXE) check('world shell: no accessibility violations above minor (desktop: every cold-link address, the Une, Radio)', worldA11y.length === 0, worldA11y.slice(0, 3).join(' | ') || 'names, roles, landmarks, contrast');
}
