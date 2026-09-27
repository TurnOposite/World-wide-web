/**
 * A DJ's second decision must not undo what the first one put on air.
 *
 * Found by the pre-go-live review (2026-09-27): the booth replaced the one
 * override outright, so "back to the station clock" — or a second reorder of
 * a later window — while a moved track was playing would swap the track on
 * air, mid-song, for every listener. `planQueueOrder` and
 * `planClearQueueOrder` compose with what is in force and never touch the
 * fence. The property test at the bottom is the one that matters.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Station } from '../server/lib/schedule.js';

const EPOCH = Date.parse('2026-01-01T00:00:00Z');
const LOCK = 60_000;

function makeTracks(n = 12) {
  return Array.from({ length: n }, (_, i) => ({ id: `t${String(i).padStart(2, '0')}`, title: `Track ${i}`, duration: 30 + ((i * 37) % 91) }));
}
const makeStation = (n = 12, shuffle = true) => new Station(makeTracks(n), { epoch: EPOCH, name: 'Test', shuffle });
const heardIds = (st, now, n = 12) => st.upcoming(now, n).map((s) => s.id);
const fence = (st, now) => st._fence(now, LOCK).map((f) => `${f.id}@${f.startsAt}`).join(' ');

/** A movable window as the booth sees it: slots starting after the fence, within one cycle. */
function movable(st, now, from = 0, len = 4) {
  const slots = st.upcoming(now, 16).filter((s) => s.startsAt >= now + LOCK);
  const first = slots[from];
  if (!first) return null;
  const same = slots.slice(from).filter((s) => s.cycleIndex === first.cycleIndex).slice(0, len);
  return same.length >= 2 ? same : null;
}

test('the scenario that was broken: a moved track is on air, then "back to the station clock"', () => {
  const st = makeStation();
  let now = EPOCH + 5_000;
  const w = movable(st, now, 2, 4);
  // Bring the last track of the window to the front of it.
  const ids = [w.at(-1).id, ...w.slice(0, -1).map((s) => s.id)];
  const plan = st.planQueueOrder({ cycleIndex: w[0].cycleIndex, startWithin: w[0].withinCycle, ids }, { now, lockMs: LOCK });
  assert.ok(plan.ok, plan.error);
  st.applyQueueOverride(plan.override);

  now = w[0].startsAt + 2_000; // the moved track is on air
  const onAir = st.at(now).track.id;
  assert.equal(onAir, w.at(-1).id);
  const fenceBefore = fence(st, now);

  const clear = st.planClearQueueOrder({ now, lockMs: LOCK });
  assert.equal(clear.full, false, 'the moved track on air has to play out');
  st.applyQueueOverride(clear.override);
  assert.equal(st.at(now).track.id, onAir, 'the track on air did not change');
  assert.equal(fence(st, now), fenceBefore, 'nothing inside the fence moved');
  assert.ok(clear.until > now);
  // A rotation's tail already is the clock's order: nothing else could move.
  assert.equal(clear.changed, false);

  // Once the kept part has played, the clock is fully back.
  const later = st.planClearQueueOrder({ now: clear.until + 1, lockMs: LOCK });
  assert.equal(later.override, null);
  assert.equal(later.full, true);
});

test('"back to the station clock" with a moved track on air returns everything after it to the clock now', () => {
  const st = makeStation();
  let now = EPOCH + 5_000;
  const w = movable(st, now, 2, 4);
  const [w0, w1, w2, w3] = w.map((s) => s.id);
  const plan = st.planQueueOrder({ cycleIndex: w[0].cycleIndex, startWithin: w[0].withinCycle, ids: [w2, w3, w1, w0] }, { now, lockMs: LOCK });
  st.applyQueueOverride(plan.override);
  now = w[0].startsAt + 1_000;
  assert.equal(st.at(now).track.id, w2);
  const before = fence(st, now);
  const clear = st.planClearQueueOrder({ now, lockMs: LOCK });
  st.applyQueueOverride(clear.override);
  assert.equal(fence(st, now), before);
  assert.equal(clear.changed, true);
  assert.equal(st.at(now).track.id, w2, 'on air stays');
  assert.deepEqual(heardIds(st, now, 3), [w0, w1, w3], 'the rest in the clock\'s order');
});

