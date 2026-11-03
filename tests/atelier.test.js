/**
 * The map as data and everything that reads it (docs/ATELIER.md): the
 * shipped site/data/layout.json, the model that places the windows, the
 * short links, the versions of the past (snapshot, build, local serving),
 * the Atelier's save and `npm run layout`. The browser half — dragging a
 * window, a version in its window, the bar over an old page — is in
 * scripts/atelier-smoke.mjs. `fire` has its own file, tests/fire.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { BASE_H, DESIGNED, DISTRICTS, WORLD, byId, districtFor } from '../site/js/world/layout.js';
import {
  DRAFT_KEY, applyPages, checkLayout, layoutFile, mergeDraft, resolveLayout, stringifyLayout, worldHeight,
} from '../site/js/world/model.js';
import { atelierWanted } from '../site/js/world/flag.js';
import { TODAY, linkTo, refOf, resolveRef, sameRoute } from '../site/js/refs.js';
import { linkHref, renderBody } from '../scripts/site-echo.mjs';
import { assemble, devPastFile, listSnapshots, pastConfig, pastRoutes, pastShell, pointHome, snapshot } from '../scripts/site-past.mjs';
import { routes, builtFrom } from '../scripts/site-build.mjs';
import { saveLayout, createSiteServer } from '../scripts/site-serve.mjs';
import { edit, findPage, table } from '../scripts/site-layout.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data/layout.json'), 'utf8'));
const designed = () => DESIGNED.map((d) => ({ ...d, era: 'current', status: 'online', tag: [...d.tag] }));
const all = () => resolveLayout(FILE, { all: true }).pages;
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

test('the shipped map holds: every page of today has a window, nothing overlaps, every phone frame is clear', () => {
  const { pages, problems } = resolveLayout(FILE, { all: true });
  assert.deepEqual(problems, []);
  for (const d of DESIGNED) assert.ok(pages.some((p) => p.id === d.id), `${d.id} is on the map`);
  WORLD.h = worldHeight(pages);
  assert.deepEqual(checkLayout(pages).filter((i) => i.level === 'error'), []);
  // The text form is the one the Atelier and `npm run layout` write: one page per line, so a diff reads.
  assert.equal(fs.readFileSync(path.join(ROOT, 'site/data/layout.json'), 'utf8'), stringifyLayout(FILE));
  WORLD.h = BASE_H;
});

test('every version of the past on the map is frozen in past/, or is another site with an address', () => {
  const frozen = new Set(listSnapshots().map((s) => s.id));
  const past = all().filter((p) => p.era === 'past');
  assert.ok(past.length >= 2);
  for (const p of past) {
    assert.match(p.code, /^P-\d{2}$/);
    if (p.kind === 'version') {
      assert.ok(frozen.has(p.id), `past/${p.id}/ exists`);
      const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'past', p.id, 'SNAPSHOT.json'), 'utf8'));
      assert.match(meta.commit, /^[0-9a-f]{40}$/);
      assert.ok(fs.existsSync(path.join(ROOT, 'past', p.id, 'index.html')));
      assert.ok(!fs.existsSync(path.join(ROOT, 'past', p.id, 'station')), 'an old page plays today’s programme, never its own');
    } else assert.match(p.url, /^https:\/\//);
  }
});

test('resolveLayout: today’s pages keep what they are, the file says where; a bad entry is reported, never fatal', () => {
  const file = {
    pages: [
      { id: 'atlas', x: 1200, y: 900, w: 700, h: 720, rot: 2, tag: [9, 40, 1], title: 'Hijacked', route: 'evil' },
      { id: 'nonsense', x: 1, y: 1, w: 400, h: 300 },
      { id: 'atlas', x: 0, y: 0, w: 400, h: 300 },
      { id: 'old', code: 'P-09', title: 'Old', era: 'past', kind: 'version', half: 'zone', status: 'offline', x: 100, y: 2800, w: 900, h: 600 },
      { id: 'BAD', code: 'P-10', title: 'x', era: 'past', kind: 'version', half: 'zone', x: 0, y: 0, w: 400, h: 300 },
    ],
  };
  const { pages, problems } = resolveLayout(file);
  const atlas = pages.find((p) => p.id === 'atlas');
  assert.deepEqual([atlas.x, atlas.y, atlas.w, atlas.h, atlas.rot, atlas.tag], [1200, 900, 700, 720, 2, [9, 40, 1]]);
  assert.equal(atlas.title, 'Atlas', 'what a page is never comes from the file');
  assert.equal(atlas.route, 'atlas');
  assert.ok(!pages.some((p) => p.id === 'old'), 'offline: off the map');
  assert.ok(resolveLayout(file, { all: true }).pages.some((p) => p.id === 'old' && p.status === 'offline'), '…except for the Atelier');
  assert.equal(pages.length, DESIGNED.length, 'the pages the file forgot keep their designed place');
  assert.equal(problems.length, 3, problems.join(' | '));
  assert.deepEqual(resolveLayout(null).pages.map((p) => p.id), DESIGNED.map((d) => d.id), 'no file at all: the designed map');
});

test('checkLayout: overlaps, phone frames, the world’s edge, sizes — errors; the wrong side, a tilt, a stray tag — warnings', () => {
  const pages = designed();
  assert.deepEqual(checkLayout(pages), [], 'the designed map is clean');
  const zone = pages.find((p) => p.id === 'zone');
  zone.x = 1500; zone.y = 1000; // Zone's Atlas onto the Booth
  assert.ok(checkLayout(pages).some((i) => i.level === 'error' && i.id === 'zone' && /on top of booth/.test(i.msg)));
  zone.x = 380; zone.y = 1780;
  assert.deepEqual(checkLayout(pages), [], 'back in its place: clean again');
  // Clear of Ondes on a desktop (a 120 px gap), but on a phone each frame is up to 736 × 700 from its corner.
  const radio = pages.find((p) => p.id === 'radio');
  radio.x = 900; radio.w = 380;
  const phone = checkLayout(pages).filter((i) => i.level === 'error');
  assert.equal(phone.length, 1);
  assert.match(phone[0].msg, /too close to ondes for a phone/);
  const small = designed();
  small[0].w = 200;
  small[1].x = 5000;
  small[2].rot = 9;
  small[7].x = 2000; // Echo's Atlas into Zone's night
  const issues = checkLayout(small);
  assert.ok(issues.some((i) => i.level === 'error' && /too small/.test(i.msg)));
  assert.ok(issues.some((i) => i.level === 'error' && /off the world/.test(i.msg)));
  assert.ok(issues.some((i) => i.level === 'warn' && /tilted 9/.test(i.msg)));
  assert.ok(issues.some((i) => i.level === 'warn' && /Echo window reaching into Zone/.test(i.msg)));
  assert.equal(issues[0].level, 'error', 'errors first');
});

test('the file round-trips: what the Atelier writes is what the site reads back', () => {
  const pages = all();
  pages.find((p) => p.id === 'atlas').x = 130.04;
  const text = stringifyLayout(layoutFile(pages, { updatedAt: 'T' }));
  assert.equal(text.split('\n').filter((l) => l.startsWith('    {"id":')).length, pages.length, 'one line per page');
  const back = resolveLayout(JSON.parse(text), { all: true }).pages;
  assert.deepEqual(back.map((p) => [p.id, p.x, p.y, p.w, p.h, p.rot, p.tag.join(), p.status]), pages.map((p) => [p.id, Math.round(p.x * 10) / 10, p.y, p.w, p.h, p.rot, p.tag.join(), p.status]));
  const atlasLine = JSON.parse(text).pages.find((p) => p.id === 'atlas');
  assert.deepEqual(Object.keys(atlasLine), ['id', 'x', 'y', 'w', 'h', 'rot', 'tag'], 'a page of today: its place only');
});

test('applyPages refills the one DISTRICTS array every world module reads, and the world grows for the past band', () => {
  const same = DISTRICTS;
  try {
    applyPages(resolveLayout(FILE).pages);
    assert.equal(DISTRICTS, same, 'refilled in place, never replaced');
    assert.ok(byId('v1') && byId('v1').era === 'past');
    assert.ok(WORLD.h > BASE_H && WORLD.h >= byId('v1').y + byId('v1').h);
    assert.equal(districtFor('version', { id: 'v1' }), 'v1');
    assert.equal(districtFor('version', { id: 'wix' }), null, 'offline: no window, the page says so over the world');
    assert.equal(districtFor('go', { ref: 'E-05' }), null);
  } finally {
    applyPages(designed());
  }
  assert.equal(WORLD.h, BASE_H);
  assert.equal(byId('v1'), null);
});

test('the Atelier’s draft: the tab’s own choice, kept over the published map without losing a version published since', () => {
  const m = new Map();
  const s = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
  assert.equal(atelierWanted({ search: '', storage: s }), false);
  assert.equal(atelierWanted({ search: '?atelier=1', storage: s }), true);
  assert.equal(atelierWanted({ search: '', storage: s }), true, 'remembered for the tab');
  assert.equal(atelierWanted({ search: '?atelier=0', storage: s }), false);
  assert.equal(DRAFT_KEY, 'gt.atelier.draft');
  const draft = { pages: [{ id: 'atlas', x: 1, y: 2, w: 400, h: 300, rot: 0, tag: [1, 10, 0] }, { id: 'gone', era: 'past', kind: 'version', code: 'P-99', title: 'Gone', half: 'zone', x: 0, y: 0, w: 400, h: 300 }] };
  const merged = mergeDraft(FILE, draft);
  assert.equal(merged.pages.find((p) => p.id === 'atlas').x, 1);
  assert.ok(!merged.pages.some((p) => p.id === 'gone'), 'a version the published map dropped');
  assert.ok(merged.pages.some((p) => p.id === 'v1'), 'a version published since the draft');
  assert.equal(mergeDraft(FILE, null), FILE);
});

test('short links: codes, ids, articles, rooms, the past in its window or full screen, offline and unknown', () => {
  const pages = all();
  assert.deepEqual(resolveRef('E-05', pages), { kind: 'route', to: 'atlas', page: byIdIn(pages, 'atlas') });
  assert.equal(resolveRef('gt:e-05', pages).to, 'atlas', 'gt: and any case');
  assert.equal(resolveRef('atlas', pages).to, 'atlas');
  // The map's Atlas was Z-04 until it moved to Echo (2026-11-01): a link handed out before still lands on it.
  assert.deepEqual(resolveRef('Z-04', pages), { kind: 'route', to: 'atlas' });
  assert.deepEqual(resolveRef('Z-03', pages), { kind: 'route', to: 'zone', page: byIdIn(pages, 'zone') }, 'Z-03 is Zone\'s Atlas again');
  assert.equal(resolveRef('E-02/article-temoin', pages).to, 'echo/article-temoin');
  assert.equal(resolveRef('E-02', pages).to, 'echo', 'Articles has no address of its own: the Une');
  assert.equal(resolveRef('E-03/voyages', pages).to, 'echo/lectures/voyages');
  assert.equal(resolveRef('Z-05/photos', pages).to, 'portfolio/photos');
  assert.deepEqual([resolveRef('P-01', pages).kind, resolveRef('P-01', pages).to], ['route', 'versions/v1']);
  assert.deepEqual([resolveRef('v1/atlas', pages).kind, resolveRef('v1/atlas', pages).to], ['load', 'past/v1/atlas']);
  assert.equal(resolveRef('wix', pages).kind, 'offline');
  const online = pages.map((p) => (p.id === 'wix' ? { ...p, status: 'online' } : p));
  assert.deepEqual([resolveRef('P-03', online).kind, resolveRef('P-03', online).to], ['external', 'https://arthurbarrier.wixsite.com/globe-trotter']);
  assert.equal(resolveRef('ecrits/voyages', pages).to, 'ecrits/voyages', 'an address of the site passes through');
  assert.equal(resolveRef('nowhere', pages), null);
  assert.equal(resolveRef('../etc', pages), null);
  assert.equal(resolveRef('javascript:alert(1)', pages), null);
  assert.equal(refOf('gt:/Z-04/'), 'Z-04');
  assert.equal(linkTo('gt:Z-04'), 'go/Z-04');
});
function byIdIn(pages, id) { return pages.find((p) => p.id === id); }

test('the same page in another version: renames both ways, nothing invented', () => {
  const v1 = all().find((p) => p.id === 'v1').routes;
  const v2 = all().find((p) => p.id === 'v2').routes;
  assert.equal(sameRoute('ecrits/voyages', TODAY), 'echo/lectures/voyages');
  assert.equal(sameRoute('echoes', TODAY), 'ondes');
  assert.equal(sameRoute('echo/lectures/odes', v1), 'ecrits/odes');
  assert.equal(sameRoute('ondes', v1), 'echoes');
  assert.equal(sameRoute('atlas', v1), 'atlas');
  assert.equal(sameRoute('', v1), '');
  assert.equal(sameRoute('playlists', v1), null, 'v1 had no playlists');
  assert.equal(sameRoute('echo/archives', v2), null, 'v2 had Echo, not its Archives');
  assert.equal(sameRoute('echo/lectures/odes', v2), 'echo/lectures/odes');
});

test('Echo articles take links: a ref, an address of the site, the web — nothing else', () => {
  assert.equal(linkHref('gt:Z-04'), 'go/Z-04');
  assert.equal(linkHref('gt:v1/atlas'), 'go/v1/atlas');
  assert.equal(linkHref('atlas'), 'atlas');
  assert.equal(linkHref('https://example.org/a?b=1'), 'https://example.org/a?b=1');
  assert.equal(linkHref('javascript:alert(1)'), null);
  assert.equal(linkHref('gt:../x'), null);
  const { html } = renderBody('Voir [l’Atlas](gt:Z-04) ; [le web](https://example.org) ; [rien](javascript:x).');
  assert.match(html, /<a href="go\/Z-04">l’Atlas<\/a>/);
  assert.match(html, /<a href="https:\/\/example.org" target="_blank" rel="noopener">le web<\/a>/);
  assert.ok(!/javascript/.test(html.match(/href="[^"]*"/g).join('')), 'no script address ever becomes a link');
  assert.ok(!/https\s:/.test(html), 'the French spacing never lands inside an address');
});

test('Echo articles take a picture in the text: a site path or https, with its caption; anything else stays text', () => {
  const { html } = renderBody('Avant.\n\n![Une banderole verte](assets/echo/x.jpg "« Arrête », 17 octobre")\n\nAprès.');
  assert.match(html, /<figure class="echo-fig"><img src="assets\/echo\/x\.jpg" alt="Une banderole verte" loading="lazy"><figcaption>«.Arrête.», 17 octobre<\/figcaption><\/figure>/);
  assert.match(html, /<p>Avant\.<\/p>[\s\S]*<figure[\s\S]*<p>Après\.<\/p>/);
  const bad = renderBody('![x](javascript:alert(1))').html;
  assert.ok(!/<img/.test(bad), 'no script address ever becomes a picture');
});

test('a version of the past: its shell, its config (today’s tower), its routes, its data pointed at today’s heavy files', () => {
  const shell = pastShell('<head><base href="/"></head>', { id: 'v1', base: '/radio-tower/' });
  assert.match(shell, /<base href="\/radio-tower\/past\/v1\/">/);
  assert.match(shell, /<meta name="gt-past" content="v1">/);
  assert.match(shell, /<script type="module" src="\/radio-tower\/past\/bar\.js"><\/script>/);
  const cfg = pastConfig({ mode: 'cloud', tower: { url: 'https://old' }, site: { title: 'Old' }, world: true }, { mode: 'tower', tower: { url: 'https://new' } });
  assert.deepEqual(cfg, { mode: 'tower', tower: { url: 'https://new' }, site: { title: 'Old' } });
  const page = all().find((p) => p.id === 'v1');
  const r = pastRoutes(page, { texts: [{ slug: 'odes' }], echo: [{ slug: 'x' }] });
  assert.ok(r.includes('ecrits/odes') && r.includes('portfolio/photos') && r.includes('atlas'));
  assert.ok(!r.includes('echo/x'), 'v1 had no Echo');
  assert.deepEqual(pointHome({ a: 'collections/u/x.jpg', b: ['press/nh/1.pdf', 'assets/k.svg'], c: 3 }),
    { a: '../../collections/u/x.jpg', b: ['../../press/nh/1.pdf', 'assets/k.svg'], c: 3 });
  assert.equal(pointHome('press/kept.pdf', (rel) => rel === 'press/kept.pdf'), 'press/kept.pdf', 'a file the snapshot kept is its own');
});

test('the build lays an online version out under past/<id>/, with today’s station and small shared files', async () => {
  const dist = tmp('past-dist');
  fs.mkdirSync(path.join(dist, 'fonts'), { recursive: true });
  fs.mkdirSync(path.join(dist, 'station'), { recursive: true });
  fs.mkdirSync(path.join(dist, 'collections'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'fonts/f.woff2'), 'font');
  fs.writeFileSync(path.join(dist, 'station/library.json'), '{"today":true}');
  fs.writeFileSync(path.join(dist, 'collections/big.jpg'), 'big');
  fs.writeFileSync(path.join(dist, 'config.json'), JSON.stringify({ mode: 'tower', tower: { url: 'https://today' } }));
  const page = all().find((p) => p.id === 'v1');
  const out = await assemble(page, { dist, base: '/' });
  const v = path.join(dist, 'past/v1');
  assert.equal(out.id, 'v1');
  assert.match(fs.readFileSync(path.join(v, 'index.html'), 'utf8'), /<base href="\/past\/v1\/">/);
  assert.match(fs.readFileSync(path.join(v, 'atlas/index.html'), 'utf8'), /past\/bar\.js/);
  assert.equal(fs.readFileSync(path.join(v, 'station/library.json'), 'utf8'), '{"today":true}');
  assert.equal(fs.readFileSync(path.join(v, 'fonts/f.woff2'), 'utf8'), 'font');
  assert.ok(!fs.existsSync(path.join(v, 'collections')), 'the heavy files are not copied');
  assert.ok(!fs.existsSync(path.join(v, 'SNAPSHOT.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(v, 'config.json'), 'utf8')).tower.url, 'https://today');
  assert.match(fs.readFileSync(path.join(v, 'data/collections.json'), 'utf8'), /"\.\.\/\.\.\/collections\//);
  await assert.rejects(assemble({ ...page, id: 'nope' }, { dist, base: '/' }), /holds no snapshot/);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('the local server serves a version straight from its snapshot, the same overlay as the build', async () => {
  const today = { mode: 'tower', tower: { url: 'https://today' } };
  assert.deepEqual((await devPastFile('v1', 'config.json', { today })).json.tower, today.tower);
  assert.match((await devPastFile('v1', 'ecrits/odes', { today })).html, /<base href="\/past\/v1\/">/);
  assert.ok((await devPastFile('v1', 'js/main.js', { today })).file.endsWith(path.join('past', 'v1', 'js', 'main.js')));
  assert.deepEqual(await devPastFile('v1', 'collections/a/b.jpg', { today }), { collections: 'a/b.jpg' });
  assert.ok((await devPastFile('v1', 'station/library.json', { today })).file.endsWith(path.join('site', 'station', 'library.json')));
  assert.match(JSON.stringify((await devPastFile('v1', 'data/collections.json', { today })).json), /\.\.\/\.\.\/collections\//);
  assert.equal(await devPastFile('v1', 'SNAPSHOT.json', { today }), null);
  assert.equal(await devPastFile('v1', '../../package.json', { today }), null);
  assert.equal(await devPastFile('nope', '', { today }), null);
});

test('a snapshot freezes site/ at a commit, less the station and what is byte for byte today’s — and is never retaken', () => {
  const root = tmp('past-snap');
  const g = (...a) => execFileSync('git', a, { cwd: root, stdio: 'pipe' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  for (const [f, body] of [['site/index.html', '<base href="/">'], ['site/station/library.json', '{}'], ['site/fonts/same.woff2', 'same'], ['site/fonts/old.woff2', 'old'], ['site/js/main.js', '1']]) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), body);
  }
  g('add', '.');
  g('commit', '-qm', 'then');
  fs.writeFileSync(path.join(root, 'site/fonts/old.woff2'), 'changed since');
  const meta = snapshot('t1', 'HEAD', { root, quiet: true });
  const has = (f) => fs.existsSync(path.join(root, 'past/t1', f));
  assert.ok(has('index.html') && has('js/main.js'));
  assert.ok(!has('station/library.json'), 'never the station');
  assert.ok(!has('fonts/same.woff2'), 'today’s copy is the same: filled in at build');
  assert.ok(has('fonts/old.woff2'), 'today’s differs: the snapshot keeps its own');
  assert.equal(meta.files, 3);
  assert.equal(meta.fromToday, 1);
  assert.throws(() => snapshot('t1', 'HEAD', { root, quiet: true }), /never retaken/);
  assert.throws(() => snapshot('Bad Id', 'HEAD', { root, quiet: true }), /usable id/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the build serves every window’s address and every short link cold, and says which commit it is', () => {
  const pages = resolveLayout(FILE).pages;
  const r = routes([], [], pages);
  for (const want of ['versions/v1', 'versions/v2', 'go/E-05', 'go/atlas', 'go/Z-03', 'go/zone', 'go/Z-04', 'go/Z-05', 'go/P-01', 'go/v1', 'radio', 'echo/archives']) assert.ok(r.includes(want), want);
  assert.ok(!r.includes('versions/wix') && !r.includes('go/P-03'), 'an offline version has no shell: it answers like any unknown address');
  assert.equal(new Set(r).size, r.length, 'no address twice');
  assert.equal(builtFrom({ VERCEL_GIT_COMMIT_SHA: 'abc' }), 'abc');
  assert.equal(builtFrom({ GITHUB_SHA: 'def' }), 'def');
  assert.match(builtFrom({}) || '', /^([0-9a-f]{40})?$/, 'on the tower (a git checkout): git says');
});

test('the Atelier saves only a sound map, one page per line, from this machine only', async () => {
  const dir = tmp('atelier-save');
  const file = path.join(dir, 'layout.json');
  fs.writeFileSync(file, stringifyLayout(FILE));
  const pages = all();
  pages.find((p) => p.id === 'wix').status = 'online';
  const [ok, body] = await saveLayout(stringifyLayout(layoutFile(pages)), file);
  assert.equal(ok, 200);
  assert.equal(body.pages, pages.length);
  assert.equal(resolveLayout(JSON.parse(fs.readFileSync(file, 'utf8')), { all: true }).pages.find((p) => p.id === 'wix').status, 'online');
  const broken = all();
  Object.assign(broken.find((p) => p.id === 'booth'), { x: 500, y: 1800 });
  const [bad, why] = await saveLayout(stringifyLayout(layoutFile(broken)), file);
  assert.equal(bad, 422);
  assert.match(why.error, /zone: on top of booth/);
  assert.equal((await saveLayout('{nope', file))[0], 400);

  const server = await createSiteServer({ layoutFile: file, quiet: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    assert.deepEqual(await (await fetch(`${base}__atelier/ping`)).json(), { writable: true });
    const put = await fetch(`${base}__atelier/layout`, { method: 'PUT', body: stringifyLayout(FILE) });
    assert.equal(put.status, 200);
    assert.equal((await (await fetch(`${base}data/layout.json`)).json()).pages.find((p) => p.id === 'wix').status, 'offline');
    const v1 = await fetch(`${base}past/v1/atlas`);
    assert.equal(v1.status, 200);
    assert.match(await v1.text(), /<meta name="gt-past" content="v1">/);
    const bare = await fetch(`${base}past/v1`, { redirect: 'manual' });
    assert.equal(bare.status, 301);
    assert.equal((await fetch(`${base}past/nope/`)).status, 404);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('npm run layout: move, nudge, size, tilt, tag, swap, online — one line each, on the map the file holds', () => {
  const pages = all();
  assert.match(edit(pages, ['move', 'E-05', '1200', '900']), /E-05 Atlas → 1200, 900/);
  assert.equal(findPage(pages, 'Z-03').id, 'zone', 'a code finds its page; the id « atlas » finds Echo\'s Atlas, not Zone\'s of the same title');
  assert.deepEqual([findPage(pages, 'atlas').x, findPage(pages, 'atlas').y], [1200, 900]);
  edit(pages, ['nudge', 'atlas', '+10', '-20']);
  assert.deepEqual([findPage(pages, 'atlas').x, findPage(pages, 'atlas').y], [1210, 880]);
  edit(pages, ['size', 'Atlas', '700', '720']);
  edit(pages, ['tilt', 'atlas', '2']);
  edit(pages, ['tag', 'atlas', '9', '45', '-2']);
  assert.deepEqual([findPage(pages, 'atlas').w, findPage(pages, 'atlas').h, findPage(pages, 'atlas').rot, findPage(pages, 'atlas').tag], [700, 720, 2, [9, 45, -2]]);
  const [z, a] = [{ ...findPage(pages, 'playlists') }, { ...findPage(pages, 'atlas') }];
  edit(pages, ['swap', 'atlas', 'playlists']);
  assert.deepEqual([findPage(pages, 'playlists').x, findPage(pages, 'atlas').x], [a.x, z.x]);
  assert.match(edit(pages, ['offline', 'v1']), /offline/);
  assert.equal(findPage(pages, 'P-01').status, 'offline');
  assert.match(table(pages), /P-01\s+Version 1.*OFFLINE/);
  assert.throws(() => edit(pages, ['offline', 'atlas']), /only the versions of the past/);
  assert.throws(() => edit(pages, ['move', 'nowhere', '1', '2']), /no page "nowhere"/);
  assert.throws(() => edit(pages, ['move', 'atlas', 'x', '2']), /must be a number/);
  assert.throws(() => edit(pages, ['fly', 'atlas']), /unknown command/);
});
