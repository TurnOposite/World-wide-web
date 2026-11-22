/**
 * His labels on the tower (BACKLOG W1, 2026-11-22): his sheet → server/data/labels.json → applied over the rules at
 * every scan. What must hold: his words read as the label they name first; an artist he labelled once keeps that label
 * on his other rows; the file holds only labels the tower knows, for well-formed ids; applying it changes slug, name
 * and hue together, and an unknown slug changes nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GENRES, GENRE_BY_SLUG, GENRE_BY_LABEL } from '../server/lib/genre.js';
import { applyLabels, readLabels } from '../server/lib/library.js';
import { labelOf, decideRows } from '../scripts/labels-from-sheet.mjs';

test('his eight labels are the tower\'s now, each with its own slug and hue', () => {
  for (const l of ['Slushwave', 'Bossa nova', 'Beat tape', 'Breakcore', 'Hyperpop', 'Funk', 'Hip-hop', 'Pop']) {
    const g = GENRE_BY_LABEL.get(l.toLowerCase());
    assert.ok(g && GENRE_BY_SLUG.get(g.slug) === g && Number.isFinite(g.accent), l);
  }
  assert.equal(new Set(GENRES.map((g) => g.slug)).size, GENRES.length, 'slugs unique');
  assert.equal(GENRES.at(-1).slug, 'unsorted', 'unsorted stays last');
});

test('his words: the label whose word comes first', () => {
  assert.equal(labelOf('jazz lofi anime'), 'Jazz');
  assert.equal(labelOf('anime soundtrack / lofi / beats'), 'Lo-fi');
  assert.equal(labelOf('ALL OFSAKEN IS BARBER'), 'Barber Beats');
  assert.equal(labelOf('Denz1000 is all uk garabe n house'), 'Electronic');
  assert.equal(labelOf('drum n bass great mix'), 'Atmospheric DnB');
  assert.equal(labelOf('Hyperpop'), 'Hyperpop', 'not Pop');
  assert.equal(labelOf('Sloshwave'), 'Slushwave', 'his spelling too');
  assert.equal(labelOf('chill / rlly good'), null, 'no label word: nothing');
});

test('an artist he labelled once keeps that label on his other rows; Unknown artist is many people', () => {
  const rows = decideRows([
    { Artist: 'saken', 'Album, or the long mix': 'a', 'Your label': 'ALL OFSAKEN IS BARBER', 'Right label': 'Barber Beats' },
    { Artist: 'saken', 'Album, or the long mix': 'b', 'Right label': 'Video Game' },
    { Artist: 'Unknown artist', 'Album, or the long mix': 'c', 'Your label': 'Jazz', 'Right label': 'Jazz' },
    { Artist: 'Unknown artist', 'Album, or the long mix': 'd', 'Right label': 'Ambient' },
  ]);
  assert.deepEqual(rows.map((r) => r.label), ['Barber Beats', 'Barber Beats', 'Jazz', 'Ambient']);
});

test('labels.json holds only labels the tower knows, for twelve-hex ids', async () => {
  const doc = JSON.parse(fs.readFileSync(new URL('../server/data/labels.json', import.meta.url), 'utf8'));
  const entries = Object.entries(doc.tracks);
  assert.ok(entries.length > 1000, `${entries.length} tracks labelled`);
  for (const [id, slug] of entries) { assert.match(id, /^[0-9a-f]{12}$/); assert.ok(GENRE_BY_SLUG.has(slug), slug); }
  assert.equal(Object.keys(await readLabels()).length, entries.length);
  assert.deepEqual(await readLabels(new URL('./no-such-file.json', import.meta.url)), {}, 'no file: no labels');
});

test('applying: slug, name and hue together; an unknown slug changes nothing', () => {
  const t = [{ id: 'aaaaaaaaaaaa', genreSlug: 'unsorted', genreLabel: 'Unsorted', genreAccent: 210 }, { id: 'bbbbbbbbbbbb', genreSlug: 'jazz', genreLabel: 'Jazz', genreAccent: 35 }];
  assert.equal(applyLabels(t, { aaaaaaaaaaaa: 'slushwave', bbbbbbbbbbbb: 'nonsense' }), 1);
  assert.deepEqual([t[0].genreSlug, t[0].genreLabel, t[0].genreAccent], ['slushwave', 'Slushwave', GENRE_BY_SLUG.get('slushwave').accent]);
  assert.equal(t[1].genreSlug, 'jazz');
});

test('his pace (2026-11-22): two lanes put first, by track id; a long mix he loves comes round every 3 days', async () => {
  const { withPace, normalizeProgramme, planLibrary, makeCalendar, DEFAULT_PROGRAMME } = await import('../server/lib/programme.js');
  const spec = { timeZone: 'Europe/Paris', dayStarts: '05:00', lanes: [{ name: 'Long mixes', minMinutes: 35, perDay: 5 }, { name: 'Albums', fill: true }] };
  assert.equal(withPace(spec, null), spec, 'no pace: untouched');
  assert.equal(withPace(spec, { more: [], less: ['nope'] }), spec, 'nothing usable: untouched');
  const paced = normalizeProgramme(withPace(spec, { more: ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'], less: ['bbbbbbbbbbbb', 'cccccccccccc'] }));
  assert.deepEqual(paced.lanes.map((l) => [l.name, l.every]).slice(0, 2), [['Less often (his sheet)', 30], ['More often (his sheet)', 3]]);
  assert.deepEqual(paced.lanes[1].ids, ['aaaaaaaaaaaa'], 'a track in both goes less often');
  const t = (id, mins) => ({ id, relPath: `x/${id}.mp3`, duration: mins * 60, artist: id, title: id });
  const plan = planLibrary([t('aaaaaaaaaaaa', 90), t('cccccccccccc', 4), t('dddddddddddd', 90), t('eeeeeeeeeeee', 4)], paced, makeCalendar(paced));
  const laneOf = (id) => plan.lanes.find((l) => l.tracks.some((x) => x.id === id))?.name;
  assert.equal(laneOf('aaaaaaaaaaaa'), 'More often (his sheet)', 'the loved long mix: not the long mixes\' lane');
  assert.equal(laneOf('cccccccccccc'), 'Less often (his sheet)');
  assert.equal(laneOf('dddddddddddd'), 'Long mixes');
  assert.equal(laneOf('eeeeeeeeeeee'), 'Albums');
  assert.ok(withPace(true, { more: ['aaaaaaaaaaaa'] }) === true || DEFAULT_PROGRAMME, 'a non-object spec passes through');
});

test('pace.json: well-formed ids, reasons for each, and nothing both loved and lowered', () => {
  const doc = JSON.parse(fs.readFileSync(new URL('../server/data/pace.json', import.meta.url), 'utf8'));
  for (const id of [...doc.more, ...doc.less]) { assert.match(id, /^[0-9a-f]{12}$/); assert.ok(doc.why[id], id); }
  assert.equal(doc.more.filter((id) => doc.less.includes(id)).length, 0);
  assert.ok(doc.more.length >= 1 && doc.less.length >= 1);
});
