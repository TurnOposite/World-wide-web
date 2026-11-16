/**
 * The Booth's « Line » tab (site/js/ui/line-admin.js) and what the listener's
 * page does with a message the station put back (site/js/ui/telegraph.js).
 *
 * What must hold:
 *   - the log is read by broadcast day (05:00 → 05:00 Paris), like the room;
 *   - each row offers only what can be done to it: take off (and silence)
 *     while it is on the line, put back otherwise;
 *   - a stranger's words reach the page as text, never as markup;
 *   - nothing here is reachable without the key: the tab is built only by the
 *     unlocked desk, on a tower;
 *   - a restored message stays on a listener's page until the next morning.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { broadcastDay, groupByDay, stateLabel, actionsFor, queryOf, PAGE } from '../site/js/ui/line-admin.js';
import { sinceDay, mergeMessages } from '../site/js/ui/telegraph.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('the log is read by broadcast day: 05:00 to 05:00 in Paris, summer and winter', () => {
  assert.equal(broadcastDay(Date.parse('2026-11-16T12:00:00Z')), '2026-11-16');
  assert.equal(broadcastDay(Date.parse('2026-11-17T01:30:00Z')), '2026-11-16', '02:30 in Paris is still the evening before\'s day');
  assert.equal(broadcastDay(Date.parse('2026-11-17T03:59:00Z')), '2026-11-16', '04:59 too');
  assert.equal(broadcastDay(Date.parse('2026-11-17T04:00:00Z')), '2026-11-17', '05:00 is the new day');
  assert.equal(broadcastDay(Date.parse('2026-07-01T02:59:00Z')), '2026-06-30', 'in summer 05:00 Paris is 03:00 UTC');
  assert.equal(broadcastDay(Date.parse('2026-07-01T03:00:00Z')), '2026-07-01');

  const e = (id, iso) => ({ id, t: Date.parse(iso) });
  const days = groupByDay([e(4, '2026-11-17T08:00:00Z'), e(3, '2026-11-17T02:00:00Z'), e(2, '2026-11-16T20:00:00Z'), e(1, '2026-11-15T20:00:00Z')]);
  assert.deepEqual(days.map((d) => [d.day, d.entries.map((x) => x.id)]), [['2026-11-17', [4]], ['2026-11-16', [3, 2]], ['2026-11-15', [1]]]);
  assert.deepEqual(groupByDay([]), []);
});

test('each row says what happened to it, and offers only what can be done', () => {
  assert.equal(stateLabel({ state: 'on' }), 'on the line');
  assert.equal(stateLabel({ state: 'on', restoredAt: 5 }), 'on the line (put back)');
  assert.equal(stateLabel({ state: 'removed' }), 'taken off');
  assert.equal(stateLabel({ state: 'removed', silenced: true }), 'taken off, sender silenced');
  assert.equal(stateLabel({ state: 'left' }), 'left at 05:00');
  assert.deepEqual(actionsFor({ state: 'on' }), ['remove', 'mute']);
  assert.deepEqual(actionsFor({ state: 'on', host: true }), ['remove'], 'the station does not silence itself');
  assert.deepEqual(actionsFor({ state: 'removed' }), ['restore']);
  assert.deepEqual(actionsFor({ state: 'left' }), ['restore']);
});

test('the filters reach the tower as whole days, and empty ones are left out', () => {
  assert.deepEqual(queryOf(), { limit: PAGE, offset: 0 });
  const q = queryOf({ from: '2026-11-15', to: '2026-11-16', q: '  rude ', name: ' Ada ' }, 50);
  assert.equal(q.from, new Date('2026-11-15T00:00:00').getTime());
  assert.equal(q.to, new Date('2026-11-17T00:00:00').getTime() - 1, 'the last day is included to its end');
  assert.deepEqual([q.q, q.name, q.offset, q.limit], ['rude', 'Ada', 50, PAGE]);
  assert.deepEqual(queryOf({ from: 'nonsense', q: '   ' }), { limit: PAGE, offset: 0 });
});

test('a stranger\'s words are put on the page as text; the log is asked for with the key, and only by the unlocked desk', () => {
  const src = read('site/js/ui/line-admin.js');
  const rows = src.slice(src.indexOf('paint() {'));
  assert.doesNotMatch(rows, /innerHTML|insertAdjacentHTML|outerHTML/, 'no markup is ever built from the log');
  assert.match(rows, /h\('p', 'la-text', e\.text\)/, 'the text goes through textContent');
  const client = read('site/js/engine/transport.js');
  assert.match(client, /telegraphLog\(q = \{\}\) \{ return this\._getKeyed\(/, 'the log is read through the keyed request');
  assert.match(client, /_getKeyed[\s\S]{0,200}'x-station-key': this\.key/, '…which sends the key as a header, never in the address');
  const booth = read('site/js/pages/booth.js');
  assert.match(booth, /client\.planeKind === 'tower' \? \[\['music', 'Music'\], \['line', 'Line'\], \['status', 'Status'\]\] : \[\]/, 'the Line and Status sides exist on a tower only');
  assert.ok(booth.indexOf('new LineAdmin') > booth.indexOf('function buildDesk()'), 'and is built inside the desk, which only an accepted key opens');
});

test('a message the station put back stays on a listener\'s page until the next morning', () => {
  const day = Date.parse('2026-11-16T04:00:00Z');
  const old = { id: 1, t: day - 3600_000, text: 'last night', restored: day + 60_000 };
  const stale = { id: 2, t: day - 3600_000, text: 'last night too' };
  const fresh = { id: 3, t: day + 120_000, text: 'this morning' };
  assert.deepEqual(sinceDay([old, stale, fresh], day).map((m) => m.id), [1, 3], 'restored today: it stays; not restored: it goes');
  assert.deepEqual(sinceDay([{ ...old, restored: day - 60_000 }], day), [], 'restored yesterday: gone with yesterday');
  // The tower names what it put back apart (it keeps its old id): the page merges both lists.
  assert.deepEqual(mergeMessages([fresh], [old]).map((m) => m.id), [1, 3], 'it takes its place in order');
  assert.match(read('site/js/ui/telegraph.js'), /\.\.\.\(out\.restored \|\| \[\]\)/, 'the poll reads the tower\'s « restored » list');
});
