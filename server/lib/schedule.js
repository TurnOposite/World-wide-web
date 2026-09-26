/**
 * The station clock.
 *
 * This is what makes Radio Tower a *station* rather than a music player:
 * the programme is a pure function of wall-clock time. Nobody's playback
 * position is stored anywhere. Given the same library and the same epoch,
 * every client — and the server, and a restart three days from now — computes
 * the identical answer to "what is playing right now, and how far in?".
 *
 * Model
 * -----
 * Time is divided into CYCLES. One cycle plays every track in the library
 * exactly once, in an order derived deterministically from the cycle number.
 * Cycle N therefore has a fixed order and a fixed total duration, so:
 *
 *   elapsed      = now - epoch
 *   cycleIndex   = floor(elapsed / cycleDuration)
 *   posInCycle   = elapsed % cycleDuration
 *
 * and walking the cycle's order accumulating durations lands on the track and
 * the offset inside it. O(n) per lookup, memoised per cycle.
 *
 * Library changes and "eras"
 * ---------------------------
 * `cycleDuration` is the sum of every track's duration. If it changed the
 * instant `setTracks()` was called, it would retroactively re-date every
 * cycle boundary since the epoch — the *current* cycle index and position
 * would jump, sometimes by hours, for a station that has been on air for
 * months (see docs/ROADMAP.md #5 and docs/DECISIONS.md for a measured
 * example). Adding one MP3 is the most ordinary possible action; it must not
 * cut every listener to a different song.
 *
 * So a library change does not replace the schedule in place. It is staged
 * as an "era" — a `{ tracks, cycleSeconds, startTimeMs, startAbsCycle }`
 * snapshot that only starts governing playback once the wall clock reaches
 * `startTimeMs`, which is computed once, at the moment the change is noticed,
 * as the end of whichever cycle is already in progress under the *previous*
 * era. `startAbsCycle` keeps the global cycle counter (and therefore the
 * shuffle seed, `cycleIndex * 2654435761`) monotonic across the switch, so a
 * library change doesn't reset the shuffle back to cycle 0's natural order.
 *
 * A `Station` keeps at most two eras alive: `_era` (governs playback right
 * now, or did until `_nextEra` took over) and `_nextEra` (queued, takes over
 * at its own `startTimeMs`). Which one applies to a given `now` is a pure
 * comparison against stored timestamps — no mutation happens inside `at()`
 * itself, so calling it with times in any order, on any number of `Station`
 * instances that received the same `setTracks()` calls at the same moments,
 * gives the same answer. That last clause is deliberate: two independent
 * processes whose *rescans* land at slightly different real moments can in
 * principle queue different boundary times and diverge from that point on.
 * Radio Tower runs as a single process today, so this is a documented
 * property, not a live bug — see docs/DECISIONS.md, 2026-08-18 "Deferring
 * library changes to the next cycle boundary".
 *
 * Reordering what's next
 * ----------------------
 * A station whose programme is a pure function of time cannot, naively, let
 * anyone change what plays next — that is the whole point of the model. But
 * "I want to move that track up" is a reasonable thing to want from your own
 * radio station, so there is exactly one sanctioned way to do it, and it is
 * built to not disturb anything else: `setQueueOrder()` applies a
 * **permutation of a bounded window of upcoming slots**.
 *
 * Permutation is the load-bearing word. Swapping a 3-minute track for a
 * 5-minute one would change `cycleSeconds`, which would move every cycle
 * boundary since the epoch — the exact catastrophe the era mechanism above
 * exists to prevent. A permutation reorders the *same multiset of durations*
 * inside a window, so the window still ends at precisely the same instant.
 * Everything after it is untouched, `cycleSeconds` is unchanged, no era is
 * created, and a listener who is not in the window hears nothing different.
 *
 * The override is still a pure input to `at()`: for a fixed override, the
 * schedule remains a deterministic function of time, so two clients that
 * fetched the same override compute the same programme. It is deliberately
 * *not* persisted across a library change — if the underlying slots no
 * longer match, the override is ignored rather than applied to the wrong
 * tracks. See docs/DECISIONS.md, 2026-08-19.
 *
 * `Station.tracks` / `Station.byId` / `Station.cycleSeconds` /
 * `Station.revision` are deliberately NOT gated by the era mechanism — they
 * reflect the most recently scanned library immediately, the same way they
 * always have, because `/api/library` (search) and `/api/health` (track
 * count) are "what's here" views, not the programme itself. Only the
 * programme — `at()`, `upcoming()`, `history()`, `schedule()` — is deferred.
 */

