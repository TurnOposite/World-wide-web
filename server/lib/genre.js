/**
 * Genre classification.
 *
 * Ortis's library arrived as six unsorted folders scraped from a laptop and a
 * USB drive. Almost none of it carries usable ID3 genre tags — most files came
 * from YouTube rips, so the only reliable signal is the *filename and the
 * folder it sits in*. "Macroblank - 痛みの永遠.mp3" is barber beats; the folder
 * `RL/` is French chanson and classical; "MICROMECHA - Underwater Quest
 * (Atmospheric DnB_Ambient Jungle_Liquid DnB).mp3" announces itself.
 *
 * So this is deliberately a *rule* engine over text, not a tag reader. It runs
 * over the relative path, the embedded tags, and the artist/album, in that
 * order of trust, and returns the first bucket that matches.
 *
 * Why rules and not a model: the station has to boot on a Pi Zero 2 W with
 * 512MB of RAM and no network. A lookup table costs nothing and is auditable —
 * when a track lands in the wrong bucket you can see exactly which pattern
 * caught it and fix that one line. See docs/DECISIONS.md, 2026-08-19.
 *
 * Ordering matters. Rules are evaluated top to bottom and the first hit wins,
 * so the specific ones ("silph skyline" is VGM-flavoured barber beats, but it
 * is *made of* game music) come before the broad ones ("ambient").
 */

/**
 * The canonical buckets. `slug` is what the schedule and the API speak;
 * `label` is what the UI prints; `accent` is the hue the visualiser leans on
 * when this genre is on air (see public/viz.js).
 */
export const GENRES = [
  { slug: 'barber-beats', label: 'Barber Beats', accent: 285 },
  { slug: 'vaporwave', label: 'Vaporwave', accent: 315 },
  { slug: 'vgm', label: 'Video Game', accent: 195 },
  { slug: 'dnb-jungle', label: 'Atmospheric DnB', accent: 165 },
  { slug: 'lofi', label: 'Lo-fi', accent: 255 },
  { slug: 'jazz', label: 'Jazz', accent: 35 },
  { slug: 'electronic', label: 'Electronic', accent: 225 },
  { slug: 'trip-hop', label: 'Trip-Hop', accent: 270 },
  { slug: 'ambient', label: 'Ambient', accent: 180 },
  { slug: 'french-rap', label: 'Rap FR', accent: 10 },
  { slug: 'chanson', label: 'Chanson', accent: 45 },
  { slug: 'classical', label: 'Classical', accent: 55 },
  { slug: 'rock-pop', label: 'Rock & Pop', accent: 340 },
  { slug: 'unsorted', label: 'Unsorted', accent: 210 },
];

export const GENRE_BY_SLUG = new Map(GENRES.map((g) => [g.slug, g]));

/**
 * Fold the wilder end of the library's filenames into something matchable:
 * fullwidth Latin ("ＶＥＲＩＤＩＳ"), bold-math styling ("𝗟𝗢𝗦𝗧"), accents,
 * and the usual punctuation soup. Without this, a third of the vaporwave in
 * this library is unmatchable — which is exactly the third that most needs
 * matching.
 */
export function foldText(input) {
  if (!input) return '';
  let s = String(input).normalize('NFKD');
  // Strip combining marks left behind by NFKD (é -> e).
  s = s.replace(/[̀-ͯ]/g, '');
  // Mathematical alphanumerics (𝗔-𝗭, 𝐀-𝐳 and friends) fold to ASCII via a
  // codepoint walk; NFKD already handles most, this catches the rest.
  s = s.replace(/[\u{1D400}-\u{1D7FF}]/gu, (ch) => {
    const cp = ch.codePointAt(0);
    const offset = (cp - 0x1d400) % 52;
    return offset < 26
      ? String.fromCharCode(65 + offset)
      : String.fromCharCode(97 + (offset - 26));
  });
  return s.toLowerCase();
}

