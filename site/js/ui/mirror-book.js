/**
 * The Livre miroir (Ortis, 2026-11-03): one more book on the Bibliothèque's top shelf. On the shelf it
 * behaves like the others — the pointer pulls it a little way out and turns its cover to you. Clicked,
 * it is taken down and opens: the cover swings over to the left, and the first double page is the
 * introduction to the texts (texts.json `intro`), one sentence to a paragraph (Ortis, 2026-11-03 later:
 * the Lectures window is gone, its description lives here, so the texts are harder to come upon).
 *
 * Nothing says the page turns. Only the right-hand page's outer edge lifts a little under the pointer,
 * the bottom corner most, as a page with another behind it does; a click on the edge or the corner turns
 * it, and under it, across the next two pages, lies the pond of the old Écrits page (ui/pond.js), the six
 * texts engraved on stones at the bottom of it, dark until a hand moves over the water. A stone is a link
 * to the text, which opens in the Articles window.
 *
 * The open book is a <dialog> on <body>, not inside the page: in the world the page sits in a scaled,
 * zoomed window, and the book should open at the reader's scale, over everything.
 */
import { esc } from './util.js';

export const MIRROR = 'livre-miroir';

/** What the shelf, the peek card and the chips need to know about it. */
export const mirrorBook = Object.freeze({
  id: MIRROR, mirror: true, title: 'Livre miroir', course: 'Écrits', kind: 'six textes au fond de l’eau',
  h: 262, t: 36, d: 184,
});

