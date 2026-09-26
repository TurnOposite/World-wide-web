import test from 'node:test';
import assert from 'node:assert/strict';
import { Station, seededShuffle, mulberry32 } from '../server/lib/schedule.js';

const EPOCH = Date.parse('2026-01-01T00:00:00Z');

function lib(durations) {
  return durations.map((d, i) => ({ id: `t${i}`, relPath: `${i}.mp3`, title: `Track ${i}`, artist: 'A', duration: d }));
}

test('mulberry32 is deterministic and in range', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('seededShuffle is a permutation and does not mutate input', () => {
  const items = lib([1, 2, 3, 4, 5, 6, 7]);
  const copy = items.slice();
  const out = seededShuffle(items, 7);
  assert.deepEqual(items, copy, 'input was mutated');
  assert.equal(out.length, items.length);
  assert.deepEqual(new Set(out.map((t) => t.id)), new Set(items.map((t) => t.id)));
});

test('same seed produces the same order', () => {
  const items = lib([10, 20, 30, 40, 50]);
  assert.deepEqual(seededShuffle(items, 99).map((t) => t.id), seededShuffle(items, 99).map((t) => t.id));
});

test('empty station reports empty and returns null', () => {
  const s = new Station([], { epoch: EPOCH });
  assert.equal(s.isEmpty, true);
  assert.equal(s.at(EPOCH + 5000), null);
  assert.deepEqual(s.upcoming(EPOCH, 3), []);
});

test('at() lands on the right track and offset in cycle 0', () => {
  const s = new Station(lib([100, 200, 300]), { epoch: EPOCH });
  assert.equal(s.cycleSeconds, 600);

  const a = s.at(EPOCH + 50_000);
  assert.equal(a.track.id, 't0');
  assert.ok(Math.abs(a.offset - 50) < 1e-6);

  const b = s.at(EPOCH + 150_000);
  assert.equal(b.track.id, 't1');
  assert.ok(Math.abs(b.offset - 50) < 1e-6);

  const c = s.at(EPOCH + 350_000);
  assert.equal(c.track.id, 't2');
  assert.ok(Math.abs(c.offset - 50) < 1e-6);
});

test('boundaries: exact start of each track has offset 0', () => {
  const s = new Station(lib([100, 200, 300]), { epoch: EPOCH });
  assert.equal(s.at(EPOCH).offset, 0);
  assert.equal(s.at(EPOCH).track.id, 't0');
  assert.equal(s.at(EPOCH + 100_000).offset, 0);
  assert.equal(s.at(EPOCH + 100_000).track.id, 't1');
  assert.equal(s.at(EPOCH + 300_000).offset, 0);
  assert.equal(s.at(EPOCH + 300_000).track.id, 't2');
});

test('the schedule wraps into the next cycle', () => {
  const s = new Station(lib([100, 200, 300]), { epoch: EPOCH });
  const wrapped = s.at(EPOCH + 600_000 + 10_000);
  assert.equal(wrapped.cycleIndex, 1);
  assert.ok(Math.abs(wrapped.offset - 10) < 1e-6);
});

test('a single-track library loops forever without gaps in coverage', () => {
  const s = new Station(lib([120]), { epoch: EPOCH });
  for (const t of [0, 60, 119.9, 120, 240.5, 3600]) {
    const at = s.at(EPOCH + t * 1000);
    assert.ok(at, `no answer at t=${t}`);
    assert.equal(at.track.id, 't0');
    assert.ok(at.offset >= 0 && at.offset < 120);
  }
});

test('every instant across two full cycles resolves to a track', () => {
  const s = new Station(lib([31, 47, 59, 73]), { epoch: EPOCH });
  const total = s.cycleSeconds * 2;
  for (let t = 0; t < total; t += 0.37) {
    const at = s.at(EPOCH + t * 1000);
    assert.ok(at, `dead air at t=${t}`);
    assert.ok(at.offset >= 0 && at.offset <= at.track.duration + 1e-6, `bad offset ${at.offset} at t=${t}`);
  }
});

test('startsAt/endsAt bracket the query time', () => {
  const s = new Station(lib([90, 150, 210]), { epoch: EPOCH });
  for (let t = 0; t < 900; t += 7) {
    const now = EPOCH + t * 1000;
    const at = s.at(now);
    assert.ok(at.startsAt <= now, `startsAt after now at t=${t}`);
    assert.ok(at.endsAt >= now, `endsAt before now at t=${t}`);
    assert.ok(Math.abs(at.endsAt - at.startsAt - at.track.duration * 1000) < 2);
  }
});

test('two independent Station instances agree — this is what keeps listeners in sync', () => {
  const tracks = lib([61, 83, 127, 45, 99]);
  const a = new Station(tracks, { epoch: EPOCH });
  const b = new Station(tracks.slice(), { epoch: EPOCH });
  for (let t = 0; t < 5000; t += 13) {
    const now = EPOCH + t * 1000;
    const x = a.at(now);
    const y = b.at(now);
    assert.equal(x.track.id, y.track.id, `divergent track at t=${t}`);
    assert.ok(Math.abs(x.offset - y.offset) < 1e-9, `divergent offset at t=${t}`);
  }
});

test('upcoming() is contiguous with the current track', () => {
  const s = new Station(lib([60, 90, 120, 30]), { epoch: EPOCH });
  const now = EPOCH + 45_000;
  const cur = s.at(now);
  const next = s.upcoming(now, 4);
  assert.equal(next.length, 4);
  assert.equal(next[0].startsAt, cur.endsAt);
  for (let i = 1; i < next.length; i++) {
    assert.equal(next[i].startsAt, next[i - 1].endsAt, `gap before item ${i}`);
  }
});

test('upcoming() never repeats a track within one library pass', () => {
  const s = new Station(lib([10, 20, 30, 40, 50]), { epoch: EPOCH });
  const ids = s.upcoming(EPOCH + 5000, 4).map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('history() walks backwards from the current slot', () => {
  const s = new Station(lib([60, 60, 60, 60]), { epoch: EPOCH });
  const now = EPOCH + 190_000; // inside slot 3
  const cur = s.at(now);
  const past = s.history(now, 2);
  assert.equal(past.length, 2);
  assert.notEqual(past[0].id, cur.track.id);
});

test('gapSeconds lengthens the cycle and yields inGap between tracks', () => {
  const s = new Station(lib([100, 100]), { epoch: EPOCH, gapSeconds: 5 });
  assert.equal(s.cycleSeconds, 210);
  const inGap = s.at(EPOCH + 102_000);
  assert.equal(inGap.track.id, 't0');
  assert.equal(inGap.inGap, true);
  assert.equal(s.at(EPOCH + 105_000).track.id, 't1');
});

test('times before the epoch still resolve (clock skew safety)', () => {
  const s = new Station(lib([100, 200]), { epoch: EPOCH });
  const at = s.at(EPOCH - 50_000);
  assert.ok(at);
  assert.ok(at.offset >= 0);
});

test('zero and negative durations are filtered out of the programme', () => {
  const s = new Station(
    [
      { id: 'ok', duration: 60, title: 'ok', artist: 'a' },
      { id: 'zero', duration: 0, title: 'zero', artist: 'a' },
      { id: 'neg', duration: -5, title: 'neg', artist: 'a' },
      { id: 'nan', duration: Number.NaN, title: 'nan', artist: 'a' },
    ],
    { epoch: EPOCH },
  );
  assert.equal(s.tracks.length, 1);
  assert.equal(s.at(EPOCH + 1000).track.id, 'ok');
});

test('revision changes when the library changes', () => {
  const s = new Station(lib([60, 60]), { epoch: EPOCH });
  const before = s.revision;
  s.setTracks(lib([60, 60, 60]));
  assert.notEqual(s.revision, before);
});

// --- roadmap #5: adding/removing a track must not re-deal the current instant ---
//
// Reproduces the exact scenario measured in docs/ROADMAP.md #5: a large
// library, many days past the epoch (so cycleIndex is large and any change
// to cycleSeconds would displace the current position by hours), one track
// added. Against the pre-fix code (setTracks() mutating this.tracks/
// cycleSeconds in place) this test fails — the track and offset both change.
// Against the fix, they must not, because the new library is only queued for
// the *next* cycle boundary.

function bigLib(n, baseDuration = 180) {
  // Varying durations (not a constant) so cycleSeconds isn't a suspiciously
  // round multiple of track count — closer to a real library.
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    relPath: `${i}.mp3`,
    title: `Track ${i}`,
    artist: 'A',
    duration: baseDuration + (i % 47),
  }));
}

