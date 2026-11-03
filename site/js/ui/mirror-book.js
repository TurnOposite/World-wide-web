/**
 * The Livre miroir (Ortis, 2026-11-03): one more book on the Bibliothèque's top shelf. On the shelf it
 * behaves like the others — the pointer pulls it a little way out and turns its cover to you. Clicked,
 * it is taken down and opens: the cover swings over to the left, and across the two open pages lies the
 * pond of the old Écrits page (ui/pond.js), the six texts engraved on stones at the bottom of it, dark
 * until a hand moves over the water. A stone is a link to the text in Lectures.
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

let TEXTS = null;
async function texts() {
  if (!TEXTS) TEXTS = (await (await fetch(new URL('data/texts.json', document.baseURI))).json()).texts || [];
  return TEXTS;
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

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'mirror-book';
  dialog.setAttribute('aria-label', 'Livre miroir : les textes, au fond de l’eau');
  dialog.innerHTML = `<div class="mb-stage">
      <div class="mb-book">
        <div class="mb-page mb-left" aria-hidden="true"><span class="mb-run">Livre miroir</span><span class="mb-folio">i</span></div>
        <div class="mb-page mb-right" aria-hidden="true"><span class="mb-run">Au fond de l’eau</span><span class="mb-folio">ii</span></div>
        <div class="mb-pool"><div class="mb-pond" role="group" aria-label="Les textes, au fond de l’eau"></div></div>
        <div class="mb-gutter" aria-hidden="true"></div>
        <div class="mb-cover" aria-hidden="true">
          <div class="mb-front"><span class="mb-ttl">Livre miroir</span><span class="mb-art">${POOL}</span><span class="mb-sub">six textes · au fond de l’eau</span></div>
          <div class="mb-back"></div>
        </div>
      </div>
      <p class="mb-hint">Passez la main sur l’eau ; un texte s’ouvre d’un clic sur sa pierre.</p>
      <button type="button" class="mb-close" aria-label="Refermer le livre">✕</button>
    </div>`;
  document.body.append(dialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('.mb-close')) { dialog.close(); return; }
    // A stone opens its text: the router takes the link; the book closes behind it.
    if (e.target.closest('a.stone')) setTimeout(() => dialog.open && dialog.close(), 0);
  });
  dialog.addEventListener('close', () => {
    timers.forEach(clearTimeout);
    timers = [];
    pond?.destroy();
    pond = null;
    dialog.classList.remove('is-open', 'is-ready');
    dialog.querySelector('.mb-pond').innerHTML = '';
    if (location.hash === '#miroir') history.replaceState(null, '', location.pathname + location.search);
    openMirror.from?.focus?.({ preventScroll: true });
  });
}

/**
 * Take the book down and open it. `from` is the shelf's button, focused again when the book closes.
 * The cover swings open (0.9 s), then the water is drawn on the open pages.
 */
export async function openMirror(from = null) {
  if (!dialog) build();
  openMirror.from = from;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!dialog.open) dialog.showModal();
  if (location.hash !== '#miroir') history.replaceState(null, '', `${location.pathname}${location.search}#miroir`);
  dialog.classList.toggle('still', still);
  // next frame: the closed book is laid out, then it opens
  requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('is-open')));
  const items = (await texts()).map(stone);
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
