/**
 * Channels: several synced stations from one library.
 *
 * Until 2026-10-07 the tower had one programme. Whatever the library held
 * played as one long loop, and the cloud edition — 28 short tracks on Wix —
 * could only ever be "the short songs". Ortis asked for the opposite: switch
 * easily between the genres, and have a Mashup.
 *
 * A channel is a *filter* over the library plus a *running order*. Each one
 * is its own `Station` with the same epoch, so the station's one idea holds
 * per channel: everyone tuned to Mashup hears the same second of Mashup,
 * everyone on Long mixes the same second of Long mixes, and none of it is
 * stored anywhere. Switching channel is just asking a different clock.
 *
 * The filters speak about **crates**: the top-level folder a file sits in
 * (`Library/<playlist>/…` — one folder per Spotify playlist, see
 * library/README.md), or a cloud track's own `crate` field. Crates are
 * Ortis's own categories, so the default spec gives every crate a channel of
 * its own, and adds:
 *
 *   mashup  every crate taking turns (Station order 'interleave'), songs only
 *   long    the long mixes and full albums — anything 20 minutes or more
 *   all     everything, as the station always played it (legacy; the DJ's
 *           command-line booth and the Pi's own page still use this one)
 *
 * Since 2026-11-10 a channel can also name `folders` at any depth, and say
 * `match: 'any'` (see matches) — the two streams beside Everything, Chill
 * and Energy, are channels of that kind.
 *
 * The spec is data (library/channels.json on a server, `channels` in
 * site/station/library.json on the static site). A channel with no tracks is
 * not listed — the long-mix channel appears the day a long mix is online.
 *
 * Pure and dependency-free apart from schedule.js: the static site imports a
 * verbatim copy (scripts/site-sync.mjs).
 */
import { Station, ORDERS } from './schedule.js';

export const DEFAULT_CHANNEL_SPEC = {
  default: 'mashup',
  channels: [
    {
      slug: 'mashup',
      label: 'Mashup',
      blurb: 'Every crate takes its turn — songs only, the long mixes have their own channel.',
      order: 'interleave',
      maxMinutes: 20,
    },
    {
      slug: 'long',
      label: 'Long mixes',
      blurb: 'The hour-long sets and full albums, start to finish.',
      order: 'shuffle',
      minMinutes: 20,
    },
    { auto: 'crates', order: 'shuffle', minTracks: 3 },
    {
      slug: 'all',
      label: 'Everything',
      blurb: 'The whole library in one loop, the way the tower first played it.',
      order: 'station',
    },
  ],
};

/** Lower-case, accent-free, hyphenated — the same folding for every name. */
export function slugify(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'crate';
}

/**
 * Which crate a track belongs to.
 *   1. its own `crate` (the static site's library.json, or set by a scanner)
 *   2. the first folder of its path inside the library
 *   3. its genre label — loose files at the top still land somewhere sensible
 */
export function crateOf(t) {
  if (t?.crate) return String(t.crate);
  const rel = t?.relPath;
  if (typeof rel === 'string' && rel.includes('/')) return rel.split('/')[0];
  return t?.genreLabel || 'Loose tracks';
}

/**
 * Every crate a track belongs to. A song can sit in several Spotify
 * playlists but is stored once, in its first playlist's folder; the library
 * bot records the others (library/bot.mjs → playlists.json `files`), and the
 * scanner hands them over as `t.crates`. The first one is the home crate —
 * the one the Mashup deals it from.
 */
export function cratesOf(t) {
  const home = crateOf(t);
  const extra = Array.isArray(t?.crates) ? t.crates.map(String) : [];
  return [home, ...extra.filter((c) => slugify(c) !== slugify(home))];
}

/**
 * A folder as the filters compare it — the daily programme's folding
 * (programme.js fold: accents, case, runs of spaces and underscores), written
 * out here so this file stays whole when the site copies it.
 */
export function foldPath(s) {
  return String(s ?? '').normalize('NFKC').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\\/g, '/').replace(/[\s_]+/g, ' ').replace(/^\/+|\/+$/g, '').trim();
}

/** Is a track inside one of these folders, at any depth? `Crates/Bandcamp/an album` is a folder like `Chill`. */
export function inFolders(t, folders) {
  const rel = foldPath(t?.relPath);
  if (!rel) return false;
  return folders.some((raw) => {
    const f = foldPath(raw);
    return Boolean(f) && (rel === f || rel.startsWith(`${f}/`));
  });
}

/**
 * Does a track pass a channel's filter?
 *
 * The length limits and the exclusions always hold. Of what a channel asks
 * for — `crates` (top-level folders), `folders` (any depth), `genres` — a
 * track must meet every kind named, or, with `match: 'any'`, at least one:
 * that is how a stream is drafted from the genre labels and then filled by
 * hand, folder by folder (Ortis, 2026-11-10: « folders for the streams, but
 * help me fill them based on the labels »).
 */
