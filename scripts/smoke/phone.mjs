/**
 * The site smoke, phone: phones: the world shell upright and on its side (swipes, and what is not a swipe), the Archive, the mini-player, the world shell on every page.
 * One part of scripts/site-smoke.mjs (`--only phone` runs it alone); scripts/smoke/harness.mjs is what it is handed.
 */
export default async function phone({ check, AXE, axeRun, dev, browser, watch }) {
  const wm = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  watch(wm, 'world, phone');
  await wm.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
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
  // No boat on a phone (Ortis, 2026-11-22: « remove the boat option from the phone version only »): the way aboard is
  // not shown, and a ?boat=1 link opens the map.
  const noBoat1 = await wm.evaluate(() => ({ aboard: Boolean(document.querySelector('.w-aboard')), shown: document.querySelector('.w-aboard') ? getComputedStyle(document.querySelector('.w-aboard')).display !== 'none' : false }));
  const wb = await wm.context().newPage();
  watch(wb, 'world, phone, ?boat=1');
  await wb.goto(dev + 'radio?boat=1', { waitUntil: 'domcontentloaded' });
  await wb.waitForFunction(() => window.radioTower?.world?.current === 'radio', null, { timeout: 10000 }).catch(() => {});
  const noBoat2 = await wb.evaluate(() => ({ boat: Boolean(document.querySelector('.b-root')), map: Boolean(document.querySelector('.w-root')), kept: (() => { try { return sessionStorage.getItem('gt.boat'); } catch { return 'blocked'; } })() }));
  await wb.close();
  await wm.bringToFront();
  check('…and no boat there: the way aboard is not shown, and a ?boat=1 link opens the map, not remembered',
    noBoat1.aboard && !noBoat1.shown && !noBoat2.boat && noBoat2.map && noBoat2.kept === null, JSON.stringify({ ...noBoat1, ...noBoat2 }));
  const phoneSkin = await wm.evaluate(() => ({ screen: getComputedStyle(document.querySelector('.w-screen-btn')).display, glass: getComputedStyle(document.querySelector('#w-radio .w-win')).backdropFilter,
    bubbles: window.radioTower.world.bubbles.list.length }));
  check('…the Zone skin on a phone: no « Écran » in the public header (the Booth\'s Lights have its settings), clear glass, half the bubbles', phoneSkin.screen === 'none'
    && phoneSkin.glass === 'none' && phoneSkin.bubbles === 5, JSON.stringify(phoneSkin));
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
  // Phase 5: a swipe across the phone goes to the other half, as the switch does — real touches (CDP), not synthetic
  // events. Each touch carries the time the finger is meant to be there (the page reads the events' own timeStamp),
  // so a busy test machine delivering them late does not turn a quick swipe into a slow drag.
  const swipe = async (pg, x0, y0, x1, y1, { ms = 160 } = {}) => {
    const cdp = await pg.context().newCDPSession(pg);
    const t = Date.now() / 1000;
    const steps = [[x0, y0], [x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3], [x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3], [x1, y1]];
    for (const [i, [x, y]] of steps.entries()) {
      await cdp.send('Input.dispatchTouchEvent', { type: i ? 'touchMove' : 'touchStart', touchPoints: [{ x, y }], timestamp: t + (i * ms) / 3000 });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t + ms / 1000 });
    await cdp.detach();
    return ms;
  };
  const landedOn = (pg, id) => pg.waitForFunction((i) => window.radioTower.world.current === i && !window.radioTower.world.camera.moving, id, { timeout: 8000 }).catch(() => {});
  await wm.tap('#mbTune');
  await wm.waitForFunction(() => { const au = document.getElementById('audio'); return !au.paused && au.currentTime > 0.3; }, null, { timeout: 10000 }).catch(() => {});
  await wm.evaluate(() => { window.__swipeAudio = document.getElementById('audio'); });
  const swiped = { ms: [] };
  swiped.ms.push(await swipe(wm, 90, 520, 300, 530));
  await landedOn(wm, 'radio');
  swiped.right = await wm.evaluate(() => location.pathname);
  swiped.ms.push(await swipe(wm, 300, 520, 90, 510));
  await landedOn(wm, 'une');
  swiped.left = await wm.evaluate(() => location.pathname);
  await wm.waitForFunction(() => !document.getElementById('audio').paused, null, { timeout: 3000 }).catch(() => {});
  Object.assign(swiped, await wm.evaluate(() => {
    const au = document.getElementById('audio');
    const nav = document.querySelector('.w-tags');
    const cur = nav.querySelector('[aria-current]').getBoundingClientRect();
    return { same: au === window.__swipeAudio, playing: !au.paused && !au.muted, strip: cur.left >= 0 && cur.right <= innerWidth, scrolled: nav.scrollLeft > 0 };
  }));
  check('phone: a swipe to the right brings Zone (Radio), one to the left the Une — the radio plays on, the tag strip follows', swiped.right === '/radio'
    && swiped.left === '/echo' && swiped.same && swiped.playing && swiped.strip && swiped.scrolled, JSON.stringify(swiped));
  // What is not a swipe stays put: a scroll, a slow drag, the screen's edge, and a gesture something in the page takes itself.
  const stays = async (label, act) => {
    await act();
    await wm.waitForTimeout(500);
    const at = await wm.evaluate(() => [window.radioTower.world.current, location.pathname, window.radioTower.world.camera.moving]);
    return at[0] === 'une' && at[1] === '/echo' && !at[2] ? null : `${label} → ${at.join(' ')}`;
  };
  const unmoved = [];
  const top0 = await wm.evaluate(() => document.querySelector('#w-une .w-box').scrollTop);
  unmoved.push(await stays('scroll', () => swipe(wm, 200, 640, 150, 300)));
  const scrolledDown = await wm.evaluate((t) => document.querySelector('#w-une .w-box').scrollTop > t + 50, top0);
  unmoved.push(await stays('slow drag', () => swipe(wm, 90, 400, 320, 400, { ms: 900 })));
  unmoved.push(await stays('left edge', () => swipe(wm, 8, 400, 260, 400)));
  await wm.evaluate(() => {
    const box = document.querySelector('#w-une .w-box');
    const strip = Object.assign(document.createElement('div'), { id: 'swipeStrip' });
    strip.style.cssText = 'overflow-x:auto;height:120px';
    strip.innerHTML = '<div style="width:2400px;height:100px"></div>';
    const pad = Object.assign(document.createElement('div'), { id: 'swipePad' });
    pad.style.cssText = 'touch-action:none;height:120px';
    box.prepend(strip, pad);
    box.scrollTop = 0;
    strip.scrollLeft = 900;
  });
  const at = (sel) => wm.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  const [sx, sy] = await at('#swipeStrip');
  unmoved.push(await stays('a strip that scrolls sideways', () => swipe(wm, sx - 100, sy, sx + 120, sy)));
  const stripMoved = await wm.evaluate(() => document.getElementById('swipeStrip').scrollLeft < 900);
  const [px, py] = await at('#swipePad');
  unmoved.push(await stays('a drag surface (touch-action)', () => swipe(wm, px - 100, py, px + 120, py)));
  await wm.evaluate(() => { document.getElementById('swipeStrip').remove(); document.getElementById('swipePad').remove(); });
  check('…and what is not a swipe stays put: a scroll (the page scrolls), a slow drag, a start at the screen\'s edge, a strip that scrolls sideways (it scrolls), a drag surface',
    unmoved.every((u) => u === null) && scrolledDown && stripMoved, JSON.stringify({ unmoved: unmoved.filter(Boolean), scrolledDown, stripMoved }));
  // Until 2026-11-24 one check with the laptop's addresses (scripts/smoke/world.mjs).
  const worldA11y = ((await axeRun(wm)) || []).map((v) => `phone: ${v}`);
  if (AXE) check('world shell on a phone: no accessibility violations above minor', worldA11y.length === 0, worldA11y.slice(0, 3).join(' | ') || 'names, roles, landmarks, contrast');
  await wm.context().close();

  // A phone on its side (844×390): still a phone — the header, the switch and the tags on one line, the frame the rest of the screen at 1:1.
  const wl = await (await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  watch(wl, 'world, phone on its side');
  await wl.goto(dev + 'radio', { waitUntil: 'domcontentloaded' });
  await wl.waitForFunction(() => window.radioTower?.world?.current === 'radio' && document.querySelector('#w-radio .w-box .onair'), null, { timeout: 10000 }).catch(() => {});
  await wl.evaluate(() => document.fonts.ready);
  const side = await wl.evaluate(() => {
    const r = (q) => document.querySelector(q).getBoundingClientRect();
    const [brand, sw, tags, frame, mb] = ['.w-brand', '.w-switch', '.w-tags', '#w-radio', '#minibar'].map(r);
    const box = document.querySelector('#w-radio .w-box');
    const page = box.querySelector(':scope > .page');
    return {
      line: [brand, sw, tags].every((b) => b.top < 20 && b.bottom <= 60), apart: brand.right <= sw.left && sw.right <= tags.left && tags.right <= innerWidth,
      // 2026-11-17: « above » once allowed 2 px, and a frame 2.1 px under the mini-player (Windows' taller text) hid in it, red by 0.125.
      // The frame now measures the mini-player (world.js miniH); half a pixel is sub-pixel rounding, nothing more.
      under: frame.top >= tags.bottom, above: frame.bottom <= mb.top + 0.5, inside: frame.left >= 0 && frame.right <= innerWidth,
      gap: +(mb.top - frame.bottom).toFixed(3),
      zoom: box.style.zoom, scale: page ? page.getBoundingClientRect().width / page.offsetWidth : 0,
      minimap: getComputedStyle(document.querySelector('.w-minimap')).display, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  check('phone on its side (844×390): brand, switch and tags share one line («  Écran » is private); the frame fills the rest at 1:1, above the mini-player; nothing overflows',
    side.line && side.apart && side.under && side.above && side.inside && side.zoom === '' && Math.abs(side.scale - 1) < 0.02 && side.minimap === 'none' && side.overflow <= 1,
    JSON.stringify(side));
  await swipe(wl, 600, 220, 300, 225);
  await landedOn(wl, 'une');
  check('…and a swipe there goes to the Une too', await wl.evaluate(() => location.pathname === '/echo' && window.radioTower.world.current === 'une'));
  await wl.context().close();

  /* ------------------------------------------------------------- phone -- */
  // Until 2026-11-25 the classic shell's phone pass ran here: ?classic=1, then a cold load of every address with axe, and the
  // banner by touch. The world's pass at the end of this part loads the same addresses (PHONE_ROUTES) and checks the same two things.
  const PHONE_ROUTES = ['', 'radio', 'ondes', 'playlists', 'atlas', 'antenna', 'ecrits', 'ecrits/l-ascenceur-tombe', 'echo/lectures', 'echo/lectures/voyages', 'echo',
    'echo/dont-shoot-the-pianist', 'echo/articles', 'echo/presse/2024-07-22-p12', 'echo/archives', 'portfolio', 'portfolio/photos', 'portfolio/crates', 'booth'];
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await phone.newPage();
  watch(m, 'phone');
  // The Archive's books on a phone (Ortis, 2026-11-24: « piled up vertically instead of horizontally, bc right now you
  // have to scroll to the side to see it »): every shelf a pile, one book above the next, nothing to scroll sideways.
  await m.goto(dev + 'portfolio', { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.room .shelf .book', { timeout: 10000 }).catch(() => {});
  const pile = await m.evaluate(() => {
    const shelves = [...document.querySelectorAll('.room .shelf')].map((s) => ({ over: s.scrollWidth - s.clientWidth, tops: [...s.querySelectorAll('.book')].map((b) => b.getBoundingClientRect().top) }));
    return { shelves: shelves.length, books: shelves.reduce((n, s) => n + s.tops.length, 0), sideways: Math.max(0, ...shelves.map((s) => s.over)),
      piled: shelves.every((s) => s.tops.every((t, i) => i === 0 || t > s.tops[i - 1])), doc: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check('on a phone the Archive\'s books lie in piles, one above the next, with nothing to scroll sideways',
    pile.shelves >= 1 && pile.books >= 6 && pile.piled && pile.sideways <= 1 && pile.doc <= 1, JSON.stringify(pile));
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

  /* --------------------------------------------- the world on a phone, every page -- */
  // What the site ships, on the same addresses, each a cold load in a tab that never chose: nothing wider than the screen —
  // the document, or the page inside its window (a window scrolls on its own: a page too wide for it would hide its right
  // edge there without widening the document) — and axe.
  const wp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  watch(wp, 'world, every page on a phone');
  const wOverflow = [];
  const wA11y = [];
  for (const r of PHONE_ROUTES) {
    await wp.goto(dev + r, { waitUntil: 'domcontentloaded' });
    await wp.waitForFunction(() => {
      const t = window.radioTower?.world;
      return t?.current && !t.camera.moving && document.querySelector(`#w-${t.current} .w-box > .page`)?.textContent.trim().length > 20;
    }, null, { timeout: 10000 }).catch(() => {});
    await wp.waitForTimeout(700);
    const o = await wp.evaluate(() => {
      const t = window.radioTower.world;
      const box = t && document.querySelector(`#w-${t.current} .w-box`);
      return { at: t?.current || null, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, box: box ? box.scrollWidth - box.clientWidth : null };
    });
    if (!o.at || o.doc > 1 || o.box === null || o.box > 1) wOverflow.push(`/${r} ${JSON.stringify(o)}`);
    for (const v of (await axeRun(wp)) || []) wA11y.push(`/${r}: ${v}`);
  }
  check(`the world on a 390 px phone: every page fits, the document and the page in its window (${PHONE_ROUTES.length} addresses)`, wOverflow.length === 0,
    wOverflow.slice(0, 3).join(' | ') || 'every page fits');
  if (AXE) check('…and none has an accessibility violation above minor (axe-core)', wA11y.length === 0, wA11y.slice(0, 3).join(' | ') || 'contrast, names, roles, headings');
  await wp.context().close();
}
