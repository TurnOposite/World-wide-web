// Lighter step 5: the site's one animation loop (site/js/lib/pulse.js) and its switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, skyVars } from '../site/js/lib/pulse.js';
import { skyAt } from '../site/js/lib/station-time.js';
import { pulseWanted } from '../site/js/world/flag.js';

test('the bass is smoothed (it breathes, it does not flicker) and a beat falls off in about a third of a second', () => {
  let s = { bass: 0, hit: 0 };
  s = step(s, { low: 1, hit: 0 }, 1 / 60);
  assert.ok(s.bass > 0.1 && s.bass < 0.2, `one frame towards a loud low end: ${s.bass}`);
  for (let i = 0; i < 60; i++) s = step(s, { low: 1, hit: 0 }, 1 / 60);
  assert.ok(s.bass > 0.99, 'a second of it: there');
  s = step(s, { low: 0, hit: 0.8 }, 1 / 60);
  assert.equal(s.hit, 0.8);
  for (let i = 0; i < 20; i++) s = step(s, { low: 0, hit: 0 }, 1 / 60);
  assert.equal(s.hit, 0, 'gone a third of a second later');
  assert.deepEqual(step({ bass: 0, hit: 0 }, { low: 7, hit: 9 }, 1), { bass: 1, hit: 1 }, 'never past 1');
  assert.deepEqual(step({ bass: 0, hit: 0 }, null, 1 / 60), { bass: 0, hit: 0 }, 'no visualiser: silence');
});

test('idle is calm: with reduced motion the bass and the beat stay at 0', () => {
  assert.deepEqual(step({ bass: 0.5, hit: 0.5 }, { low: 1, hit: 1 }, 1 / 60, true), { bass: 0, hit: 0 });
});

test('the sky reaches the page as four variables', () => {
  const v = skyVars(skyAt(0));
  assert.deepEqual(Object.keys(v), ['--sky-top', '--sky-hor', '--sky-mist', '--sky-dark']);
  assert.match(v['--sky-top'], /^#[0-9a-f]{6}$/);
  assert.equal(v['--sky-dark'], '0.840');
});

test('?pulse=1 turns it on for the tab, ?pulse=0 off; off by default', () => {
  const kept = new Map();
  const storage = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v) };
  assert.equal(pulseWanted({ search: '', storage }), false);
  assert.equal(pulseWanted({ search: '?pulse=1', storage }), true);
  assert.equal(pulseWanted({ search: '', storage }), true, 'remembered for the tab');
  assert.equal(pulseWanted({ search: '?pulse=0', storage }), false);
  assert.equal(pulseWanted({ search: '', storage }), false);
  assert.equal(pulseWanted({ search: '?pulse=1', storage: { setItem() { throw new Error('private'); }, getItem() { throw new Error('private'); } } }), true, 'private mode: this page');
});
