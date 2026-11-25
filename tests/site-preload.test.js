// Lighter step 4: the build asks for the whole start-up chain at once, and the chain stays light.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startupModules, withPreloads } from '../scripts/site-preload.mjs';

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');

test('the start-up chain: main.js and the world, with what they import — and not what a visitor asks for later', () => {
  const mods = startupModules(SITE);
  assert.equal(mods[0], 'js/main.js');
  for (const m of ['js/world/world.js', 'js/engine/transport.js', 'js/lib/schedule.js', 'js/viz/stage.js', 'js/ui/minibar.js']) assert.ok(mods.includes(m), m);
  // Out of the chain since 2026-11-25: the call map (Canopy only), the mini-player's face (the line, the cast),
  // every page, the boat, the Atelier.
  for (const m of ['js/viz/callmap.js', 'js/ui/telegraph.js', 'js/ui/cast.js', 'js/boat/boat.js', 'js/world/atelier.js']) assert.ok(!mods.includes(m), m);
  assert.ok(!mods.some((m) => m.startsWith('js/pages/')), mods.filter((m) => m.startsWith('js/pages/')).join(', '));
  for (const m of mods) assert.ok(fs.existsSync(path.join(SITE, m)), `${m} exists`);
  assert.equal(new Set(mods).size, mods.length, 'each once');
});

test('the shell gets one modulepreload per module, in <head>, once', () => {
  const html = '<html><head><base href="/">\n</head><body><script type="module" src="js/main.js"></script></body></html>';
  const out = withPreloads(html, ['js/main.js', 'js/a.js']);
  assert.match(out, /<link rel="modulepreload" href="js\/main\.js">\n<link rel="modulepreload" href="js\/a\.js">\n<\/head>/);
  assert.equal(withPreloads(out, ['js/b.js']), out, 'never twice');
  assert.equal(withPreloads('<head></head><body></body>', ['js/a.js']), '<head></head><body></body>', 'no entry script, nothing added');
});

test('rooms.css is not in the shell (the Archive asks for it: the site smoke\'s pages part proves it arrives)', () => {
  assert.ok(!fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').includes('css/rooms.css'));
});