export function matches(t, ch) {
  const mins = (t.duration || 0) / 60;
  if (Number.isFinite(ch.minMinutes) && mins < ch.minMinutes) return false;
  if (Number.isFinite(ch.maxMinutes) && mins >= ch.maxMinutes) return false;
  const crates = cratesOf(t).map(slugify);
  if (Array.isArray(ch.excludeCrates) && ch.excludeCrates.some((c) => crates.includes(slugify(c)))) return false;
  if (Array.isArray(ch.excludeFolders) && ch.excludeFolders.length && inFolders(t, ch.excludeFolders)) return false;
  const asked = [];
  if (Array.isArray(ch.crates) && ch.crates.length) asked.push(ch.crates.some((c) => crates.includes(slugify(c))));
  if (Array.isArray(ch.folders) && ch.folders.length) asked.push(inFolders(t, ch.folders));
  if (Array.isArray(ch.genres) && ch.genres.length) asked.push(ch.genres.includes(t.genreSlug));
  if (!asked.length) return true;
  return ch.match === 'any' ? asked.some(Boolean) : asked.every(Boolean);
}

/**
 * The two streams beside Everything (Ortis, 2026-11-10: « one chill as fuck and the other more energetic — keep
 * the Everything one »). They are the tower's own, so that a tower whose channels.json was written before them
 * carries them from the first restart; a channels.json that defines `chill` or `energy` itself wins, and
 * `"streams": false` there switches both off.
 *
 * They ship empty, on purpose (the same evening: « make the stream interface live now and build infra for
 * their content, but no content for now »). Each is the folder of its name at the top of the library — what is
 * dropped in `Chill` plays on Chill and never on Energy, and the other way round — and `keepEmpty` keeps a
 * stream with nothing in it on the dial, shown as waiting, instead of leaving it out as an empty channel is.
 * Filling them from the albums already on the tower is done in channels.json, where a stream can list any
 * folders, name genres with `match: 'any'`, and exclude folders: he wants the labels revised before that.
 */
export const STREAMS = Object.freeze([
  Object.freeze({
    slug: 'chill',
    label: 'Chill',
    blurb: 'Slow and quiet. For working, reading, or nothing at all.',
    order: 'shuffle',
    match: 'any',
    folders: ['Chill'],
    excludeFolders: ['Energy'],
    keepEmpty: true,
  }),
  Object.freeze({
    slug: 'energy',
    label: 'Energy',
    blurb: 'Faster and louder.',
    order: 'shuffle',
    match: 'any',
    folders: ['Energy'],
    excludeFolders: ['Chill'],
    keepEmpty: true,
  }),
]);

/** A spec with the streams it does not define itself added after its own channels — unless it says `streams: false`. */
export function withStreams(spec) {
  if (!spec || spec.streams === false) return spec;
  const have = new Set((spec.channels || []).map((c) => c?.slug));
  const add = STREAMS.filter((s) => !have.has(s.slug));
  return add.length ? { ...spec, channels: [...(spec.channels || []), ...add] } : spec;
}

/**
 * Turn a spec into concrete channels for a given library: expands
 * `{ auto: 'crates' }` into one channel per crate, drops unknown orders,
 * de-duplicates slugs (first one wins).
 */
