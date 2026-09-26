/**
 * Queue reordering.
 *
 * The station's whole claim is that the programme is a pure function of wall
 * time. Reordering is the one sanctioned exception, so the tests that matter
 * most here are not "did the tracks move" but "did anything *else* move".
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Station } from '../server/lib/schedule.js';

const EPOCH = Date.parse('2026-01-01T00:00:00Z');

/** Tracks with deliberately uneven durations, so a permutation is detectable. */
function makeTracks(n = 12) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${String(i).padStart(2, '0')}`,
    title: `Track ${i}`,
    artist: 'Test',
    duration: 30 + ((i * 37) % 91), // 30..120s, non-uniform
  }));
}

function makeStation(n = 12) {
  return new Station(makeTracks(n), { epoch: EPOCH, name: 'Test' });
}

test('a reorder permutes the window and nothing else', () => {
  const station = makeStation();
  const now = EPOCH + 1000;

  const before = station.upcoming(now, 10);
  const window = before.slice(3, 6);
  const rotated = [window[2].id, window[0].id, window[1].id];

  const res = station.setQueueOrder({
    cycleIndex: window[0].cycleIndex,
    startWithin: window[0].withinCycle,
    ids: rotated,
  });
  assert.equal(res.ok, true, JSON.stringify(res));

  const after = station.upcoming(now, 10);

  // Inside the window: the requested order.
  assert.deepEqual(after.slice(3, 6).map((s) => s.id), rotated);

  // Outside the window: identical tracks AND identical timings. This is the
  // invariant the permutation-only rule exists to protect.
  assert.deepEqual(
    after.slice(0, 3).map((s) => [s.id, s.startsAt, s.endsAt]),
    before.slice(0, 3).map((s) => [s.id, s.startsAt, s.endsAt])
  );
  assert.deepEqual(
    after.slice(6).map((s) => [s.id, s.startsAt, s.endsAt]),
    before.slice(6).map((s) => [s.id, s.startsAt, s.endsAt])
  );
});

test('the window still ends at exactly the same instant', () => {
  const station = makeStation();
  const now = EPOCH + 1000;
  const before = station.upcoming(now, 10);
  const w = before.slice(2, 7);

  station.setQueueOrder({
    cycleIndex: w[0].cycleIndex,
    startWithin: w[0].withinCycle,
    ids: [...w].reverse().map((s) => s.id),
  });

  const after = station.upcoming(now, 10);
  assert.equal(after[2].startsAt, before[2].startsAt, 'window start moved');
  assert.equal(after[6].endsAt, before[6].endsAt, 'window end moved');
});

test('reordering does not change the cycle duration', () => {
  const station = makeStation();
  const cycleBefore = station.cycleSeconds;
  const w = station.upcoming(EPOCH + 1000, 10).slice(1, 5);

  station.setQueueOrder({
    cycleIndex: w[0].cycleIndex,
    startWithin: w[0].withinCycle,
    ids: [...w].reverse().map((s) => s.id),
  });

  assert.equal(station.cycleSeconds, cycleBefore);
  assert.equal(station.revision, `12:${Math.round(cycleBefore)}`);
});

test('the track on air is unaffected by a reorder behind it', () => {
  const station = makeStation();
  const now = EPOCH + 5000;
  const onAirBefore = station.at(now);
  const w = station.upcoming(now, 10).slice(2, 6);

  station.setQueueOrder({
    cycleIndex: w[0].cycleIndex,
    startWithin: w[0].withinCycle,
    ids: [...w].reverse().map((s) => s.id),
  });

  const onAirAfter = station.at(now);
  assert.equal(onAirAfter.track.id, onAirBefore.track.id);
  assert.equal(onAirAfter.startsAt, onAirBefore.startsAt);
  assert.equal(onAirAfter.endsAt, onAirBefore.endsAt);
  assert.equal(onAirAfter.offset, onAirBefore.offset);
});

test('the schedule stays deterministic while an override is active', () => {
  // Same override, same answers, however many times you ask and in whatever
  // order you ask — this is what lets two clients agree without talking.
  const a = makeStation();
  const b = makeStation();
  const w = a.upcoming(EPOCH + 1000, 10).slice(3, 7);
  const ids = [w[3].id, w[1].id, w[0].id, w[2].id];
  const req = { cycleIndex: w[0].cycleIndex, startWithin: w[0].withinCycle, ids };
  a.setQueueOrder(req);
  b.setQueueOrder(req);

  const instants = [];
  for (let i = 0; i < 400; i++) instants.push(EPOCH + i * 3137);

  // Ask A forward and B backward: order of interrogation must not matter.
  const fromA = instants.map((t) => a.at(t)).map((s) => `${s.track.id}@${s.startsAt}`);
  const fromB = [...instants].reverse().map((t) => b.at(t)).map((s) => `${s.track.id}@${s.startsAt}`).reverse();
  assert.deepEqual(fromA, fromB);
});

test('rejects anything that is not a permutation', () => {
  const station = makeStation();
  const w = station.upcoming(EPOCH + 1000, 10).slice(2, 5);
  const base = { cycleIndex: w[0].cycleIndex, startWithin: w[0].withinCycle };

  // A stranger sneaked in — this is how you would *insert* a track, which
  // would change the window's duration.
  assert.equal(
    station.setQueueOrder({ ...base, ids: [w[0].id, w[1].id, 'not-a-real-id'] }).error,
    'not_a_permutation'
  );
  // A repeat — this is how you would duplicate a track.
  assert.equal(
    station.setQueueOrder({ ...base, ids: [w[0].id, w[0].id, w[1].id] }).error,
    'not_a_permutation'
  );
  assert.equal(station.queueOverride, null, 'a rejected reorder must leave no trace');
});

test('deleting a track through the queue is structurally impossible', () => {
  // The window's length is taken from `ids.length`, so a shorter list is not
  // "the same window minus one" — it is a shorter window, which is still a
  // permutation and still duration-preserving. There is no argument to
  // setQueueOrder that removes a track from the programme.
  const station = makeStation();
  const now = EPOCH + 1000;
  const before = station.upcoming(now, 10);
  const w = before.slice(2, 5);

  const res = station.setQueueOrder({
    cycleIndex: w[0].cycleIndex,
    startWithin: w[0].withinCycle,
    ids: [w[1].id, w[0].id], // only the first two slots
  });
  assert.equal(res.ok, true);

  const after = station.upcoming(now, 10);
  assert.equal(after.length, before.length, 'the programme lost a slot');
  assert.deepEqual(
    [...after].map((s) => s.id).sort(),
    [...before].map((s) => s.id).sort(),
    'the same tracks must still be present, merely rearranged'
  );
  // The third slot — outside the two-slot window — never moved.
  assert.deepEqual([after[4].id, after[4].startsAt], [before[4].id, before[4].startsAt]);
});

test('rejects a window that runs past the end of the cycle', () => {
  const station = makeStation(4);
  const res = station.setQueueOrder({ cycleIndex: 0, startWithin: 3, ids: ['t03', 't00'] });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'window_out_of_range');
});

test('clearing restores the natural order exactly', () => {
  const station = makeStation();
  const now = EPOCH + 1000;
  const before = station.upcoming(now, 10);
  const w = before.slice(3, 7);

  station.setQueueOrder({
    cycleIndex: w[0].cycleIndex,
    startWithin: w[0].withinCycle,
    ids: [...w].reverse().map((s) => s.id),
  });
  assert.notDeepEqual(station.upcoming(now, 10).map((s) => s.id), before.map((s) => s.id));

  assert.equal(station.clearQueueOrder(), true);
  assert.deepEqual(
    station.upcoming(now, 10).map((s) => [s.id, s.startsAt]),
    before.map((s) => [s.id, s.startsAt])
  );
});

test('repeated reorders of one window compose from the natural order', () => {
  // Each reorder names an absolute target order, so applying two in a row
  // yields the second — not the second applied on top of the first.
  const station = makeStation();
  const now = EPOCH + 1000;
  const w = station.upcoming(now, 10).slice(3, 6);
  const base = { cycleIndex: w[0].cycleIndex, startWithin: w[0].withinCycle };

  station.setQueueOrder({ ...base, ids: [w[1].id, w[2].id, w[0].id] });
  station.setQueueOrder({ ...base, ids: [w[2].id, w[1].id, w[0].id] });

  assert.deepEqual(
    station.upcoming(now, 10).slice(3, 6).map((s) => s.id),
    [w[2].id, w[1].id, w[0].id]
  );
});

test('a library change drops the override rather than misapplying it', () => {
  const station = makeStation();
  const w = station.upcoming(EPOCH + 1000, 10).slice(3, 6);
  station.setQueueOrder({
    cycleIndex: w[0].cycleIndex,
    startWithin: w[0].withinCycle,
    ids: [...w].reverse().map((s) => s.id),
  });
  assert.ok(station.queueOverride);

  station.setTracks(makeTracks(14), { now: EPOCH + 2000 });
  assert.equal(station.queueOverride, null);
});

test('upcoming() exposes the slot address the editor addresses by', () => {
  const station = makeStation();
  const slots = station.upcoming(EPOCH + 1000, 5);
  for (const s of slots) {
    assert.equal(typeof s.cycleIndex, 'number');
    assert.equal(typeof s.withinCycle, 'number');
  }
  // Consecutive slots in one cycle are consecutive indices.
  const sameCycle = slots.filter((s) => s.cycleIndex === slots[0].cycleIndex);
  for (let i = 1; i < sameCycle.length; i++) {
    assert.equal(sameCycle[i].withinCycle, sameCycle[i - 1].withinCycle + 1);
  }
});
