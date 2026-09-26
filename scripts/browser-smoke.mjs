/**
 * Browser smoke test.
 *
 * Loads the player in a real headless Chromium, tunes in, and asserts that the
 * audio element is actually playing near the position the tower reports. This
 * is the only way to catch the things unit tests cannot: autoplay policy,
 * seeking before metadata is ready, CORS on the Web Audio graph, and the
 * drift-correction loop.
 *
 * Usage: node scripts/browser-smoke.mjs [baseUrl] [--shot out.png]
 */
import { chromium } from 'playwright';

const base = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://127.0.0.1:8080';
const shotIdx = process.argv.indexOf('--shot');
const shotPath = shotIdx > -1 ? process.argv[shotIdx + 1] : null;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// TOWER_BROWSER_EXECUTABLE (or CHROME_PATH, kept for back-compat) points
// Playwright at a browser binary that is already on disk instead of the one
// its own version expects. Playwright pins an exact Chromium revision per
// release and refuses to launch a mismatched one, so a machine that has a
// perfectly good Chromium already — a different Playwright-managed download,
// a system package, whatever build-test.sh's own search in the next stage
// finds — can still be used without re-downloading anything.
const launchOpts = {
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--mute-audio'],
};
const browserExecutable = process.env.TOWER_BROWSER_EXECUTABLE || process.env.CHROME_PATH;
if (browserExecutable) launchOpts.executablePath = browserExecutable;

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

