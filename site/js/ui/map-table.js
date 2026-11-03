/**
 * The map table (Ortis, 2026-11-03, evening): the map room moved under the bookcase, as a table seen in
 * the same perspective as the shelves, the thesis's network maps spread out on it in small format, each
 * on old paper. Over the table the pointer becomes a loupe — a lens that really magnifies what is under
 * it — so the small maps ask to be looked at. A click lifts a map off the table: it comes up to the
 * reader (the sheet flies from where it lay on the table to the middle of the screen) beside its
 * description and what the thesis concludes from it; there it can be dragged, zoomed and downloaded as
 * the map room allowed before.
 *
 * The close-up is a <dialog> on <body>, like the Livre miroir: in the world the page sits in a scaled,
 * zoomed window, and the map should come up at the reader's scale. The lens is a copy of the table,
 * scaled around the pointer inside a round window; touch screens have no hover, so they get no lens.
 *
 * mountMapTable(section, maps, { reducedMotion }) → { open(id), destroy() }
 */
import { esc } from './util.js';

/** Where the sheets lie, as % of the table top (centre x, centre y) and a tilt: scattered, never a grid. */
export const SLOTS = [
  [15, 31, -7], [37, 24, 4], [60, 30, -3], [83, 26, 6],
  [22, 71, 5], [46, 69, -5], [69, 73, 3], [88, 67, -6], [52, 48, 1.5],
];
/** How much the loupe magnifies, and its radius in the page's CSS px. */
export const LENS = { zoom: 2.3, r: 92 };

/** A sheet's width on the table, % of the table: the same paper area whatever the map's shape. */
export const sheetWidth = (aspect) => Math.max(11, Math.min(26, 15 * Math.sqrt(Math.max(0.4, Math.min(3, aspect || 1)))));

const sheetHtml = (l, i) => {
  const [x, y, r] = SLOTS[i % SLOTS.length];
  return `<button type="button" class="mt-sheet" data-id="${esc(l.id)}" style="--x:${x}%;--y:${y}%;--r:${r}deg;--sw:${sheetWidth(1)}%" aria-label="${esc(`${l.title} — ${l.source}`)}" aria-haspopup="dialog">` +
    `<span class="mt-paper"><img src="${esc(l.thumb || l.url)}" alt="" loading="lazy" decoding="async" draggable="false"></span>` +
    `<span class="mt-tag">${esc(l.source.replace(/^Thesis · /, ''))}</span></button>`;
};

function closeUpHtml() {
  return `<div class="mc-wrap">
      <div class="mc-sheet">
        <div class="mc-stage" tabindex="0" aria-label="The map. Drag to pan, scroll or pinch to zoom; the plus and minus keys zoom too.">
          <img class="mc-img" alt="" draggable="false" decoding="async">
          <span class="mc-zoom">100%</span>
          <div class="mc-controls">
            <button type="button" data-z="in" aria-label="Zoom in">+</button>
            <button type="button" data-z="out" aria-label="Zoom out">−</button>
            <button type="button" data-z="reset">Fit</button>
            <a class="mc-dl" href="#" download>Download</a>
          </div>
        </div>
      </div>
      <aside class="mc-info" aria-live="polite"></aside>
      <button type="button" class="mc-close" aria-label="Put the map back on the table">✕</button>
    </div>`;
}

function infoHtml(l, i, n) {
  let legend = '';
  if (l.legend?.length) {
    const max = Math.max(...l.legend.map((x) => x.share));
    legend = '<ol class="mc-legend" aria-label="Share of nodes by channel">' + l.legend.map((x) =>
      `<li><span class="sw" style="background:${esc(x.color)}"></span><span class="nm">${esc(x.label)}</span>` +
      `<span class="pc">${x.share.toLocaleString(undefined, { maximumFractionDigits: 2 })}%</span>` +
      `<span class="bar"><i style="width:${(x.share / max) * 100}%;background:${esc(x.color)}"></i></span></li>`).join('') + '</ol>';
  }
  return `<p class="mc-source">${esc(l.source)}</p>
    <h3 id="mcTitle">${esc(l.title)}</h3>
    <p class="mc-caption">${esc(l.caption)}</p>
    ${l.context ? `<h4>What the thesis draws from it</h4><p class="mc-context">${esc(l.context)}</p>` : ''}
    ${legend}
    <nav class="mc-steps" aria-label="The other maps"><button type="button" data-step="-1">← Previous</button><span>${i + 1} / ${n}</span><button type="button" data-step="1">Next →</button></nav>`;
}