test('adding one track mid-run leaves the currently-playing track and offset unchanged', () => {
  const tracks = bigLib(500);
  const s = new Station(tracks, { epoch: EPOCH });
  // 229 days past the epoch, deep into a large cycleIndex — this is exactly
  // the shape (500 tracks, 229 days) the roadmap measured a 10.6-hour jump
  // against under the old code.
  const now = EPOCH + 229 * 24 * 3600 * 1000;

  const before = s.at(now);
  assert.ok(before, 'expected something on air before the change');

  s.setTracks([...tracks, { id: 'new', relPath: 'new.mp3', title: 'New', artist: 'A', duration: 200 }], { now });

  const after = s.at(now);
  assert.equal(after.track.id, before.track.id, 'the on-air track changed the instant a file was added');
  assert.ok(Math.abs(after.offset - before.offset) < 1e-6, `offset moved from ${before.offset} to ${after.offset}`);
  assert.equal(after.startsAt, before.startsAt);
  assert.equal(after.endsAt, before.endsAt);

  // The library view (search, health track count) updates immediately —
  // only the programme itself is deferred.
  assert.equal(s.tracks.length, 501);
});

test('removing a track mid-run leaves the currently-playing track and offset unchanged', () => {
  const tracks = bigLib(500);
  const s = new Station(tracks, { epoch: EPOCH });
  const now = EPOCH + 229 * 24 * 3600 * 1000;

  const before = s.at(now);
  assert.ok(before);

  s.setTracks(tracks.slice(1), { now }); // drop one track

  const after = s.at(now);
  assert.equal(after.track.id, before.track.id);
  assert.ok(Math.abs(after.offset - before.offset) < 1e-6);
  assert.equal(s.tracks.length, 499);
});

