/**
 * The station, running inside the visitor's browser.
 *
 * On a Radio Tower server the programme is computed by `Station` in Node and
 * served as JSON. On the static site there is no server — so each browser
 * builds the very same `Station` (the file is copied verbatim from
 * server/lib/schedule.js) from `station/library.json`, and answers the same
 * questions with the same payload builders (server/lib/payloads.js). Two
 * browsers on two continents therefore agree on the track and the second
 * without ever talking to each other: that is BRIEF.md §3, unchanged.
 *
 * What a browser cannot know on its own is a DJ's decision. That arrives as
 * `control.json` (see ./control.js) and is applied with the same
 * `setQueueOrder()` the Pi uses — a permutation, so nothing outside the
 * window can move.
 */
import { Station, publicTrack } from '../lib/schedule.js';
import { stationPayload, schedulePayload, queuePayload, checkReorder } from '../lib/payloads.js';

export const CLOUD_DEFAULTS = {
  lookahead: 5,
  queueWindow: 12,
  // The Pi fences 60 s. A cloud change has to travel: DJ's browser → GitHub
  // → every listener's next poll. Three minutes covers the worst case with
  // room to spare, and a listener never hears a track they were promised
  // swapped out from under them.
  queueLockSeconds: 180,
};

/** Resolve a library-relative path ("collections/…") against the site root. */
function absolutise(url, base) {
  if (!url) return null;
  try { return new URL(url, base).href; } catch { return url; }
}

export class CloudEngine {
  /**
   * @param {object} o
   * @param {object} o.library   parsed station/library.json
   * @param {object} [o.control] parsed station/control.json
   * @param {object} [o.config]  overrides for CLOUD_DEFAULTS + station origin
   * @param {string} [o.base]    site root URL, for relative art/sources
   * @param {() => number} [o.clock]  ms since epoch, skew-corrected
   */
  constructor({ library, control = null, config = {}, base = globalThis.location?.href ?? 'http://localhost/', clock = () => Date.now() }) {
    this.base = base;
    this.clock = clock;
    this.config = {
      ...CLOUD_DEFAULTS,
      ...config,
      stationName: library.name || 'Radio Tower',
      stationTagline: library.tagline || '',
    };
    this.station = new Station(library.tracks || [], {
      epoch: Date.parse(library.epoch || '2026-01-01T00:00:00Z'),
      gapSeconds: library.gapSeconds || 0,
      name: this.config.stationName,
      shuffle: library.shuffle !== false,
    });
    this.library = library;
    this.urls = {
      stream: (t) => absolutise((t.sources || [])[0], this.base),
      art: (t) => absolutise(t.art, this.base),
    };
    this.control = null;
    this.controlStatus = 'none';
    if (control) this.applyControl(control);
  }

  /** Every source for a track, absolute, in the order to try them. */
  sourcesFor(id) {
    const t = this.station.get(id);
    return (t?.sources || []).map((s) => absolutise(s, this.base));
  }

  /**
   * Adopt a control document. Returns what happened to its override, because
   * "the DJ's reorder silently did nothing" must be visible somewhere:
   *   'none'     — no override in the document
   *   'applied'  — it is a valid permutation of the slots it names
   *   'stale'    — it targets a cycle that has already finished (harmless)
   *   'rejected' — it does not match this library (e.g. edited since)
   */
  applyControl(doc) {
    this.control = doc && typeof doc === 'object' ? doc : null;
    const ov = this.control?.override;
    if (!ov) {
      this.station.clearQueueOrder();
      this.controlStatus = 'none';
      return this.controlStatus;
    }
    const now = this.clock();
    const current = this.station.at(now);
    if (current && ov.cycleIndex < current.cycleIndex) {
      this.station.clearQueueOrder();
      this.controlStatus = 'stale';
      return this.controlStatus;
    }
    const result = this.station.setQueueOrder({ cycleIndex: ov.cycleIndex, startWithin: ov.startWithin, ids: ov.ids });
    this.controlStatus = result.ok ? 'applied' : 'rejected';
    if (!result.ok) this.station.clearQueueOrder();
    return this.controlStatus;
  }

  /** The broadcast look the DJ set, or null. */
  get look() {
    return this.control?.look ?? null;
  }

