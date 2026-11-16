/**
 * scripts/compare-phone.mjs — the phone next to the desktop.
 *
 * What must hold:
 *   - it visits every address the site smoke's phone pass visits, at the
 *     three sizes the handoff names;
 *   - each flag is a measurement that crossed its line — off the side, under
 *     the first screen, under 12 px, a console error — and says by how much;
 *   - a page that did not load is a flag, not a blank;
 *   - the report is one page, shows what was flagged first, and writes
 *     nothing a route's name or a page's text could turn into markup.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, VIEWPORTS, MIN_TEXT_PX, parseArgs, fileOf, flagsFor, reportHtml } from '../scripts/compare-phone.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every address the site smoke\'s phone pass visits, at 1440×900, 390×844 and 375×667', () => {
  const smoke = fs.readFileSync(path.join(ROOT, 'scripts/site-smoke.mjs'), 'utf8');
  const list = /const PHONE_ROUTES = \[([\s\S]*?)\];/.exec(smoke)[1].match(/'[^']*'/g).map((s) => s.slice(1, -1));
  assert.deepEqual([...ROUTES].sort(), [...list].sort(), 'a route added to the phone pass is added here too');
  assert.deepEqual(VIEWPORTS.map((v) => [v.id, v.width, v.height, v.mobile]), [['desktop', 1440, 900, false], ['phone', 390, 844, true], ['small', 375, 667, true]]);
  assert.equal(MIN_TEXT_PX, 12);
});

test('the options: a published site or this copy, a label, some routes; pictures land in a dated folder', () => {
  const o = parseArgs(['--label', 'Before the Fix!', '--routes', '/radio,antenna/,radio']);
  assert.equal(o.label, 'before-the-fix');
  assert.deepEqual(o.routes, ['radio', 'antenna']);
  assert.match(o.out.split(path.sep).join('/'), /docs\/screenshots\/compare-\d{4}-\d\d-\d\d-before-the-fix$/);
  assert.equal(parseArgs(['--url', 'https://site.example/']).url, 'https://site.example');
  assert.equal(parseArgs([]).url, null);
  assert.throws(() => parseArgs(['--url', 'site.example']), /full address/);
  assert.throws(() => parseArgs(['--fast']), /unknown option/);
  assert.equal(fileOf('', 'phone'), 'home.phone.jpg');
  assert.equal(fileOf('echo/presse/2024-07-22-p12', 'small'), 'echo--presse--2024-07-22-p12.small.jpg');
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^docs\/screenshots\/compare-\*\/$/m, 'the pictures are working files, not history');
});

test('a flag is a measurement that crossed its line, and says by how much', () => {
  const clear = { fold: 774, overflowDoc: 0, overflowBox: 1, title: { text: 'Radio', top: 80, bottom: 120 }, action: { text: 'Tune in', top: 700, bottom: 744 }, small: { count: 0, min: null, samples: [] }, errors: [] };
  assert.deepEqual(flagsFor(clear), []);
  assert.deepEqual(flagsFor({ ...clear, action: null }), [], 'a page with no main action has nothing to be under the fold');
  assert.deepEqual(flagsFor({ ...clear, action: { text: 'Tune in', bottom: 647 }, fold: 597 }), [{ id: 'action', text: '« Tune in » ends 50 px under the first screen' }]);
  assert.deepEqual(flagsFor({ ...clear, title: { text: 'Archive', bottom: 800 } }), [{ id: 'title', text: 'the title ends 26 px under the first screen' }]);
  assert.deepEqual(flagsFor({ ...clear, title: null }), [{ id: 'title', text: 'no title (h1) on the page' }]);
  assert.deepEqual(flagsFor({ ...clear, overflowDoc: 14, overflowBox: 212 }).map((f) => f.text), ['the page runs 14 px off the side', 'the page runs 212 px off the side of its window']);
  assert.deepEqual(flagsFor({ ...clear, small: { count: 2, min: 10.5, samples: ['42 tracks', 'kbd'] } }), [{ id: 'small', text: '2 pieces of text under 12 px (smallest 10.5 px: « 42 tracks », « kbd »)' }]);
  assert.match(flagsFor({ ...clear, errors: ['TypeError: x is not a function', 'another'] })[0].text, /^2 console errors: TypeError: x is not a function$/);
  assert.deepEqual(flagsFor({ error: 'page.goto: Timeout 30000ms exceeded' }), [{ id: 'load', text: 'did not load: page.goto: Timeout 30000ms exceeded' }]);
  assert.deepEqual(flagsFor(null), [{ id: 'load', text: 'did not load: no measurement' }]);
});

test('the report: one page, what is flagged first, each route\'s three sizes side by side, nothing turned into markup', () => {
  const vp = Object.fromEntries(VIEWPORTS.map((v) => [v.id, v]));
  const results = [
    { route: 'radio', shots: [{ viewport: vp.desktop, file: 'radio.desktop.jpg', flags: [] }, { viewport: vp.phone, file: 'radio.phone.jpg', flags: [] }, { viewport: vp.small, file: 'radio.small.jpg', flags: [{ id: 'action', text: '« Tune <in> » ends 50 px under the first screen' }] }] },
    { route: 'echo/"><script>x</script>', shots: [{ viewport: vp.desktop, file: null, flags: [{ id: 'load', text: 'did not load: <b>boom</b>' }] }] },
    { route: '', shots: VIEWPORTS.map((v) => ({ viewport: v, file: fileOf('', v.id), flags: [] })) },
  ];
  const html = reportHtml(results, { source: 'https://site.example', date: '2026-11-16', label: 'before', commit: 'abcdef1234' });
  assert.match(html, /<title>Phone next to desktop — 2026-11-16 \(before\)<\/title>/);
  assert.match(html, /2 flags on 2 routes/);
  assert.match(html, /commit <code>abcdef1<\/code>/);
  assert.ok(html.indexOf('2 flags on 2 routes') < html.indexOf('<h2 id="r-radio">'), 'the summary comes before the pictures');
  assert.doesNotMatch(html, /<script>x<\/script>|<b>boom<\/b>|Tune <in>/, 'a route\'s name and a page\'s text are escaped');
  assert.match(html, /« Tune &lt;in&gt; » ends 50 px/);
  assert.equal(html.match(/<img /g).length, 6, 'a picture for every size that loaded');
  assert.match(html, /<img src="home\.small\.jpg" alt="\/ at Small phone 375×667" loading="lazy" width="375" height="667">/);
  assert.match(html, /<h2 id="r-home"><code>\/<\/code><\/h2>/);
  const clean = reportHtml([results[2]], { source: 'local', date: '2026-11-16' });
  assert.match(clean, /Nothing flagged/);
  assert.doesNotMatch(clean, /class="flag"><b>/);
});
