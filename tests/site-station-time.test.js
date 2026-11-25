// Lighter step 5: one station clock for the site (site/js/lib/station-time.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parisClock, parisMinutes, broadcastDay, partOfDay, skyAt, skyMinutes } from '../site/js/lib/station-time.js';
import { skyAt as boatSky, skyMinutes as boatMinutes } from '../site/js/boat/scene.js';
import { badgeFor } from '../site/js/world/badge.js';

const at = (iso) => Date.parse(iso);

test('Paris\'s wall clock, winter and summer', () => {
  assert.deepEqual(parisClock(at('2026-01-15T11:07:00Z')), { year: 2026, month: 1, day: 15, hour: 12, minute: 7 });
  assert.deepEqual(parisClock(at('2026-07-15T11:07:00Z')), { year: 2026, month: 7, day: 15, hour: 13, minute: 7 });
  assert.equal(parisMinutes(at('2026-07-15T22:30:00Z')), 30);
});

test('the broadcast day turns at 05:00 Paris, on the nights the clocks change too', () => {
  assert.equal(broadcastDay(at('2026-11-25T03:59:00Z')), '2026-11-24'); // 04:59 Paris
  assert.equal(broadcastDay(at('2026-11-25T04:00:00Z')), '2026-11-25'); // 05:00 Paris
  // 29 March 2026, clocks forward at 02:00: 05:30 Paris is 03:30 UTC.
  assert.equal(broadcastDay(at('2026-03-29T03:30:00Z')), '2026-03-29');
  assert.equal(broadcastDay(at('2026-03-29T02:30:00Z')), '2026-03-28');
  // 25 October 2026, clocks back at 03:00: 05:30 Paris is 04:30 UTC.
  assert.equal(broadcastDay(at('2026-10-25T04:30:00Z')), '2026-10-25');
  assert.equal(broadcastDay(at('2026-10-25T03:30:00Z')), '2026-10-24');
});

test('the part of the day: the small hours are still the night', () => {
  const word = (iso) => partOfDay(at(iso)).word;
  assert.equal(word('2026-11-25T02:00:00Z'), 'NUIT'); // 03:00
  assert.equal(word('2026-11-25T04:00:00Z'), 'MATIN'); // 05:00
  assert.equal(word('2026-11-25T11:00:00Z'), 'APRÈS-MIDI'); // 12:00
  assert.equal(word('2026-11-25T17:00:00Z'), 'SOIR'); // 18:00
  assert.equal(word('2026-11-25T21:00:00Z'), 'NUIT'); // 22:00
});

test('the badge reads the station clock: day, weekday, word', () => {
  assert.deepEqual(badgeFor(at('2026-11-25T02:00:00Z')), { day: 24, weekday: 'MAR', word: 'NUIT', jp: '夜' });
  assert.deepEqual(badgeFor(at('2026-11-25T09:00:00Z')), { day: 25, weekday: 'MER', word: 'MATIN', jp: '朝' });
});

test('the sky is the boat\'s, minute for minute, until his boat replaces it (the two copies cannot drift)', () => {
  for (let m = 0; m < 1440; m += 15) assert.deepEqual(skyAt(m), boatSky(m), `minute ${m}`);
  const now = at('2026-11-25T16:40:00Z');
  assert.equal(skyMinutes(now), boatMinutes(new Date(now)));
  assert.equal(skyMinutes(now, '?sky=21:15'), 21 * 60 + 15);
  assert.equal(skyMinutes(now, '?sky=25:00'), parisMinutes(now), 'an hour that is not one: the clock');
  assert.ok(skyAt(0).star === 1 && skyAt(720).dark === 0, 'midnight starry, noon light');
});
