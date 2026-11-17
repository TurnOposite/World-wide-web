import assert from 'node:assert/strict';

/**
 * « Everyone who opens it hears the same track at the same second » — the rule the whole tower rests on, written
 * once (docs/TESTS-REVIEW.md, section 2) and run against every engine that must keep it: the server's Station, the
 * daily programme, each channel of the browser's engine.
 *
 * `make(i)` builds the engine as listener i would: a new process, a fresh scan — the library perhaps listed in
 * another order. Two are built; at every instant they must agree on what is on air and at what second, on what
 * comes next, and (at every `guideEvery`-th instant) on the next hour's guide.
 *
 * Before 2026-11-17 this was four tests in four shapes, each checking a different part (the track here, the
 * offset there, the guide once).
 */
export function assertSameProgramme(make, instants, { label = '', next = 5, guideEvery = 25, guideMs = 3_600_000 } = {}) {
  const a = make(0);
  const b = make(1);
  assert.ok(instants.length > 0, 'no instants to compare');
  instants.forEach((t, i) => {
    const at = `${label}${label ? ' ' : ''}at ${new Date(t).toISOString()}`;
    const x = a.at(t);
    const y = b.at(t);
    assert.ok(x?.track, `nothing on air ${at}`);
    assert.equal(x.track.id, y?.track?.id, `a different track ${at}`);
    assert.ok(Math.abs(x.offset - y.offset) < 1e-6, `a different second ${at}: ${x.offset} vs ${y.offset}`);
    assert.equal(x.startsAt, y.startsAt, `a different start ${at}`);
    const soon = (e) => e.upcoming(t, next).map((s) => `${s.id}@${s.startsAt}`);
    assert.deepEqual(soon(a), soon(b), `a different « next » ${at}`);
    if (i % guideEvery === 0) assert.deepEqual(a.schedule(t, t + guideMs), b.schedule(t, t + guideMs), `a different guide ${at}`);
  });
}

/** `count` instants from `start`, `step` ms apart — a prime step, so they fall at every point of tracks and cycles. */
export const instantsFrom = (start, { count = 400, step = 91_337 } = {}) => Array.from({ length: count }, (_, i) => start + i * step);