const POOL = `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="mb-water" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#2f4b4d"/><stop offset=".7" stop-color="#132426"/><stop offset="1" stop-color="#0a1213"/></radialGradient>
    <linearGradient id="mb-glint" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <path d="M50 14 C74 12 92 30 88 52 C85 74 66 90 46 88 C24 86 9 70 12 48 C15 28 30 15 50 14 Z" fill="url(#mb-water)" stroke="#e9eef1" stroke-width="1.2"/>
  <g fill="none" stroke="#cfe3e4" stroke-width=".7" opacity=".7">
    <ellipse cx="44" cy="50" rx="8" ry="4.6"/><ellipse cx="44" cy="50" rx="16" ry="9" opacity=".6"/><ellipse cx="44" cy="50" rx="25" ry="14" opacity=".35"/>
  </g>
  <g fill="#9fb4b2" opacity=".55"><ellipse cx="62" cy="66" rx="7" ry="3.6"/><ellipse cx="34" cy="72" rx="6" ry="3"/><ellipse cx="66" cy="38" rx="5.5" ry="2.8"/></g>
  <path d="M30 24 C44 18 60 19 70 26" stroke="url(#mb-glint)" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

/** The volume on the shelf: the same parts as every book (library.js bookHtml), in silvered cloth. */
export function mirrorHtml() {
  const b = mirrorBook;
  return (
    `<button type="button" class="book mirror" data-id="${MIRROR}" data-dept="" style="--h:${b.h}px;--t:${b.t}px;--d:${b.d}px;--turn:-24deg" aria-label="Livre miroir — les textes, au fond de l’eau" aria-haspopup="dialog">` +
    `<span class="b3d" aria-hidden="true">` +
    `<span class="bf spine"><span class="book-title">Livre miroir</span><span class="book-course">ÉCRITS</span></span>` +
    `<span class="bf bcover cv-mirror"><span class="cv-title">Livre miroir</span><span class="cv-art">${POOL}</span><span class="cv-meta">six textes · au fond de l’eau</span></span>` +
    `<span class="bf top"></span>` +
    `</span><span class="slot" aria-hidden="true"></span></button>`
  );
}

let DATA = null;
async function load() {
  if (!DATA) {
    const j = await (await fetch(new URL('data/texts.json', document.baseURI))).json();
    DATA = { texts: j.texts || [], intro: j.intro || '' };
  }
  return DATA;
}

/** The introduction, one sentence to a paragraph. A full stop, ?, ! or … followed by a capital ends one. */
export function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+(?=[«"“A-ZÀ-ÖØ-Þ])/u).filter(Boolean);
}

/**
 * The two pages of the introduction: the sentences in order, cut where the two pages come out nearest in
 * length, the left never empty (a single sentence fills the right-hand page alone).
 */
export function introPages(text) {
  const all = sentences(text);
  if (all.length < 2) return { left: [], right: all };
  const total = all.reduce((n, x) => n + x.length, 0);
  let best = 1;
  let bestGap = Infinity;
  let run = 0;
  for (let i = 1; i < all.length; i++) {
    run += all[i - 1].length;
    const gap = Math.abs(run - total / 2);
    if (gap < bestGap) { bestGap = gap; best = i; }
  }
  return { left: all.slice(0, best), right: all.slice(best) };
}

/** The stones' places, as fractions of the pond: three on each page, none on the gutter. */
const SPOTS = {
  landscape: [[0.23, 0.27], [0.35, 0.53], [0.22, 0.78], [0.77, 0.27], [0.65, 0.53], [0.78, 0.78]],
  portrait: [[0.32, 0.13], [0.68, 0.28], [0.32, 0.44], [0.68, 0.59], [0.32, 0.75], [0.68, 0.89]],
};

const stone = (t) => {
  const meta = [t.category, t.readingTime].filter(Boolean).join(' · ');
  return {
    href: `echo/lectures/${esc(t.slug)}`,
    title: t.title,
    meta,
    scored: Boolean(t.scoredBy),
    label: esc(`${t.title} — ${meta}${t.scoredBy ? ', scoré' : ''}. ${t.excerpt || ''}`),
  };
};

let dialog = null;
let pond = null;
let timers = [];

const paras = (list) => list.map((x) => `<p>${esc(x)}</p>`).join('');

function build(intro) {
  const { left, right } = introPages(intro);
  dialog = document.createElement('dialog');
  dialog.className = 'mirror-book';
  dialog.setAttribute('aria-label', 'Livre miroir : les textes, au fond de l’eau');
  // Under the first double page, the second: the pool across both. The first is the introduction — its
  // left page lies still, its right page is the leaf that turns. On a phone the book has one page: the
  // leaf carries the whole introduction (the left half again, hidden on a desktop).
  dialog.innerHTML = `<div class="mb-stage">
      <div class="mb-book">
        <div class="mb-page mb-left" aria-hidden="true"><span class="mb-run">Livre miroir</span><span class="mb-folio">iii</span></div>
        <div class="mb-page mb-right" aria-hidden="true"><span class="mb-run">Au fond de l’eau</span><span class="mb-folio">iv</span></div>
        <div class="mb-pool" inert><div class="mb-pond" role="group" aria-label="Les textes, au fond de l’eau"></div></div>
        <div class="mb-gutter" aria-hidden="true"></div>
        <div class="mb-sheet mb-intro"><div class="mb-text">${paras(left)}</div><span class="mb-run" aria-hidden="true">Livre miroir</span><span class="mb-folio" aria-hidden="true">i</span></div>
        <div class="mb-leaf">
          <div class="mb-sheet mb-recto">
            <div class="mb-text"><div class="mb-text-l" aria-hidden="true">${paras(left)}</div>${paras(right)}</div>
            <span class="mb-run" aria-hidden="true">Au fond de l’eau</span><span class="mb-folio" aria-hidden="true">ii</span>
            <button type="button" class="mb-edge" aria-label="Tourner la page"></button>
            <span class="mb-corner" aria-hidden="true"></span>
          </div>
          <div class="mb-sheet mb-verso" aria-hidden="true"></div>
        </div>
        <div class="mb-cover" aria-hidden="true">
          <div class="mb-front"><span class="mb-ttl">Livre miroir</span><span class="mb-art">${POOL}</span><span class="mb-sub">six textes · au fond de l’eau</span></div>
          <div class="mb-back"></div>
        </div>
      </div>
      <p class="mb-hint">Passez la main sur l’eau ; un texte s’ouvre d’un clic sur sa pierre.</p>
      <button type="button" class="mb-close" aria-label="Refermer le livre" autofocus>✕</button>
    </div>`;
  document.body.append(dialog);
  const leaf = dialog.querySelector('.mb-leaf');
  // The lift: the outer edge a little, the bottom corner more (rooms.css). Only a mouse can hover;
  // a keyboard lifts the edge by focusing it. A touch turns the page at once.
  const lift = (k) => (e) => { if (e.pointerType === 'mouse' && !dialog.classList.contains('is-turned')) leaf.dataset.lift = k; };
  const drop = (e) => { if (!e.relatedTarget?.closest?.('.mb-edge, .mb-corner')) delete leaf.dataset.lift; };
  for (const [sel, k] of [['.mb-edge', 'edge'], ['.mb-corner', 'corner']]) {
    const z = leaf.querySelector(sel);
    z.addEventListener('pointerenter', lift(k));
    z.addEventListener('pointerleave', drop);
  }
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('.mb-close')) { dialog.close(); return; }
    if (e.target.closest('.mb-edge, .mb-corner')) { turn(); return; }
    // A stone opens its text: the router takes the link; the book closes behind it.
    if (e.target.closest('a.stone')) setTimeout(() => dialog.open && dialog.close(), 0);
  });
  dialog.addEventListener('close', () => {
    timers.forEach(clearTimeout);
    timers = [];
    pond?.destroy();
    pond = null;
    dialog.classList.remove('is-open', 'is-ready', 'is-turned', 'is-turning');
    delete leaf.dataset.lift;
    dialog.querySelector('.mb-pool').inert = true;
    dialog.querySelector('.mb-pond').innerHTML = '';
    if (location.hash === '#miroir') history.replaceState(null, '', location.pathname + location.search);
    openMirror.from?.focus?.({ preventScroll: true });
  });
}

/** Turn the right-hand page over: the pond is under it. */
function turn() {
  if (!dialog?.open || dialog.classList.contains('is-turning') || dialog.classList.contains('is-turned')) return;
  const leaf = dialog.querySelector('.mb-leaf');
  delete leaf.dataset.lift;
  dialog.classList.add('is-turning');
  const done = () => {
    if (!dialog.open || !dialog.classList.contains('is-turning')) return;
    dialog.classList.remove('is-turning');
    dialog.classList.add('is-turned');
    const pool = dialog.querySelector('.mb-pool');
    pool.inert = false;
    pool.querySelector('a.stone')?.focus({ preventScroll: true });
  };
  timers.push(setTimeout(done, dialog.classList.contains('still') ? 0 : 1150));
}

/**
 * Take the book down and open it. `from` is the shelf's button, focused again when the book closes.
 * The cover swings open (0.9 s) on the introduction; the water is drawn under the page meanwhile, so it
 * is there when the page turns.
 */
export async function openMirror(from = null) {
  const data = await load().catch(() => ({ texts: [], intro: '' }));
  if (!dialog) build(data.intro);
  openMirror.from = from;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!dialog.open) dialog.showModal();
  if (location.hash !== '#miroir') history.replaceState(null, '', `${location.pathname}${location.search}#miroir`);
  dialog.classList.toggle('still', still);
  // next frame: the closed book is laid out, then it opens
  requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('is-open')));
  const items = data.texts.map(stone);
  const wait = still ? 0 : 820;
  timers.push(setTimeout(async () => {
    if (!dialog.open || pond) return;
    const { createPond } = await import('./pond.js');
    if (!dialog.open || pond) return;
    pond = createPond(dialog.querySelector('.mb-pond'), items, { reducedMotion: still, spots: SPOTS });
    dialog.classList.add('is-ready');
  }, wait));
}
openMirror.close = () => { if (dialog?.open) dialog.close(); };
openMirror.turn = turn;
