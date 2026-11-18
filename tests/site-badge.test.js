/**
 * Zone's date badge (site/js/world/badge.js, the mood board's MB-09) and the small motion pieces around it (MB-04
 * marquee, MB-07 entrances, MB-08 side text).
 *
 * What must hold: the badge reads Paris time and the broadcast day (before 05:00 it is still the night before), names
 * the four parts of the day with their Japanese; every section named in the mood board's table has its entrance, all
 * under 320 ms, none with less motion; the scroll-driven side text only where the browser has a view timeline.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { badgeFor } from '../site/js/world/badge.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'site/css/site.css'), 'utf8');

test('the badge: Paris time, the broadcast day, the four parts of the day', () => {
  const at = (iso) => badgeFor(Date.parse(iso));
  assert.deepEqual(at('2026-11-19T08:00:00Z'), { day: 19, weekday: 'JEU', word: 'MATIN', jp: '朝' }, '09:00 in Paris');
  assert.deepEqual(at('2026-11-19T12:30:00Z'), { day: 19, weekday: 'JEU', word: 'APRÈS-MIDI', jp: '午後' });
  assert.deepEqual(at('2026-11-19T18:30:00Z'), { day: 19, weekday: 'JEU', word: 'SOIR', jp: '夕方' });
  assert.deepEqual(at('2026-11-19T22:30:00Z'), { day: 19, weekday: 'JEU', word: 'NUIT', jp: '夜' });
  assert.deepEqual(at('2026-11-19T03:30:00Z'), { day: 18, weekday: 'MER', word: 'NUIT', jp: '夜' }, '04:30 in Paris is still Wednesday night');
  assert.equal(at('2026-11-19T04:00:00Z').word, 'MATIN', '05:00 in Paris, winter: the new day');
  assert.equal(at('2026-07-01T03:00:00Z').day, 1, '05:00 in Paris, summer, is 03:00 UTC');
  assert.equal(at('2026-07-01T02:59:00Z').day, 30, 'a minute before, still June 30');
});

test('every section in the mood board\'s table has its own entrance, under 320 ms, none with less motion', () => {
  for (const name of ['radio', 'ondes', 'playlists', 'antenna', 'booth', 'echo', 'articles', 'portfolio', 'atlas']) {
    assert.match(css, new RegExp(`\\.page-enter\\[data-enter="${name}"\\]`), `${name} has an entrance`);
  }
  const durations = [...css.matchAll(/\.page-enter\[data-enter="[a-z]+"\](?: li)?\{animation:pe-[a-z]+ ([\d.]+)s/g)].map((m) => Number(m[1]) * 1000);
  assert.ok(durations.length >= 9 && durations.every((ms) => ms <= 320), durations.join());
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.page-enter,\.page-enter li\{animation:none!important\}/);
});

test('the side text runs only where the browser has a view timeline, and not with less motion', () => {
  const at = css.indexOf('@supports (animation-timeline: view())');
  assert.ok(at > 0);
  assert.ok(css.indexOf('@media (prefers-reduced-motion: no-preference)', at) > at, 'and inside it, only for those who want motion');
  assert.match(css, /\.echo-article figcaption,\.echo-article blockquote,\.echo-article \.echo-kicker\{animation:side-in linear both;animation-timeline:view\(\)/);
});
