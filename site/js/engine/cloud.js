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
import { ChannelSet, DEFAULT_CHANNEL_SPEC } from '../lib/channels.js';

/** The channel a control document's legacy `override` (no `channel` field) belongs to. */
export const LEGACY_CHANNEL = 'all';

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
   * @param {string} [o.channel]  start on this channel (else the library's default)
   */
  constructor({ library, control = null, config = {}, base = globalThis.location?.href ?? 'http://localhost/', clock = () => Date.now(), channel = null }) {
    this.base = base;
    this.clock = clock;
    this.config = {
      ...CLOUD_DEFAULTS,
      ...config,
      stationName: library.name || 'Radio Tower',
      stationTagline: library.tagline || '',
    };
    const stationOpts = {
      epoch: Date.parse(library.epoch || '2026-01-01T00:00:00Z'),
      gapSeconds: library.gapSeconds || 0,
      name: this.config.stationName,
    };
    // The original single programme, kept as the 'all' channel so nothing
    // that predates channels moves (server/lib/channels.js).
    this.main = new Station(library.tracks || [], { ...stationOpts, shuffle: library.shuffle !== false });
    this.channels = new ChannelSet({ spec: library.channels || DEFAULT_CHANNEL_SPEC, station: stationOpts, main: this.main });
    this.channels.setTracks(library.tracks || [], { now: clock() });
    this.channel = this.channels.resolve(channel);
    this.library = library;
    this.urls = {
      stream: (t) => absolutise((t.sources || [])[0], this.base),
      art: (t) => absolutise(t.art, this.base),
    };
    this.control = null;
    this.controlStatuses = {};
    if (control) this.applyControl(control);
  }

  /** The station for the channel this tab is tuned to. */
  get station() {
    return this.channels.get(this.channel) ?? this.main;
  }

  /** Tune this tab to a channel. Unknown slugs fall back to the default. Returns the slug in force. */
  setChannel(slug) {
    this.channel = this.channels.resolve(slug);
    return this.channel;
  }

  /** The channel a request asks for (?channel=), else the one this tab is on. */
  _stationFor(q) {
    const asked = q?.get?.('channel');
    return asked && this.channels.has(asked) ? this.channels.get(asked) : this.station;
  }

  /** Every source for a track, absolute, in the order to try them. */
  sourcesFor(id) {
    const t = this.station.get(id) ?? this.main.get(id);
    return (t?.sources || []).map((s) => absolutise(s, this.base));
  }

  /**
   * Adopt a control document. Returns what happened to the override on the
   * channel this tab is tuned to, because "the DJ's reorder silently did
   * nothing" must be visible somewhere:
   *   'none'     — no override for this channel in the document
   *   'applied'  — it is a valid permutation of the slots it names
   *   'stale'    — it targets a cycle that has already finished (harmless)
   *   'rejected' — it does not match this library (e.g. edited since)
   *
   * A document carries at most one override per channel: `overrides[slug]`,
   * plus the pre-channels `override`, which belongs to its own `channel`
   * field or, without one, to 'all' — the programme it was made against.
   */
  applyControl(doc) {
    this.control = doc && typeof doc === 'object' ? doc : null;
    const wanted = overridesOf(this.control);
    this.controlStatuses = {};
    const now = this.clock();
    const seen = new Set();
    for (const slug of [...this.channels.list({ now }).map((c) => c.slug), LEGACY_CHANNEL]) {
      const st = this.channels.get(slug) ?? (slug === LEGACY_CHANNEL ? this.main : null);
      if (!st || seen.has(st)) continue;
      seen.add(st);
      const ov = wanted[slug];
      if (!ov) { st.clearQueueOrder(); this.controlStatuses[slug] = 'none'; continue; }
      const current = st.at(now);
      if (current && ov.cycleIndex < current.cycleIndex) {
        st.clearQueueOrder();
        this.controlStatuses[slug] = 'stale';
        continue;
      }
      const result = st.setQueueOrder({ cycleIndex: ov.cycleIndex, startWithin: ov.startWithin, ids: ov.ids });
      this.controlStatuses[slug] = result.ok ? 'applied' : 'rejected';
      if (!result.ok) st.clearQueueOrder();
    }
    return this.controlStatus;
  }

  /** What happened to the DJ's override on the channel this tab is on. */
  get controlStatus() {
    return this.controlStatuses?.[this.channel] ?? 'none';
  }

  /**
   * Write `override` for the current channel into a copy of the control
   * document. The 'all' channel keeps the pre-channels shape (`override`,
   * no channel field) so a listener still running an older build of the
   * site reads it exactly as before; every other channel goes in
   * `overrides[slug]`, which older builds ignore — they only know 'all'.
   */
  _withOverride(override) {
    const doc = { ...(this.control || {}), version: 1 };
    const overrides = { ...(doc.overrides || {}) };
    if (this.channel === LEGACY_CHANNEL) {
      doc.override = override;
      delete overrides[LEGACY_CHANNEL];
    } else {
      if (doc.override?.channel === this.channel) doc.override = null;
      if (override) overrides[this.channel] = { ...override, channel: this.channel };
      else delete overrides[this.channel];
    }
    if (Object.keys(overrides).length) doc.overrides = overrides; else delete doc.overrides;
    if (doc.override === undefined) doc.override = null;
    return doc;
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

    // Composed with the override in force — never moving what is on air or
    // inside the fence (Station.planQueueOrder).
    const lockMs = (this.config.queueLockSeconds ?? 0) * 1000;
    const plan = this.station.planQueueOrder({ cycleIndex, startWithin, ids }, { now, lockMs });
    if (!plan.ok) {
      const at = plan.until ? new Date(plan.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const detail = plan.error === 'earlier_reorder_on_air'
        ? `An earlier reorder is still playing out. Try again at ${at}.`
        : plan.error === 'other_reorder_waiting'
          ? `Your earlier reorder is still waiting to play (until ${at}). Press “Back to the station clock” to drop it, or try again after it has played.`
          : 'Refresh the queue and try again.';
      return { ok: false, status: 409, error: plan.error, detail, until: plan.until ?? null };
    }
    // Dry-run on a throwaway station, so a refusal is reported here rather
    // than discovered by every listener later.
    if (plan.override) {
      const probe = new Station(this.station.tracks, {
        epoch: this.station.epoch, gapSeconds: this.station.gapSeconds, order: this.station.order,
      });
      const result = probe.setQueueOrder(plan.override);
      if (!result.ok) return { ok: false, status: 409, error: result.error, detail: 'Refresh the queue and try again.' };
    }

    const doc = this._withOverride(plan.override
      ? { cycleIndex: plan.override.cycleIndex, startWithin: plan.override.startWithin, ids: [...plan.override.ids], setAt: now, by }
      : null);
    doc.updatedAt = new Date(now).toISOString();
    if (note) doc.note = note; else delete doc.note;
    return { ok: true, doc };
  }

  /**
   * "Back to the station clock": the override removed — except the reordered
   * tracks on air or inside the fence, which keep their place and play out
   * (Station.planClearQueueOrder). `full` false + `until` says so.
   */
  proposeClear() {
    const now = this.clock();
    const plan = this.station.planClearQueueOrder({ now, lockMs: (this.config.queueLockSeconds ?? 0) * 1000 });
    const prev = overridesOf(this.control)[this.channel];
    const override = plan.override ? { ...plan.override, ids: [...plan.override.ids], setAt: prev?.setAt ?? now, by: prev?.by ?? 'booth' } : null;
    const doc = this._withOverride(override);
    doc.updatedAt = new Date(now).toISOString();
    delete doc.note;
    return { ok: true, doc, full: plan.full, changed: plan.changed, until: plan.until };
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
    const station = this._stationFor(q);
    const slug = q.get('channel') && this.channels.has(q.get('channel')) ? q.get('channel') : this.channel;
    const label = this.channels.list({ now }).find((c) => c.slug === slug)?.label ?? null;
    const extra = { mode: 'cloud', origin: this.config.origin || null, channel: slug, channelLabel: label };

    switch (url.pathname) {
      case '/api/time':
        return { status: 200, body: { t: now } };

      case '/api/channels':
        return { status: 200, body: { default: this.channels.defaultSlug, current: this.channel, channels: this.channels.list({ now }) } };

      case '/api/station':
        return { status: 200, body: stationPayload(station, { now, config: this.config, urls: this.urls, extra }) };

      case '/api/schedule': {
        const body = schedulePayload(station, { now, from: q.get('from'), to: q.get('to'), urls: this.urls });
        if (body.error) return { status: body.status, body: { error: body.error } };
        return { status: 200, body };
      }

      case '/api/queue':
        return {
          status: 200,
          body: queuePayload(station, {
            now, config: this.config, editable: true, urls: this.urls,
            extra: { mode: 'cloud', channel: slug, controlStatus: this.controlStatuses?.[slug] ?? 'none', look: this.look },
          }),
        };

      case '/api/library': {
        const needle = (q.get('q') || '').trim().toLowerCase();
        const limit = Math.min(500, Math.max(1, Number.parseInt(q.get('limit'), 10) || 100));
        const offset = Math.max(0, Number.parseInt(q.get('offset'), 10) || 0);
        let items = (q.get('channel') ? station : this.main).tracks;
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
            ok: !station.isEmpty,
            status: station.isEmpty ? 'no_tracks' : 'on_air',
            mode: 'cloud',
            tracks: this.main.tracks.length,
            cycleSeconds: Math.round(station.cycleSeconds),
            revision: station.revision,
            channel: slug,
            nowPlayingId: station.at(now)?.track?.id ?? null,
            controlStatus: this.controlStatus,
          },
        };

      default:
        return { status: 404, body: { error: 'not_found' } };
    }
  }
}

/**
 * Every override a control document holds, by channel slug. The legacy
 * single `override` goes to its own `channel`, or to 'all' without one;
 * `overrides[slug]` wins over it for the same channel.
 */
export function overridesOf(doc) {
  const out = {};
  if (doc?.override) out[doc.override.channel || LEGACY_CHANNEL] = doc.override;
  for (const [slug, ov] of Object.entries(doc?.overrides || {})) if (ov) out[slug] = ov;
  return out;
}

export default CloudEngine;