try {
  // Not 'networkidle': in dev mode (server/lib/devReload.js, active whenever
  // NODE_ENV !== 'production' — which build-test.sh's spawned server never
  // sets) the page opens a long-lived EventSource to /api/dev/reload that,
  // by design, never goes idle. 'networkidle' would then wait the full
  // timeout on every run instead of the ~1s a real page load takes here —
  // confirmed live: this run's the first with the SSE connection in place,
  // and 'networkidle' timed out at 20000ms where it previously did not.
  // Nothing below this line depends on networkidle: every other check
  // already waits for a specific element or condition explicitly.
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 20000 });
  check('page loads', true);

  await page.waitForFunction(() => document.getElementById('title')?.textContent !== 'Tuning in…', { timeout: 10000 });
  const title = await page.textContent('#title');
  const artist = await page.textContent('#artist');
  check('now playing is populated', Boolean(title) && title !== 'Dead air', `${title} — ${artist}`);

  const upcoming = await page.$$eval('#upcoming li:not(.empty)', (n) => n.length);
  check('up next is populated', upcoming > 0, `${upcoming} entries`);

  const libCount = await page.$$eval('#library li:not(.empty)', (n) => n.length);
  check('library renders', libCount > 0, `${libCount} rows`);

  await page.click('#tuneBtn');
  await page.waitForTimeout(3500);

  const audio = await page.evaluate(() => {
    const a = document.getElementById('audio');
    return {
      paused: a.paused, currentTime: a.currentTime, readyState: a.readyState,
      src: a.currentSrc, duration: a.duration, error: a.error?.code ?? null,
    };
  });
  check('audio element is playing', !audio.paused && audio.readyState >= 2,
    `readyState=${audio.readyState} t=${audio.currentTime.toFixed(2)}s`);
  check('audio has no decode error', audio.error === null, audio.error ? `code ${audio.error}` : '');
  check('a stream URL was selected', /\/api\/track\/[0-9a-f]{12}\/stream/.test(audio.src), audio.src.split('/').slice(-3).join('/'));

  // The point of the whole system: our position matches the tower's.
  const sync = await page.evaluate(async () => {
    const a = document.getElementById('audio');
    const res = await fetch('/api/station', { cache: 'no-store' });
    const d = await res.json();
    return { serverOffset: d.onAir.offset, clientTime: a.currentTime, id: d.onAir.id };
  });
  const drift = Math.abs(sync.clientTime - sync.serverOffset);
  check('playback is in sync with the tower', drift < 2.0, `drift ${drift.toFixed(2)}s`);

  const syncMeter = await page.textContent('#syncValue');
  check('sync meter reports a value', /-?\d/.test(syncMeter || ''), syncMeter);

  // Ride across a track boundary and confirm the player rolls over on its own.
  const before = await page.textContent('#title');
  const remaining = await page.evaluate(async () => (await (await fetch('/api/station')).json()).onAir.remaining);
  if (remaining < 20) {
    await page.waitForTimeout((remaining + 3) * 1000);
    const after = await page.textContent('#title');
    check('rolls over to the next track automatically', after !== before, `${before} -> ${after}`);
    const stillPlaying = await page.evaluate(() => !document.getElementById('audio').paused);
    check('still playing after the rollover', stillPlaying);
  } else {
    check('rollover check skipped (track too long)', true, `${remaining}s remaining`);
  }

  // --- the visualiser -------------------------------------------------------
  // Every layer of it is canvas pixels, so nothing in the DOM changes when it
  // breaks. A thrown error in the audio graph, a zero-sized backing store, a
  // loop that never starts: all of those leave the page looking completely
  // normal and the canvas blank. These three checks are the only thing
  // standing between that and a green build.
  const viz = await page.evaluate(() => {
    const c = document.getElementById('viz');
    if (!c) return { present: false };
    const ctx = c.getContext('2d');
    const sample = () => {
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let painted = 0;
      let sum = 0;
      // Step 4 px at a time (one RGBA pixel) and stride to keep this cheap on
      // a 2x-DPR canvas.
      for (let i = 0; i < d.length; i += 4 * 37) {
        if (d[i + 3] > 8) painted++;
        sum += d[i] + d[i + 1] + d[i + 2];
      }
      return { painted, sum };
    };
    return { present: true, hidden: c.hidden, w: c.width, h: c.height, first: sample() };
  });
  check('visualiser canvas has a real backing store', viz.present && !viz.hidden && viz.w > 0 && viz.h > 0,
    `${viz.w}x${viz.h}${viz.hidden ? ' (hidden — Web Audio was refused)' : ''}`);
  check('visualiser is painting pixels', (viz.first?.painted ?? 0) > 0, `${viz.first?.painted} sampled pixels lit`);

  await page.waitForTimeout(700);
  const viz2 = await page.evaluate(() => {
    const c = document.getElementById('viz');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4 * 37) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  });
  // A frozen loop still leaves a painted canvas — only comparing two moments
  // in time distinguishes "drawing" from "drew once and died".
  check('visualiser is animating', viz2 !== viz.first.sum, `frame sum ${viz.first.sum} -> ${viz2}`);

  // The one thing Ortis asked for explicitly: it frames the cover, it does not
  // cover it. If the CSS inset and viz.js's ART_FRACTION ever drift apart, the
  // ring starts drawing across the artwork.
  const inset = await page.evaluate(() => {
    const frame = document.querySelector('.art-frame');
    const art = document.getElementById('art');
    const shown = art && !art.hidden ? art : document.getElementById('artFallback');
    if (!frame || !shown) return null;
    const f = frame.getBoundingClientRect();
    const a = shown.getBoundingClientRect();
    return { ratio: a.width / f.width, margin: (f.width - a.width) / 2 };
  });
  check('album art is inset so the visualiser frames it',
    inset != null && inset.ratio > 0.6 && inset.ratio < 0.9 && inset.margin > 4,
    inset ? `cover is ${(inset.ratio * 100).toFixed(0)}% of the frame, ${inset.margin.toFixed(0)}px margin` : 'not measurable');

  const listeners = await page.textContent('#listenerCount');
  check('listener count is reported', Number(listeners) >= 1, `${listeners} listening`);

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // --- queue editor ---------------------------------------------------------
  // Two branches, and both matter. With STATION_KEY unset the editor must be
  // invisible — not merely inert: the write endpoints are 503 and there is
  // nothing to hint at on a public URL. With a key set, a drag must actually
  // reach the server and change the programme.
  const q = await page.evaluate(async () => {
    const res = await fetch('/api/queue', { cache: 'no-store' });
    const data = await res.json();
    const panel = document.getElementById('queuePanel');
    return { editable: Boolean(data.editable), hidden: panel ? panel.hidden : null, lock: data.lockSeconds };
  });

  if (!q.editable) {
    check('queue editor is hidden when no station key is configured', q.hidden === true,
      `editable=${q.editable} hidden=${q.hidden}`);
  } else {
    check('queue editor is shown when a station key is configured', q.hidden === false);

    const frozen = await page.$$eval('.q-item.locked', (n) => ({
      count: n.length, allInert: n.every((x) => x.dataset.movable === '0'),
    }));
    check('slots inside the lock fence are frozen', frozen.count >= 1, `${frozen.count} frozen (${q.lock}s fence)`);
    check('a frozen slot is never given a drag handle', frozen.allInert);
    check('no drag handles before the key is entered',
      (await page.$$('.q-item[data-movable="1"]')).length === 0);

    await page.fill('#queueKey', 'selftest-key');
    await page.click('#queueUnlock button');
    await page.waitForTimeout(400);
    check('the key field is cleared once entered', (await page.inputValue('#queueKey')) === '',
      'the key must not linger in the DOM');

    const movableRows = await page.$$('.q-item[data-movable="1"]');
    check('movable slots appear after unlocking', movableRows.length >= 2, `${movableRows.length} movable`);
    check('frozen slots stay frozen after unlocking',
      await page.$$eval('.q-item.locked', (n) => n.length > 0 && n.every((x) => x.dataset.movable === '0')));

    // Retry the drag a few times. This is not papering over flakiness — the
    // fixture tracks are 7-15s long, so the programme genuinely advances
    // between picking a row and dropping it, and the editor re-renders on its
    // poll. A row that was movable a second ago can legitimately be frozen or
    // gone by the time the pointer lands on it. Re-querying and retrying is
    // what a person does too. If three attempts all fail to move anything,
    // that is a real failure and it is reported as one.
    let before = null;
    let after = null;
    for (let attempt = 0; attempt < 3 && !after; attempt++) {
      const rows = await page.$$('.q-item[data-movable="1"]');
      if (rows.length < 3) { await page.waitForTimeout(1200); continue; }
      before = await page.$$eval('.q-item[data-movable="1"] .t', (n) => n.map((x) => x.textContent));
      const from = await rows[0].boundingBox();
      const to = await rows[2].boundingBox();
      if (!from || !to) { await page.waitForTimeout(800); continue; }
      await page.mouse.move(from.x + 40, from.y + from.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(from.x + 40, from.y + from.height / 2 + ((to.y - from.y) * i) / 10);
      }
      await page.mouse.up();
      await page.waitForTimeout(1600);
      const now = await page.$$eval('.q-item[data-movable="1"] .t', (n) => n.map((x) => x.textContent));
      if (JSON.stringify(now) !== JSON.stringify(before)) after = now;
    }

    check('dragging reorders the queue', Boolean(after),
      after ? `${before[0]} -> ${after[0]}` : 'no attempt moved a row');
    if (after) {
      // The load-bearing property: a reorder is a permutation, never an
      // insert or a delete, or cycleSeconds would move and re-date every
      // cycle boundary since the epoch.
      check('the reorder is a permutation — same tracks, same count',
        JSON.stringify([...before].sort()) === JSON.stringify([...after].sort()));
      check('the reorder was accepted, not refused',
        !/refused|could not|crosses|too close/i.test((await page.textContent('#queueStatus')) || ''),
        await page.textContent('#queueStatus'));
      check('the server recorded the override (not just the DOM)',
        await page.evaluate(async () =>
          Boolean((await (await fetch('/api/queue', { cache: 'no-store' })).json()).override)));

      // Only offered when an override exists, so check rather than assume.
      if (await page.isVisible('#queueReset')) {
        await page.click('#queueReset');
        await page.waitForTimeout(1500);
        check('reset restores the natural order',
          !(await page.evaluate(async () =>
            Boolean((await (await fetch('/api/queue', { cache: 'no-store' })).json()).override))));
      }
    }
  }

  // --- phone layout ---------------------------------------------------------
  // Emulation cannot settle iOS Safari's audio quirks (see the
  // tower-mobile-check skill for what still needs a real device), but it
  // settles layout — and layout is where this broke. On 2026-08-19 the art
  // frame used `margin:0 auto`, which makes a stretched grid item shrink to
  // its content: with no album art that content was a 64px placeholder SVG,
  // so the whole player rendered as a thumbnail on a phone while looking
  // perfect at 1280px. Every check above passed throughout.
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  try {
    // See the identical comment on the desktop goto() above: the dev-mode
    // SSE connection means 'networkidle' never fires here either.
    await phone.goto(base, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await phone.waitForFunction(() => document.getElementById('title')?.textContent !== 'Tuning in…', { timeout: 10000 });
    const box = await phone.evaluate(() => {
      const f = document.querySelector('.art-frame');
      const r = f.getBoundingClientRect();
      return { w: r.width, h: r.height, viewport: window.innerWidth };
    });
    check('art frame is a sensible size on a phone', box.w >= 180,
      `${box.w.toFixed(0)}px wide in a ${box.viewport}px viewport`);
    check('art frame stays square on a phone', Math.abs(box.w - box.h) < 2,
      `${box.w.toFixed(0)}x${box.h.toFixed(0)}`);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('nothing overflows the phone viewport horizontally', overflow <= 1, `${overflow}px overflow`);
  } finally {
    await phone.close();
  }

  // --- the rooms: Library, Photos, Crates (2026-09-23) -----------------------
  // The station must never be hurt by them, and the requested behaviours are
  // asserted as behaviours: a book *lifts* when hovered (its box moves up),
  // the map *zooms*, the lightbox *opens*. Skipped as a group when this
  // server has no collections folder (a fresh clone), because then the rooms
  // are correctly empty.
  const rooms = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const roomErrors = [];
  rooms.on('pageerror', (e) => roomErrors.push(String(e)));
  rooms.on('console', (m) => { if (m.type() === 'error' && !/dev\/reload/.test(m.text())) roomErrors.push(m.text()); });
  try {
    const col = await (await fetch(`${base}/api/collections`)).json();
    const bookCount = (col.university?.shelves || []).reduce((s, sh) => s + sh.books.length, 0);
    if (!col.ok || bookCount === 0) {
      check('rooms check skipped (no collections on this server)', true, col.reason || 'empty manifest');
    } else {
      await rooms.goto(`${base}/library.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await rooms.waitForSelector('.book', { timeout: 10000 });
      const shelf = await rooms.$$eval('.book', (b) => b.length);
      check('library: every book in the manifest is on a shelf', shelf === bookCount, `${shelf}/${bookCount} spines`);

      // An essay from the fullest shelf: a doorway book (the map room) has no
      // file to download, which is correct but not what this check is about.
      const book = rooms.locator('.shelf').last().locator('.book').nth(2);
      // Scroll first and settle, or hover()'s own scroll would be measured as
      // the lift (it was, the first time this ran: "rose 1000px").
      await book.scrollIntoViewIfNeeded();
      await rooms.mouse.move(5, 5);
      await rooms.waitForTimeout(500);
      const before = await book.boundingBox();
      await book.hover();
      await rooms.waitForTimeout(600);
      const after = await book.boundingBox();
      const lift = before.y - after.y;
      check('library: a hovered book lifts itself off the shelf', lift > before.height * 0.3 && lift < before.height,
        `rose ${lift.toFixed(0)}px of ${before.height.toFixed(0)}px`);
      check('library: the peek card shows the full title', await rooms.$eval('#peek', (p) => p.classList.contains('show') && p.textContent.length > 10));

      await book.click();
      await rooms.waitForSelector('#desk[open]', { timeout: 3000 });
      const deskLinks = await rooms.$$eval('#deskActions a', (as) => as.map((a) => a.getAttribute('href')));
      check('library: clicking a book opens the reading desk with Read + Download', deskLinks.some((h) => /\?download=1$/.test(h)), deskLinks.join(' '));
      await rooms.keyboard.press('Escape');

      const thesisDl = await rooms.$eval('#thesisCard a.btn.gold', (a) => a.getAttribute('href')).catch(() => null);
      if (thesisDl) {
        const head = await fetch(base + thesisDl, { method: 'HEAD' });
        check('library: the full thesis downloads', head.ok && /attachment/.test(head.headers.get('content-disposition') || ''), thesisDl);
      }

      if ((col.university.maps?.layers || []).length) {
        await rooms.locator('#maps').scrollIntoViewIfNeeded();
        await rooms.waitForFunction(() => document.getElementById('mapImg')?.naturalWidth > 0, null, { timeout: 8000 });
        const z0 = await rooms.textContent('#mapZoom');
        await rooms.click('.map-controls button[data-z="in"]');
        const z1 = await rooms.textContent('#mapZoom');
        check('library: the map room zooms', parseInt(z1, 10) > parseInt(z0, 10), `${z0} -> ${z1}`);
      }

      if ((col.photos?.albums || []).some((a) => a.items.length)) {
        await rooms.goto(`${base}/photos.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await rooms.waitForSelector('.ph', { timeout: 8000 });
        await rooms.click('.ph');
        await rooms.waitForSelector('#lightbox[open]', { timeout: 3000 });
        await rooms.waitForFunction(() => document.getElementById('lbImg')?.naturalWidth > 0, null, { timeout: 8000 });
        const cap1 = await rooms.textContent('#lbCap');
        await rooms.keyboard.press('ArrowRight');
        const cap2 = await rooms.textContent('#lbCap');
        check('photos: the lightbox opens and arrows through', cap1 !== cap2, `${cap1} -> ${cap2}`);
        await rooms.keyboard.press('Escape');
      }

      await rooms.goto(`${base}/crates.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await rooms.waitForSelector('.sleeve', { timeout: 8000 });
      const nexts = await rooms.$$eval('.s-next', (n) => n.map((x) => x.textContent));
      check('crates: sleeves render with when each is next on air', nexts.some((t) => /now|next/.test(t)), nexts.slice(0, 3).join(' | '));
      check('crates: there is no play button (a radio, not a jukebox)', (await rooms.$$('.crate-row audio, .crate-row [data-play]')).length === 0);

      await rooms.goto(`${base}/library.html`, { waitUntil: 'domcontentloaded' });
      await rooms.setViewportSize({ width: 390, height: 844 });
      await rooms.waitForSelector('.book');
      const over = await rooms.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check('library: nothing overflows a phone viewport (shelves scroll inside themselves)', over <= 1, `${over}px`);
      check('rooms: no console errors', roomErrors.length === 0, roomErrors.slice(0, 3).join(' | '));
    }
  } finally {
    await rooms.close();
  }

  if (shotPath) {
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`\nscreenshot -> ${shotPath}`);
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
