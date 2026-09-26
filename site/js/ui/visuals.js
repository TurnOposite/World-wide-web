/**
 * The Visuals panel — "visuals control", for every listener.
 *
 * Looks (one tap), then the nine layers, then four sliders. It edits
 * VisualSettings, which the stage reads every frame, so a change is visible
 * on the next frame with nothing to rebuild. When the DJ has set a broadcast
 * look, the panel says so and a checkbox follows or leaves it.
 */
import { LAYERS, LOOKS } from '../viz/settings.js';
import { esc } from './util.js';

export class VisualsPanel {
  constructor({ root, settings, openers = [], theatre }) {
    this.root = root;
    this.settings = settings;
    this.theatre = theatre;
    this.openers = openers;
    openers.forEach((b) => b.addEventListener('click', () => this.toggle()));
    settings.subscribe(() => { if (!root.hidden && !this._self) this.render(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !root.hidden) this.close();
    });
  }

  toggle() { this.root.hidden ? this.open() : this.close(); }

  open() {
    this.render();
    this.root.hidden = false;
    this.openers.forEach((b) => b.setAttribute('aria-expanded', 'true'));
    this.root.querySelector('button')?.focus({ preventScroll: true });
  }

  close() {
    this.root.hidden = true;
    this.openers.forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }

  render() {
    const s = this.settings.effective;
    const following = this.settings.following;
    const hasBroadcast = Boolean(this.settings.broadcast);
    const slider = (id, label, value, min, max, step, shown) => `
      <label class="v-slider" for="v-${id}"><span>${label}</span>
        <input type="range" id="v-${id}" data-k="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
        <output>${shown}</output></label>`;
    this.root.innerHTML = `
      <h2>Visuals <button class="close" type="button" data-close aria-label="Close">✕</button></h2>
      ${hasBroadcast ? `<label class="v-follow"><input type="checkbox" id="v-follow" ${following ? 'checked' : ''}>
        <span>Follow the tower's look${following ? '' : ' (you are using your own)'} — the DJ set <b>${esc(LOOKS[this.settings.broadcast.look]?.label || 'a custom look')}</b>.</span></label>` : ''}
      <div class="v-section"><span class="eyebrow">Look</span>
        <div class="v-looks" role="group" aria-label="Looks">
          ${Object.entries(LOOKS).map(([k, l]) => `<button type="button" data-look="${k}" aria-pressed="${s.look === k}">${l.label}</button>`).join('')}
        </div></div>
      <div class="v-section"><span class="eyebrow">Layers</span>
        <div class="v-layers">
          ${LAYERS.map((l) => `<label title="${esc(l.hint)}"><input type="checkbox" data-layer="${l.id}" ${s.layers[l.id] ? 'checked' : ''}><span class="sw" style="background:${l.color}"></span>${l.label}</label>`).join('')}
        </div></div>
      <div class="v-section"><span class="eyebrow">Tuning</span>
        ${slider('intensity', 'Intensity', s.intensity, 0, 1, 0.01, `${Math.round(s.intensity * 100)}%`)}
        ${slider('sensitivity', 'Sensitivity', s.sensitivity, 0.2, 3, 0.05, `${s.sensitivity.toFixed(2)}×`)}
        ${slider('motion', 'Motion', s.motion, 0, 2, 0.05, `${s.motion.toFixed(2)}×`)}
        ${slider('hue', 'Colour', s.hue ?? 0, 0, 360, 1, s.hue === null ? 'genre' : `${Math.round(s.hue)}°`)}
        ${slider('ambient', 'Other pages', s.ambient, 0, 1, 0.01, `${Math.round(s.ambient * 100)}%`)}
      </div>
      <div class="v-row">
        <button class="btn small" type="button" data-act="theatre">Full screen <span class="kbd">F</span></button>
        <button class="btn small" type="button" data-act="genre" ${s.hue === null ? 'disabled' : ''}>Colour from genre</button>
        <button class="btn small" type="button" data-act="reset">Reset</button>
      </div>
      <p class="hint">Remembered in this browser only. <span class="kbd">V</span> opens this panel.</p>`;

    this.root.querySelector('[data-close]').onclick = () => this.close();
    this.root.querySelectorAll('[data-look]').forEach((b) => { b.onclick = () => this.settings.pickLook(b.dataset.look); });
    this.root.querySelectorAll('[data-layer]').forEach((c) => {
      c.onchange = () => this.settings.update({ layers: { [c.dataset.layer]: c.checked } });
    });
    this.root.querySelectorAll('input[type=range]').forEach((r) => {
      r.oninput = () => {
        const k = r.dataset.k;
        const v = Number(r.value);
        // Update in place: re-rendering would drop the slider mid-drag.
        this._self = true;
        this.settings.update({ [k]: v });
        this._self = false;
        const out = r.parentElement.querySelector('output');
        if (out) out.textContent = k === 'hue' ? `${Math.round(v)}°` : k === 'intensity' || k === 'ambient' ? `${Math.round(v * 100)}%` : `${v.toFixed(2)}×`;
        this.root.querySelectorAll('[data-look]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      };
    });
    const follow = this.root.querySelector('#v-follow');
    if (follow) follow.onchange = () => this.settings.setFollow(follow.checked);
    this.root.querySelector('[data-act="theatre"]').onclick = () => this.theatre?.();
    this.root.querySelector('[data-act="genre"]').onclick = () => this.settings.update({ hue: null });
    this.root.querySelector('[data-act="reset"]').onclick = () => this.settings.reset();
  }
}
