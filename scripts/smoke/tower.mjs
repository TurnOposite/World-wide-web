/**
 * The site smoke, tower: tower mode: pointed at a real Radio Tower server (its address as the argument), the same front end.
 * One part of scripts/site-smoke.mjs (`--only tower` runs it alone); scripts/smoke/harness.mjs is what it is handed.
 */
import { CAST, castIcon } from '../../site/js/ui/cast.js';

export default async function tower({ towerUrl, check, dev, browser, errors, watch, tab }) {
  /* -------------------------------------------------- tower mode ----------- */
  if (towerUrl) {
    const t = await (await browser.newContext()).newPage();
    watch(t, 'tower');
    // The world shell, the live site's own set-up (the classic shell went first here until 2026-11-25).
    await t.goto(`${dev}radio?tower=${encodeURIComponent(towerUrl)}`, { waitUntil: 'domcontentloaded' });
    await t.waitForFunction(() => window.radioTower?.player?.onAir && window.radioTower.world?.current === 'radio', null, { timeout: 15000 }).catch(() => {});
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

    // What the Pi-era player's browser stage (scripts/browser-smoke.mjs) proved about the tower, on the site since that
    // player was retired (2026-11-25, LIGHTER step 3, archive/pi-player-2026-11-25/): a listener in step with the tower
    // and across a track change, and a reorder from the booth that the tower itself records, undone by « Back to the
    // station clock ». In the world shell, as the live site is. Every reading names the slot it reads (each cycle is
    // its own shuffle, so a title can open the next cycle too) and is taken again when a track ends between.
    {
      const enc = encodeURIComponent(towerUrl);
      const lp = await (await browser.newContext()).newPage();
      watch(lp, 'tower, listening');
      await lp.goto(`${dev}radio?tower=${enc}`, { waitUntil: 'domcontentloaded' });
      await lp.waitForFunction(() => window.radioTower?.player?.onAir && document.getElementById('rTune'), null, { timeout: 15000 }).catch(() => {});
      await lp.evaluate(() => { if (/Tune in/.test(document.getElementById('rTuneLabel')?.textContent || '')) document.getElementById('rTune').click(); });
      await lp.waitForFunction(() => { const au = document.getElementById('audio'); return au && !au.paused && au.currentTime > 0.5; }, null, { timeout: 15000 }).catch(() => {});
      const onTower = () => lp.evaluate(async (tw) => {
        const au = document.getElementById('audio');
        const ch = window.radioTower.client.channel;
        const { onAir } = await (await fetch(`${tw}/api/station${ch ? `?channel=${encodeURIComponent(ch)}` : ''}`, { cache: 'no-store' })).json();
        return { id: onAir.id, title: onAir.title, startsAt: onAir.startsAt, endsAt: onAir.endsAt, offset: onAir.offset, remaining: onAir.remaining,
          playingId: (au.currentSrc.match(/track\/([0-9a-f]{12})\//) || [])[1], ct: au.currentTime, paused: au.paused };
      }, towerUrl);
      let s = await onTower();
      for (let i = 0; i < 4 && !(s.id === s.playingId && s.offset > 0.5); i++) { await lp.waitForTimeout(1200); s = await onTower(); }
      check('a listener on the site plays the tower\'s own stream, in step with the tower', !s.paused && s.id === s.playingId && Math.abs(s.ct - s.offset) < 2,
        `${s.title}: ${s.ct.toFixed(2)} s here, ${s.offset.toFixed(2)} s on the tower`);
      // Across a track change: a later slot, its track in the <audio>, at its position — not the end of the old file.
      if (s.remaining < 20) {
        const before = s;
        await lp.waitForTimeout((before.remaining + 3) * 1000);
        let after = await onTower();
        for (let i = 0; i < 3 && (after.playingId !== after.id || Math.abs(after.ct - after.offset) >= 2); i++) { await lp.waitForTimeout(700); after = await onTower(); }
        check('…and it rolls over to the next track by itself, still playing', after.startsAt >= before.endsAt && after.playingId === after.id && Math.abs(after.ct - after.offset) < 2 && !after.paused,
          `${before.title} → ${after.title}, ${after.ct.toFixed(1)} s here vs ${after.offset.toFixed(1)} s on the tower`);
      } else console.log(`SKIP  the rollover: ${Math.round(s.remaining)} s left on the track`);
      await lp.context().close();

      // The booth on the tower, unlocked by the shortcut's key: a row moved up, and the tower holds the override.
      const qb = await (await browser.newContext()).newPage();
      watch(qb, 'tower, booth queue');
      await qb.goto(`${dev}booth?tower=${enc}#key=selftest-key`, { waitUntil: 'domcontentloaded' });
      await qb.waitForSelector('#bQueue li[data-movable="1"]', { timeout: 10000 }).catch(() => {});
      const queueOn = () => qb.evaluate(async (tw) => {
        const ch = window.radioTower.client.channel;
        const q = await (await fetch(`${tw}/api/queue${ch ? `?channel=${encodeURIComponent(ch)}` : ''}`, { cache: 'no-store' })).json();
        return { ids: (q.slots || []).map((x) => x.id), override: Boolean(q.override) };
      }, towerUrl);
      // As in the cloud booth (pages.mjs): the programme moves under the hand — a track ends, the list is redrawn —
      // so an attempt counts only when the tower holds an override over the same tracks in another order; anything
      // else is put back and tried again, four times at most. `slid` tracks left the front while it was moved.
      let moved = null;
      let first = null;
      for (let attempt = 0; attempt < 4 && !moved; attempt++) {
        first = await queueOn();
        if ((await qb.$$('#bQueue li[data-movable="1"]')).length < 2) { await qb.waitForTimeout(1200); continue; }
        await qb.evaluate(() => { const r = document.querySelectorAll('#bQueue li[data-movable="1"]'); r[r.length - 1]?.focus(); });
        await qb.keyboard.press('ArrowUp');
        for (let waited = 0; waited < 6000 && !(await queueOn()).override; waited += 300) await qb.waitForTimeout(300);
        const now = await queueOn();
        const slid = Math.max(0, first.ids.indexOf(now.ids[0]));
        const was = first.ids.slice(slid);
        const is = now.ids.slice(0, was.length);
        if (now.override && [...was].sort().join() === [...is].sort().join() && was.join() !== is.join()) moved = { now, slid };
        else if (now.override) { await qb.evaluate(() => document.querySelector('#bQueue [data-clear]')?.click()); await qb.waitForTimeout(1500); }
      }
      check('the booth on the tower moves a track, and the tower itself records it (not just the page): the same tracks, in another order',
        Boolean(moved), moved ? `slid ${moved.slid}, ${moved.now.ids.length} slots` : `no attempt moved a row — the tower's queue ${first?.ids.join(' ')}`);
      if (moved) {
        await qb.evaluate(() => document.querySelector('#bQueue [data-clear]')?.click());
        for (let waited = 0; waited < 8000 && (await queueOn()).override; waited += 300) await qb.waitForTimeout(300);
        check('…and « Back to the station clock » gives the tower its natural order back', !(await queueOn()).override);
      }
      await qb.context().close();
    }

    // The Antenna on a tower (2026-11-10): the telegraph line. A listener joins with a name and an icon from the bank,
    // says something, and it is on the tower's line for everyone; what a stranger types stays text; and the browser
    // keeps who they are only when asked.
    await t.evaluate(() => { try { localStorage.removeItem('gt.telegraph.me'); } catch { /* nothing kept */ } window.radioTower.router.go('antenna'); });
    await t.waitForSelector('.w-box > .page .tg-join', { timeout: 8000 }).catch(() => {});
    const bank = await t.evaluate(async () => (await (await fetch(new URL('data/telegraph.json', document.baseURI))).json()).icons?.length || 0);
    await t.click('.w-box > .page .tg-join').catch(() => {});
    await t.waitForSelector('#tgName', { timeout: 4000 }).catch(() => {});
    const form = await t.evaluate(() => ({ picks: document.querySelectorAll('.cast-strip .cast-thumb').length, step: document.querySelector('.cast')?.dataset.step, keep: document.getElementById('tgKeep')?.checked, focus: document.activeElement?.id }));
    check('the telegraph line: joining asks for a name and a character — the cast, then the bank\'s pictures — and « remember me » starts unticked', bank >= 1 && form.picks === CAST.length + bank && form.step === 'who' && form.keep === false && form.focus === 'tgName', JSON.stringify({ bank, cast: CAST.length, ...form }));
    const said = `selftest ${Date.now()} <img src=x onerror="window.__tgHit=1"> https://example.test/x`;
    await t.fill('#tgName', 'Self <b>test</b>').catch(() => {});
    // The character select (Ortis, 2026-11-11): a slide changes who; once chosen, the same slide changes their clothes.
    const slide = async () => {
      const r = await t.evaluate(() => { const b = document.querySelector('.cast-reel').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await t.mouse.move(r.x + 30, r.y);
      await t.mouse.down();
      for (let i = 1; i <= 6; i++) await t.mouse.move(r.x + 30 - i * 14, r.y + 1);
      await t.mouse.up();
      await t.waitForTimeout(120);
    };
    const castNow = () => t.evaluate(() => ({ step: document.querySelector('.cast')?.dataset.step, name: document.querySelector('.cast-name b')?.textContent, label: document.querySelector('.cast-stage')?.getAttribute('aria-label'), pressed: document.querySelector('.cast-look[aria-pressed="true"]')?.dataset.look ?? null }));
    const c0 = await castNow();
    await slide();
    const c1 = await castNow();
    await t.click('.cast-choose').catch(() => {});
    const c2 = await castNow();
    await slide();
    const c3 = await castNow();
    const wantIcon = castIcon(CAST[1].id, 1);
    check('…the character select: a slide brings the next character; once chosen, a slide changes their clothes and not who they are', c0.name === CAST[0].name && c0.step === 'who' && c1.name === CAST[1].name && c1.step === 'who'
      && c2.step === 'look' && c2.pressed === '0' && c3.step === 'look' && c3.name === CAST[1].name && c3.pressed === '1' && c3.label !== c2.label, JSON.stringify([c0, c1, c2, c3]));
    await t.click('.tg-joinform button[type=submit]').catch(() => {});
    await t.waitForSelector('#tgText', { timeout: 4000 }).catch(() => {});
    await t.fill('#tgText', said).catch(() => {});
    await t.press('#tgText', 'Enter').catch(() => {});
    await t.waitForFunction(() => [...document.querySelectorAll('.tg-msg .tg-text')].some((p) => p.textContent.includes('selftest')), null, { timeout: 6000 }).catch(() => {});
    const line = await t.evaluate(() => {
      const li = [...document.querySelectorAll('.tg-msg')].find((x) => x.querySelector('.tg-text')?.textContent.includes('selftest'));
      return {
        text: li?.querySelector('.tg-text')?.textContent, name: li?.querySelector('.tg-name')?.textContent, face: li?.querySelector('img.tg-face')?.dataset.icon || null, faceSrc: (li?.querySelector('img.tg-face')?.getAttribute('src') || '').slice(0, 19),
        bar: { hidden: document.getElementById('mbMe')?.hidden, icon: document.querySelector('#mbMe img')?.dataset.icon || null, href: document.getElementById('mbMe')?.getAttribute('href') },
        markup: document.querySelectorAll('.tg-log img:not(.tg-face), .tg-log b:not(.tg-name), .tg-log a').length, hit: window.__tgHit === 1,
        kept: localStorage.getItem('gt.telegraph.me'), box: document.getElementById('tgText')?.value, who: document.querySelector('.tg-who')?.textContent,
      };
    });
    const onTower = (await (await fetch(`${towerUrl}/api/telegraph`)).json()).messages?.find((x) => x.text.startsWith('selftest'));
    check('…a message sent from the page is on the tower\'s line, under that name and that character in those clothes', Boolean(onTower) && onTower.name === 'Self <b>test</b>' && onTower.icon === wantIcon && line.face === onTower.icon
      && line.faceSrc === 'data:image/svg+xml,' && line.box === '', JSON.stringify({ onTower, wantIcon, face: line.face, box: line.box }));
    check('…and the mini-player shows who they are, on every page, leading back to the Antenna', line.bar.hidden === false && line.bar.icon === wantIcon && line.bar.href === 'antenna', JSON.stringify(line.bar));
    check('…what a stranger typed is shown as text — no markup, no link, nothing run — and the link is gone', line.text === onTower?.text && /<img src=x/.test(line.text || '') && /\[link\]/.test(line.text || '')
      && !/example\.test/.test(line.text || '') && line.markup === 0 && !line.hit && line.name === 'Self <b>test</b>', JSON.stringify(line));
    check('…and the browser keeps nothing about them unless asked', line.kept === null && /On the line as/.test(line.who || ''), JSON.stringify({ kept: line.kept, who: line.who }));
    // A second listener, who has not joined, reads it within a poll or two.
    const t2 = await (await browser.newContext()).newPage();
    watch(t2, 'tower, second listener');
    await t2.goto(`${dev}antenna?tower=${encodeURIComponent(towerUrl)}`, { waitUntil: 'domcontentloaded' });
    const heard = await t2.waitForFunction(() => [...document.querySelectorAll('.tg-msg .tg-text')].some((p) => p.textContent.includes('selftest')), null, { timeout: 12000 }).then(() => true).catch(() => false);
    check('…another listener, who has not joined, reads it too', heard);
    await t2.context().close();

    // « Notify this device » (Ortis, 2026-11-16: « phone notification for messages in antenna »; 2026-11-17: « only
    // accessible to me, so it doesn't have to appear on the antenna »): the bell in the Booth's Line side, behind the
    // key. Nothing is asked of the browser before the tap; the tap asks permission, registers the service worker and
    // hands the tower a subscription made with the tower's own key; the next listener's message then arrives at that
    // browser's push service, encrypted to it. The push service is someone else's, so
    // this run plays it: the page's subscription is a stand-in that points here (TOWER_PUSH_STUB, build-test.sh).
    const pushStub = process.env.TOWER_PUSH_STUB;
    if (!pushStub) {
      console.log('SKIP  the line\'s notifications: no TOWER_PUSH_STUB (build-test.sh sets it, and tells the tower it may call it)');
    } else {
      const { generateKeys, decrypt, b64u } = await import('../../server/lib/webpush.js');
      const { randomBytes } = await import('node:crypto');
      const { createServer } = await import('node:http');
      const pushed = [];
      const pushService = createServer((req, res) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c)).on('end', () => { pushed.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(201).end(); });
      });
      const up = await new Promise((resolve) => { pushService.once('error', () => resolve(false)); pushService.listen(Number(new URL(pushStub).port), '127.0.0.1', () => resolve(true)); });
      if (!up) {
        check('the line\'s notifications: the stand-in push service could start', false, `${pushStub} is taken (TEST_PUSH_PORT picks another)`);
      } else {
        const ua = generateKeys();
        const auth = b64u(randomBytes(16));
        const endpoint = `${pushStub}/push/selftest-${Date.now()}`;
        const nctx = await browser.newContext();
        await nctx.addInitScript((subscription) => {
          // Whatever this browser's own push support is (a headless one may have none), the page meets the same
          // three things a browser with Web Push has: PushManager, Notification, and a pushManager on the worker's
          // registration — all stand-ins that record what the page asked of them.
          window.__push = { asked: 0, subscribed: 0, sub: null };
          const fake = { endpoint: subscription.endpoint, toJSON: () => subscription, unsubscribe: async () => { window.__push.sub = null; return true; } };
          const manager = {
            subscribe: async (o) => {
              Object.assign(window.__push, { subscribed: window.__push.subscribed + 1, keyBytes: o?.applicationServerKey?.length ?? null, visible: o?.userVisibleOnly === true, sub: fake });
              return fake;
            },
            getSubscription: async () => window.__push.sub,
          };
          if (!('PushManager' in window)) window.PushManager = function PushManager() {};
          if (!('Notification' in window)) window.Notification = function Notification() {};
          window.Notification.requestPermission = async () => { window.__push.asked++; return 'granted'; };
          Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', { configurable: true, get() { return manager; } });
        }, { endpoint, keys: { p256dh: ua.publicKey, auth } });
        const np = await nctx.newPage();
        watch(np, 'tower, notifications');
        await np.goto(`${dev}antenna?tower=${encodeURIComponent(towerUrl)}`, { waitUntil: 'domcontentloaded' });
        await np.waitForSelector('.w-box > .page .tg-join', { timeout: 10000 }).catch(() => {});
        const antennaHas = await np.evaluate(() => ({ bell: Boolean(document.querySelector('#tgNotify, #laNotify')), words: /tell me when someone writes|notify this device/i.test(document.getElementById('view')?.textContent || '') }));
        check('the Antenna offers listeners no notifications: they are the station\'s', !antennaHas.bell && !antennaHas.words, JSON.stringify(antennaHas));
        await np.goto(`${dev}booth?tower=${encodeURIComponent(towerUrl)}#key=selftest-key`, { waitUntil: 'domcontentloaded' });
        await np.waitForSelector('#bTabs [data-tab="line"]', { timeout: 10000 }).catch(() => {});
        await np.evaluate(() => document.querySelector('#bTabs [data-tab="line"]')?.click());
        await np.waitForFunction(() => document.getElementById('laNotify') && !document.getElementById('laNotify').hidden, null, { timeout: 10000 }).catch(() => {});
        const idle = await np.evaluate(async () => ({ label: document.getElementById('laNotifyText')?.textContent ?? null, pressed: document.getElementById('laNotify')?.getAttribute('aria-pressed'), asked: window.__push.asked, subscribed: window.__push.subscribed,
          registered: (await navigator.serviceWorker.getRegistrations()).length }));
        await np.click('#laNotify').catch(() => {});
        await np.waitForFunction(() => document.getElementById('laNotify')?.getAttribute('aria-pressed') === 'true', null, { timeout: 12000 }).catch(() => {});
        const asked = await np.evaluate(async () => {
          const reg = (await navigator.serviceWorker.getRegistrations())[0];
          const worker = reg?.active || reg?.waiting || reg?.installing;
          return { label: document.getElementById('laNotifyText')?.textContent ?? null, pressed: document.getElementById('laNotify')?.getAttribute('aria-pressed'), asked: window.__push.asked, subscribed: window.__push.subscribed, keyBytes: window.__push.keyBytes,
            visible: window.__push.visible, worker: worker ? new URL(worker.scriptURL).pathname : null, scope: reg ? new URL(reg.scope).pathname : null };
        });
        check('the Booth\'s Line side, unlocked, has the bell « Notify this device »; before the tap nothing is asked, registered or subscribed',
          idle.label === 'Notify this device' && idle.pressed === 'false' && idle.asked === 0 && idle.subscribed === 0 && idle.registered === 0, JSON.stringify(idle));
        check('…the tap asks the browser\'s permission once, registers sw.js for the site, and subscribes with the tower\'s key',
          asked.pressed === 'true' && asked.label === 'On · stop' && asked.asked === 1 && asked.subscribed === 1 && asked.keyBytes === 65 && asked.visible && asked.worker === '/sw.js' && asked.scope === '/', JSON.stringify(asked));
        const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 150)); } return fn(); };
        const say = (text) => fetch(`${towerUrl}/api/telegraph`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Push check', text }) });
        const mine = () => pushed.filter((r) => `${pushStub}${r.url}` === endpoint);
        const words = `pushcheck ${Date.now()}`;
        await say(words);
        await until(() => mine().length >= 1);
        const first = mine()[0];
        let told = null;
        try { told = JSON.parse(decrypt(first.body, { ...ua, auth }).toString()); } catch { /* not for this browser, or not encrypted */ }
        check('…the next message reaches that browser\'s push service: encrypted to it alone, signed by the tower, and it says who wrote and what',
          Boolean(first) && first.headers['content-encoding'] === 'aes128gcm' && /^vapid t=[\w.-]+, k=[\w-]{87}$/.test(first.headers.authorization || '') && !first.body.includes(words)
          && told?.title === 'Push check on the telegraph line' && told.body === words && told.url === 'antenna', JSON.stringify({ got: mine().length, headers: first && { enc: first.headers['content-encoding'], ttl: first.headers.ttl }, told }));
        await np.click('#laNotify').catch(() => {});
        await np.waitForFunction(() => document.getElementById('laNotify')?.getAttribute('aria-pressed') === 'false', null, { timeout: 8000 }).catch(() => {});
        pushed.length = 0;
        await say(`pushcheck after stop ${Date.now()}`);
        await new Promise((r) => setTimeout(r, 1500));
        const stopped = await np.evaluate(() => ({ label: document.getElementById('laNotifyText')?.textContent ?? null, sub: Boolean(window.__push.sub) }));
        check('…and the same bell stops it: the tower forgets the subscription, the browser too, and nothing more is sent', stopped.label === 'Notify this device' && !stopped.sub && mine().length === 0, JSON.stringify({ ...stopped, sent: mine().length }));
        // Not on a phone (Ortis, 2026-11-22: « remove from phone version the option to get notified about chats »):
        // the same browser at a phone's size, the log read with the same key — no bell, no iPhone hint.
        // The key in the address is read once and dropped from it, so the Booth is opened again with it, not reloaded
        // (a query of its own makes it a new load; about:blank would run the stand-in above on a page without workers).
        await np.setViewportSize({ width: 390, height: 844 });
        await np.goto(`${dev}booth?tower=${encodeURIComponent(towerUrl)}&size=phone#key=selftest-key`, { waitUntil: 'domcontentloaded' });
        await np.waitForSelector('#bTabs [data-tab="line"]', { timeout: 10000 }).catch(() => {});
        await np.evaluate(() => document.querySelector('#bTabs [data-tab="line"]')?.click());
        await np.waitForFunction(() => { const s = document.getElementById('laState')?.textContent || ''; return s && !/^Reading/.test(s); }, null, { timeout: 10000 }).catch(() => {});
        const small = await np.evaluate(() => ({ state: document.getElementById('laState')?.textContent || null, bell: document.getElementById('laNotify')?.hidden ?? null, ios: document.getElementById('laIos')?.hidden ?? null }));
        check('…and at a phone\'s size the Line side offers no notifications: no bell, no hint', /message|Nothing/.test(small.state || '') && small.bell === true && small.ios === true, JSON.stringify(small));
        await nctx.close();
        await new Promise((r) => pushService.close(r));
      }
    }

    // The phone (Ortis, 2026-11-10: « people have to scroll down to see the music name »): on /radio the title and
    // Tune in are on the first screen, the tagline, the loop and sync figures and Resync are not shown; in the Booth
    // a button puts the visuals on the big screen (a phone has no F).
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const ph = await pctx.newPage();
    watch(ph, 'tower, phone');
    await ph.goto(`${dev}radio?tower=${encodeURIComponent(towerUrl)}`, { waitUntil: 'domcontentloaded' });
    await ph.waitForFunction(() => window.radioTower?.world?.current === 'radio' && window.radioTower.player?.onAir && !window.radioTower.world.camera.moving, null, { timeout: 15000 }).catch(() => {});
    await ph.waitForTimeout(400);
    const fold = await ph.evaluate(() => {
      const floor = (document.getElementById('minibar')?.getBoundingClientRect().top ?? innerHeight);
      const r = (id) => document.getElementById(id)?.getBoundingClientRect();
      const shown = (el) => Boolean(el) && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
      return {
        title: document.getElementById('rTitle')?.textContent, titleBottom: Math.round(r('rTitle')?.bottom ?? 9999), tuneBottom: Math.round(r('rTune')?.bottom ?? 9999), floor: Math.round(floor),
        extras: [...document.querySelectorAll('#w-radio .radio-extra')].filter(shown).map((e) => e.id || e.className), count: document.querySelectorAll('#w-radio .radio-extra').length,
        listeners: shown(document.getElementById('rMode')),
      };
    });
    check('on a phone, /radio shows the title and Tune in on the first screen', Boolean(fold.title) && fold.titleBottom < fold.floor && fold.tuneBottom <= fold.floor, JSON.stringify(fold));
    check('…without the tagline, the loop and sync figures or Resync; the listener count stays', fold.count === 4 && fold.extras.length === 0 && fold.listeners, JSON.stringify(fold));
    await ph.evaluate(() => window.radioTower.router.go('booth'));
    await ph.waitForSelector('#bBig', { timeout: 8000 }).catch(() => {});
    await ph.waitForFunction(() => !window.radioTower.world.camera.moving, null, { timeout: 5000 }).catch(() => {});
    await ph.click('#bBig').catch(() => {});
    const big = await ph.evaluate(() => ({ theatre: document.body.classList.contains('theatre'), exit: Boolean(document.querySelector('.theatre-exit')), keys: getComputedStyle(document.querySelector('.booth-keys')).display }));
    await ph.click('.theatre-exit').catch(() => {});
    const stillBig = await ph.evaluate(() => document.body.classList.contains('theatre'));
    check('on a phone, the Booth\'s button puts the visuals on the big screen, and « Exit » brings the Booth back', big.theatre && big.exit && big.keys === 'none' && !stillBig, JSON.stringify({ ...big, stillBig }));
    await pctx.close();

    // The live site's set-up (config.json: tower mode, the world on): the world's Radio plays the tower's programme and
    // its Ondes window reads the guide from the tower.
    const tw = await (await browser.newContext()).newPage();
    watch(tw, 'tower, world');
    await tw.goto(`${dev}radio?tower=${encodeURIComponent(towerUrl)}`, { waitUntil: 'domcontentloaded' });
    await tw.waitForFunction(() => window.radioTower?.world?.current === 'radio' && window.radioTower.player?.onAir, null, { timeout: 15000 }).catch(() => {});
    let wShown, wServer;
    for (let i = 0; i < 4; i++) {
      await tw.evaluate(() => window.radioTower.player.refresh());
      wShown = await tw.evaluate(() => ({ at: window.radioTower.world?.current, mode: window.radioTower.client.mode, id: window.radioTower.player.onAir?.id, ch: window.radioTower.client.channel }));
      wServer = await (await fetch(`${towerUrl}/api/station${wShown.ch ? `?channel=${encodeURIComponent(wShown.ch)}` : ''}`)).json();
      if (wShown.id === wServer.onAir?.id) break;
      await tw.waitForTimeout(700);
    }
    check('the world in tower mode (the live site\'s set-up): Radio plays the tower\'s programme', wShown.at === 'radio' && wShown.mode === 'tower' && wShown.id === wServer.onAir?.id,
      `${wServer.onAir?.title} ${JSON.stringify(wShown)}`);
    await tw.click('.w-tag[data-go="ondes"]');
    await tw.waitForSelector('#w-ondes #eGuide li .at', { timeout: 8000 }).catch(() => {});
    const twOndes = await tw.evaluate(() => ({ path: location.pathname, next: document.querySelectorAll('#w-ondes #eNext li:not(.empty)').length, guide: document.querySelectorAll('#w-ondes #eGuide li .at').length }));
    check('…and its Ondes window reads Up next and the next hours from the tower', twOndes.path === '/ondes' && twOndes.next >= 1 && twOndes.guide >= 5, JSON.stringify(twOndes));
    await tw.context().close();

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
    const opened = await bk.evaluate(() => ({ queue: Boolean(document.querySelector('#bDesk:not([hidden]) #bQueue')), moods: document.querySelectorAll('#bMoods [data-mood]').length }));
    check('the shortcut\'s #key unlocks the booth on a tower — the tower said yes, so the queue and the moods show — and is gone from the address bar', arrived.unlocked === true && !arrived.url.includes('#')
      && opened.queue && opened.moods >= 1, `${arrived.url.replace(dev, '/')} ${JSON.stringify(opened)}`);
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

    // The Booth's « Line » tab (Ortis, 2026-11-16: « more parameters in the chat logs for admin with history … and
    // restore option »): behind the key, the tower's log of the line. The message this run sent earlier is in it,
    // with the track on air and a sender tag; the station takes it off, a listener's page loses it; the station
    // puts it back, and the listener's page — which asks the tower only for what is newer — shows it again.
    check('a locked Booth has no desk sides at all: the line\'s log is not there to be found', await bk.evaluate(() => !document.querySelector('#bTabs, #bSideLine, .la')));
    const la = await keyCtx.newPage();
    watch(la, 'booth, line');
    await la.goto(`${boothAt}#key=selftest-key`, { waitUntil: 'domcontentloaded' });
    await la.waitForSelector('#bTabs [data-tab="line"]', { timeout: 10000 }).catch(() => {});
    const sidesBefore = await la.evaluate(() => ({ tabs: [...document.querySelectorAll('#bTabs [data-tab]')].map((b) => b.dataset.tab), music: !document.getElementById('bSideMusic')?.hidden, line: document.getElementById('bSideLine')?.hidden, built: Boolean(document.querySelector('.la')) }));
    await la.click('#bTabs [data-tab="line"]').catch(() => {});
    const rowOf = () => la.evaluate(() => {
      const li = [...document.querySelectorAll('.la-row')].find((x) => x.querySelector('.la-text')?.textContent.startsWith('selftest'));
      return li ? { id: li.dataset.id, cls: li.className, chip: li.querySelector('.la-chip')?.textContent, meta: li.querySelector('.la-meta')?.textContent, name: li.querySelector('.la-name')?.textContent,
        acts: [...li.querySelectorAll('.la-acts button')].map((b) => b.dataset.act), markup: li.querySelectorAll('.la-text *, .la-name *').length, day: li.closest('.la-day')?.querySelector('.la-sub')?.textContent } : null;
    });
    await la.waitForFunction(() => [...document.querySelectorAll('.la-row .la-text')].some((x) => x.textContent.startsWith('selftest')), null, { timeout: 8000 }).catch(() => {});
    const laRow = await rowOf();
    check('the Booth on a tower, unlocked: « Line » and « Status » sides beside Music, each built only when opened', sidesBefore.tabs.join() === 'music,line,status' && sidesBefore.music && sidesBefore.line === true && !sidesBefore.built && Boolean(laRow), JSON.stringify({ ...sidesBefore, row: Boolean(laRow) }));
    check('…the log shows the message with more than the room is told — the track on air, a sender tag — as text, by day',
      Boolean(laRow) && laRow.chip === 'on the line' && /on air: \S/.test(laRow.meta || '') && /sender #[\w-]{6}/.test(laRow.meta || '') && laRow.name === 'Self <b>test</b>' && laRow.markup === 0 && Boolean(laRow.day)
      && laRow.acts.join() === 'remove,mute', JSON.stringify(laRow));
    // A listener who has not joined, reading the line.
    const l3 = await (await browser.newContext()).newPage();
    watch(l3, 'tower, listener during moderation');
    await l3.goto(`${dev}antenna?tower=${encodeURIComponent(towerUrl)}`, { waitUntil: 'domcontentloaded' });
    const hears = (want, ms = 12000) => l3.waitForFunction((w) => [...document.querySelectorAll('.tg-msg .tg-text')].some((x) => x.textContent.startsWith('selftest')) === w, want, { timeout: ms }).then(() => true).catch(() => false);
    const heardFirst = await hears(true);
    await la.click(`.la-row[data-id="${laRow?.id}"] button[data-act="remove"]`).catch(() => {});
    await la.waitForFunction((id) => document.querySelector(`.la-row[data-id="${id}"]`)?.classList.contains('la-removed'), laRow?.id, { timeout: 8000 }).catch(() => {});
    const laOff = await rowOf();
    const goneForListener = await hears(false);
    check('…taken off from the log: the row says so and offers to put it back, and a listener\'s page loses it', heardFirst && laOff?.chip === 'taken off' && laOff.acts.join() === 'restore' && /taken off \d/.test(laOff.meta || '') && goneForListener,
      JSON.stringify({ heardFirst, laOff, goneForListener }));
    await la.click(`.la-row[data-id="${laRow?.id}"] button[data-act="restore"]`).catch(() => {});
    await la.waitForFunction((id) => document.querySelector(`.la-row[data-id="${id}"]`)?.classList.contains('la-on'), laRow?.id, { timeout: 8000 }).catch(() => {});
    const laBack = await rowOf();
    const backForListener = await hears(true);
    const laMark = await l3.evaluate(() => [...document.querySelectorAll('.tg-msg')].find((x) => x.querySelector('.tg-text')?.textContent.startsWith('selftest'))?.querySelector('.tg-meta')?.textContent || '');
    const onTowerAgain = (await (await fetch(`${towerUrl}/api/telegraph`)).json()).messages?.filter((x) => x.text.startsWith('selftest')) || [];
    check('…put back: it is on the line again, once, with its own id and a « put back » mark, on the page of a listener who was already reading', laBack?.chip === 'on the line (put back)' && /put back \d/.test(laBack.meta || '')
      && backForListener && /put back/.test(laMark) && onTowerAgain.length === 1 && String(onTowerAgain[0].id) === laRow?.id && Number.isFinite(onTowerAgain[0].restored), JSON.stringify({ laBack, backForListener, laMark, n: onTowerAgain.length }));
    const keyless = await fetch(`${towerUrl}/api/telegraph/log`);
    check('…and none of it answers without the key', keyless.status === 401);
    await l3.context().close();
    // On a phone the log is rows, not a table: nothing runs off the side.
    const lpctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const lp = await lpctx.newPage();
    watch(lp, 'booth, line, phone');
    await lp.goto(`${boothAt}#key=selftest-key`, { waitUntil: 'domcontentloaded' });
    await lp.waitForSelector('#bTabs [data-tab="line"]', { timeout: 10000 }).catch(() => {});
    await lp.evaluate(() => document.querySelector('#bTabs [data-tab="line"]')?.click());
    await lp.waitForSelector('.la-row', { timeout: 8000 }).catch(() => {});
    await lp.waitForTimeout(300);
    const lpFit = await lp.evaluate(() => {
      const box = document.querySelector('.la')?.closest('.w-box');
      const side = document.querySelector('.la')?.getBoundingClientRect();
      return { rows: document.querySelectorAll('.la-row').length, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, box: box ? box.scrollWidth - box.clientWidth : null, wide: side ? Math.round(side.width) : null };
    });
    check('on a 390 px phone the line\'s log fits: rows, nothing off the side', lpFit.rows >= 1 && lpFit.doc <= 1 && (lpFit.box === null || lpFit.box <= 1) && lpFit.wide <= 390, JSON.stringify(lpFit));
    await lpctx.close();

    // The Booth's « Status » side: GitHub, the site and the tower each asked for its commit, and the tower's
    // health, the line and the notifications in rows. GitHub is someone else's: this run answers for it, with the
    // commit the tower says it is on, so the three can be compared.
    const towerHealth = await (await fetch(`${towerUrl}/api/health`)).json();
    const ghAsked = [];
    await keyCtx.route('https://api.github.com/repos/**', (r) => {
      const u = r.request().url();
      ghAsked.push(u);
      const body = /\/commits\/main$/.test(u) ? { sha: towerHealth.commit || 'c'.repeat(40), commit: { message: 'The commit under test\n\nbody', committer: { date: new Date().toISOString() } } }
        : { workflow_runs: [{ name: 'self-test', status: 'completed', conclusion: 'success', created_at: new Date().toISOString() }] };
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    });
    await la.click('#bTabs [data-tab="status"]').catch(() => {});
    await la.waitForFunction(() => document.querySelectorAll('#statRows dt').length >= 4 && /Read at/.test(document.getElementById('statState')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
    const sp = await la.evaluate(() => ({
      rows: Object.fromEntries([...document.querySelectorAll('#statRows dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent || ''])),
      say: document.getElementById('statSay')?.textContent || '',
      lamps: [...document.querySelectorAll('#statLamps .stat-lamp')].map((l) => `${l.querySelector('b')?.textContent}:${[...l.classList].find((c) => /^stat-(ok|behind|unknown)$/.test(c))}`),
      shown: { music: !document.getElementById('bSideMusic').hidden, line: !document.getElementById('bSideLine').hidden, status: !document.getElementById('bSideStatus').hidden },
      markup: document.querySelectorAll('#statRows dd *, #statSay *').length,
    }));
    const sha7 = towerHealth.commit ? towerHealth.commit.slice(0, 7) : '—';
    check('/api/health says which commit the tower runs', /^[0-9a-f]{40}$/.test(towerHealth.commit || ''), String(towerHealth.commit));
    check('the Booth\'s « Status » side: the tower\'s commit and health, GitHub\'s commit and self-test, the line, the notifications — each asked now, shown as text',
      sp.shown.status && !sp.shown.music && !sp.shown.line && sp.markup === 0 && sp.rows['The tower']?.startsWith(`${sha7} · on air · up `) && sp.rows['GitHub main'] === `${sha7} · self-test passed · « The commit under test »`
      && /messages? today · .*empties in /.test(sp.rows['The line'] || '') && /your phone: not set up .* listeners who asked: \d+/.test(sp.rows.Notifications || '') && /tracks · \d+ listening/.test(sp.rows['On air'] || '')
      && ghAsked.some((u) => /\/commits\/main$/.test(u)), JSON.stringify(sp));
    // The dev server's config.json carries no commit (only a build stamps one), so two agree and one is unknown: that is not « in step ».
    check('…three lamps, GitHub · Site · Tower, and it does not say « in step » while one of the three is unknown', /^GitHub and the tower on [0-9a-f]{7}; commit not known for the site\.$/.test(sp.say) && sp.lamps.join() === 'GitHub:stat-ok,Site:stat-unknown,Tower:stat-ok', JSON.stringify({ say: sp.say, lamps: sp.lamps }));
    await la.close();

    // Not watched for console errors: the browser logs the tower's 401 itself.
    const bad = await keyCtx.newPage();
    bad.on('pageerror', (e) => errors.push(`booth-bad-key: ${e.message}`));
    await bad.goto(boothAt, { waitUntil: 'domcontentloaded' });
    await bad.waitForSelector('#bKey', { timeout: 10000 });
    await bad.fill('#bKey', 'not-the-station-key');
    await bad.check('#bKeyKeep');
    await bad.click('#bKeyForm button[type=submit]');
    // Since 2026-11-01 the booth asks the tower (POST /api/key) before it keeps a key or opens the desk.
    await bad.waitForSelector('#bAuth .qstate.bad', { timeout: 8000 }).catch(() => {});
    const refused = await bad.evaluate(async () => {
      const c = window.radioTower.client;
      const keptBefore = Boolean(localStorage.getItem('radiotower.stationKeys'));
      let err = '';
      try { await c.clear(); } catch (e) { err = e.message; }
      await new Promise((r) => setTimeout(r, 150));
      return { keptBefore, err, unlocked: c.canWrite, stored: localStorage.getItem('radiotower.stationKeys'), text: document.querySelector('#bAuth')?.textContent || '' };
    });
    const desk = await bad.evaluate(() => ({ queue: document.querySelectorAll('#bQueue, #bMoods [data-mood]').length, open: !document.getElementById('bDesk').hidden }));
    check('a key the tower refuses never opens the desk and is never kept, not even with « Remember » ticked: the booth asks again',
      !refused.keptBefore && /refused/.test(refused.err) && refused.unlocked === false && refused.stored === null && /refused/.test(refused.text) && desk.queue === 0 && !desk.open,
      JSON.stringify({ ...refused, ...desk }));
    await keyCtx.close();
  }
}