  /**
   * Build the control document a reorder would produce, validated exactly as
   * the Pi validates a POST /api/queue/reorder — but *not* applied: in the
   * cloud it only takes effect once the control plane has accepted it.
   * Returns `{ ok: true, doc }` or `{ ok: false, status, error, detail? }`.
   */
  proposeReorder({ cycleIndex, startWithin, ids }, { by = 'booth', note = null } = {}) {
    const now = this.clock();
    const verdict = checkReorder(this.station, { now, lockSeconds: this.config.queueLockSeconds, body: { cycleIndex, startWithin, ids } });
    if (!verdict.ok) return verdict;

    // Dry-run the permutation on a throwaway station, so a refusal is
    // reported here rather than discovered by every listener later.
    const probe = new Station(this.library.tracks || [], {
      epoch: this.station.epoch, gapSeconds: this.station.gapSeconds, shuffle: this.station.shuffle,
    });
    const result = probe.setQueueOrder({ cycleIndex, startWithin, ids });
    if (!result.ok) return { ok: false, status: 409, error: result.error, detail: 'Refresh the queue and try again.' };

    const doc = {
      ...(this.control || {}),
      version: 1,
      override: { cycleIndex, startWithin, ids: [...ids], setAt: now, by },
      updatedAt: new Date(now).toISOString(),
    };
    if (note) doc.note = note; else delete doc.note;
    return { ok: true, doc };
  }

  /** The control document with the override removed. */
  proposeClear() {
    const doc = { ...(this.control || {}), version: 1, override: null, updatedAt: new Date(this.clock()).toISOString() };
    delete doc.note;
    return { ok: true, doc };
  }

  /** The control document with a new broadcast look (null clears it). */
  proposeLook(look) {
    return { ok: true, doc: { ...(this.control || {}), version: 1, look: look || null, updatedAt: new Date(this.clock()).toISOString() } };
  }

  /**
   * Answer a GET the way a Radio Tower server would. Same paths, same bodies,
   * so the player and the rooms do not care which kind of host they are on.
   * @returns {{ status: number, body: object }}
   */
  get(pathAndQuery) {
    const url = new URL(pathAndQuery, 'http://station.local');
    const q = url.searchParams;
    const now = this.clock();
    const extra = { mode: 'cloud', origin: this.config.origin || null };

    switch (url.pathname) {
      case '/api/time':
        return { status: 200, body: { t: now } };

      case '/api/station':
        return { status: 200, body: stationPayload(this.station, { now, config: this.config, urls: this.urls, extra }) };

      case '/api/schedule': {
        const body = schedulePayload(this.station, { now, from: q.get('from'), to: q.get('to'), urls: this.urls });
        if (body.error) return { status: body.status, body: { error: body.error } };
        return { status: 200, body };
      }

      case '/api/queue':
        return {
          status: 200,
          body: queuePayload(this.station, {
            now, config: this.config, editable: true, urls: this.urls,
            extra: { mode: 'cloud', controlStatus: this.controlStatus, look: this.look },
          }),
        };

      case '/api/library': {
        const needle = (q.get('q') || '').trim().toLowerCase();
        const limit = Math.min(500, Math.max(1, Number.parseInt(q.get('limit'), 10) || 100));
        const offset = Math.max(0, Number.parseInt(q.get('offset'), 10) || 0);
        let items = this.station.tracks;
        if (needle) {
          items = items.filter((t) => [t.title, t.artist, t.album].some((v) => (v || '').toLowerCase().includes(needle)));
        }
        return {
          status: 200,
          body: {
            total: items.length, offset, limit,
            items: items.slice(offset, offset + limit).map((t) => ({ ...publicTrack(t), artUrl: this.urls.art(t), scores: t.scores || null })),
          },
        };
      }

      case '/api/health':
        return {
          status: 200,
          body: {
            ok: !this.station.isEmpty,
            status: this.station.isEmpty ? 'no_tracks' : 'on_air',
            mode: 'cloud',
            tracks: this.station.tracks.length,
            cycleSeconds: Math.round(this.station.cycleSeconds),
            revision: this.station.revision,
            nowPlayingId: this.station.at(now)?.track?.id ?? null,
            controlStatus: this.controlStatus,
          },
        };

      default:
        return { status: 404, body: { error: 'not_found' } };
    }
  }
}

export default CloudEngine;
