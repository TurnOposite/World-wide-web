import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRange, mimeFor } from '../server/lib/stream.js';

test('no header means a full-body response', () => {
  assert.equal(parseRange(undefined, 1000), null);
  assert.equal(parseRange('', 1000), null);
});

test('open-ended range runs to the last byte', () => {
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 });
});

test('closed range is honoured exactly', () => {
  assert.deepEqual(parseRange('bytes=0-499', 1000), { start: 0, end: 499 });
});

test('range past the end is clamped, not rejected', () => {
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 });
});

test('suffix range returns the tail', () => {
  assert.deepEqual(parseRange('bytes=-200', 1000), { start: 800, end: 999 });
});

test('suffix larger than the file starts at zero', () => {
  assert.deepEqual(parseRange('bytes=-5000', 1000), { start: 0, end: 999 });
});

test('start beyond EOF is unsatisfiable (416)', () => {
  assert.deepEqual(parseRange('bytes=1000-', 1000), { unsatisfiable: true });
  assert.deepEqual(parseRange('bytes=2000-3000', 1000), { unsatisfiable: true });
});

test('inverted range is unsatisfiable', () => {
  assert.deepEqual(parseRange('bytes=500-100', 1000), { unsatisfiable: true });
});

test('multipart and malformed ranges fall back to a full body', () => {
  assert.equal(parseRange('bytes=0-100,200-300', 1000), null);
  assert.equal(parseRange('items=0-100', 1000), null);
  assert.equal(parseRange('bytes=abc-def', 1000), null);
  assert.equal(parseRange('bytes=-', 1000), null);
});

test('mime types cover the formats the scanner accepts', () => {
  assert.equal(mimeFor('/x/a.mp3'), 'audio/mpeg');
  assert.equal(mimeFor('/x/a.M4A'), 'audio/mp4');
  assert.equal(mimeFor('/x/a.flac'), 'audio/flac');
  assert.equal(mimeFor('/x/a.ogg'), 'audio/ogg');
  assert.equal(mimeFor('/x/a.wav'), 'audio/wav');
  assert.equal(mimeFor('/x/a.xyz'), 'application/octet-stream');
});