test('a second reorder of a later window keeps the first one, and the ids are the ones listeners hear', () => {
  const st = makeStation(14);
  const now = EPOCH + 5_000;
  const w1 = movable(st, now, 0, 3);
  const p1 = st.planQueueOrder({ cycleIndex: w1[0].cycleIndex, startWithin: w1[0].withinCycle, ids: [w1[2].id, w1[0].id, w1[1].id] }, { now, lockMs: LOCK });
  assert.ok(p1.ok);
  st.applyQueueOverride(p1.override);
  const afterFirst = heardIds(st, now);

  const w2 = movable(st, now, 4, 3); // as the booth now shows it
  const p2 = st.planQueueOrder({ cycleIndex: w2[0].cycleIndex, startWithin: w2[0].withinCycle, ids: [w2[1].id, w2[0].id, w2[2].id] }, { now, lockMs: LOCK });
  assert.ok(p2.ok, p2.error);
  st.applyQueueOverride(p2.override);
  const afterSecond = heardIds(st, now);

  const i1 = afterFirst.indexOf(w1[2].id);
  assert.equal(afterSecond[i1], w1[2].id, 'the first reorder survived');
  const i2 = afterFirst.indexOf(w2[0].id);
  assert.deepEqual(afterSecond.slice(i2, i2 + 3), [w2[1].id, w2[0].id, w2[2].id]);
});

test('an earlier reorder still on air in the previous cycle refuses a reorder that would drop it, and says until when', () => {
  const st = makeStation(6);
  const cycleLen = st.cycleOrder(0).reduce((a, t) => a + t.duration * 1000, 0);
  // Reorder the last three slots of cycle 0 (start = the fourth slot).
  const start = st.slotStartsAt(0, 3);
  let now = start - LOCK - 5_000;
  const order = st.cycleOrder(0).map((t) => t.id);
  const p = st.planQueueOrder({ cycleIndex: 0, startWithin: 3, ids: [order[5], order[3], order[4]] }, { now, lockMs: LOCK });
  assert.ok(p.ok);
  st.applyQueueOverride(p.override);

  now = start + 1_000; // cycle 0's moved track is on air
  const next = st.upcoming(now, 12).filter((s) => s.cycleIndex === 1 && s.startsAt >= now + LOCK).slice(0, 2);
  assert.equal(next.length, 2, 'fixture: two movable slots in cycle 1');
  const refused = st.planQueueOrder({ cycleIndex: 1, startWithin: next[0].withinCycle, ids: [next[1].id, next[0].id] }, { now, lockMs: LOCK });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'earlier_reorder_on_air');
  assert.equal(refused.until, EPOCH + cycleLen, 'free again when cycle 0 ends');
});

test('requests that are not a permutation of what listeners hear are refused', () => {
  const st = makeStation();
  const now = EPOCH + 5_000;
  const w = movable(st, now, 0, 3);
  const base = { cycleIndex: w[0].cycleIndex, startWithin: w[0].withinCycle };
  for (const ids of [[w[0].id, w[0].id, w[1].id], [w[0].id, w[1].id, 'stranger'], [w[0].id, w[1].id]]) {
    const r = st.planQueueOrder({ ...base, ids: ids.length === 2 ? [...ids, 'zz'] : ids }, { now, lockMs: LOCK });
    assert.equal(r.ok, false, JSON.stringify(ids));
  }
  // Putting the window back as it naturally is plans "no override".
  const p = st.planQueueOrder({ ...base, ids: w.map((s) => s.id) }, { now, lockMs: LOCK });
  assert.ok(p.ok);
  assert.equal(p.override, null);
});

test('property: across hundreds of random DJ decisions, the fence never moves and every override is a permutation', () => {
  let seed = 20260927;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (const [n, shuffle] of [[7, true], [12, true], [9, false]]) {
    const st = makeStation(n, shuffle);
    const cycleSeconds = st.cycleOrder(0).reduce((a, t) => a + t.duration, 0);
    let now = EPOCH + 3_000;
    let applied = 0;
    for (let step = 0; step < 400; step++) {
      now += Math.floor(rnd() * 40_000);
      const before = fence(st, now);
      let override;
      if (rnd() < 0.25) {
        const c = st.planClearQueueOrder({ now, lockMs: LOCK });
        assert.ok(c.until === null || c.until > now - 1, 'a kept part is still to finish');
        override = c.override;
      } else {
        const w = movable(st, now, Math.floor(rnd() * 3), 2 + Math.floor(rnd() * 4));
        if (!w) continue;
        const ids = w.map((s) => s.id);
        for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
        const plan = st.planQueueOrder({ cycleIndex: w[0].cycleIndex, startWithin: w[0].withinCycle, ids }, { now, lockMs: LOCK });
        if (!plan.ok) { assert.equal(plan.error, 'earlier_reorder_on_air', plan.error); continue; }
        override = plan.override;
      }
      const res = st.applyQueueOverride(override);
      assert.ok(res.ok, `override must be a permutation of the natural order (${JSON.stringify(override)})`);
      applied++;
      assert.equal(fence(st, now), before, `step ${step}: the fence moved`);
      const cyc = override ? override.cycleIndex : 0;
      assert.equal(st.cycleOrder(cyc).reduce((a, t) => a + t.duration, 0), cycleSeconds, 'cycle length is constant');
    }
    assert.ok(applied > 100, `enough decisions were exercised (${applied})`);
  }
});
