/**
 * The channel flip between Zone and Echo (site/js/world/flip.js, the mood board's MB-05).
 *
 * What must hold: it plays on a crossing and only on a crossing (not the first arrival, not inside a half, not an
 * instant jump); it is over in under 300 ms, and the CSS animations last exactly as long as the module says; with less
 * motion it does not play at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flips, FLIP_MS } from '../site/js/world/flip.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('it plays on a crossing and only on a crossing', () => {
  assert.equal(flips('zone', 'echo'), true);
  assert.equal(flips('echo', 'zone'), true, 'both ways');
  assert.equal(flips(null, 'echo'), false, 'not the first arrival of a visit');
  assert.equal(flips('zone', 'zone'), false, 'not a move inside a half');
  assert.equal(flips('zone', 'echo', { instant: true }), false, 'not an instant jump');
});

test('over in under 300 ms, its CSS as long as the module says, none of it with less motion', () => {
  assert.ok(FLIP_MS > 0 && FLIP_MS <= 300);
  const css = fs.readFileSync(path.join(ROOT, 'site/css/world.css'), 'utf8');
  const durations = [...css.matchAll(/\.go \.w-flip-[a-z]+\{animation:w-flip-[a-z]+ ([\d.]+)s/g)].map((m) => Math.round(Number(m[1]) * 1000));
  assert.equal(durations.length, 3, 'the wipe, the tear and the static');
  assert.ok(durations.every((ms) => ms === FLIP_MS), `${durations} = ${FLIP_MS}`);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.w-flip\{display:none\}\}/);
  assert.match(css, /\.w-flip\{position:absolute;inset:0;z-index:50;pointer-events:none;/);
});
