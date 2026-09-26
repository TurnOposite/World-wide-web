/**
 * Ported from public/library.js (2026-09-26): mounted into the site's <main> instead
 * of owning a page, listeners removed on navigation, data through the station
 * client so it works on the Pi and on the static site alike.
 *
 * The Library: a close-up bookshelf of essays, the thesis, and the map room.
 *
 * Everything on this page comes from GET /api/collections (the manifest in
 * collections/collection.json). Books are drawn as spines — height from what
 * kind of work it is, thickness from its page count, colour from its
 * department — and lift half off the shelf under the pointer (collections.css
 * does the lift; this file only positions the peek card that shows the full
 * title a spine has to truncate).
 */
import { esc } from '../../ui/util.js';

const TEMPLATE = `<div class="room-head">
    <h2 id="libTitle">The Library</h2>
    <p id="libIntro">Loading the shelves…</p>
    <div class="chips" id="courseChips" role="group" aria-label="Filter by class"></div>
  </div>

  <section class="thesis-card" id="thesisCard" hidden aria-labelledby="thesisTitle"></section>

  <section class="bookcase" id="bookcase" aria-label="Bookshelf">
    <p class="empty-room" id="shelfEmpty">…</p>
  </section>
  <p class="hint">Hover a spine and the book lifts off the shelf. Click it to open the reading desk. Every essay can be read in the browser or downloaded as a PDF.</p>

  <section class="maproom" id="maps" aria-labelledby="mapsTitle" hidden>
    <div class="panel-head"><h3 id="mapsTitle">The map room</h3></div>
    <p class="hint" id="mapsIntro" style="margin-top:0"></p>
    <div class="layer-tabs" id="layerTabs" role="tablist" aria-label="Network layers"></div>
    <div class="map-grid">
      <div class="map-stage" id="mapStage" tabindex="0" aria-label="Network map. Drag to pan, scroll or pinch to zoom, plus and minus keys also zoom.">
        <img id="mapImg" alt="" draggable="false" decoding="async">
        <span class="map-zoom" id="mapZoom">100%</span>
        <div class="map-controls">
          <button type="button" data-z="in" aria-label="Zoom in">+</button>
          <button type="button" data-z="out" aria-label="Zoom out">−</button>
          <button type="button" data-z="reset">Fit</button>
          <a id="mapDownload" href="#" download>Download</a>
        </div>
      </div>
      <aside class="map-info" id="mapInfo" aria-live="polite"></aside>
    </div>
  </section>
<dialog class="desk" id="desk" aria-labelledby="deskTitle">
  <div class="desk-inner">
    <button class="close-x" type="button" data-close aria-label="Close">✕</button>
    <img class="desk-cover" id="deskCover" alt="">
    <div>
      <h3 id="deskTitle"></h3>
      <p class="meta" id="deskMeta"></p>
      <p class="blurb" id="deskBlurb"></p>
      <div class="actions" id="deskActions"></div>
    </div>
  </div>
</dialog>
<div class="peek" id="peek" aria-hidden="true"><b></b><span></span></div>
<p class="hint" id="statusLine"></p>
`;

