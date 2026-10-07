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

/** Does a track pass a channel's filter? */
export function matches(t, ch) {
  const mins = (t.duration || 0) / 60;
  if (Number.isFinite(ch.minMinutes) && mins < ch.minMinutes) return false;
  if (Number.isFinite(ch.maxMinutes) && mins >= ch.maxMinutes) return false;
  const crates = cratesOf(t).map(slugify);
  if (Array.isArray(ch.crates) && ch.crates.length && !ch.crates.some((c) => crates.includes(slugify(c)))) return false;
  if (Array.isArray(ch.excludeCrates) && ch.excludeCrates.some((c) => crates.includes(slugify(c)))) return false;
  if (Array.isArray(ch.genres) && ch.genres.length && !ch.genres.includes(t.genreSlug)) return false;
  return true;
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
    const alive = new Set();
    for (const ch of expanded) {
      if (ch.order === 'station') {
        if (!this.main) continue;
        alive.add(ch.slug);
        list.push({ ...ch, station: this.main });
        continue;
      }
      const picked = usable.filter((t) => matches(t, ch));
      if (!picked.length) continue;
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
    }
    for (const slug of [...this._stations.keys()]) if (!alive.has(slug)) this._stations.delete(slug);
    this._list = list;
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

  /** The public description of every channel — what /api/channels returns. */
  list({ now = Date.now() } = {}) {
    return this._list.map((c) => {
      const st = c.station;
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
