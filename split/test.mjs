/**
 * `node --test split/test.mjs` — no ffmpeg needed, no dependencies.
 *
 * Only the pure half is tested: parsing ffmpeg's log, planning segments, and
 * judging whether the result actually helped. The ffmpeg calls themselves are
 * proved by running the tool on a real mix, which is what the worklog records.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSilences, planSegments, verdict, pieceName } from './split-mixes.mjs';

const LOG = `
[silencedetect @ 0x1] silence_start: 100.5
[silencedetect @ 0x1] silence_end: 102.0 | silence_duration: 1.5
[silencedetect @ 0x1] silence_start: 300.0
[silencedetect @ 0x1] silence_end: 300.4 | silence_duration: 0.4
[silencedetect @ 0x1] silence_start: 500.0
[silencedetect @ 0x1] silence_end: 503.0 | silence_duration: 3.0
`;

test('parses silencedetect output into pairs', () => {
  const s = parseSilences(LOG);
  assert.equal(s.length, 3);
  assert.deepEqual(s[0], { start: 100.5, end: 102, duration: 1.5 });
});

test('an unterminated silence_start at EOF is dropped, not guessed at', () => {
  assert.equal(parseSilences(LOG + '[silencedetect] silence_start: 900.0\n').length, 3);
});

test('the cut lands in the middle of the silence, not at its edge', () => {
  const segs = planSegments(parseSilences(LOG), 700, { gap: 1.0, minTrack: 1 });
  assert.equal(segs.length, 3);
  assert.equal(segs[0].end, 101.25);          // midpoint of 100.5–102.0
  assert.equal(segs[1].start, 101.25);
  assert.equal(segs[2].end, 700);
});

test('--gap filters by silence length, so one decode serves every sensitivity', () => {
  const s = parseSilences(LOG);
  assert.equal(planSegments(s, 700, { gap: 0.3, minTrack: 1 }).length, 4);
  assert.equal(planSegments(s, 700, { gap: 2.0, minTrack: 1 }).length, 2);
  assert.equal(planSegments(s, 700, { gap: 9.0, minTrack: 1 }).length, 1);
});

test('segments shorter than minTrack are merged, not emitted', () => {
  const segs = planSegments(parseSilences(LOG), 700, { gap: 0.3, minTrack: 300 });
  assert.ok(segs.every((s) => s.duration >= 300 || segs.length === 1));
  assert.equal(segs[0].start, 0);
  assert.equal(segs[segs.length - 1].end, 700);
});

test('segments always cover the whole file with no gap and no overlap', () => {
  const segs = planSegments(parseSilences(LOG), 700, { gap: 0.3, minTrack: 60 });
  assert.equal(segs[0].start, 0);
  assert.equal(segs[segs.length - 1].end, 700);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].start, segs[i - 1].end);
});

test('a gapless mix yields one segment and an honest refusal', () => {
  const v = verdict(planSegments([], 3600), 3600);
  assert.equal(v.ok, false);
  assert.match(v.note, /crossfade/);
});

test('a split whose longest piece is still huge is reported as weak', () => {
  const v = verdict([{ duration: 30 * 60 }, { duration: 5 * 60 }], 35 * 60);
  assert.equal(v.ok, true);
  assert.equal(v.weak, true);
});

test('piece names keep the original stem — genre.js classifies by filename', () => {
  assert.equal(pieceName('Macroblank - 一生に一度', 3), 'Macroblank - 一生に一度 - 03.mp3');
  assert.equal(pieceName('x', 12, '.m4a'), 'x - 12.m4a');
});
