/**
 * The site's own logic that can be checked without a browser: the booth's
 * mood engine must agree with the DJ CLI's, the visual settings must clamp
 * and hand control between listener and tower correctly, and the writing
 * must come through verbatim.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cli from '../dj/dj.mjs';
import * as web from '../site/js/ui/moods.js';
import { normalise, lookToSettings, VisualSettings, LOOKS, LAYERS } from '../site/js/viz/settings.js';
import { toHtml, frontMatter, build as buildTexts } from '../scripts/site-texts.mjs';
import { routes, normaliseBase, shellFor } from '../scripts/site-build.mjs';
import { CloudEngine } from '../site/js/engine/cloud.js';
import { webAudioIsSafe } from '../site/js/player.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOODS = JSON.parse(fs.readFileSync(path.join(ROOT, 'dj/moods.json'), 'utf8'));
const LIBRARY = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/station/library.json'), 'utf8'));

test('the booth in the browser plans every mood exactly as dj.mjs does', () => {
  const t = Date.parse('2026-09-27T09:00:00Z');
  for (let k = 0; k < 6; k++) {
    const eng = new CloudEngine({ library: LIBRARY, clock: () => t + k * 1_700_000 });
    const slots = eng.get('/api/queue').body.slots;
    const inputs = [...Object.keys(MOODS.moods), 'zelda rain', 'night', 'something like macroblank'];
    for (const input of inputs) {
      const a = cli.planEmission(slots, cli.resolveMood(input, MOODS));
      const b = web.planEmission(slots, web.resolveMood(input, MOODS));
      assert.equal(b.ok, a.ok, input);
      if (!a.ok) continue;
      assert.deepEqual(b.ids, a.ids, `mood "${input}" orders the window differently`);
      assert.equal(b.matched, a.matched, input);
      assert.equal(b.changed, a.changed, input);
      assert.equal(b.startWithin, a.startWithin, input);
    }
  }
});

test('fold agrees with the CLI on the library\'s hardest names', () => {
  for (const s of ['𝗟𝗢𝗦𝗧 𝗩𝗜𝗗𝗘𝗢𝗚𝗔𝗠𝗘 𝗠𝗔𝗟𝗟', 'ＶＥＲＩＤＩＳ', 'Coração sertão', 'snowpoint lounge - 思い出の森', 'silph skyline ◓']) {
    assert.equal(web.fold(s), cli.fold(s), s);
  }
});

test('visual settings clamp anything thrown at them', () => {
  const s = normalise({ look: 'nope', intensity: 7, motion: -3, sensitivity: 'abc', hue: 999, ambient: null, layers: { ring: 0, bloom: 'yes', bogus: true } });
  assert.equal(s.intensity, 1);
  assert.equal(s.motion, 0);
  assert.equal(s.sensitivity, 1);
  assert.equal(s.hue, 360);
  assert.equal(s.layers.ring, false);
  assert.equal(s.layers.bloom, true);
  assert.equal('bogus' in s.layers, false);
  assert.equal(normalise(null).look, 'stage');
});

test('every look names only real layers, and "off" paints nothing', () => {
  const ids = new Set(LAYERS.map((l) => l.id));
  for (const [name, look] of Object.entries(LOOKS)) for (const l of look.layers) assert.ok(ids.has(l), `${name}: ${l}`);
  const off = lookToSettings('off');
  assert.equal(off.intensity, 0);
  assert.ok(Object.values(off.layers).every((v) => v === false));
});

test('a listener follows the tower\'s look until they touch a control, then one box hands it back', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const vs = new VisualSettings({ storage });
  vs.setBroadcast({ look: 'horizon' });
  assert.equal(vs.following, true);
  assert.equal(vs.effective.layers.horizon, true);

  vs.update({ intensity: 0.3 });
  assert.equal(vs.following, false, 'touching a control means your settings win');
  assert.equal(vs.effective.intensity, 0.3);
  vs.setBroadcast({ look: 'quiet' });
  assert.equal(vs.effective.intensity, 0.3, 'a new broadcast must not override a listener who chose');

  vs.setFollow(true);
  assert.equal(vs.effective.look, 'quiet');
  const again = new VisualSettings({ storage });
  assert.equal(again.follow, true, 'remembered in this browser');
});

test('reduced motion starts calm', () => {
  const vs = new VisualSettings({ storage: { getItem: () => null, setItem: () => {} }, reducedMotion: true });
  assert.equal(vs.effective.look, 'quiet');
});

test('the texts come through verbatim — spelling, punctuation and all', () => {
  const html = toHtml('**[Révélation]**\n\n*D\'après* *Nous*\n\nL\'ascenceur tombe — rien corrigé\nligne deux');
  assert.match(html, /<h2>Révélation<\/h2>/);
  assert.match(html, /L'ascenceur tombe — rien corrigé<br>ligne deux/);
  assert.match(html, /<em>D'après<\/em>/);
  assert.equal(toHtml('<script>x</script>').includes('<script>'), false);
  const { meta, body } = frontMatter('---\ntitre: Voyages\npublie: 2025-03-21\n---\nSur les toits');
  assert.equal(meta.titre, 'Voyages');
  assert.equal(body, 'Sur les toits');

  const data = buildTexts();
  assert.equal(data.texts.length, 6);
  const scored = data.texts.filter((t) => t.scoredBy).map((t) => t.slug).sort();
  assert.deepEqual(scored, ['coracao-sertao', 'opal-orre', 'voyages']);
  assert.ok(data.texts.find((t) => t.slug === 'l-ascenceur-tombe').title === "L'ascenceur tombe", 'the title keeps its c');
});

test('the build writes a shell at every route, including every text', () => {
  const r = routes([{ slug: 'voyages' }, { slug: 'odes' }]);
  for (const want of ['radio', 'atlas', 'ecrits', 'portfolio/photos', 'booth', 'ecrits/voyages', 'ecrits/odes']) assert.ok(r.includes(want), want);
  assert.equal(normaliseBase('radio-tower'), '/radio-tower/');
  assert.equal(normaliseBase('/radio-tower/'), '/radio-tower/');
  assert.equal(normaliseBase(''), '/');
});

test('the visualiser may take the music through Web Audio except on an iPhone that cannot call it music', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  assert.equal(webAudioIsSafe({ userAgent: iphone, audioSession: { type: 'auto' } }), true, 'iOS 16.4+: declared as playback in tuneIn()');
  assert.equal(webAudioIsSafe({ userAgent: iphone }), false, 'older iOS: silent switch and screen lock would stop the music');
  assert.equal(webAudioIsSafe({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }), false, 'an iPad asking for the desktop site is still iOS');
  assert.equal(webAudioIsSafe({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }), true, 'a Mac');
  assert.equal(webAudioIsSafe({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129 Mobile' }), true);
});

test('the Pages shell gives link previews an absolute picture and address', () => {
  const html = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');
  const out = shellFor(html, { base: '/radio-tower/', siteUrl: 'https://ortis.github.io/radio-tower' });
  assert.match(out, /<base href="\/radio-tower\/">/);
  assert.match(out, /<meta property="og:image" content="https:\/\/ortis\.github\.io\/radio-tower\/assets\/share-card\.jpg">/);
  assert.match(out, /<meta property="og:url" content="https:\/\/ortis\.github\.io\/radio-tower\/">/);
  assert.ok(fs.existsSync(path.join(ROOT, 'site/assets/share-card.jpg')), 'the card exists (node scripts/site-card.mjs)');
  const local = shellFor(html, { base: '/' });
  assert.match(local, /content="assets\/share-card\.jpg"/, 'no address known: left relative');
  assert.doesNotMatch(local, /property="og:url"/);
});
