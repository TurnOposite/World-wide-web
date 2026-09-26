/**
 * The queue editor's window arithmetic.
 *
 * `public/queue.js` keeps its pure helpers DOM-free so this file can check
 * them in Node. The drag gestures are proved in the browser; what is proved
 * here is the part that decides *which slots may be touched at all* — and
 * getting that wrong means either offering a move the server will reject, or
 * (worse) silently building a request that names the wrong slots.
 *
 * The two rules being defended, both enforced server-side in
 * `server/routes/api.js`, both of which the client must respect to be usable:
 *
 *   - locked slots (on air, or starting within QUEUE_LOCK_SECONDS) never move
 *   - a permutation may not straddle a cycle boundary
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { movableWindow, applyMove, isPermutation, untilAir } from '../public/queue.js';

/** Build a slot list: `L` = locked, digits = cycleIndex. */
const slots = (spec) =>
  spec.split(' ').map((tok, i) => ({
    id: `t${i}`,
    locked: tok.startsWith('L'),
    cycleIndex: Number(tok.replace('L', '')),
    withinCycle: i,
    startsAt: 1000 + i * 1000,
    duration: 100,
  }));

/* ------------------------------------------------------ movableWindow --- */

test('the window starts after the last locked slot', () => {
  const w = movableWindow(slots('L0 L0 0 0 0'));
  assert.equal(w.from, 2);
  assert.equal(w.to, 5);
  assert.equal(w.startWithin, 2, 'startWithin must be the slot address, not the array index');
  assert.deepEqual(w.ids, ['t2', 't3', 't4']);
});

test('the window stops at a cycle boundary', () => {
  // Two cycles are two different shuffles; a rearrangement across the seam is
  // not a permutation of either, and the server returns window_crosses_cycle.
  const w = movableWindow(slots('L0 0 0 1 1'));
  assert.equal(w.cycleIndex, 0);
  assert.deepEqual(w.ids, ['t1', 't2']);
  assert.equal(w.to, 3, 'the window ran into the next cycle');
});

test('everything locked, or nothing movable, yields no window', () => {
  assert.equal(movableWindow(slots('L0 L0 L0')), null);
  assert.equal(movableWindow([]), null);
  assert.equal(movableWindow(), null);
});

test('a window of one is not a reorder', () => {
  // The server rejects ids.length < 2 as nothing_to_reorder, so offering a
  // drag handle here could only ever produce a failed request.
  assert.equal(movableWindow(slots('L0 L0 0')), null);
  assert.equal(movableWindow(slots('L0 0')), null);
});

test('the longest run wins, not the first', () => {
  // This is why the self-test went red on 2026-08-19 with a 4-track fixture:
  // when the frozen slot lands second-to-last in its cycle, the first
  // available run is a single slot and the editor offered nothing — while the
  // next cycle had a full set waiting. Taking the first run makes the editor
  // usable only about three times in four.
  const w = movableWindow(slots('L0 0 1 1 1'));
  assert.equal(w.cycleIndex, 1);
  assert.deepEqual(w.ids, ['t2', 't3', 't4']);
  assert.equal(w.from, 2);
});

test('ties go to the earlier run, so the same queue always gives the same window', () => {
  // Determinism matters: the window is the address the reorder request names,
  // and two clients looking at the same queue must name the same slots.
  const spec = 'L0 0 0 1 1';
  const first = movableWindow(slots(spec));
  assert.equal(first.cycleIndex, 0, 'a tie should keep the earlier run');
  assert.deepEqual(first.ids, ['t1', 't2']);
  for (let i = 0; i < 5; i++) assert.deepEqual(movableWindow(slots(spec)), first);
});

test('a locked slot appearing after an unlocked one still ends the window', () => {
  // Not expected from the server (locked slots are the earliest), but the
  // window must be a contiguous run either way — a gap would make
  // startWithin + ids.length name slots that were never offered.
  const w = movableWindow(slots('0 0 L0 0'));
  assert.deepEqual(w.ids, ['t0', 't1']);
  assert.equal(w.to, 2);
});

test('the window addresses slots by withinCycle, not by position in the array', () => {
  // A library smaller than the lookahead repeats track ids across cycles, so
  // the (cycleIndex, withinCycle) address is the only unambiguous one. If
  // startWithin were the array index this would be 1 instead of 41.
  const s = slots('L3 3 3 3');
  s.forEach((slot, i) => { slot.withinCycle = 40 + i; });
  const w = movableWindow(s);
  assert.equal(w.cycleIndex, 3);
  assert.equal(w.startWithin, 41);
  assert.equal(w.startWithin + w.ids.length, 44);
});

/* ---------------------------------------------------------- applyMove --- */

test('applyMove reorders without losing or duplicating anything', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(applyMove(ids, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(applyMove(ids, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(applyMove(ids, 1, 1), ['a', 'b', 'c', 'd']);
  for (const [f, t] of [[0, 3], [2, 1], [3, 2]]) {
    assert.ok(isPermutation(ids, applyMove(ids, f, t)), `${f}->${t} was not a permutation`);
  }
  assert.deepEqual(ids, ['a', 'b', 'c', 'd'], 'applyMove mutated its input');
});

test('applyMove ignores out-of-range indices instead of throwing', () => {
  const ids = ['a', 'b', 'c'];
  for (const [f, t] of [[-1, 1], [5, 1], [0, 9], [0, -2]]) {
    assert.deepEqual(applyMove(ids, f, t), ids, `${f}->${t} should be a no-op`);
  }
  assert.deepEqual(applyMove(ids, 0.5, 1), ids);
  assert.deepEqual(applyMove([], 0, 0), []);
});

/* ------------------------------------------------------ isPermutation --- */

test('isPermutation counts duplicates rather than comparing sets', () => {
  // A small library repeats the same track id inside one window, so a
  // set-based check would wave through a request that drops one copy.
  assert.ok(isPermutation(['a', 'a', 'b'], ['a', 'b', 'a']));
  assert.equal(isPermutation(['a', 'a', 'b'], ['a', 'b', 'b']), false);
  assert.equal(isPermutation(['a', 'b'], ['a', 'b', 'c']), false, 'length change slipped through');
  assert.equal(isPermutation(['a', 'b'], ['a', 'c']), false);
  assert.ok(isPermutation([], []));
});

/* ------------------------------------------------------------ untilAir --- */

test('untilAir counts down and never goes negative', () => {
  assert.equal(untilAir({ startsAt: 10_000 }, 4_000), 6);
  assert.equal(untilAir({ startsAt: 1_000 }, 9_000), 0, 'a past slot reported negative time');
});
