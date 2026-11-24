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
 *   - the world shell (docs/WORLD.md) is what the site ships since phase 5b:
 *     a bare address opens it, and the camera flies to each route's district
 *     while the radio plays on, by tag, arrow key, minimap, switch and Back;
 *     each page opens in its district's window at 1:1, every route answers on
 *     a cold link, 20 pans never cut the radio, and Tab follows the camera; on
 *     a phone (upright or on its side) a swipe goes to the other half and
 *     nothing that is not a swipe does, and every page fits and passes axe;
 *     the built dist/ and a tower-mode visit (the live site's set-up) open it
 *     too;
 *   - the classic shell, kept one release behind ?classic=1 (remembered for
 *     the tab): the checks on listeners A and B, the booth, the rooms and the
 *     classic phone pass run on it.
 *
 * Since 2026-11-24 the checks live in five parts, scripts/smoke/<part>.mjs, that share one harness
 * (scripts/smoke/harness.mjs: the fixtures, the dev server, the browser) and read nothing from each other, so GitHub
 * runs them side by side (docs/plans/LIGHTER-2026-11-24.md, step 2). This file runs them, all in turn by default.
 *
 * Usage: node scripts/site-smoke.mjs [towerUrl] [--only part,part]   (or SITE_SMOKE_ONLY=part,part)
 *        parts: classic, world, phone, dist, tower; « tower » checks nothing without a towerUrl
 */
import { open } from './smoke/harness.mjs';

export const PARTS = ['classic', 'world', 'phone', 'dist', 'tower'];

const args = process.argv.slice(2);
const towerUrl = args.find((a) => a.startsWith('http')) || null;
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : process.env.SITE_SMOKE_ONLY;
const parts = only ? only.split(',').map((s) => s.trim()).filter(Boolean) : PARTS;
const unknown = parts.filter((p) => !PARTS.includes(p));
if (unknown.length || !parts.length) {
  console.error(`site-smoke: no part called ${unknown.join(', ') || '(none)'}; the parts are ${PARTS.join(', ')}`);
  process.exit(2);
}

const h = await open({ towerUrl });
if (!h) process.exit(0);
const firstLines = (err) => err.stack?.split('\n').slice(0, 3).join(' ');
try {
  for (const part of parts) {
    const t0 = Date.now();
    const n0 = h.results.length;
    // A part that throws is one failure, and the next part still runs: none depends on another.
    try {
      const { default: run } = await import(`./smoke/${part}.mjs`);
      await run(h);
    } catch (err) {
      h.check(`site smoke ran to completion (${part})`, false, firstLines(err));
    }
    console.log(`----  ${part}: ${h.results.length - n0} checks in ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  h.check('no console errors anywhere', h.errors.length === 0, h.errors.slice(0, 3).join(' | '));
} catch (err) {
  h.check('site smoke ran to completion', false, firstLines(err));
} finally {
  await h.close();
}

const failed = h.results.filter((r) => !r.ok).length;
console.log(`\n${h.results.length - failed}/${h.results.length} site checks passed${only ? ` (${parts.join(', ')})` : ''}`);
process.exit(failed ? 1 : 0);