export async function mount(root, ctx) {
  root.insertAdjacentHTML('beforeend', TEMPLATE);
  const $ = (id) => root.querySelector('#' + id);
  const cleanups = [];
  const on = (target, ...args) => { target.addEventListener(...args); cleanups.push(() => target.removeEventListener(...args)); };
  const el = {
    title: $('libTitle'), intro: $('libIntro'), chips: $('courseChips'),
    thesis: $('thesisCard'), bookcase: $('bookcase'), status: $('statusLine'),
    desk: $('desk'), deskCover: $('deskCover'), deskTitle: $('deskTitle'), deskMeta: $('deskMeta'),
    deskBlurb: $('deskBlurb'), deskActions: $('deskActions'), peek: $('peek'),
    maps: $('maps'), mapsTitle: $('mapsTitle'), mapsIntro: $('mapsIntro'), tabs: $('layerTabs'),
    stage: $('mapStage'), img: $('mapImg'), zoom: $('mapZoom'), download: $('mapDownload'), info: $('mapInfo'),
  };

  // The peek card is positioned in page coordinates; <main> is a positioned
  // ancestor on this site, so it lives on <body> while the room is open.
  document.body.append(el.peek);
  cleanups.push(() => el.peek.remove());

  const BOOKS = new Map();

  // ------------------------------------------------------------------ books --

  /** Department → base colour (h, s, l). The spine's hue is its department. */
  const DEPARTMENTS = {
    LACS: [36, 52, 36], POLI: [352, 52, 30], INTD: [184, 48, 25], HISP: [118, 28, 29],
    HIST: [222, 40, 29], SOCI: [288, 26, 30], UCPH: [206, 34, 31], IFP: [150, 22, 21],
  };

  /** Stable small integer from a string, so a book looks the same on every visit. */
  function hash(s) {
    let h = 2166136261;
    for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
    return h >>> 0;
  }

  function department(book, shelfId) {
    const code = String(book.course || '').split(/\s+/)[0].toUpperCase();
    if (DEPARTMENTS[code]) return code;
    return shelfId === 'ucph' ? 'UCPH' : 'IFP';
  }

  function spineStyle(book, shelfId) {
    const r = hash(book.id);
    const kind = book.kind.toLowerCase();
    let h =
      book.featured ? 318
      : /slides/.test(kind) ? 236
      : /final|research|thesis|exam/.test(kind) ? 292
      : /short|response|memo|midterm/.test(kind) ? 258
      : 274;
    h += (r % 17) - 8;
    const pages = book.pages ?? 8;
    const w = book.featured ? 66 : Math.max(26, Math.min(46, Math.round(24 + pages * 1.3)));
    const [hue, sat, lig] = DEPARTMENTS[department(book, shelfId)];
    const color = `hsl(${hue + ((r >> 5) % 13) - 6} ${sat}% ${lig + ((r >> 9) % 11) - 5}%)`;
    return `--h:${h}px;--w:${w}px;--c:${color}`;
  }

  function chipKey(book, shelfId) {
    return department(book, shelfId);
  }

  function renderShelves(shelves) {
    if (!shelves.length || shelves.every((s) => !s.books.length)) {
      el.bookcase.innerHTML = '<p class="empty-room">The shelves are empty — nothing is listed in collections/collection.json yet.</p>';
      return;
    }
    // Paris and Copenhagen are two books each; they share the top shelf with a
    // bookend between them rather than getting a nearly empty shelf apiece.
    const small = shelves.filter((s) => s.books.length && s.books.length <= 3);
    const big = shelves.filter((s) => s.books.length > 3);
    const rows = [];
    if (small.length) rows.push(small);
    for (const s of big) rows.push([s]);

    el.bookcase.innerHTML = rows
      .map((group) => {
        const label = group.map((s) => esc(s.label)).join('<span aria-hidden="true"> · </span>');
        const spines = group
          .map((shelf, gi) => {
            const books = [...shelf.books].sort((a, b) =>
              a.featured !== b.featured ? (a.featured ? -1 : 1) : a.course.localeCompare(b.course) || a.title.localeCompare(b.title),
            );
            const html = books
              .map((b, i) => {
                BOOKS.set(b.id, { ...b, shelfId: shelf.id });
                // The last book of a run leans on the bookend, like real shelves.
                const tilt = i === books.length - 1 && books.length > 2 ? '--tilt:4deg;' : '';
                return (
                  `<button type="button" class="book${b.featured ? ' thesis' : ''}" data-id="${esc(b.id)}" data-dept="${chipKey(b, shelf.id)}"` +
                  ` style="${spineStyle(b, shelf.id)};${tilt}" aria-label="${esc(b.title)} — ${esc(b.course)}, ${esc(b.kind)}">` +
                  `<span class="book-title">${esc(b.title)}</span><span class="book-course">${esc(b.course)}</span></button>`
                );
              })
              .join('');
            return (gi > 0 ? '<span class="bookend" aria-hidden="true"></span>' : '') + html;
          })
          .join('');
        return (
          `<div class="shelf"><p class="shelf-label">${label}</p>` +
          `<div class="shelf-row"><span class="bookend" aria-hidden="true"></span>${spines}<span class="bookend" aria-hidden="true"></span></div>` +
          `<div class="shelf-board" aria-hidden="true"></div></div>`
        );
      })
      .join('');
  }

  function renderChips() {
    const depts = new Map();
    for (const b of BOOKS.values()) {
      const d = chipKey(b, b.shelfId);
      depts.set(d, (depts.get(d) || 0) + 1);
    }
    const order = ['IFP', 'UCPH', 'LACS', 'POLI', 'INTD', 'HISP', 'HIST', 'SOCI'];
    const keys = [...depts.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    el.chips.innerHTML =
      `<button type="button" class="chip" data-dept="" aria-pressed="true">All <span class="count">${BOOKS.size}</span></button>` +
      keys.map((k) => `<button type="button" class="chip" data-dept="${k}" aria-pressed="false">${k} <span class="count">${depts.get(k)}</span></button>`).join('');
    el.chips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const dept = chip.dataset.dept;
      el.chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      el.bookcase.querySelectorAll('.book').forEach((b) => b.classList.toggle('dim', Boolean(dept) && b.dataset.dept !== dept));
    });
  }

  function renderThesis(book) {
    if (!book) return;
    const size = book.file?.bytes ? ` <small>${(book.file.bytes / 1048576).toFixed(1)} MB</small>` : '';
    el.thesis.innerHTML =
      (book.cover ? `<img src="${book.cover}" alt="First page of the thesis" loading="lazy">` : '<div></div>') +
      `<div><p class="eyebrow">The thesis · ${esc(book.kind)}</p>` +
      `<h3 id="thesisTitle">${esc(book.title)}</h3>` +
      (book.subtitle ? `<p class="sub">${esc(book.subtitle)}</p>` : '') +
      (book.blurb ? `<p class="blurb">${esc(book.blurb)}</p>` : '') +
      `<div class="actions">` +
      (book.file ? `<a class="btn gold" href="${book.file.url}" download>Download the full thesis${size}</a>` : '') +
      (book.file ? `<a class="btn quiet" href="${book.file.url}" target="_blank" rel="noopener">Read online · ${book.pages ?? ''} pages</a>` : '') +
      `<a class="btn quiet" href="#maps" data-maps>Open the map room</a>` +
      `</div></div>`;
    el.thesis.hidden = false;
  }

  // ------------------------------------------------------------ peek & desk --

  function showPeek(btn) {
    const b = BOOKS.get(btn.dataset.id);
    if (!b) return;
    el.peek.querySelector('b').textContent = b.title;
    el.peek.querySelector('span').textContent = [b.course, b.kind, b.pages ? `${b.pages} pages` : ''].filter(Boolean).join(' · ');
    el.peek.classList.add('show');
    // Measure after the text is in, then sit the card just above the lifted
    // spine (the lift is 46% of the book's height, set in collections.css).
    const r = btn.getBoundingClientRect();
    const lift = r.height * 0.46;
    const pw = el.peek.offsetWidth;
    const ph = el.peek.offsetHeight;
    let left = r.left + r.width / 2 - pw / 2 + window.scrollX;
    left = Math.max(8 + window.scrollX, Math.min(left, window.scrollX + document.documentElement.clientWidth - pw - 8));
    el.peek.style.left = `${left}px`;
    el.peek.style.top = `${r.top + window.scrollY - lift - ph - 10}px`;
  }
  const hidePeek = () => el.peek.classList.remove('show');

  function openDesk(id) {
    const b = BOOKS.get(id);
    if (!b) return;
    el.deskTitle.textContent = b.title;
    el.deskMeta.textContent = [b.course, b.kind, b.pages ? `${b.pages} pages` : '', b.lang === 'fr' ? 'en français' : ''].filter(Boolean).join(' · ');
    el.deskBlurb.textContent = b.blurb || (b.subtitle ?? '');
    el.deskCover.src = b.cover || '';
    el.deskCover.hidden = !b.cover;
    el.deskCover.classList.toggle('map', !b.file && b.mapsLink);
    el.deskCover.alt = b.cover ? `First page of ${b.title}` : '';
    const acts = [];
    if (b.file) {
      acts.push(`<a class="btn" href="${b.file.url}" target="_blank" rel="noopener">Read</a>`);
      acts.push(`<a class="btn quiet" href="${b.file.url}" download>Download PDF <small>${Math.max(1, Math.round(b.file.bytes / 1024))} KB</small></a>`);
    }
    if (b.extra) acts.push(`<a class="btn quiet" href="${b.extra.url}" target="_blank" rel="noopener">${esc(b.extra.label)}</a>`);
    if (b.mapsLink) acts.push(`<a class="btn quiet" href="#maps" data-maps>${b.file ? 'The maps' : 'Open the map room'}</a>`);
    el.deskActions.innerHTML = acts.join('');
    history.replaceState(null, '', `#book=${encodeURIComponent(id)}`);
    if (!el.desk.open) el.desk.showModal();
  }

  function wireShelf() {
    el.bookcase.addEventListener('pointerover', (e) => {
      const btn = e.target.closest('.book');
      if (btn && e.pointerType === 'mouse') showPeek(btn);
    });
    el.bookcase.addEventListener('pointerout', (e) => {
      if (e.target.closest('.book') && !e.relatedTarget?.closest?.('.book')) hidePeek();
    });
    el.bookcase.addEventListener('focusin', (e) => {
      const btn = e.target.closest('.book');
      if (btn) showPeek(btn);
    });
    el.bookcase.addEventListener('focusout', hidePeek);
    el.bookcase.addEventListener('click', (e) => {
      const btn = e.target.closest('.book');
      if (!btn) return;
      hidePeek();
      openDesk(btn.dataset.id);
    });
    on(window, 'scroll', hidePeek, { passive: true });

    el.desk.addEventListener('click', (e) => {
      if (e.target === el.desk || e.target.closest('[data-close]')) el.desk.close();
    });
    el.desk.addEventListener('close', () => {
      if (location.hash.startsWith('#book=')) history.replaceState(null, '', location.pathname);
    });
    on(document, 'click', (e) => {
      const link = e.target.closest('[data-maps]');
      if (!link) return;
      e.preventDefault();
      if (el.desk.open) el.desk.close();
      el.maps.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // --------------------------------------------------------------- map room --

  const view = { s: 1, x: 0, y: 0, fit: 1, iw: 1, ih: 1, atFit: true };
  const pointers = new Map();
  let pinch = null;

  function applyView() {
    el.img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    el.zoom.textContent = `${Math.round((view.s / view.fit) * 100)}%`;
  }

  function fitView() {
    const W = el.stage.clientWidth;
    const H = el.stage.clientHeight;
    if (!W || !H) return;
    view.fit = Math.min(W / view.iw, H / view.ih) * 0.96;
    view.s = view.fit;
    view.x = (W - view.iw * view.s) / 2;
    view.y = (H - view.ih * view.s) / 2;
    view.atFit = true;
    applyView();
  }

  function zoomAt(factor, cx, cy) {
    const next = Math.min(view.fit * 10, Math.max(view.fit * 0.6, view.s * factor));
    const k = next / view.s;
    view.x = cx - (cx - view.x) * k;
    view.y = cy - (cy - view.y) * k;
    view.s = next;
    view.atFit = false;
    applyView();
  }

  function stagePoint(e) {
    const r = el.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function wireMap() {
    el.stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = stagePoint(e);
      zoomAt(Math.exp(-e.deltaY * 0.0016), p.x, p.y);
    }, { passive: false });

    el.stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.map-controls')) return;
      el.stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, stagePoint(e));
      el.stage.classList.add('dragging');
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      }
    });
    el.stage.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const now = stagePoint(e);
      pointers.set(e.pointerId, now);
      if (pointers.size === 1) {
        view.x += now.x - prev.x;
        view.y += now.y - prev.y;
        view.atFit = false;
        applyView();
      } else if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        view.x += m.x - pinch.m.x;
        view.y += m.y - pinch.m.y;
        zoomAt(d / pinch.d, m.x, m.y);
        pinch = { d, m };
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) el.stage.classList.remove('dragging');
    };
    el.stage.addEventListener('pointerup', end);
    el.stage.addEventListener('pointercancel', end);
    el.stage.addEventListener('dblclick', (e) => {
      const p = stagePoint(e);
      zoomAt(2, p.x, p.y);
    });
    el.stage.addEventListener('keydown', (e) => {
      const c = { x: el.stage.clientWidth / 2, y: el.stage.clientHeight / 2 };
      const step = 50;
      const keys = {
        '+': () => zoomAt(1.4, c.x, c.y), '=': () => zoomAt(1.4, c.x, c.y), '-': () => zoomAt(1 / 1.4, c.x, c.y),
        0: fitView, ArrowLeft: () => { view.x += step; }, ArrowRight: () => { view.x -= step; },
        ArrowUp: () => { view.y += step; }, ArrowDown: () => { view.y -= step; },
      };
      if (!keys[e.key]) return;
      e.preventDefault();
      keys[e.key]();
      applyView();
    });
    el.stage.querySelector('.map-controls').addEventListener('click', (e) => {
      const z = e.target.closest('button')?.dataset.z;
      if (!z) return;
      const c = { x: el.stage.clientWidth / 2, y: el.stage.clientHeight / 2 };
      if (z === 'in') zoomAt(1.5, c.x, c.y);
      else if (z === 'out') zoomAt(1 / 1.5, c.x, c.y);
      else fitView();
    });
    const ro = new ResizeObserver(() => { if (view.atFit) fitView(); });
    ro.observe(el.stage);
    cleanups.push(() => ro.disconnect());
  }

  // The map images are up to 1.6 MB each: fetch one when the map room comes
  // near the screen, not with the bookshelf (a phone reading one essay never pays for it).
  let mapNear = typeof IntersectionObserver !== 'function';
  let pendingSrc = null;
  const setMapSrc = (url) => { if (mapNear) el.img.src = url; else pendingSrc = url; };

  function showLayer(layer, tabs) {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.id === layer.id)));
    el.img.onload = () => {
      view.iw = el.img.naturalWidth;
      view.ih = el.img.naturalHeight;
      el.img.style.width = `${view.iw}px`;
      el.img.style.height = `${view.ih}px`;
      fitView();
    };
    setMapSrc(layer.url);
    el.img.alt = `${layer.title} — ${layer.caption}`;
    el.download.href = `${layer.url}`;
    el.download.textContent = `Download · ${Math.max(1, Math.round(layer.bytes / 1024))} KB`;

    let legend = '';
    if (layer.legend?.length) {
      const max = Math.max(...layer.legend.map((l) => l.share));
      legend =
        '<ol class="legend" aria-label="Share of nodes by channel">' +
        layer.legend
          .map(
            (l) =>
              `<li><span class="sw" style="background:${esc(l.color)}"></span><span class="nm">${esc(l.label)}</span>` +
              `<span class="pc">${l.share.toLocaleString(undefined, { maximumFractionDigits: 2 })}%</span>` +
              `<span class="bar"><i style="width:${(l.share / max) * 100}%;background:${esc(l.color)}"></i></span></li>`,
          )
          .join('') +
        '</ol>';
    }
    el.info.innerHTML =
      `<h4>${esc(layer.title)}</h4><p class="source">${esc(layer.source)}</p><p>${esc(layer.caption)}</p>${legend}`;
  }

  function renderMaps(maps) {
    if (!maps?.layers?.length) return;
    el.mapsTitle.textContent = maps.title;
    el.mapsIntro.textContent = maps.intro;
    el.tabs.innerHTML = maps.layers
      .map((l) => `<button type="button" role="tab" class="layer-tab" data-id="${esc(l.id)}" aria-selected="false">${esc(l.title)}<small>${esc(l.source)}</small></button>`)
      .join('');
    const tabs = [...el.tabs.querySelectorAll('.layer-tab')];
    el.tabs.addEventListener('click', (e) => {
      const t = e.target.closest('.layer-tab');
      if (t) showLayer(maps.layers.find((l) => l.id === t.dataset.id), tabs);
    });
    el.maps.hidden = false;
    wireMap();
    if (!mapNear) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        io.disconnect();
        mapNear = true;
        if (pendingSrc) el.img.src = pendingSrc;
      }, { rootMargin: '400px 0px' });
      io.observe(el.maps);
      cleanups.push(() => io.disconnect());
    }
    showLayer(maps.layers[0], tabs);
  }

  // ------------------------------------------------------------------- boot --

  await (async function boot() {
    try {
      const data = await ctx.client.get('/api/collections');
      const uni = data.university;
      el.title.textContent = uni.title;
      el.intro.textContent = uni.intro || '';
      renderShelves(uni.shelves);
      renderThesis(uni.shelves.flatMap((s) => s.books).find((b) => b.featured));
      renderChips();
      wireShelf();
      renderMaps(uni.maps);
      const essays = [...BOOKS.values()].filter((b) => b.file).length;
      el.status.textContent = `${essays} works on the shelves · ${uni.maps.layers.length} maps`;
      const m = location.hash.match(/^#book=(.+)$/);
      if (m) openDesk(decodeURIComponent(m[1]));
      else if (location.hash === '#maps') el.maps.scrollIntoView();
    } catch (err) {
      el.bookcase.innerHTML = '<p class="empty-room">Could not load the shelves.</p>';
      el.status.textContent = 'lost the tower — try again in a moment';
      el.status.style.color = 'var(--live)';
    }
  })();

  return () => cleanups.forEach((f) => f());
}