test('a deferred library change takes effect exactly at the next cycle boundary, not before or after', () => {
  const tracks = lib([100, 200, 300]); // cycleSeconds = 600
  const s = new Station(tracks, { epoch: EPOCH });
  const now = EPOCH + 250_000; // partway through cycle 0

  const grown = [...tracks, { id: 'extra', relPath: 'extra.mp3', title: 'Extra', artist: 'A', duration: 50 }];
  s.setTracks(grown, { now });

  // cycle 0 (the era in progress) started at EPOCH and is 600s long, so its
  // boundary is EPOCH + 600_000 exactly.
  const boundary = EPOCH + 600_000;

  const justBefore = s.at(boundary - 1);
  assert.equal(justBefore.track.id, 't2', 'old library should still govern right up to the boundary');

  const atBoundary = s.at(boundary);
  assert.equal(atBoundary.offset, 0);
  // Past the boundary, cycle 1 shuffles the *new* (4-track) library — just
  // check the new library is actually in effect: cycleOrder(1) now has 4
  // tracks, and the track on air belongs to that new set.
  assert.equal(s.cycleOrder(1).length, 4);
  assert.ok(grown.some((t) => t.id === atBoundary.track.id));
});

test('two independent Station instances agree across a deferred library change', () => {
  const tracks = lib([61, 83, 127, 45, 99]);
  const a = new Station(tracks, { epoch: EPOCH });
  const b = new Station(tracks.slice(), { epoch: EPOCH });

  const changeAt = EPOCH + 4_000_000; // some way into the programme
  const grown = [...tracks, { id: 'sixth', relPath: 'sixth.mp3', title: 'Sixth', artist: 'A', duration: 71 }];
  a.setTracks(grown, { now: changeAt });
  b.setTracks(grown.map((t) => ({ ...t })), { now: changeAt }); // same content, distinct objects

  // Sweep across the boundary: before, at, and well after.
  for (let t = 0; t < 12_000_000; t += 2_500) {
    const now = EPOCH + t;
    const x = a.at(now);
    const y = b.at(now);
    assert.equal(x.track.id, y.track.id, `divergent track at t=${t}`);
    assert.ok(Math.abs(x.offset - y.offset) < 1e-9, `divergent offset at t=${t}`);
  }
});