/**
 * The rules. Each is [slug, ...patterns]; a pattern is a plain substring
 * (cheap, and the common case) or a RegExp when word boundaries matter.
 *
 * Kept as data rather than code so that mis-filed tracks are a one-line fix.
 */
const RULES = [
  // --- Named artists and labels, most specific first -----------------------
  // These are unambiguous: if the filename says Macroblank, it is barber beats.
  ['barber-beats',
    'macroblank', 'undersaken', 'haircuts for men', 'slowerpace', 'dirty river',
    'snowpoint lounge', 'barber beats', 'barber', 'mabisyo', 'doze into purgatory',
    'telepath', 'lost epoch', 'plastic fables'],

  // Explicit vaporwave markers outrank the VGM list below. "𝗟𝗢𝗦𝗧
  // 𝗩𝗜𝗗𝗘𝗢𝗚𝗔𝗠𝗘 𝗠𝗔𝗟𝗟 … 1990s Low Poly Ambient Vaporwave" contains
  // "videogame", but a filename that says *vaporwave* is telling you the
  // genre, whereas one that says *videogame* is telling you the subject.
  ['vaporwave',
    'vaporwave', 'vapourwave', 'mallsoft', 'signalwave', 'future funk',
    'low poly ambient', 'lost videogame mall', 'god on the code',
    'liminal stages', 'utopian scholastic', '幻街', 'zodiak'],

  ['vgm',
    'silph skyline', 'hyrule', 'zelda', 'ocarina', 'kakariko', 'pokemon', 'pokémon',
    'nintendo', 'mario', 'balatro', 'warframe', 'bomb rush cyberfunk', 'cyberfunk',
    'orre region', 'snowpoint', 'video game', 'videogame', 'game music', '3ds',
    'town of zoz', 'skyloft', 'twilight princess', 'majora', 'chrono', 'final fantasy',
    'sonic', 'metroid', 'castlevania', 'undertale', 'katamari', 'ost', 'soundtrack',
    /\bvgm\b/],

  ['dnb-jungle',
    'atmospheric dnb', 'ambient jungle', 'liquid dnb', 'liquid db', 'jungle',
    'breakcore', 'break station', 'micromecha', 'arcologies', 'lake effect',
    'drum and bass', 'drum & bass', 'low poly breaks', 'neurofunk', 'amen',
    /\bdnb\b/, /\bd&b\b/, /\bdb mix\b/],

  ['lofi',
    'lofi', 'lo-fi', 'lo fi', 'chillhop', 'beattape', 'beat tape', 'radio juicy',
    'cookin soul', 'beats for contemplation', 'shifting music', 'jazzy beats',
    'study beats', 'idm'],

  ['jazz',
    'jazz', 'bossa', 'takanaka', 'jiro inagaki', 'akira ishikawa', 'moonchild',
    'porco rosso', 'count buffalos', 'soul media', 'nu disco', 'acid jazz',
    'big band', 'swing', 'cowboy bebop', 'tiny desk', 'sinatra', 'seychelles',
    'rainbow goblins'],

  ['trip-hop', 'massive attack', 'trip hop', 'trip-hop', 'blue lines', 'portishead'],

  ['electronic',
    'daft punk', 'daft punk', 'lorn', 'mitch murder', 'sega sunset', 'synthwave',
    'salvatore ganacci', 'house and disco', 'disco remix', 'nu disco', 'garage',
    'pinkpantheress', 'ukg', 'uk garage', 'drozax', 'accelio', 'proux',
    // Air (French duo, "Premiers Symptomes"). Matched on the title/album, not
    // the artist name alone — "air" is too common a word to trust as a
    // substring match without colliding with unrelated filenames.
    'premiers symptomes', 'le soleil est pres de moi',
    /\bhouse\b/, /\bdisco\b/, /\btechno\b/],

  ['ambient',
    'aphex twin', 'selected ambient works', 'ambient', 'ambience', 'atmospheres',
    'reflection garden', 'water show', 'montparnasse', 'drone', 'weltschmerz'],

  ['french-rap',
    'alpha wann', 'alphawann', 'nekfeu', 'kaaris', 'ziak', 'freeze corleone',
    'alkpote', 'vald', 'leto', 'oklm', 'couvre feu', 'bongaré', 'bongare',
    'nique les clones', 'galatée', 'galatee'],

  ['chanson',
    'aznavour', 'brassens', 'dassin', 'sardou', 'becaud', 'bécaud', 'gainsbourg',
    'brel', 'piaf', 'montand', 'trenet', 'chanson',
    // The RL folder is a French-chanson + classical shoebox; these are its
    // unmistakable titles, which carry no artist in the filename at all.
    'auprès de mon arbre', 'aupres de mon arbre', 'gare au gorille',
    'les champs-elysees', 'champs-elysees', "l'été indien", 'ete indien',
    'emmenez moi', 'la mamma', 'que c est triste venise', 'que c\'est triste venise',
    'ta katie t\'a quitté', 'siffler sur la colline', 'les comediens',
    'mes emmerdes', 'les passantes', 'le petit pain au chocolat',
    'trousse chemise', 'guantanamera', 'les daltons', 'billy le bordelais',
    'cupidon s\'en fout', 'le cocu', 'la cane de jeanne', 'le cimetière',
    'les nymphomanes', 'ma bonne etoile', 'ma bonne étoile', 'sur ma vie',
    'salut', 'cecilia', 'emanuelle', 'framboise', 'mireille', 'marcelle'],

  ['classical',
    'concerto', 'partita', 'cantata', 'symphony', 'sonata', 'prelude', 'fugue',
    'gould', 'bach', 'mozart', 'beethoven', 'vivaldi', 'chopin', 'itzha',
    'ronda alla turca', 'rondo alla turca', 'clarinet', 'oboe', 'harp',
    /\bbwv?\b/, /\bk\d{3}\b/, /\bop\.\s?\d+/],

  ['rock-pop',
    'led zeppelin', 'gorillaz', 'the strokes', 'strokes recorded', 'the turtles',
    'happy together', 'onerepublic', 'dua lipa', 'the weeknd', 'depeche mode',
    'unknown mortal orchestra', 'clairo', 'karen o', 'blue scholars',
    'kendrick', 'maad city', 'm.a.a.d', 'tribe called quest', 'mf doom',
    'wu tang', 'biggie', '6ix9ine', 'kahoot'],
];

