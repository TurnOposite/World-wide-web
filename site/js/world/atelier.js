/**
 * The Atelier (docs/ATELIER.md): the map's editor, on top of the world, for a
 * tab that asked with ?atelier=1. On the whole map every window can be
 * dragged and resized; in the panel, placed to the pixel, tilted, its tag
 * moved; every version of the past switched online or offline; every page's
 * short link copied. A change shows at once — it is the real world being
 * moved, pages and all — and is kept as a draft in this browser.
 *
 * Nothing reaches anyone else until the map is in the repository: « Enregistrer
 * dans le dépôt » when the site is served by `npm run site` (scripts/site-serve.mjs
 * writes site/data/layout.json), or the downloaded layout.json put there by
 * hand — then `fire` publishes it.
 *
 * The Atelier is also the private view (Ortis, 2026-11-01): « Écran », the
 * minimap and the versions of the past show here and nowhere else. « Aperçu
 * public » puts the panel away and shows the site exactly as everyone else
 * sees it — the draft included — until « Revenir à l'Atelier ».
 */
import { DISTRICTS, WORLD, byId } from './layout.js';
import { DRAFT_KEY, MIN_H, MIN_W, applyPages, checkLayout, layoutFile, resolveLayout, stringifyLayout, worldHeight } from './model.js';

const SNAP = 10;
const snap = (v, free) => (free ? Math.round(v) : Math.round(v / SNAP) * SNAP);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function button(text, cls, onClick, label) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

/** One page of a map as the file has it, for comparing two maps page by page. */
const pageKey = (pages) => new Map(layoutFile(pages, { updatedAt: '' }).pages.map((p) => [p.id, JSON.stringify(p)]));

/**
 * @param {object} o
 * @param {object} o.world      mountWorld()'s handle
 * @param {object|null} o.published  site/data/layout.json as the site serves it
 * @param {object|null} o.draft      what this browser kept from the last visit
 * @param {(text: string, ms?: number) => void} o.toast
 */