// --- roadmap #5, reopened 2026-08-19: the era-staging fix above was itself
// found broken by the same-day audit. Two regression tests below, one per
// finding, reproducing exactly what docs/ROADMAP.md #5's reopened entry
// describes. Both fail against the code as it stood before this fix and pass
// after it — see docs/WORKLOG.md for the revert/reapply transcript.

test('roadmap #5 finding 1 (BLOCKING): a same-count/same-duration rename is not silently dropped forever', () => {
  // Two tracks, cycle 0 in progress (protected) — t0 is on air.
  const tracks = lib([100, 200]); // t0, t1; cycleSeconds = 300
  const s = new Station(tracks, { epoch: EPOCH });
  const now = EPOCH + 50_000; // 50s into t0

  // Rename t1: same duration (so same count, same cycleSeconds, same
  // `revision` string "2:300"), different id — trackId() is sha1(relPath),
  // so a real filesystem rename produces exactly this shape.
  const renamed = [tracks[0], { ...tracks[1], id: 't1renamed', relPath: 't1renamed.mp3' }];
  s.setTracks(renamed, { now });

  // Protected: the track on air right now must not move.
  assert.equal(s.at(now).track.id, 't0');

  // Well past the boundary (cycle 0 ends at EPOCH + 300_000) — the renamed
  // library must actually have been staged and adopted. Against the
  // pre-fix gate (comparing `revision`, which never changed) setTracks()
  // returned early every time, `_nextEra` was never created, and cycle 1
  // would still be built from the *old* 2-track set containing 't1' —
  // permanently, since every later no-op rescan hits the same false match.
  const cycle1 = s.cycleOrder(1);
  assert.equal(cycle1.length, 2);
  assert.ok(cycle1.some((t) => t.id === 't1renamed'), 'renamed track never made it into the staged library');
  assert.ok(!cycle1.some((t) => t.id === 't1'), 'old id is still governing after the change should have landed');
});

test('roadmap #5 finding 2 (HIGH): a track the schedule still promises stays resolvable via get() until its era retires', () => {
  const tracks = lib([100, 200]); // t0, t1; cycle 0 in progress
  const s = new Station(tracks, { epoch: EPOCH });
  const now = EPOCH + 50_000; // 50s into t0 — protected cycle

  const renamed = [tracks[0], { ...tracks[1], id: 't1renamed', relPath: 't1renamed.mp3' }];
  s.setTracks(renamed, { now });

  // The schedule still promises the OLD id for the rest of this cycle...
  const next = s.upcoming(now, 1);
  assert.equal(next[0].id, 't1', 'expected the still-protected old id to be next up');

  // ...and get() — what /api/track/:id/stream and /art call — must still
  // resolve it. Pre-fix, `byId` (updated unconditionally, immediately) no
  // longer has 't1', and get() had no fallback, so this returned null and
  // the route 404'd for the exact track the schedule says is playing next.
  const found = s.get('t1');
  assert.ok(found, 'get() returned null for a track the schedule is still actively promising');
  assert.equal(found.id, 't1');

  // Meanwhile the *live* view (search, health track count) has already
  // moved on, exactly as designed — this fix only changes lookup fallback,
  // not the "immediate" contract `revision changes when the library changes`
  // above already pins.
  assert.equal(s.byId.has('t1'), false);
  assert.ok(s.byId.has('t1renamed'));
});

test('an empty-to-populated first scan is not deferred — nothing was on air to protect', () => {
  const s = new Station([], { epoch: EPOCH });
  const now = EPOCH + 999_000; // long after epoch, before any real scan landed
  assert.equal(s.at(now), null);

  s.setTracks(lib([60, 60]), { now });

  // Applied immediately, anchored to the station's epoch — cycle 0 starts at
  // `epoch` in natural order, exactly like a station's first-ever scan today,
  // not deferred to some boundary of a cycle that never actually played.
  assert.ok(s.at(now), 'expected something on air right after the first real scan');
  assert.equal(s.at(EPOCH).offset, 0);
  assert.equal(s.at(EPOCH).track.id, 't0');
});

