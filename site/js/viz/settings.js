/**
 * What the visuals look like, and who decided.
 *
 * Two voices: the listener (this browser, remembered in localStorage) and the
 * tower (the DJ's broadcast look, from control.json). A listener follows the
 * tower until they touch a control themselves — then their choice wins, and
 * one checkbox hands it back. Ortis asked for "visuals control"; the answer is
 * both: everyone gets the knobs, and the booth can set the room's lighting.
 */

export const LAYERS = [
  { id: 'bloom', label: 'Bloom', hint: 'the bass breathes', color: '#34d399' },
  { id: 'horizon', label: 'Horizon', hint: 'grid and sun', color: '#f472b6' },
  { id: 'harmonic', label: 'Harmonics', hint: 'three summed sines', color: '#60a5fa' },
  { id: 'lattice', label: 'Spectrum', hint: 'bars, like an EQ', color: '#2dd4bf' },
  { id: 'weave', label: 'Phase weave', hint: 'low × mid, trailing', color: '#e879f9' },
  { id: 'ring', label: 'Ring', hint: 'hugs the cover', color: '#7dd3fc' },
  { id: 'dispersal', label: 'Dispersal', hint: 'sparks on the highs', color: '#fbbf24' },
  { id: 'shock', label: 'Shock', hint: 'waves on every hit', color: '#fb7185' },
  { id: 'ribbon', label: 'Ribbon', hint: 'the raw waveform', color: '#a78bfa' },
];

const ALL = LAYERS.map((l) => l.id);

/** Named looks. Picking one sets the layers and intensity; everything stays editable. */
export const LOOKS = {
  stage: { label: 'Stage', layers: ALL.filter((l) => l !== 'horizon'), intensity: 0.85 },
  frame: { label: 'Frame', layers: ['bloom', 'ring', 'dispersal', 'shock', 'ribbon'], intensity: 0.75 },
  horizon: { label: 'Horizon', layers: ['horizon', 'bloom', 'ring', 'shock', 'ribbon'], intensity: 0.85 },
  lattice: { label: 'Lattice', layers: ['lattice', 'harmonic', 'weave', 'ring', 'shock'], intensity: 0.8 },
  quiet: { label: 'Quiet', layers: ['bloom', 'ring'], intensity: 0.45 },
  off: { label: 'Off', layers: [], intensity: 0 },
};

export const DEFAULT_LOOK = 'stage';

export function lookToSettings(name, base = {}) {
  const look = LOOKS[name] || LOOKS[DEFAULT_LOOK];
  return {
    ...defaults(),
    ...base,
    look: LOOKS[name] ? name : DEFAULT_LOOK,
    layers: Object.fromEntries(ALL.map((id) => [id, look.layers.includes(id)])),
    intensity: look.intensity,
  };
}

export function defaults() {
  return {
    look: DEFAULT_LOOK,
    layers: Object.fromEntries(ALL.map((id) => [id, LOOKS[DEFAULT_LOOK].layers.includes(id)])),
    intensity: LOOKS[DEFAULT_LOOK].intensity,
    motion: 1,        // speed of everything that moves on its own
    sensitivity: 1,   // gain on the audio before it reaches the layers
    hue: null,        // null = follow the genre on air; else degrees
    ambient: 0.4,     // how much of it shows on pages that are not the radio
  };
}

/** Clamp and fill a settings object from anywhere (storage, control.json, a URL). */
export function normalise(s) {
  const d = defaults();
  if (!s || typeof s !== 'object') return d;
  const num = (v, lo, hi, dflt) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, +v)) : dflt);
  const out = {
    look: typeof s.look === 'string' && (LOOKS[s.look] || s.look === 'custom') ? s.look : d.look,
    layers: { ...d.layers },
    intensity: num(s.intensity, 0, 1, d.intensity),
    motion: num(s.motion, 0, 2, d.motion),
    sensitivity: num(s.sensitivity, 0.2, 3, d.sensitivity),
    hue: s.hue === null || s.hue === undefined || s.hue === '' ? null : num(s.hue, 0, 360, null),
    ambient: num(s.ambient, 0, 1, d.ambient),
  };
  if (s.layers && typeof s.layers === 'object') {
    for (const id of ALL) if (id in s.layers) out.layers[id] = Boolean(s.layers[id]);
  } else if (s.look && LOOKS[s.look]) {
    out.layers = lookToSettings(s.look).layers;
    if (!('intensity' in s)) out.intensity = LOOKS[s.look].intensity;
  }
  return out;
}

const KEY = 'radiotower.visuals';

export class VisualSettings {
  constructor({ storage = globalThis.localStorage, reducedMotion = false } = {}) {
    this.storage = storage;
    this.listeners = new Set();
    this.broadcast = null;
    this.reducedMotion = reducedMotion;
    let saved = null;
    try { saved = JSON.parse(this.storage?.getItem(KEY) || 'null'); } catch { saved = null; }
    this.own = saved?.own ? normalise(saved.own) : null;
    this.follow = saved ? saved.follow !== false : true;
    if (reducedMotion && !saved) {
      // Start calm; a listener who wants motion can still turn it on.
      this.own = lookToSettings('quiet');
      this.follow = false;
    }
  }

  /** The settings the stage should paint with right now. */
  get effective() {
    if (this.follow && this.broadcast) return this.broadcast;
    return this.own || defaults();
  }

  get following() { return this.follow && Boolean(this.broadcast); }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { this.listeners.forEach((fn) => fn(this.effective)); }

  _save() {
    try { this.storage?.setItem(KEY, JSON.stringify({ own: this.own, follow: this.follow })); } catch { /* private mode */ }
  }

  /** The DJ's look arrived (or was cleared). */
  setBroadcast(look) {
    this.broadcast = look ? normalise(look) : null;
    this._emit();
  }

  /** The listener changed something: from here on, their settings win. */
  update(patch) {
    const base = this.effective;
    const next = normalise({ ...base, ...patch, layers: { ...base.layers, ...(patch.layers || {}) } });
    if (patch.layers || 'intensity' in patch) next.look = patch.look || 'custom';
    this.own = next;
    this.follow = false;
    this._save();
    this._emit();
  }

  pickLook(name) {
    this.own = lookToSettings(name, { motion: this.effective.motion, sensitivity: this.effective.sensitivity, hue: this.effective.hue, ambient: this.effective.ambient });
    this.follow = false;
    this._save();
    this._emit();
  }

  setFollow(on) {
    this.follow = Boolean(on);
    if (!this.own) this.own = { ...this.effective };
    this._save();
    this._emit();
  }

  reset() {
    this.own = null;
    this.follow = true;
    this._save();
    this._emit();
  }
}
