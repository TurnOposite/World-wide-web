/**
 * The lane select (site/js/ui/channels.js, the mood board's MB-02): the streams as a cast, each with its emblem and its
 * accent, cycled with ▲ ▼.
 *
 * What must hold: ▲ ▼ go round the lanes on air and skip those still waiting for music, both ways; every lane gets an
 * accent and a shape of its own up to five, and its emblem carries its initial, escaped, in any script.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleLane, emblem, LANE_ACCENTS } from '../site/js/ui/channels.js';

test('▲ ▼ go round the lanes on air, both ways, skipping the ones waiting for music', () => {
  const lanes = [{ slug: 'mashup' }, { slug: 'long' }, { slug: 'soon', empty: true }, { slug: 'crate-upbeat' }];
  assert.equal(cycleLane(lanes, 'mashup', 1), 'long');
  assert.equal(cycleLane(lanes, 'long', 1), 'crate-upbeat', 'over the one still waiting');
  assert.equal(cycleLane(lanes, 'crate-upbeat', 1), 'mashup', 'round again');
  assert.equal(cycleLane(lanes, 'mashup', -1), 'crate-upbeat', 'and back the other way');
  assert.equal(cycleLane(lanes, 'unknown', 1), 'mashup', 'from nowhere, the first');
  assert.equal(cycleLane([{ slug: 'a', empty: true }], 'a', 1), null, 'nothing on air, nowhere to go');
});

test('each lane its own accent and shape, its emblem its initial', () => {
  assert.equal(new Set(LANE_ACCENTS).size, LANE_ACCENTS.length, 'five accents, all different');
  const shapes = new Set(Array.from({ length: 5 }, (_, i) => emblem('X', i).match(/d="([^"]+)"/)[1]));
  assert.equal(shapes.size, 5, 'five shapes');
  assert.match(emblem('Everything', 0), />E<\/text>/);
  assert.match(emblem('chill', 1), />C<\/text>/, 'the initial in capitals');
  assert.match(emblem('ゾーン', 2), />ゾ<\/text>/, 'in any script');
  assert.match(emblem('<x>', 3), />X<\/text>/, 'never markup');
  assert.match(emblem('Everything', 0), new RegExp(`fill="${LANE_ACCENTS[0]}"`));
  assert.match(emblem('Sixth', 5), new RegExp(`fill="${LANE_ACCENTS[0]}"`), 'the sixth lane starts the colours again');
});
