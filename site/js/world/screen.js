/**
 * « Écran » — the world's screen settings (docs/WORLD.md, phase 3): what is
 * behind the Zone windows (Grille, Pluie, Vide), how many glass bubbles
 * drift there, whether the menu is the scatter of tags or a Persona-style
 * stack, and the scan lines. A viewer's own taste, kept in localStorage —
 * never the broadcast look, which the visualiser's panel (V) owns.
 *
 * The choices are plain data so node:test can check them; mountScreen is the
 * panel: radio buttons in four groups, ↑ ↓ to move, Esc to close.
 */

export const SCREEN_KEY = 'gt.world.screen';

export const SCREEN_OPTIONS = {
  bg: { label: 'Fond', choices: [['grid', 'Grille', 'lignes au sol'], ['rain', 'Pluie', 'stries obliques'], ['void', 'Vide', 'brume seule']] },
  bub: { label: 'Bulles de verre', choices: [['few', 'Quelques-unes'], ['many', 'Beaucoup'], ['none', 'Aucune']] },
  list: { label: 'Menu', choices: [['scatter', 'Étiquettes éparses', 'le monde en vrac'], ['stack', 'Pile', 'menu à la Persona']] },
  scan: { label: 'Lignes de balayage', choices: [['on', 'Oui'], ['off', 'Non']] },
};

export const SCREEN_DEFAULTS = { bg: 'grid', bub: 'few', list: 'scatter', scan: 'on' };

/** Only known keys with known values survive; anything else falls back to the default. */
export function normalScreen(raw) {
  const out = { ...SCREEN_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, { choices }] of Object.entries(SCREEN_OPTIONS)) {
    if (choices.some(([v]) => v === raw[k])) out[k] = raw[k];
  }
  return out;
}

/** @param {Storage|null} storage  localStorage, or null where it throws */
export function readScreen(storage) {
  try { return normalScreen(JSON.parse(storage?.getItem(SCREEN_KEY) || 'null')); } catch { return normalScreen(null); }
}

export function writeScreen(storage, prefs) {
  try { storage?.setItem(SCREEN_KEY, JSON.stringify(normalScreen(prefs))); } catch { /* private mode: lasts this page */ }
}

/**
 * How many bubbles drift: at most 26 on a desktop, half on a phone, none
 * when the reader asked for less motion.
 */
export function bubbleCount(pref, { phone = false, reduced = false } = {}) {
  if (reduced) return 0;
  const n = { few: 10, many: 26, none: 0 }[pref] ?? 10;
  return phone ? Math.ceil(n / 2) : n;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * @param {object} o
 * @param {HTMLElement} o.root     .w-root: carries data-w-bg, data-w-bub, data-w-list, data-w-scan
 * @param {(prefs: object) => void} [o.onChange]
 * @returns {{ button: HTMLButtonElement, panel: HTMLElement, prefs: object, open: (on: boolean) => void }}
 */
export function mountScreen({ root, onChange = () => {} }) {
  let storage = null;
  try { storage = localStorage; } catch { /* blocked: the defaults, for this page */ }
  const prefs = readScreen(storage);

  const button = el('button', 'w-screen-btn');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'wScreen');
  const glyph = el('span', 'w-screen-glyph');
  glyph.setAttribute('aria-hidden', 'true');
  button.append(glyph, el('span', '', 'Écran'));

  const panel = el('aside', 'w-screen');
  panel.id = 'wScreen';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'wScreenH');
  const head = el('header');
  const h = el('h2', '', 'Réglages · Écran');
  h.id = 'wScreenH';
  const close = el('button', 'w-screen-close', 'Fermer · Échap');
  close.type = 'button';
  head.append(h, close);
  panel.append(head);

  const radios = [];
  for (const [key, { label, choices }] of Object.entries(SCREEN_OPTIONS)) {
    const grp = el('div', 'w-grp');
    const p = el('p', '', label);
    p.id = `wScreen-${key}`;
    const opts = el('div', 'w-opts');
    opts.setAttribute('role', 'radiogroup');
    opts.setAttribute('aria-labelledby', p.id);
    for (const [val, name, small] of choices) {
      const b = el('button', 'w-opt');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.set = key;
      b.dataset.val = val;
      b.append(el('span', '', name));
      if (small) b.append(el('small', '', small));
      b.addEventListener('click', () => {
        prefs[key] = val;
        writeScreen(storage, prefs);
        apply();
      });
      opts.append(b);
      radios.push(b);
    }
    grp.append(p, opts);
    panel.append(grp);
  }

  function apply() {
    for (const k of Object.keys(SCREEN_DEFAULTS)) root.dataset[`w${k[0].toUpperCase()}${k.slice(1)}`] = prefs[k];
    for (const b of radios) b.setAttribute('aria-checked', String(prefs[b.dataset.set] === b.dataset.val));
    onChange({ ...prefs });
  }

  function open(on) {
    panel.hidden = !on;
    button.setAttribute('aria-expanded', String(on));
    if (on) panel.querySelector('[aria-checked="true"]')?.focus();
  }

  button.addEventListener('click', () => open(panel.hidden));
  close.addEventListener('click', () => { open(false); button.focus(); });
  // Every arrow stays in the panel: the world's own ← → would otherwise walk the map.
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); open(false); button.focus(); return; }
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = radios.indexOf(document.activeElement);
    radios[(i + step + radios.length) % radios.length].focus();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) open(false);
  });

  apply();
  return { button, panel, prefs, open };
}