/**
 * Classify one track.
 *
 * @param {object} track  needs at least { relPath }; title/artist/album/genre optional
 * @returns {{slug: string, label: string, accent: number, matched: string|null}}
 *   `matched` is the pattern that fired — kept so `npm run scan` can explain
 *   itself and mis-filings are traceable to a single rule.
 */
export function classify(track = {}) {
  // Trust order: the path (folder names carry real intent here), then the
  // embedded tag, then artist/album, then the title on its own.
  const haystack = foldText(
    [track.relPath, track.genre, track.artist, track.album, track.title]
      .filter(Boolean)
      .join('   ')
  );

  for (const [slug, ...patterns] of RULES) {
    for (const pattern of patterns) {
      const hit = pattern instanceof RegExp
        ? pattern.test(haystack)
        : haystack.includes(foldText(pattern));
      if (hit) {
        const g = GENRE_BY_SLUG.get(slug);
        return { ...g, matched: String(pattern) };
      }
    }
  }

  // An honest "don't know" beats a confident wrong bucket — `unsorted` is
  // visible in the UI so the library tells you what still needs a rule.
  return { ...GENRE_BY_SLUG.get('unsorted'), matched: null };
}

/** Count tracks per genre, heaviest first. Used by `npm run scan` and /api/health. */
export function genreBreakdown(tracks = []) {
  const counts = new Map();
  for (const t of tracks) {
    const slug = t.genreSlug || classify(t).slug;
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      count,
      label: GENRE_BY_SLUG.get(slug)?.label || slug,
    }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

export default { classify, genreBreakdown, foldText, GENRES, GENRE_BY_SLUG };
