/**
 * Genre classification and duplicate detection.
 *
 * The cases here are not invented: every filename is a real one from the six
 * folders this library was assembled from. That matters, because the whole
 * point of a rule engine over filenames is that it is tuned to *this*
 * collection — a test built from tidy synthetic names would pass while the
 * real drive still landed half its vaporwave in "unsorted".
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { classify, genreBreakdown, foldText } from '../server/lib/genre.js';
import { dedupeTracks, normalizeTitle, preferredOf } from '../server/lib/dedupe.js';

const g = (relPath, extra = {}) => classify({ relPath, ...extra }).slug;

test('classifies the real library by filename alone', () => {
  const cases = [
    // Barber beats — the artists that define the bucket.
    ['April music re-up/Macroblank - 能界蘭極境 - Macroblank.mp3', 'barber-beats'],
    ['undersaken - 斬鉄剣 - 01 Exilium.mp3', 'barber-beats'],
    ['iTunes/Haircuts for Men  -  ダウンタンブルと死にます.mp3', 'barber-beats'],
    ['August/Dirty River - The desire to move forward [VaporwaveBarber Beats].mp3', 'barber-beats'],

    // Video game music.
    ['silph skyline ◓ - Orre Region - 01 Wes.mp3', 'vgm'],
    ["iTunes/Hyrule Warrior Legends OST/Zelda's Lullaby - Hyrule Warriors.mp3", 'vgm'],
    ['iTunes/1 Hour of Amazing Pokemon BlackWhite Music Compilation.mp3', 'vgm'],
    ['April music re-up/Funk Express (from Bomb Rush Cyberfunk).mp3', 'vgm'],

    // Atmospheric DnB / jungle.
    ['MICROMECHA - Underwater Quest (Atmospheric DnB_Ambient Jungle_Liquid DnB).mp3', 'dnb-jungle'],
    ['Musiques/BREAK STATION • _Ambient Jungle_DnB Mix_.mp3', 'dnb-jungle'],
    ['Musiques/Breakcore mix for Dissociating (1).mp3', 'dnb-jungle'],
    ['April music re-up/LAKE EFFECT  Atmospheric DnB & Jungle  - arcologies.mp3', 'dnb-jungle'],

    // French chanson and classical — the RL folder, which carries no artist
    // in the filename at all and is matched on title alone.
    ['RL/Auprès de mon arbre.mp3', 'chanson'],
    ['RL/Les Champs-Elysees.mp3', 'chanson'],
    ["RL/Ta Katie t'a quitté.mp3", 'chanson'],
    ['RL/Cantata No. 140.mp3', 'classical'],
    ['RL/Violin Concerto in E major BW.mp3', 'classical'],
    ['RL/Ronda alla turca.mp3', 'classical'],
    ['RL/03 Invention (Gould).mp3.mp3', 'classical'],

    // The rest of the spread.
    ['iTunes/Nekfeu - Galatée.mp3', 'french-rap'],
    ['iTunes/ALPHA WANN - Freestyle COUVRE FEU sur OKLM Radio.mp3', 'french-rap'],
    ['iTunes/Gorillaz - Clint Eastwood (Official Video).mp3', 'rock-pop'],
    ['Musiques/aphex-twin-selected-ambient-works-8592.mp3', 'ambient'],
    ['Musiques/massive-attack-blue-lines-trip-hop-1991.mp3', 'trip-hop'],
    ['iTunes/japanese jazz when driving on a warm night.mp3', 'jazz'],
    ['Musiques/remember when lofi hip-hop still sounded real..mp3', 'lofi'],
    ['Musiques/PinkPantheress X UK Garage.mp3', 'electronic'],
    ['SpotiMate.io - Le soleil est près de moi - Air.mp3', 'electronic'],
  ];

  for (const [relPath, expected] of cases) {
    assert.equal(g(relPath), expected, `${relPath} should be ${expected}, got ${g(relPath)}`);
  }
});

test('fullwidth and bold-math filenames still classify', () => {
  // A third of the vaporwave in this library is written in styled unicode.
  // If folding breaks, these silently fall into "unsorted".
  assert.equal(foldText('ＶＥＲＩＤＩＳ'), 'veridis');
  assert.equal(foldText('𝗟𝗢𝗦𝗧'), 'lost');
  assert.equal(g('iTunes/ＶＥＲＩＤＩＳ　ＱＵＯ（ＳＩＭＰＬＥ　ＶＡＰＯＲＷＡＶＥ）.mp3'), 'vaporwave');
  assert.equal(g('𝗚𝗢𝗗 𝗢𝗡 𝗧𝗛𝗘 𝗖𝗢𝗗𝗘 1990s Ambient Vaporwave.mp3'), 'vaporwave');
});

test('an explicit vaporwave marker outranks the word "videogame"', () => {
  // "LOST VIDEOGAME MALL … Low Poly Ambient Vaporwave" is mallsoft, not a
  // game soundtrack. The filename names its genre and its subject; the genre
  // has to win, or the whole mallsoft shelf files itself as VGM.
  assert.equal(
    g('𝗟𝗢𝗦𝗧 𝗩𝗜𝗗𝗘𝗢𝗚𝗔𝗠𝗘 𝗠𝗔𝗟𝗟 幻街  1990s Low Poly Ambient Vaporwave - Liminal Stages.mp3'),
    'vaporwave'
  );
  // …but a game soundtrack with no genre claim is still VGM.
  assert.equal(g('April music re-up/Balatro OST in the style of Masayoshi Takanaka.mp3'), 'vgm');
});

test('an unmatched track is honestly unsorted, not guessed', () => {
  assert.equal(g('August/ㅤㅤㅤ.mp3'), 'unsorted');
  assert.equal(g('random/track01.mp3'), 'unsorted');
});

test('classification prefers the path over a misleading tag', () => {
  // YouTube rips routinely carry a junk genre tag. The folder is the better
  // signal, and is consulted first.
  const slug = classify({
    relPath: 'RL/Cantata No. 140.mp3',
    genre: 'Blues',
    title: 'Cantata No. 140',
  }).slug;
  assert.equal(slug, 'classical');
});

test('genreBreakdown counts and sorts heaviest first', () => {
  const tracks = [
    { relPath: 'a/Macroblank - x.mp3' },
    { relPath: 'b/undersaken - y.mp3' },
    { relPath: 'c/Zelda - z.mp3' },
  ];
  const rows = genreBreakdown(tracks);
  assert.equal(rows[0].slug, 'barber-beats');
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].label, 'Barber Beats');
});

// --- Duplicates ------------------------------------------------------------

test('normalizeTitle strips the noise but keeps what changes the recording', () => {
  assert.equal(
    normalizeTitle('03 Invention (Gould).mp3.mp3'),
    normalizeTitle('Invention (Gould).mp3')
  );
  assert.equal(
    normalizeTitle('Face a Crisis - Hyrule Warriors (1).mp3'),
    normalizeTitle('Face a Crisis - Hyrule Warriors.mp3')
  );
  assert.equal(
    normalizeTitle('Happy_Together_-_The_Turtles_1967_(getmp3.pro).mp3'),
    normalizeTitle('Happy Together - The Turtles 1967.mp3')
  );
  assert.equal(
    normalizeTitle('Gorillaz - Clint Eastwood (Official Video).mp3'),
    normalizeTitle('Gorillaz - Clint Eastwood.mp3')
  );

  // A leading track number must not eat a number that is part of the name.
  assert.equal(normalizeTitle('Gorillaz - 19-2000 (Official Video).mp3'), 'gorillaz192000');
  assert.match(normalizeTitle('1990s-low-poly-ambient-vaporwave.mp3'), /^1990s/);
  assert.equal(normalizeTitle('01. Ready or Not Here We Go.mp3'), 'readyornotherewego');
  assert.equal(normalizeTitle('04 Taurus.mp3'), 'taurus');

  // These must stay distinct — they are different recordings.
  assert.notEqual(
    normalizeTitle('Instant Crush (slowed + reverb).mp3'),
    normalizeTitle('Instant Crush.mp3')
  );
  assert.notEqual(
    normalizeTitle('Main Theme - Hyrule Warriors.mp3'),
    normalizeTitle('Main Theme (Legend Mode) - Hyrule Warriors.mp3')
  );
});

test('drops the real cross-folder overlap and keeps the better copy', () => {
  // E:\Music and Desktop\Music\April music re-up genuinely share this album.
  const tracks = [
    {
      relPath: 'April music re-up/undersaken - Music Has the Right to Barber - 04 Taurus.mp3',
      title: 'Taurus', duration: 401, size: 16144266, bitrate: 320,
    },
    {
      relPath: 'EMusic/undersaken - Music Has the Right to Barber - 04 Taurus.mp3',
      title: 'Taurus', duration: 401.4, size: 16144266, bitrate: 256,
    },
  ];
  const { unique, duplicates } = dedupeTracks(tracks);
  assert.equal(unique.length, 1);
  assert.equal(duplicates.length, 1);
  assert.equal(unique[0].bitrate, 320, 'kept the lower-bitrate copy');
  assert.equal(duplicates[0].duplicateOf, unique[0].relPath);
});

test('a "(1)" download is dropped in favour of the unsuffixed original', () => {
  const tracks = [
    { relPath: 'iTunes/Face a Crisis - Hyrule Warriors.mp3', title: 'Face a Crisis', duration: 120, size: 100, bitrate: 192 },
    { relPath: 'iTunes/Face a Crisis - Hyrule Warriors (1).mp3', title: 'Face a Crisis', duration: 120, size: 100, bitrate: 192 },
  ];
  const { unique, duplicates } = dedupeTracks(tracks);
  assert.equal(unique.length, 1);
  assert.match(unique[0].relPath, /Warriors\.mp3$/);
  assert.match(duplicates[0].relPath, /\(1\)\.mp3$/);
});

test('same title, genuinely different length, stays two tracks', () => {
  // Dozens of soundtracks contain a "Main Theme". Duration is what stops
  // them collapsing into one entry.
  const tracks = [
    { relPath: 'a/Main Theme.mp3', title: 'Main Theme', duration: 90, size: 10 },
    { relPath: 'b/Main Theme.mp3', title: 'Main Theme', duration: 240, size: 20 },
  ];
  const { unique, duplicates } = dedupeTracks(tracks);
  assert.equal(unique.length, 2);
  assert.equal(duplicates.length, 0);
});

test('lossless beats lossy at equal bitrate metadata', () => {
  const flac = { relPath: 'a/x.flac', title: 'x', duration: 100, size: 50, codec: 'FLAC' };
  const mp3 = { relPath: 'b/x.mp3', title: 'x', duration: 100, size: 50, codec: 'MPEG' };
  assert.equal(preferredOf(flac, mp3).relPath, 'a/x.flac');
  assert.equal(preferredOf(mp3, flac).relPath, 'a/x.flac');
});

test('dedupe is deterministic and order-independent', () => {
  // Two scans of the same drive must drop the same file. If they do not, the
  // library revision flaps and the schedule re-eras itself on every rescan
  // (see schedule.js, "Library changes and eras").
  const tracks = [
    { relPath: 'z/song.mp3', title: 'song', duration: 200, size: 10, bitrate: 128 },
    { relPath: 'a/song.mp3', title: 'song', duration: 200, size: 10, bitrate: 128 },
    { relPath: 'm/song.mp3', title: 'song', duration: 200, size: 10, bitrate: 128 },
    { relPath: 'q/other.mp3', title: 'other', duration: 50, size: 5 },
  ];
  const forward = dedupeTracks(tracks);
  const reversed = dedupeTracks(tracks.slice().reverse());
  assert.deepEqual(
    forward.unique.map((t) => t.relPath),
    reversed.unique.map((t) => t.relPath)
  );
  assert.equal(forward.unique.length, 2);
});

test('a track with unreadable metadata is kept, not silently dropped', () => {
  const tracks = [
    { relPath: 'a/mystery.mp3', title: '', duration: 0, size: 1234 },
    { relPath: 'b/other.mp3', title: 'other', duration: 60, size: 99 },
  ];
  const { unique } = dedupeTracks(tracks);
  assert.equal(unique.length, 2);
});
