/**
 * The site smoke, dist: the built dist/ under a repository sub-path, on a cold deep link.
 * One part of scripts/site-smoke.mjs (`--only dist` runs it alone); scripts/smoke/harness.mjs is what it is handed.
 */
import { createSiteServer } from '../site-serve.mjs';
import { build } from '../site-build.mjs';
import { liveCheck } from '../cloud-live-check.mjs';

export default async function dist({ check, listen, fixtures, browser, watch }) {
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
  const dWorld = await d.evaluate(() => window.radioTower?.world?.current || null);
  // A text opens in the Articles window since 2026-11-03 (its list went into the Livre miroir).
  check('the built site answers a cold deep link under /<repo>/, in the world as shipped', dh === 'Opal Orre' && dWorld === 'articles', `${dh || 'no heading'}, ${dWorld}`);
  check('…and knows which repository its booth writes to', cfg?.owner === 'ortis' && cfg?.repo === 'radio-tower');
  const dc = await (await browser.newContext()).newPage();
  watch(dc, 'dist, classic');
  await dc.goto(`http://127.0.0.1:${distPort}/radio-tower/echo/lectures/opal-orre?classic=1`, { waitUntil: 'domcontentloaded' });
  await dc.waitForSelector('.reading h1', { timeout: 10000 }).catch(() => {});
  const dch = await dc.evaluate(() => ({ h1: document.querySelector('.reading h1')?.textContent, world: Boolean(window.radioTower?.world || document.querySelector('.w-root')) }));
  check('…and so does its classic shell, under ?classic=1', dch.h1 === 'Opal Orre' && !dch.world, JSON.stringify(dch));
  await dc.context().close();
  // The go-live checker (GO-LIVE §4) against the same build on a Pages-shaped
  // server with a stand-in GitHub API: nothing to fail on a site that works.
  const liveServer = await createSiteServer({ dist: true, base: '/radio-tower/', fixtures, fakeGithub: true });
  const livePort = await listen(liveServer);
  const live = await liveCheck(`http://127.0.0.1:${livePort}/radio-tower/`);
  liveServer.close();
  const liveFails = live.filter((r) => r.level === 'FAIL');
  check('the go-live checker passes a working build, audio and queue included', liveFails.length === 0 && live.some((r) => /audio/.test(r.name) && r.level === 'PASS'),
    liveFails.map((r) => `${r.name}: ${r.detail}`).join(' | ') || `${live.filter((r) => r.level === 'PASS').length} pass, ${live.filter((r) => r.level === 'WARN').length} warn`);
  // The page first, then its server: left open, its next control.json poll would hit a closed port.
  await d.context().close();
  distServer.close();
}