export function mountMapTable(section, maps, { reducedMotion = false } = {}) {
  const layers = maps.layers || [];
  const byId = new Map(layers.map((l) => [l.id, l]));
  const cleanups = [];
  const on = (t, ...a) => { t.addEventListener(...a); cleanups.push(() => t.removeEventListener(...a)); };

  section.insertAdjacentHTML('beforeend', `<div class="mt-scene"><div class="mt-table"><div class="mt-top"><div class="mt-blotter"></div>${layers.map(sheetHtml).join('')}</div></div></div>
    <div class="mt-front"><p class="mt-plaque">${esc(maps.title || 'The map room')}</p></div>
    <div class="mt-loupe" aria-hidden="true" inert><div class="mt-lens"><div class="mt-lens-in"></div></div><span class="mt-handle"></span></div>`);
  const scene = section.querySelector('.mt-scene');
  const loupe = section.querySelector('.mt-loupe');
  const lensIn = section.querySelector('.mt-lens-in');

  // Each sheet takes its map's shape once its picture is in: a wide figure is a wide sheet.
  for (const btn of section.querySelectorAll('.mt-sheet')) {
    const img = btn.querySelector('img');
    const shape = () => { if (img.naturalWidth) btn.style.setProperty('--sw', `${sheetWidth(img.naturalWidth / img.naturalHeight)}%`); btn.style.setProperty('--ar', `${img.naturalWidth} / ${img.naturalHeight}`); };
    if (img.complete && img.naturalWidth) shape(); else img.addEventListener('load', shape, { once: true });
  }

  // ---------------------------------------------------------------- the loupe --
  const mouse = matchMedia('(hover: hover) and (pointer: fine)');
  let lensing = false;
  const local = (e) => {
    const r = section.getBoundingClientRect();
    const k = r.width / section.offsetWidth || 1;
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };
  function startLens() {
    // A fresh copy of the table each time the pointer comes over it: the sheets may have taken their shape since.
    const copy = scene.cloneNode(true);
    copy.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    lensIn.replaceChildren(copy);
    lensIn.style.width = `${scene.offsetWidth}px`;
    lensIn.style.height = `${scene.offsetHeight}px`;
    section.classList.add('lensing');
    lensing = true;
  }
  function moveLens(e) {
    const p = local(e);
    const { r, zoom } = LENS;
    loupe.style.transform = `translate(${p.x - r}px, ${p.y - r}px)`;
    const ox = p.x - scene.offsetLeft;
    const oy = p.y - scene.offsetTop;
    lensIn.style.left = `${scene.offsetLeft - (p.x - r)}px`;
    lensIn.style.top = `${scene.offsetTop - (p.y - r)}px`;
    lensIn.style.transformOrigin = `${ox}px ${oy}px`;
    lensIn.style.transform = `scale(${zoom})`;
  }
  const stopLens = () => { section.classList.remove('lensing'); lensing = false; lensIn.replaceChildren(); markUp(null); };
  /** The sheet under the pointer rises a little — on the table and in the lens alike. */
  function markUp(id) {
    for (const s of section.querySelectorAll('.mt-sheet.up')) if (s.dataset.id !== id) s.classList.remove('up');
    if (id) for (const s of section.querySelectorAll(`.mt-sheet[data-id="${CSS.escape(id)}"]`)) s.classList.add('up');
    loupe.classList.toggle('on-sheet', Boolean(id));
  }
  on(scene, 'pointerenter', (e) => { if (e.pointerType === 'mouse' && mouse.matches) { startLens(); moveLens(e); } });
  on(scene, 'pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (!lensing && mouse.matches) startLens();
    if (lensing) moveLens(e);
    markUp(e.target.closest?.('.mt-sheet')?.dataset.id || null);
  });
  on(scene, 'pointerleave', stopLens);
  on(section, 'focusin', (e) => { const s = e.target.closest('.mt-sheet'); if (s) markUp(s.dataset.id); });
  on(section, 'focusout', () => { if (!lensing) markUp(null); });

  // ------------------------------------------------------------- the close-up --
  const dlg = document.createElement('dialog');
  dlg.className = 'map-close';
  dlg.setAttribute('aria-labelledby', 'mcTitle');
  dlg.innerHTML = closeUpHtml();
  document.body.append(dlg);
  cleanups.push(() => { if (dlg.open) dlg.close(); dlg.remove(); });
  const q = (s) => dlg.querySelector(s);
  const sheet = q('.mc-sheet');
  const stage = q('.mc-stage');
  const img = q('.mc-img');
  const zoomEl = q('.mc-zoom');
  const dl = q('.mc-dl');
  const info = q('.mc-info');
  let current = null;
  let from = null;

  const view = { s: 1, x: 0, y: 0, fit: 1, iw: 1, ih: 1, atFit: true };
  const pointers = new Map();
  let pinch = null;
  const apply = () => {
    img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    zoomEl.textContent = `${Math.round((view.s / view.fit) * 100)}%`;
  };
  function fit() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W || !H) return;
    view.fit = Math.min(W / view.iw, H / view.ih) * 0.94;
    view.s = view.fit;
    view.x = (W - view.iw * view.s) / 2;
    view.y = (H - view.ih * view.s) / 2;
    view.atFit = true;
    apply();
  }
  function zoomAt(f, cx, cy) {
    const next = Math.min(view.fit * 10, Math.max(view.fit * 0.6, view.s * f));
    const k = next / view.s;
    view.x = cx - (cx - view.x) * k;
    view.y = cy - (cy - view.y) * k;
    view.s = next;
    view.atFit = false;
    apply();
  }
  const pt = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const p = pt(e); zoomAt(Math.exp(-e.deltaY * 0.0016), p.x, p.y); }, { passive: false });
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.mc-controls')) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pt(e));
    stage.classList.add('dragging');
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const now = pt(e);
    pointers.set(e.pointerId, now);
    if (pointers.size === 1) { view.x += now.x - prev.x; view.y += now.y - prev.y; view.atFit = false; apply(); } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      view.x += m.x - pinch.m.x;
      view.y += m.y - pinch.m.y;
      zoomAt(d / pinch.d, m.x, m.y);
      pinch = { d, m };
    }
  });
  const end = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('dblclick', (e) => { const p = pt(e); zoomAt(2, p.x, p.y); });
  stage.addEventListener('keydown', (e) => {
    const c = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
    const keys = {
      '+': () => zoomAt(1.4, c.x, c.y), '=': () => zoomAt(1.4, c.x, c.y), '-': () => zoomAt(1 / 1.4, c.x, c.y), 0: fit,
      ArrowLeft: () => { view.x += 50; apply(); }, ArrowRight: () => { view.x -= 50; apply(); },
      ArrowUp: () => { view.y += 50; apply(); }, ArrowDown: () => { view.y -= 50; apply(); },
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  });
  q('.mc-controls').addEventListener('click', (e) => {
    const z = e.target.closest('button')?.dataset.z;
    if (!z) return;
    const c = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
    if (z === 'in') zoomAt(1.5, c.x, c.y); else if (z === 'out') zoomAt(1 / 1.5, c.x, c.y); else fit();
  });
  const ro = new ResizeObserver(() => { if (view.atFit) fit(); });
  ro.observe(stage);
  cleanups.push(() => ro.disconnect());

  /** Show a layer in the close-up: the table's small copy at once, the full map when it has arrived. */
  function show(l) {
    current = l;
    const i = layers.indexOf(l);
    info.innerHTML = infoHtml(l, i, layers.length);
    img.alt = `${l.title} — ${l.caption}`;
    dl.href = l.url;
    dl.textContent = `Download · ${Math.max(1, Math.round((l.bytes || 0) / 1024))} KB`;
    const take = (src) => {
      img.onload = () => { view.iw = img.naturalWidth; view.ih = img.naturalHeight; img.style.width = `${view.iw}px`; img.style.height = `${view.ih}px`; fit(); };
      img.src = src;
    };
    take(l.thumb || l.url);
    if (l.thumb && l.thumb !== l.url) {
      const full = new Image();
      full.onload = () => { if (current === l && dlg.open) take(l.url); };
      full.src = l.url;
    }
    if (location.hash !== `#map=${l.id}`) history.replaceState(null, '', `${location.pathname}${location.search}#map=${encodeURIComponent(l.id)}`);
  }

  const still = () => reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const paperOf = (id) => scene.querySelector(`.mt-sheet[data-id="${CSS.escape(id)}"]`);

  /** From the sheet on the table to the sheet in the close-up: where it was, how big, how it lay. */
  function flight(btn) {
    const a = btn.querySelector('.mt-paper').getBoundingClientRect();
    const b = sheet.getBoundingClientRect();
    if (!a.width || !b.width) return null;
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    const r = parseFloat(btn.style.getPropertyValue('--r')) || 0;
    return [
      { transform: `translate(${dx}px, ${dy}px) scale(${a.width / b.width}, ${a.height / b.height}) perspective(900px) rotateX(38deg) rotate(${r}deg)`, opacity: 0.9 },
      { transform: `translate(${dx * 0.12}px, ${dy * 0.12 - 18}px) scale(1.03) perspective(900px) rotateX(-6deg) rotate(${r * 0.1}deg)`, opacity: 1, offset: 0.68 },
      { transform: 'none', opacity: 1 },
    ];
  }

  function open(id, btn = paperOf(id)) {
    const l = byId.get(id);
    if (!l) return;
    from = btn;
    show(l);
    if (!dlg.open) dlg.showModal();
    dlg.classList.remove('is-up', 'is-down');
    const frames = btn && !still() ? flight(btn) : null;
    btn?.classList.add('lifted');
    if (frames) {
      sheet.animate(frames, { duration: 720, easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
    requestAnimationFrame(() => dlg.classList.add('is-up'));
    stage.focus({ preventScroll: true });
  }

  let closing = false;
  async function close() {
    if (!dlg.open || closing) return;
    closing = true;
    const btn = from;
    dlg.classList.remove('is-up');
    dlg.classList.add('is-down');
    const frames = btn && !still() ? flight(btn) : null;
    if (frames) {
      try { await sheet.animate([...frames].reverse(), { duration: 520, easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'forwards' }).finished; } catch { /* cancelled */ }
    }
    dlg.close();
    sheet.getAnimations().forEach((x) => x.cancel());
    closing = false;
  }
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('close', () => {
    dlg.classList.remove('is-up', 'is-down');
    from?.classList.remove('lifted');
    from?.focus({ preventScroll: true });
    if (location.hash.startsWith('#map=')) history.replaceState(null, '', location.pathname + location.search);
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.classList.contains('mc-wrap') || e.target.closest('.mc-close')) { close(); return; }
    const step = e.target.closest('[data-step]');
    if (step && current) {
      const next = layers[(layers.indexOf(current) + Number(step.dataset.step) + layers.length) % layers.length];
      from?.classList.remove('lifted');
      from = paperOf(next.id);
      from?.classList.add('lifted');
      show(next);
    }
  });

  on(scene, 'click', (e) => {
    const btn = e.target.closest('.mt-sheet');
    if (btn) { stopLens(); open(btn.dataset.id, btn); }
  });

  return {
    open,
    close,
    destroy: () => cleanups.forEach((f) => f()),
  };
}
