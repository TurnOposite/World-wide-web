/**
 * The Crates (the Archive's second room) read the whole library. /api/library
 * pages at 500; on 2026-11-07 the tower held 3,174 tracks and the room showed
 * the first page only (59 of 287 albums).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLibrary } from '../site/js/pages/rooms/crates.js';

/** A /api/library like the tower's: limit capped at `cap`, offset honoured. */
function tower(n, cap = 500, shift = 0) {
  const tracks = Array.from({ length: n }, (_, i) => ({ id: `t${i}` }));
  const asked = [];
  const get = async (url) => {
    asked.push(url);
    const q = new URL(url, 'http://tower').searchParams;
    const limit = Math.min(cap, Number(q.get('limit')) || 100);
    const offset = Math.max(0, (Number(q.get('offset')) || 0) - (Number(q.get('offset')) ? shift : 0));
    return { total: tracks.length, offset, limit, items: tracks.slice(offset, offset + limit) };
  };
  return { get, asked };
}

test('the Crates read every page: 3,174 tracks in 7 requests', async () => {
  const { get, asked } = tower(3174);
  const items = await loadLibrary(get);
  assert.equal(items.length, 3174);
  assert.equal(new Set(items.map((t) => t.id)).size, 3174);
  assert.equal(asked.length, 7);
  assert.ok(asked.every((u) => /limit=500/.test(u)));
});

test('a library of one page is one request; an empty one is too', async () => {
  const small = tower(120);
  assert.equal((await loadLibrary(small.get)).length, 120);
  assert.equal(small.asked.length, 1);
  const none = tower(0);
  assert.deepEqual(await loadLibrary(none.get), []);
  assert.equal(none.asked.length, 1);
});

test('a server that pages smaller than asked is still read to the end', async () => {
  const { get } = tower(1234, 100);
  assert.equal((await loadLibrary(get)).length, 1234);
});

test('pages that overlap (a rescan between two of them) keep each track once', async () => {
  const { get } = tower(1300, 500, 10);
  const items = await loadLibrary(get);
  assert.equal(items.length, new Set(items.map((t) => t.id)).size);
});

test('the page count is bounded', async () => {
  const { get, asked } = tower(100_000);
  await loadLibrary(get, { maxPages: 3 });
  assert.equal(asked.length, 4);
});
