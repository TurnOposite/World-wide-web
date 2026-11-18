/**
 * The menu is a scatter of tags, one per district: slanted, tilted, Zone's
 * down the left edge and Echo's down the right. They are real buttons in a
 * <nav>, so the menu reads as a list to a screen reader and Tab walks it in
 * order; on a phone they line up in a strip under the header. The versions
 * of the past get a tag too, in the archive's colour (docs/ATELIER.md).
 *
 * The selection is a shard (the mood board's MB-01, docs/design/MOODBOARD-globe-trotter.md): one jagged shape per
 * half, with a hard offset copy in the half's second colour, that jumps to the tag being pointed at (the pointer or
 * the keyboard), else to the page you are on, and takes a new shape at every jump. It replaces the amber ring the
 * current tag wore until 2026-11-18. Echo's labels are set as ransom notes, a letter at a time in the faces the paper
 * already uses; the button keeps the plain name for a screen reader.
 */
import { DISTRICTS } from './layout.js';

/**
 * A shard's outline as a clip-path polygon: ten points around a box, in percent, each pulled in from the edge by up
 * to `jag` of it at random. Always ten, so one shard can be eased into the next. Pure: `rnd` gives numbers in [0, 1).
 */
export function shardPolygon(rnd, jag = 16) {
  const j = () => (rnd() * jag).toFixed(1);
  const pts = [
    [j(), j()], [30 + rnd() * 10, j()], [62 + rnd() * 10, j()], [100 - j(), j()],
    [100 - j(), 50 + (rnd() - 0.5) * 20],
    [100 - j(), 100 - j()], [68 + rnd() * 10, 100 - j()], [34 + rnd() * 10, 100 - j()], [j(), 100 - j()],
    [j(), 50 + (rnd() - 0.5) * 20],
  ];
  return `polygon(${pts.map(([x, y]) => `${(+x).toFixed(1)}% ${(+y).toFixed(1)}%`).join(',')})`;
}

/** Ransom-note letters: which of the four styles each letter takes. Fixed per word, so a label never reshuffles. */
export function ransom(word) {
  let h = 7;
  return [...word].map((ch, i) => {
    h = (h * 31 + ch.charCodeAt(0) + i) % 9973;
    return { ch, k: ch === ' ' ? -1 : h % 4 };
  });
}

/** Where a district's tag stands, from layout.json's `tag` (the Atelier moves it). */
function place(b, d) {
  const [x, y, r] = d.tag;
  b.style.removeProperty('--tl');
  b.style.removeProperty('--tr');
  b.style.setProperty(d.half === 'echo' ? '--tr' : '--tl', `${x}%`);
  b.style.setProperty('--tt', `${y}%`);
  b.style.setProperty('--r', `${r}deg`);
  b.dataset.half = d.half;
  b.classList.toggle('w-off', d.status === 'offline');
}

function label(d) {
  const i = document.createElement('i');
  if (d.half === 'echo' && d.era !== 'past') {
    i.setAttribute('aria-hidden', 'true');
    for (const { ch, k } of ransom(d.title)) {
      const b = document.createElement('b');
      b.textContent = ch;
      if (k >= 0) b.className = `rn rn${k}`;
      i.append(b);
    }
  } else i.textContent = d.title;
  return i;
}

/** @param {(id: string) => void} onPick */
export function mountTags(onPick) {
  const nav = document.createElement('nav');
  nav.className = 'w-tags';
  nav.id = 'wTags';
  nav.tabIndex = -1;
  nav.setAttribute('aria-label', 'Monde — chaque étiquette déplace la caméra');
  const shards = {};
  for (const half of ['zone', 'echo']) {
    const sh = document.createElement('i');
    sh.className = 'w-shard';
    sh.dataset.half = half;
    sh.setAttribute('aria-hidden', 'true');
    sh.innerHTML = '<b class="w-shard-b"></b><b class="w-shard-a"></b>';
    nav.append(sh);
    shards[half] = sh;
  }
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let pointed = null;
  const api = { nav, onPoint: () => {} };

  /** Every half's shard to its tag: the one pointed at if it is in that half, else that half's current page. */
  function show() {
    const navBox = nav.getBoundingClientRect();
    for (const half of ['zone', 'echo']) {
      const sh = shards[half];
      const t = (pointed && pointed.dataset.half === half && pointed) || nav.querySelector(`.w-tag[data-half="${half}"][aria-current="true"]`);
      nav.querySelectorAll(`.w-tag[data-half="${half}"]`).forEach((b) => b.classList.toggle('w-sel', b === t));
      if (!t || !t.offsetParent) { sh.classList.remove('on'); continue; }
      const box = t.firstElementChild.getBoundingClientRect();
      const w = box.width + 22, h = box.height + 16;
      const x = box.left - navBox.left + nav.scrollLeft + box.width / 2 - 50;
      const y = box.top - navBox.top + nav.scrollTop + box.height / 2 - 20;
      const r = -parseFloat(t.style.getPropertyValue('--r') || '0');
      if (sh.dataset.at !== t.dataset.go) {
        sh.dataset.at = t.dataset.go;
        const poly = shardPolygon(rnd);
        for (const b of sh.children) { b.style.clipPath = poly; b.style.webkitClipPath = poly; }
      }
      sh.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r}deg) scale(${(w / 100).toFixed(3)},${(h / 40).toFixed(3)})`;
      sh.classList.add('on');
    }
    api.onPoint();
  }

  const point = (b) => { if (pointed === b) return; pointed = b; show(); };
  for (const d of DISTRICTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `w-tag${d.faint ? ' faint' : ''}${d.era === 'past' ? ' w-tag-past' : ''}`;
    b.dataset.go = d.id;
    if (d.half === 'echo' && d.era !== 'past') b.setAttribute('aria-label', d.title);
    place(b, d);
    const span = document.createElement('span');
    span.append(label(d));
    b.append(span);
    b.addEventListener('click', () => onPick(d.id));
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { b.classList.add('w-pointed'); point(b); } });
    b.addEventListener('pointerleave', () => { b.classList.remove('w-pointed'); if (pointed === b) point(nav.querySelector('.w-tag:focus-visible')); });
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) { b.classList.add('w-pointed'); point(b); } });
    b.addEventListener('blur', () => { b.classList.remove('w-pointed'); if (pointed === b) point(null); });
    nav.append(b);
  }
  addEventListener('resize', () => requestAnimationFrame(show));
  nav.addEventListener('scroll', () => requestAnimationFrame(show), { passive: true });
  return Object.assign(api, {
    placeAll() {
      for (const d of DISTRICTS) {
        const b = nav.querySelector(`[data-go="${d.id}"]`);
        if (b) place(b, d);
      }
      requestAnimationFrame(show);
    },
    mark(id) {
      nav.querySelectorAll('.w-tag').forEach((b) => {
        if (b.dataset.go === id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
      // On a phone the strip scrolls: keep the current tag in the middle of it.
      // By hand, not scrollIntoView, which would also scroll the hidden page.
      const cur = nav.querySelector('[aria-current]');
      if (cur && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2;
      show();
    },
    show,
  });
}