export async function mountAtelier({ world, published, draft, toast }) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('../../css/atelier.css', import.meta.url).href;
  document.head.append(css);

  let base = published;
  let baseKeys = pageKey(resolveLayout(base, { all: true }).pages);
  let selected = DISTRICTS[0]?.id || null;
  const undo = [];
  const redo = [];
  const now = () => stringifyLayout(layoutFile(DISTRICTS));
  let last = now();

  // ---- the panel ----
  const panel = el('aside', 'at-panel');
  panel.setAttribute('aria-label', 'Atelier — la carte du site');
  const head = el('header', 'at-head');
  const h = el('h2', '', 'Atelier');
  const state = el('p', 'at-state');
  state.setAttribute('role', 'status');
  head.append(h, button('Quitter', 'at-quit', () => { location.href = `${location.pathname}?atelier=0`; }, 'Quitter l’Atelier'));
  const tools = el('div', 'at-tools');
  const overBtn = button('Vue d’ensemble', 'at-btn', () => setOver(!over));
  overBtn.setAttribute('aria-pressed', 'false');
  const undoBtn = button('↶ Annuler', 'at-btn', () => step(undo, redo));
  const redoBtn = button('↷ Rétablir', 'at-btn', () => step(redo, undo));
  const publicBtn = button('Aperçu public', 'at-btn at-public-btn', () => preview(true), 'Aperçu public : le site tel que tout le monde le voit');
  tools.append(overBtn, undoBtn, redoBtn, publicBtn);
  const problems = el('ul', 'at-problems');
  const list = el('div', 'at-list');
  const insp = el('section', 'at-insp');
  insp.setAttribute('aria-label', 'La fenêtre choisie');
  const foot = el('footer', 'at-foot');
  const saveBtn = button('Enregistrer dans le dépôt', 'at-btn at-primary', save);
  saveBtn.hidden = true;
  foot.append(
    saveBtn,
    button('Télécharger layout.json', 'at-btn', download),
    button('Copier le JSON', 'at-btn', () => copy(now(), 'Le JSON de la carte est copié.')),
    button('Revenir au publié', 'at-btn', () => restore(resolveLayout(base, { all: true }).pages, 'Revenu à la carte publiée.')),
  );
  panel.append(head, state, tools, problems, list, insp, foot);
  world.root.append(panel);

  // ---- « Aperçu public »: the site as the public sees it, the draft included, with one way back ----
  const back = el('div', 'at-public');
  back.hidden = true;
  back.setAttribute('role', 'status');
  back.append(el('span', '', 'Aperçu public — le site tel que tout le monde le voit'), button('Revenir à l’Atelier', 'at-btn at-primary', () => preview(false)));
  world.root.append(back);
  function preview(on) {
    if (on && over) setOver(false);
    world.setPrivate(!on);
    panel.hidden = on;
    back.hidden = !on;
    world.root.classList.toggle('at-previewing', on);
    if (on) back.querySelector('button').focus(); else publicBtn.focus();
  }

  // ---- grips: the windows as handles, over the whole map ----
  const grips = el('div', 'at-grips');
  world.plane.append(grips);
  let over = false;

  function setOver(on) {
    over = on;
    world.root.classList.toggle('at-over', on);
    overBtn.setAttribute('aria-pressed', String(on));
    if (on) {
      const side = panel.getBoundingClientRect().width + 32;
      const aw = Math.max(200, innerWidth - side - 40);
      const ah = Math.max(200, innerHeight - 170);
      const s = Math.min(aw / WORLD.w, ah / WORLD.h);
      world.camera.look({ tx: 20 + (aw - WORLD.w * s) / 2, ty: 92 + (ah - WORLD.h * s) / 2, s });
      grips.style.setProperty('--at-k', (1 / s).toFixed(3));
      // Each half in its own light — Zone's night, Echo's paper — not the crossfade the camera's centre would pick.
      world.root.style.setProperty('--w-mix', '0');
      world.root.classList.remove('w-at-echo');
    } else if (!world.camera.district && byId(world.current)) {
      // Back from the whole map by its own button: to the page that is open, at 1:1.
      world.camera.fly(byId(world.current));
    }
    placeGrips();
  }
  // Any flight (a tag, an arrow key, a route) leaves the whole-map view.
  const fly = world.camera.fly.bind(world.camera);
  world.camera.fly = (d, ...rest) => {
    if (over) setOver(false);
    // The panel follows the camera: the window in view is the one being edited.
    if (d?.id && d.id !== selected) select(d.id);
    return fly(d, ...rest);
  };
  addEventListener('resize', () => { if (over) setOver(true); });

  function placeGrips() {
    grips.replaceChildren();
    if (!over) return;
    for (const d of DISTRICTS) {
      const g = el('button', `at-grip${d.id === selected ? ' on' : ''}${d.status === 'offline' ? ' off' : ''}`);
      g.type = 'button';
      g.dataset.id = d.id;
      g.setAttribute('aria-label', `${d.title} (${d.code}) — glisser pour déplacer, flèches pour ajuster, le coin pour la taille`);
      Object.assign(g.style, { left: `${d.x}px`, top: `${d.y}px`, width: `${d.w}px`, height: `${d.h}px`, transform: `rotate(${d.rot}deg)` });
      g.append(el('span', 'at-lbl', `${d.code} · ${d.title}`), el('span', 'at-dim', `${Math.round(d.w)} × ${Math.round(d.h)} · ${Math.round(d.x)}, ${Math.round(d.y)}`));
      const size = el('span', 'at-size');
      size.setAttribute('aria-hidden', 'true');
      g.append(size);
      grips.append(g);
    }
  }

  // Drag a grip to move its window, its corner to resize it. Alt: no snapping to the 10 px grid.
  let drag = null;
  grips.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.at-grip');
    if (!g || e.button !== 0) return;
    const d = byId(g.dataset.id);
    select(d.id);
    drag = { id: d.id, px: e.clientX, py: e.clientY, x: d.x, y: d.y, w: d.w, h: d.h, size: Boolean(e.target.closest('.at-size')), moved: false };
    g.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  grips.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const d = byId(drag.id);
    const s = world.camera.cam.s;
    const dx = (e.clientX - drag.px) / s;
    const dy = (e.clientY - drag.py) / s;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    if (drag.size) {
      d.w = Math.min(WORLD.w - d.x, Math.max(MIN_W, snap(drag.w + dx, e.altKey)));
      d.h = Math.max(MIN_H, snap(drag.h + dy, e.altKey));
    } else {
      d.x = Math.min(WORLD.w - d.w, Math.max(0, snap(drag.x + dx, e.altKey)));
      d.y = Math.max(0, snap(drag.y + dy, e.altKey));
    }
    live();
  });
  const drop = () => { if (drag?.moved) commit(); drag = null; };
  grips.addEventListener('pointerup', drop);
  grips.addEventListener('pointercancel', drop);
  grips.addEventListener('keydown', (e) => {
    const g = e.target.closest('.at-grip');
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!g || !k) return;
    const d = byId(g.dataset.id);
    const n = e.shiftKey ? 100 : SNAP;
    d.x = Math.min(WORLD.w - d.w, Math.max(0, d.x + k[0] * n));
    d.y = Math.max(0, d.y + k[1] * n);
    // The world walks the map on ← →: not while a window is being nudged.
    e.preventDefault();
    live();
    commit();
    grips.querySelector(`[data-id="${d.id}"]`)?.focus();
  });

  // ---- the list of pages, and the chosen one ----
  function drawList() {
    list.replaceChildren();
    const groups = [['Zone', (d) => d.era !== 'past' && d.half === 'zone'], ['Echo', (d) => d.era !== 'past' && d.half === 'echo'], ['Archives', (d) => d.era === 'past']];
    for (const [name, keep] of groups) {
      const pages = DISTRICTS.filter(keep);
      if (!pages.length) continue;
      const g = el('div', 'at-group');
      g.append(el('h3', '', name));
      const ul = el('ul');
      for (const d of pages) {
        const li = el('li', `at-item${d.id === selected ? ' on' : ''}`);
        const pick = button('', 'at-pick', () => { select(d.id); if (!over) world.pick(d.id); });
        pick.append(el('code', '', d.code), el('span', '', d.title));
        if (d.id === selected) pick.setAttribute('aria-current', 'true');
        li.append(pick);
        if (d.era === 'past') {
          const on = d.status === 'online';
          const t = button(on ? 'En ligne' : 'Hors ligne', `at-status${on ? ' online' : ''}`, () => toggle(d.id), `${d.title} : ${on ? 'en ligne — mettre hors ligne' : 'hors ligne — mettre en ligne'}`);
          t.setAttribute('aria-pressed', String(on));
          li.append(t);
        }
        if (baseKeys.get(d.id) !== pageKey([d]).get(d.id)) li.append(el('span', 'at-changed', '•'));
        ul.append(li);
      }
      g.append(ul);
      list.append(g);
    }
  }

  function field(label, value, onInput, { step = 10, min, max } = {}) {
    const l = el('label', 'at-field');
    const i = el('input');
    i.type = 'number';
    i.step = String(step);
    if (min !== undefined) i.min = String(min);
    if (max !== undefined) i.max = String(max);
    i.value = String(Math.round(value * 10) / 10);
    i.addEventListener('input', () => { const v = Number(i.value); if (Number.isFinite(v)) { onInput(v); live({ keepInspector: true }); } });
    i.addEventListener('change', () => commit());
    l.append(el('span', '', label), i);
    return l;
  }

  function drawInspector() {
    insp.replaceChildren();
    const d = byId(selected);
    if (!d) return;
    const link = new URL(`go/${d.code}`, document.baseURI).href;
    const top = el('div', 'at-insp-head');
    top.append(el('h3', '', `${d.code} · ${d.title}`), button('Voir', 'at-btn', () => world.pick(d.id), `Aller à ${d.title}`));
    const grid = el('div', 'at-grid');
    grid.append(
      field('x', d.x, (v) => { d.x = v; }, { min: 0 }),
      field('y', d.y, (v) => { d.y = v; }, { min: 0 }),
      field('largeur', d.w, (v) => { d.w = Math.max(MIN_W, v); }, { min: MIN_W }),
      field('hauteur', d.h, (v) => { d.h = Math.max(MIN_H, v); }, { min: MIN_H }),
      field('inclinaison °', d.rot, (v) => { d.rot = v; }, { step: 0.1, min: -6, max: 6 }),
    );
    const tag = el('div', 'at-grid');
    tag.append(
      field('étiquette, % du bord', d.tag[0], (v) => { d.tag[0] = v; }, { step: 1, min: 0, max: 40 }),
      field('% du haut', d.tag[1], (v) => { d.tag[1] = v; }, { step: 1, min: 6, max: 92 }),
      field('inclinaison °', d.tag[2], (v) => { d.tag[2] = v; }, { step: 1, min: -12, max: 12 }),
    );
    const share = el('p', 'at-link');
    share.append(el('code', '', `go/${d.code}`), button('Copier le lien', 'at-btn', () => copy(link, `Lien copié : ${link}`)));
    insp.append(top, grid, el('h4', '', 'Son étiquette'), tag, share);
  }

  function drawProblems() {
    problems.replaceChildren();
    for (const p of checkLayout(DISTRICTS)) {
      const li = el('li', `at-${p.level}`);
      const b = button(`${p.level === 'error' ? '✗' : '!'} ${byId(p.id)?.title || p.id} — ${p.msg}`, 'at-prob', () => select(p.id));
      li.append(b);
      problems.append(li);
    }
  }

  function drawState() {
    const keys = pageKey(DISTRICTS);
    const changed = [...keys].filter(([id, v]) => baseKeys.get(id) !== v).length;
    const errors = checkLayout(DISTRICTS).filter((p) => p.level === 'error').length;
    state.textContent = changed
      ? `${changed} fenêtre${changed > 1 ? 's' : ''} changée${changed > 1 ? 's' : ''} — un brouillon dans ce navigateur, que personne d’autre ne voit.${errors ? ` ${errors} erreur${errors > 1 ? 's' : ''} à corriger avant d’enregistrer.` : ''}`
      : 'Identique à la carte publiée.';
    undoBtn.disabled = !undo.length;
    redoBtn.disabled = !redo.length;
    saveBtn.disabled = errors > 0;
  }

  function select(id) {
    selected = id;
    grips.querySelectorAll('.at-grip').forEach((g) => g.classList.toggle('on', g.dataset.id === id));
    drawList();
    drawInspector();
  }

  /** Show a change now: the world, the grips, the checks. Not yet a step to undo. */
  function live({ keepInspector = false } = {}) {
    WORLD.h = worldHeight(DISTRICTS);
    world.relayout();
    if (over) {
      for (const d of DISTRICTS) {
        const g = grips.querySelector(`[data-id="${d.id}"]`);
        if (!g) continue;
        Object.assign(g.style, { left: `${d.x}px`, top: `${d.y}px`, width: `${d.w}px`, height: `${d.h}px`, transform: `rotate(${d.rot}deg)` });
        g.querySelector('.at-dim').textContent = `${Math.round(d.w)} × ${Math.round(d.h)} · ${Math.round(d.x)}, ${Math.round(d.y)}`;
        g.classList.toggle('off', d.status === 'offline');
      }
    }
    drawProblems();
    drawState();
    if (!keepInspector) drawInspector();
  }

  /** A change is done: one step to undo, and the draft kept in this browser. */
  function commit() {
    const text = now();
    if (text === last) return;
    undo.push(last);
    redo.length = 0;
    last = text;
    keep();
    drawList();
    drawState();
  }

  function keep() {
    try {
      if (pageKey(DISTRICTS).size && [...pageKey(DISTRICTS)].every(([id, v]) => baseKeys.get(id) === v)) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify(layoutFile(DISTRICTS)));
    } catch { /* storage blocked: the draft lasts this page */ }
  }

  function restore(pages, said) {
    applyPages(pages);
    live();
    commit();
    drawList();
    placeGrips();
    if (said) toast(said);
  }

  function step(from, to) {
    if (!from.length) return;
    to.push(last);
    last = from.pop();
    applyPages(resolveLayout(JSON.parse(last), { all: true }).pages);
    keep();
    live();
    drawList();
    placeGrips();
  }

  function toggle(id) {
    const d = byId(id);
    d.status = d.status === 'online' ? 'offline' : 'online';
    live();
    commit();
    toast(`${d.title} sera ${d.status === 'online' ? 'en ligne' : 'hors ligne'} une fois la carte publiée.`);
  }

  function copy(text, said) {
    (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard')))
      .then(() => toast(said), () => toast('Le navigateur refuse le presse-papiers : utilisez « Télécharger ».'));
  }

  function download() {
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([now()], { type: 'application/json' }));
    a.download = 'layout.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('layout.json téléchargé : à mettre dans site/data/ du dépôt, puis fire.', 5000);
  }

  // « Enregistrer dans le dépôt » exists only where a local `npm run site` can write the file.
  async function probe() {
    try {
      const r = await fetch(new URL('__atelier/ping', document.baseURI), { cache: 'no-store' });
      saveBtn.hidden = !(r.ok && (await r.json()).writable);
    } catch { saveBtn.hidden = true; }
  }
  async function save() {
    saveBtn.disabled = true;
    try {
      const r = await fetch(new URL('__atelier/layout', document.baseURI), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: now() });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { toast(`Pas enregistré : ${body.error || r.status}`, 6000); return; }
      base = JSON.parse(now());
      baseKeys = pageKey(DISTRICTS);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing kept */ }
      drawList();
      toast(`Enregistré dans ${body.file}. Pour le mettre en ligne : fire.`, 6000);
    } catch (err) {
      toast(`Pas enregistré : ${err.message}`, 6000);
    } finally {
      drawState();
    }
  }

  document.documentElement.classList.add('atelier-on');
  drawList();
  drawInspector();
  drawProblems();
  drawState();
  probe();
  if (draft) toast('Atelier : le brouillon de votre dernière visite est repris.', 4500);
  return { panel, setOver, select, preview, get over() { return over; } };
}
