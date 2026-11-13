/**
 * scripts/repeats.mjs — does the same song come round twice, close together? (Ortis, 2026-11-13: keep the
 * Snowpoint doubles on air, « just do warn me if they ever play like twice the same song over ».)
 *
 * The pairs below are real, from the tower's library of 2026-11-07: the six copies the Behold backup brought
 * in under other titles (and no artist), and pairs that are two different songs a hair apart in length,
 * which must never be called the same.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { titleMatch, sameRecording, twins, findRepeats, readTower } from '../scripts/repeats.mjs';

let n = 0;
const tr = (artist, title, duration) => ({ id: `t${++n}`, artist, title, duration });

test('the six copies from the Behold backup are each found to be an album track', () => {
  const pairs = [
    [tr('snowpoint lounge', 'ＢＩＲＴＨ 島  - Virus DNA Mutation Project', 297.14), tr('Unknown artist', 'ＢＩＲＴＨ 島  - Virus Mutation DNA Project', 297.10)],
    [tr('snowpoint lounge', 'B a t t l e F a c t o r y ゴールドシンボルバトル', 297.51), tr('Unknown artist', 'B a t t l e F a c t o r y ゴールドシンボルバトルv2', 297.48)],
    [tr('snowpoint lounge', '空間と時間 (ep version)', 239.52), tr('snowpoint lounge', '空間と時間 (ep album version)', 239.36)],
    [tr('snowpoint lounge', 'ミチナの飲み物', 291.79), tr('Unknown artist', 'A3 ミチナで飲む', 291.76)],
    [tr('snowpoint lounge', 'fallacious will and desire', 317.49), tr('Unknown artist', 'fallacious willpower', 317.45)],
    [tr('snowpoint lounge', '鋭敏な洞窟', 242.23), tr('snowpoint lounge', '鋭敏な洞窟', 242.21)],
  ];
  for (const [a, b] of pairs) assert.equal(sameRecording(a, b), true, `${a.title} = ${b.title}`);
});

test('two different songs a hair apart in length are never the same', () => {
  const pairs = [
    [tr('Macroblank', 'heatwave, burning city', 292.47), tr('Macroblank', 'tie fighter training', 292.47)],
    [tr('Macroblank', 'ripping rubber', 271.07), tr('Macroblank', 'ripped jeans jeanie', 271.20)],
    [tr('undersaken', 'reflection in the pond', 348.79), tr('undersaken', 'reflections of my life when I was happy', 348.89)],
    [tr('undersaken', "you wouldn't understand anyways", 280.89), tr('undersaken', 'you, resting on my chest', 280.79)],
    [tr('undersaken', 'losing others is inevitable ကုစားပါ။', 204.98), tr('undersaken', '淵 learn how to live again 昇', 204.98)],
    [tr('STEEZYASFUCK', 'Space Jazz | Jazzy Beats | 1 Hour Playlist', 3604.09), tr('STEEZYASFUCK', 'Sunset Drive | Jazzy Beats | 1 Hour Playlist', 3604.09)],
    [tr('Unknown artist', 'Heart of the End - Hyrule Warriors', 227.33), tr('Unknown artist', 'Solidus Cave (Enemy Keep) - Hyrule Warriors', 227.28)],
    [tr('snowpoint lounge', 'Fallacious Willpower', 333.40), tr('snowpoint lounge', 'fallacious will and desire', 317.49)],
  ];
  for (const [a, b] of pairs) assert.equal(sameRecording(a, b), false, `${a.title} ≠ ${b.title}`);
  assert.equal(sameRecording(tr('Saken 天', 'x', 200), tr('undersaken', 'x', 200)), false, 'two named artists are two artists');
});

test('titles: brackets, width and case aside', () => {
  assert.equal(titleMatch('SEABOMB 2023 -21:21/22:22', 'SEABOMB 2023'), 'same');
  assert.equal(titleMatch('Ｅｃｏ　Ｚｏｎｅｓ', 'eco zones'), 'same');
  assert.equal(titleMatch('Heart of the End (Enemy Keep)', 'Heart of the End (Paused)'), 'same');
  assert.equal(titleMatch('Grove', 'Mind'), null);
});

test('a library groups each recording once, however many copies', () => {
  const lib = [tr('snowpoint lounge', 'ミチナの飲み物', 291.79), tr('snowpoint lounge', 'ミチナの飲み物', 291.76), tr('Unknown artist', 'A3 ミチナで飲む', 291.76), tr('Mabisyo', 'Grove', 120)];
  const g = twins(lib);
  assert.equal(g.length, 1);
  assert.equal(g[0].length, 3);
});

test('a warning when a recording comes round within the window: the same file, or its twin', () => {
  const a = tr('snowpoint lounge', 'fallacious will and desire', 317.49);
  const b = tr('Unknown artist', 'fallacious willpower', 317.45);
  const c = tr('Mabisyo', 'Grove', 300);
  const H = 3_600_000;
  const slot = (t, startsAt) => ({ id: t.id, title: t.title, artist: t.artist, startsAt, endsAt: startsAt + t.duration * 1000 });
  const items = [slot(a, 0), slot(c, 0.1 * H), slot(b, 2 * H), slot(c, 10 * H), slot(a, 30 * H)];
  const found = findRepeats([a, b, c], items, { withinMs: 3 * H });
  assert.equal(found.length, 1, 'the twin two hours later; Grove ten hours later and the next day\'s fallacious are fine');
  assert.equal(found[0].twin, true);
  assert.equal(found[0].first.title, 'fallacious will and desire');
  assert.equal(findRepeats([a, b, c], [slot(c, 0), slot(c, 0.2 * H)], { withinMs: 3 * H })[0].twin, false, 'the same file twice is a warning too');
  assert.deepEqual(findRepeats([a, b, c], items, { withinMs: 60_000 }), [], 'a narrower window lets the two hours pass');
});

test('the tower is read page by page, and 48 hours of schedule at a time', async () => {
  const asked = [];
  const lib = Array.from({ length: 700 }, (_, i) => ({ id: `x${i}`, artist: 'a', title: `t${i}`, duration: 100 + i }));
  const fetchImpl = async (url) => {
    asked.push(url);
    const u = new URL(url);
    if (u.pathname === '/api/library') {
      const off = Number(u.searchParams.get('offset'));
      return { ok: true, json: async () => ({ total: lib.length, items: lib.slice(off, off + 500) }) };
    }
    return { ok: true, json: async () => ({ items: [{ id: 'x1', title: 't1', startsAt: Date.parse(u.searchParams.get('from')), endsAt: Date.parse(u.searchParams.get('from')) + 1000 }] }) };
  };
  const got = await readTower('https://tower.example/', { days: 5, now: Date.parse('2026-11-13T12:00:00Z'), fetchImpl });
  assert.equal(got.library.length, 700);
  assert.equal(asked.filter((u) => u.includes('/api/library')).length, 2);
  assert.equal(asked.filter((u) => u.includes('/api/schedule')).length, 3, '5 days = 48 + 48 + 24 hours');
  assert.ok(asked.every((u) => u.startsWith('https://tower.example/api/')));
});