export function expandSpec(tracks, spec = DEFAULT_CHANNEL_SPEC) {
  const out = [];
  const seen = new Set();
  const push = (ch) => {
    if (!ch.slug || seen.has(ch.slug)) return;
    seen.add(ch.slug);
    out.push(ch);
  };
  for (const raw of spec?.channels || []) {
    if (raw?.auto === 'crates') {
      const crates = new Map();
      const counts = new Map();
      for (const t of tracks) {
        for (const name of cratesOf(t)) {
          const slug = slugify(name);
          if (!crates.has(slug)) crates.set(slug, name);
          counts.set(slug, (counts.get(slug) || 0) + 1);
        }
      }
      const skip = new Set((raw.except || []).map(slugify));
      // A crate of one or two tracks is a loop, not a channel: `minTracks`.
      const minTracks = Number.isFinite(raw.minTracks) ? raw.minTracks : 1;
      [...crates.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .filter(([slug]) => !skip.has(slug) && counts.get(slug) >= minTracks)
        .forEach(([slug, name]) => push({
          slug: `crate-${slug}`,
          label: name,
          blurb: raw.blurb || null,
          crates: [name],
          order: raw.order || 'shuffle',
          minMinutes: raw.minMinutes,
          maxMinutes: raw.maxMinutes,
          kind: 'crate',
        }));
      continue;
    }
    if (!raw || typeof raw.slug !== 'string') continue;
    push({ ...raw, slug: slugify(raw.slug), order: raw.order === 'station' || ORDERS.includes(raw.order) ? raw.order : 'shuffle' });
  }
  return out;
}

/**
 * The set of channel stations for one library.
 *
 * `main` is an existing Station (the tower's original single programme) that
 * a channel with `order: 'station'` exposes as-is — so `/api/station` with
 * no channel and `/api/station?channel=all` are the same clock, and nothing
 * that predates channels moves.
 */
export class ChannelSet {
  /**
   * @param {object} o
   * @param {object} [o.spec]      channel spec (DEFAULT_CHANNEL_SPEC)
   * @param {object} o.station     { epoch, gapSeconds, name } for new stations
   * @param {Station} [o.main]     the legacy single programme, if any
   */
  constructor({ spec = DEFAULT_CHANNEL_SPEC, station = {}, main = null } = {}) {
    this.spec = spec || DEFAULT_CHANNEL_SPEC;
    this.stationOpts = station;
    this.main = main;
    this._stations = new Map(); // slug -> Station
    this._list = [];
    this._all = []; // _list, plus the channels kept on the dial while they hold nothing (keepEmpty), in the spec's order
    this._bySlug = new Map();
  }

  /**
   * Re-derive every channel from a library. A channel that already exists
   * keeps its Station, which stages the change as an era (the cycle on air
   * plays out); a new channel starts from the epoch like any first scan.
   * When `main` is given, it is the caller's job to setTracks() it.
   */
  setTracks(tracks, { now = Date.now() } = {}) {
    const usable = (tracks || []).filter((t) => Number.isFinite(t.duration) && t.duration > 0);
    const expanded = expandSpec(usable, this.spec);
    const list = [];
    const all = [];
    const alive = new Set();
    for (const ch of expanded) {
      if (ch.order === 'station') {
        if (!this.main) continue;
        alive.add(ch.slug);
        list.push({ ...ch, station: this.main });
        all.push(list.at(-1));
        continue;
      }
      const picked = usable.filter((t) => matches(t, ch));
      if (!picked.length) {
        // Nothing to play is no channel — except one the spec keeps on the dial to say it is coming (the streams).
        if (ch.keepEmpty === true) all.push({ ...ch, station: null });
        continue;
      }
      let st = this._stations.get(ch.slug);
      if (!st || st.order !== ch.order) {
        st = new Station([], { ...this.stationOpts, order: ch.order });
      }
      // Interleave groups by crate: make sure every track carries it.
      for (const t of picked) if (!t.crate) Object.defineProperty(t, 'crate', { value: crateOf(t), enumerable: false, configurable: true, writable: true });
      st.setTracks(picked, { now });
      this._stations.set(ch.slug, st);
      alive.add(ch.slug);
      list.push({ ...ch, station: st });
      all.push(list.at(-1));
    }
    for (const slug of [...this._stations.keys()]) if (!alive.has(slug)) this._stations.delete(slug);
    this._list = list;
    this._all = all;
    this._bySlug = new Map(list.map((c) => [c.slug, c]));
    return this;
  }

  /** The default channel's slug: the spec's choice if it exists, else the first. */
  get defaultSlug() {
    const want = this.spec?.default;
    if (want && this._bySlug.has(want)) return want;
    return this._list[0]?.slug ?? null;
  }

  has(slug) { return this._bySlug.has(slug); }

  /** The Station for a channel, or null. */
  get(slug) { return this._bySlug.get(slug)?.station ?? null; }

  /** Resolve a requested slug to one that exists (else the default). */
  resolve(slug) { return slug && this._bySlug.has(slug) ? slug : this.defaultSlug; }

  /** Every station this set owns, for whoever needs to visit them all. */
  stations() { return this._list.map((c) => c.station); }

  /**
   * The public description of every channel — what /api/channels returns. One kept while empty is described
   * too, marked `empty`: it has no clock, cannot be tuned to (has, get and resolve do not know it), and a
   * listener who asks for it gets the default channel.
   */
  list({ now = Date.now() } = {}) {
    return this._all.map((c) => {
      const st = c.station;
      if (!st) return { slug: c.slug, label: c.label || c.slug, blurb: c.blurb || null, kind: c.kind || 'custom', order: c.order, trackCount: 0, seconds: 0, onAir: null, empty: true };
      const cur = st.at(now);
      return {
        slug: c.slug,
        label: c.label || c.slug,
        blurb: c.blurb || null,
        kind: c.kind || (c.slug === 'mashup' ? 'mashup' : c.slug === 'long' ? 'long' : c.order === 'station' ? 'all' : 'custom'),
        order: c.order === 'station' ? st.order : c.order,
        trackCount: st.tracks.length,
        seconds: Math.round(st.cycleSeconds),
        onAir: cur?.track ? { id: cur.track.id, title: cur.track.title, artist: cur.track.artist } : null,
      };
    });
  }
}

export default ChannelSet;