/** Mulberry32 — small, fast, deterministic PRNG. Same seed, same sequence, forever. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher-Yates. Returns a new array; never mutates the input. */
export function seededShuffle(items, seed) {
  const out = items.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Order-independent content fingerprint for a track list.
 *
 * `Station.revision` (`count:cycleSeconds`) is deliberately coarse — cheap to
 * compare, fine for "did the library view change at all". It is too coarse
 * to gate the era-staging mechanism, though: renaming a file without adding
 * or removing any changes that file's id (`trackId()` is `sha1(relPath)`)
 * but not its duration, so the count and the total duration — and therefore
 * `revision` — stay identical while every id could be different underneath.
 * This fingerprint is the sorted set of ids, so it changes exactly when the
 * *content* changes, independent of ordering. See docs/ROADMAP.md #5,
 * finding 1 ("a revision-fingerprint collision permanently drops a library
 * change") and docs/DECISIONS.md 2026-08-19 for the full writeup.
 */
function fingerprintTracks(tracks) {
  return tracks.map((t) => t.id).sort().join(',');
}

export class Station {
  /**
   * @param {Array} tracks   library tracks (need at least id + duration)
   * @param {object} opts
   * @param {number} opts.epoch        ms since Unix epoch — the station's t=0
   * @param {number} opts.gapSeconds   silence between tracks
   * @param {string} opts.name
   */
  constructor(tracks = [], { epoch = 0, gapSeconds = 0, name = 'Radio Tower' } = {}) {
    this.name = name;
    this.epoch = epoch;
    this.gapSeconds = Math.max(0, gapSeconds);
    this._cycleCache = new Map(); // absolute cycleIndex -> ordered tracks for whichever era owns it

    // The schedule starts life empty, "as of" the epoch itself, so the very
    // first real setTracks() call (see the bootstrap branch below) begins
    // cycle 0 exactly at `epoch` rather than waiting for a boundary that
    // never existed.
    this._era = this._buildEra([], epoch, 0);
    this._nextEra = null;

    // A permutation of a run of slots inside one cycle, or null.
    // { cycleIndex, startWithin, ids: string[], setAt: number }
    this._override = null;

    this.tracks = [];
    this.byId = new Map();
    this.cycleSeconds = 0;
    this.revision = '0:0';
    this.setTracks(tracks);
  }

  /** Build an era snapshot: an immutable library + where in the global cycle count it starts. */
  _buildEra(tracks, startTimeMs, startAbsCycle) {
    const cycleSeconds = tracks.reduce((s, t) => s + t.duration + this.gapSeconds, 0);
    return {
      tracks,
      // A per-era id index, kept alongside the live `this.byId` so a track
      // the schedule is still actively promising (this era hasn't retired
      // yet) stays resolvable via `get()` even after a rescan has already
      // moved the live view on. See docs/ROADMAP.md #5, finding 2.
      byId: new Map(tracks.map((t) => [t.id, t])),
      cycleSeconds,
      startTimeMs,
      startAbsCycle,
      revision: `${tracks.length}:${Math.round(cycleSeconds)}`,
      fingerprint: fingerprintTracks(tracks),
    };
  }

  /**
   * Update the library.
   *
   * `this.tracks`/`this.byId`/`this.cycleSeconds`/`this.revision` change
   * immediately — they describe "what's in the library right now", used by
   * `/api/library` and `/api/health`. The *schedule* only adopts the change
   * once the clock crosses into the next cycle: see the file header.
   *
   * @param {Array} tracks
   * @param {object} [opts]
   * @param {number} [opts.now]  ms since Unix epoch — when this change was
   *   noticed. Defaults to real time; tests pass an explicit value so the
   *   boundary math is deterministic without waiting on the wall clock.
   */
  setTracks(tracks, { now = Date.now() } = {}) {
    const filtered = (tracks || []).filter((t) => Number.isFinite(t.duration) && t.duration > 0);
    this.tracks = filtered;
    this.byId = new Map(filtered.map((t) => [t.id, t]));
    this.cycleSeconds = filtered.reduce((s, t) => s + t.duration + this.gapSeconds, 0);
    this.revision = `${filtered.length}:${Math.round(this.cycleSeconds)}`;

    // Nothing new for the *schedule* to adopt (a routine rescan that found no
    // changes is the common case — every AUTO_RESCAN_MINUTES). Whatever is
    // already active or already queued still matches. Gated on the content
    // fingerprint (the sorted set of ids), not the coarser `revision` string:
    // `revision` is only `count:cycleSeconds`, so a same-count/same-duration
    // swap (e.g. renaming files without adding or removing any) used to leave
    // it unchanged, which made this an early return that silently skipped
    // staging the real change — forever, since every later no-op rescan would
    // hit the same false match. See docs/ROADMAP.md #5, finding 1 (BLOCKING).
    const queuedFingerprint = this._nextEra ? this._nextEra.fingerprint : this._era.fingerprint;
    if (fingerprintTracks(filtered) === queuedFingerprint) return this;

    const baseline = this._effectiveEra(now);
    if (baseline.tracks.length === 0 || baseline.cycleSeconds <= 0) {
      // Nothing has ever been on air under this era — there is no currently
      // playing track to protect, so apply immediately. This is what makes
      // the station's very first scan start the programme at `epoch` instead
      // of waiting for a boundary that was never real.
      this._era = this._buildEra(filtered, baseline.startTimeMs, baseline.startAbsCycle);
      this._nextEra = null;
    } else {
      // Protect the cycle already in progress: queue the new library to take
      // over at the end of it, not before.
      this._era = baseline;
      const elapsed = (now - baseline.startTimeMs) / 1000;
      const localCycle = Math.floor(elapsed / baseline.cycleSeconds);
      const startAbsCycle = baseline.startAbsCycle + localCycle + 1;
      const startTimeMs = baseline.startTimeMs + (localCycle + 1) * baseline.cycleSeconds * 1000;
      this._nextEra = this._buildEra(filtered, startTimeMs, startAbsCycle);
    }
    // A library change reshuffles the cycles the override was pinned to.
    // `_applyOverride` would refuse to apply it anyway (the slots no longer
    // match), but dropping it here means `/api/queue` reports the truth
    // rather than advertising an override that silently does nothing.
    this._override = null;
    this._cycleCache.clear();
    return this;
  }

  /** Which era governs playback at wall-clock instant `now`? Pure — no mutation. */
  _effectiveEra(now) {
    if (this._nextEra && now >= this._nextEra.startTimeMs) return this._nextEra;
    return this._era;
  }

  /** Which era owns a given *global* cycle index? Pure — no mutation. */
  _eraForCycle(cycleIndex) {
    if (this._nextEra && cycleIndex >= this._nextEra.startAbsCycle) return this._nextEra;
    return this._era;
  }

  /** Wall-clock instant (ms) at which a given global cycle index begins. */
  _startOfCycle(cycleIndex) {
    const era = this._eraForCycle(cycleIndex);
    return era.startTimeMs + (cycleIndex - era.startAbsCycle) * era.cycleSeconds * 1000;
  }

  get isEmpty() {
    // Whether *playback* has anything to offer right now — deliberately
    // reads the effective era (not the immediate `this.tracks`) so this
    // agrees with what `at(Date.now())` would actually return, even during
    // the window where a library change is queued but not yet in effect.
    const era = this._effectiveEra(Date.now());
    return era.tracks.length === 0 || era.cycleSeconds <= 0;
  }

  /** The ordered playlist for a given *global* cycle. Cached — cycles are revisited constantly. */
  cycleOrder(cycleIndex) {
    if (this._cycleCache.has(cycleIndex)) return this._cycleCache.get(cycleIndex);
    const era = this._eraForCycle(cycleIndex);
    // Cycle 0 plays the library in its natural (path-sorted) order so a fresh
    // install sounds intentional; later cycles shuffle deterministically.
    // Keyed off the *global* cycle index, which stays monotonic across a
    // library change (see setTracks) — a change does not reset the shuffle
    // back to natural order.
    const base = cycleIndex === 0 ? era.tracks.slice() : seededShuffle(era.tracks, cycleIndex * 2654435761);
    const order = this._applyOverride(base, cycleIndex);
    if (this._cycleCache.size > 8) this._cycleCache.clear();
    this._cycleCache.set(cycleIndex, order);
    return order;
  }

  /**
   * Apply the queue override to a cycle's natural order, if one targets it.
   *
   * Returns `base` untouched — same array identity — when there is nothing to
   * do, which is the overwhelmingly common case.
   *
   * The override is verified against the slots it claims to permute *every
   * time it is applied*, not just when it was set. A library rescan between
   * those two moments can reshuffle the cycle underneath it; rather than
   * reordering whatever now happens to sit at those indices, a mismatch
   * makes the override a no-op.
   */
  _applyOverride(base, cycleIndex) {
    const ov = this._override;
    if (!ov || ov.cycleIndex !== cycleIndex) return base;

    const { startWithin, ids } = ov;
    if (startWithin < 0 || startWithin + ids.length > base.length) return base;

    const slice = base.slice(startWithin, startWithin + ids.length);
    const byId = new Map(slice.map((t) => [t.id, t]));
    // Must be a genuine permutation of exactly these slots: no repeats, no
    // strangers. Anything else and we leave the schedule alone.
    if (byId.size !== slice.length) return base;
    if (!ids.every((id) => byId.has(id))) return base;

    const order = base.slice();
    ids.forEach((id, i) => {
      order[startWithin + i] = byId.get(id);
    });
    return order;
  }

  /**
   * Reorder a run of upcoming slots.
   *
   * @param {object} req
   * @param {number} req.cycleIndex   global cycle the window sits in
   * @param {number} req.startWithin  index of the first slot in the window
   * @param {string[]} req.ids        the window's track ids, in the order wanted
   * @returns {{ok: true}|{ok: false, error: string}}
   *
   * Rejects anything that is not a permutation of the slots it names, so a
   * caller cannot use this to insert, remove, or duplicate a track — only to
   * rearrange. That restriction is what keeps `cycleSeconds` constant.
   */
  setQueueOrder({ cycleIndex, startWithin, ids } = {}) {
    if (!Number.isInteger(cycleIndex) || !Number.isInteger(startWithin) || startWithin < 0) {
      return { ok: false, error: 'invalid_window' };
    }
    if (!Array.isArray(ids) || ids.length < 2) return { ok: false, error: 'nothing_to_reorder' };

    // Compare against the *natural* order, not the currently-overridden one,
    // so repeated reorders of the same window compose predictably instead of
    // stacking permutation on permutation.
    const era = this._eraForCycle(cycleIndex);
    const base = cycleIndex === 0
      ? era.tracks.slice()
      : seededShuffle(era.tracks, cycleIndex * 2654435761);

    if (startWithin + ids.length > base.length) return { ok: false, error: 'window_out_of_range' };

    const slice = base.slice(startWithin, startWithin + ids.length);
    const want = [...ids].sort();
    const have = slice.map((t) => t.id).sort();
    if (want.length !== have.length || want.some((id, i) => id !== have[i])) {
      return { ok: false, error: 'not_a_permutation' };
    }

    this._override = { cycleIndex, startWithin, ids: [...ids], setAt: Date.now() };
    this._cycleCache.clear();
    return { ok: true };
  }

  /**
   * Wall-clock instant (ms) at which a given slot begins, or null if the slot
   * does not exist.
   *
   * The queue editor addresses slots by (cycleIndex, withinCycle) rather than
   * by track id, because a library smaller than the lookahead window repeats
   * ids across cycles — with 8 tracks and a 12-slot window, "move track X"
   * names two different slots. A slot address is unambiguous at any library
   * size.
   */
  slotStartsAt(cycleIndex, withinCycle) {
    if (!Number.isInteger(cycleIndex) || !Number.isInteger(withinCycle)) return null;
    const order = this.cycleOrder(cycleIndex);
    if (withinCycle < 0 || withinCycle >= order.length) return null;
    let acc = 0;
    for (let i = 0; i < withinCycle; i++) acc += order[i].duration + this.gapSeconds;
    return Math.round(this._startOfCycle(cycleIndex) + acc * 1000);
  }

  /** Drop any override and return to the natural order. */
  clearQueueOrder() {
    const had = Boolean(this._override);
    this._override = null;
    if (had) this._cycleCache.clear();
    return had;
  }

  /** The active override, or null. Read-only view for the API. */
  get queueOverride() {
    return this._override ? { ...this._override, ids: [...this._override.ids] } : null;
  }

  /** Step one slot forward (+1) or backward (-1) from a {cycleIndex, withinCycle} position. */
  _advanceCursor({ cycleIndex, withinCycle }, delta) {
    if (delta >= 0) {
      const order = this.cycleOrder(cycleIndex);
      let wc = withinCycle + 1;
      let ci = cycleIndex;
      if (wc >= order.length) {
        wc = 0;
        ci += 1;
      }
      return { cycleIndex: ci, withinCycle: wc };
    }
    let ci = cycleIndex;
    let wc = withinCycle - 1;
    if (wc < 0) {
      ci -= 1;
      const order = this.cycleOrder(ci);
      if (order.length === 0) return null; // nothing further back to walk into
      wc = order.length - 1;
    }
    return { cycleIndex: ci, withinCycle: wc };
  }

  _trackAtCursor(cursor) {
    if (!cursor) return null;
    const order = this.cycleOrder(cursor.cycleIndex);
    return order[cursor.withinCycle] ?? null;
  }

  /**
   * What is on air at `now`?
   * @param {number} now ms since Unix epoch
   * @returns {null|{track, offset, startsAt, endsAt, cycleIndex, withinCycle, inGap}}
   */
  at(now = Date.now()) {
    const era = this._effectiveEra(now);
    if (era.tracks.length === 0 || era.cycleSeconds <= 0) return null;

    const elapsed = (now - era.startTimeMs) / 1000;
    // Negative elapsed (querying before this era's own start) still works:
    // JS % keeps the sign, so we normalise it back into [0, cycleSeconds).
    const localCycle = Math.floor(elapsed / era.cycleSeconds);
    const cycleIndex = era.startAbsCycle + localCycle;
    let pos = elapsed - localCycle * era.cycleSeconds;
    if (pos < 0) pos += era.cycleSeconds;

    const order = this.cycleOrder(cycleIndex);
    const cycleStartSec = this._startOfCycle(cycleIndex) / 1000;
    let acc = 0;
    for (let i = 0; i < order.length; i++) {
      const track = order[i];
      const slot = track.duration + this.gapSeconds;
      if (pos < acc + slot) {
        const offset = pos - acc;
        const startsAtSec = cycleStartSec + acc;
        return {
          track,
          offset: Math.min(offset, track.duration),
          inGap: offset > track.duration,
          startsAt: Math.round(startsAtSec * 1000),
          endsAt: Math.round((startsAtSec + track.duration) * 1000),
          cycleIndex,
          withinCycle: i,
          slotIndex: cycleIndex * order.length + i, // informational only — not comparable across a library change
        };
      }
      acc += slot;
    }
    // Floating-point rounding can leave us a hair past the end of the last
    // slot. Recurse into the exact start of the next cycle rather than
    // duplicating the lookup above — also the correct, safe answer if that
    // next cycle turns out to belong to an empty era (returns null via the
    // isEmpty-equivalent check at the top, not a crash on order[0]).
    return this.at(this._startOfCycle(cycleIndex + 1));
  }

  /** The next `count` tracks after the one on air at `now`, with their start times. */
  upcoming(now = Date.now(), count = 5) {
    const current = this.at(now);
    if (!current) return [];
    const out = [];
    let cursor = { cycleIndex: current.cycleIndex, withinCycle: current.withinCycle };
    let startsAt = current.endsAt + this.gapSeconds * 1000;
    for (let i = 0; i < count; i++) {
      cursor = this._advanceCursor(cursor, 1);
      const track = this._trackAtCursor(cursor);
      if (!track) break;
      out.push({
        ...publicTrack(track),
        startsAt: Math.round(startsAt),
        endsAt: Math.round(startsAt + track.duration * 1000),
        // The slot's address in the programme. The queue editor needs this to
        // name the window it wants permuted — a position in a list on screen
        // is not enough, because the list scrolls forward as tracks end.
        cycleIndex: cursor.cycleIndex,
        withinCycle: cursor.withinCycle,
      });
      startsAt += (track.duration + this.gapSeconds) * 1000;
    }
    return out;
  }

  /**
   * The programme guide: every slot whose play window overlaps [fromMs, toMs).
   * Like `at()` and `upcoming()`, this is a pure function of time — same
   * station, same window, same answer, on any machine, after any restart.
   * The first item is whatever is on air at `fromMs` (even though it started
   * earlier), so "what plays starting now" and "what plays starting at some
   * future instant" are the same call.
   *
   * `maxItems` is a belt-and-braces guard, not a normal limit: the caller
   * (the `/api/schedule` route) already caps the wall-clock span, so this
   * only matters for a pathological library (many very short tracks) where a
   * capped time window could still mean many thousands of slots.
   */
  schedule(fromMs, toMs, { maxItems = 2000 } = {}) {
    if (!(toMs > fromMs)) return [];
    const first = this.at(fromMs);
    if (!first) return [];
    const out = [];
    let cursor = { cycleIndex: first.cycleIndex, withinCycle: first.withinCycle };
    let startsAt = first.startsAt;
    while (out.length < maxItems && startsAt < toMs) {
      const track = this._trackAtCursor(cursor);
      if (!track) break;
      const endsAt = startsAt + track.duration * 1000;
      out.push({ ...publicTrack(track), startsAt: Math.round(startsAt), endsAt: Math.round(endsAt) });
      startsAt = endsAt + this.gapSeconds * 1000;
      cursor = this._advanceCursor(cursor, 1);
    }
    return out;
  }

  /** What played before now — useful for a "recently played" strip. */
  history(now = Date.now(), count = 5) {
    const current = this.at(now);
    if (!current) return [];
    const out = [];
    let cursor = { cycleIndex: current.cycleIndex, withinCycle: current.withinCycle };
    for (let i = 0; i < count; i++) {
      cursor = this._advanceCursor(cursor, -1);
      const track = this._trackAtCursor(cursor);
      if (!track) break;
      out.push(publicTrack(track));
    }
    return out;
  }

  /**
   * Resolve a track id to its metadata.
   *
   * Checked against the live `byId` first (the current scan — updates the
   * instant a rescan lands, per the file header). Falls back to whichever
   * eras are still governing playback: `at()`/`upcoming()`/`schedule()` can
   * keep promising an id for the rest of a cycle already in progress after a
   * rescan has already moved that id out of the live `byId` (an ordinary
   * rename is enough — `trackId()` is `sha1(relPath)`, so a renamed-but-
   * still-present file gets a new id and the old one vanishes from the live
   * view immediately). Without this fallback, `/api/track/:id/stream` and
   * `/art` 404 for exactly the track the schedule is telling every client is
   * playing right now. A genuinely gone file still fails correctly — this
   * only keeps the *lookup* resolvable; `resolveTrackPath()` still 410s if
   * the bytes really aren't there. See docs/ROADMAP.md #5, finding 2 (HIGH).
   */
  get(id) {
    return this.byId.get(id) || this._era?.byId.get(id) || this._nextEra?.byId.get(id) || null;
  }
}

/** Strip filesystem details before anything crosses the wire. */
export function publicTrack(t) {
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album || null,
    year: t.year ?? null,
    genre: t.genre ?? null,
    duration: t.duration,
    hasArt: Boolean(t.hasArt),
    // The station plays one undifferentiated shuffle across every genre, so
    // the genre is the only cue a listener gets that Brassens following
    // Macroblank is intentional. It also drives the visualiser's palette.
    genreSlug: t.genreSlug || null,
    genreLabel: t.genreLabel || null,
    // Degrees on the colour wheel, set by server/lib/genre.js. The player
    // passes this straight to public/viz.js so barber beats (285, violet) and
    // atmospheric DnB (165, sea-green) do not paint the same picture.
    genreAccent: Number.isFinite(t.genreAccent) ? t.genreAccent : null,
  };
}

export default Station;