test('schedule() is contiguous with at() and covers the requested window', () => {
  const s = new Station(lib([60, 90, 120, 30]), { epoch: EPOCH });
  const from = EPOCH + 45_000;
  const to = from + 400_000;
  const cur = s.at(from);
  const items = s.schedule(from, to);

  // The track on air at `from` leads the list, even though it started earlier.
  assert.equal(items[0].id, cur.track.id);
  assert.equal(items[0].startsAt, cur.startsAt);

  // Every item is back-to-back with the next — no gaps, no overlaps.
  for (let i = 1; i < items.length; i++) {
    assert.equal(items[i].startsAt, items[i - 1].endsAt, `gap before item ${i}`);
  }
  // The window is covered: the last item's span reaches at least `to`, and
  // dropping the last item would leave the window short.
  assert.ok(items.at(-1).endsAt >= to);
  assert.ok(items.length < 2 || items.at(-2).endsAt < to);
});

test('schedule() pins a specific future slot against a fixed epoch', () => {
  // Same fixture and instant as the "at() lands on the right track" test
  // above: three tracks of 100/200/300s. At EPOCH + 350_000ms — still cycle
  // 0, which always plays in natural order — that lands 50s into t2 (t0's
  // 100s + t1's 200s = 300s in), so the slot started at EPOCH + 300_000 and
  // runs to EPOCH + 600_000. (Cycle 1 and beyond are deterministically
  // shuffled, so a "pinned" test has to stay inside cycle 0 to name a track
  // id in advance rather than re-deriving the shuffle.)
  const s = new Station(lib([100, 200, 300]), { epoch: EPOCH });
  const items = s.schedule(EPOCH + 350_000, EPOCH + 350_000 + 1000);
  assert.equal(items[0].id, 't2');
  assert.equal(items[0].startsAt, EPOCH + 300_000);
  assert.equal(items[0].endsAt, EPOCH + 600_000);
});

test('schedule() survives a restart unchanged — two fresh Station instances agree', () => {
  const tracks = lib([61, 83, 127, 45, 99]);
  const a = new Station(tracks, { epoch: EPOCH });
  const b = new Station(tracks.slice(), { epoch: EPOCH }); // simulates a fresh process re-scanning the same library
  const from = EPOCH + 12_345_000;
  const to = from + 3_600_000;
  assert.deepEqual(a.schedule(from, to), b.schedule(from, to));
});

test('schedule() returns nothing for an empty station or an inverted window', () => {
  const empty = new Station([], { epoch: EPOCH });
  assert.deepEqual(empty.schedule(EPOCH, EPOCH + 10_000), []);

  const s = new Station(lib([60, 60]), { epoch: EPOCH });
  assert.deepEqual(s.schedule(EPOCH + 10_000, EPOCH), []); // to <= from
  assert.deepEqual(s.schedule(EPOCH, EPOCH), []);
});

test('schedule() respects gapSeconds the same way upcoming() does', () => {
  const s = new Station(lib([100, 100]), { epoch: EPOCH, gapSeconds: 5 });
  // Window just past the second track's start (100s track + 5s gap = starts
  // at 105s) so both slots are included.
  const items = s.schedule(EPOCH, EPOCH + 110_000);
  assert.equal(items.length, 2);
  assert.equal(items[1].startsAt, items[0].endsAt + 5000);
});

test('schedule() never returns more than maxItems, however wide the window', () => {
  const s = new Station(lib([1, 1, 1]), { epoch: EPOCH }); // tiny cycle, huge slot count over a wide window
  const items = s.schedule(EPOCH, EPOCH + 10_000_000, { maxItems: 25 });
  assert.equal(items.length, 25);
});

test('a large library resolves fast enough for a Pi', () => {
  const many = lib(Array.from({ length: 5000 }, (_, i) => 120 + (i % 90)));
  const s = new Station(many, { epoch: EPOCH });
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) s.at(EPOCH + i * 997_000);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 1500, `200 lookups over 5000 tracks took ${ms.toFixed(0)}ms`);
});
