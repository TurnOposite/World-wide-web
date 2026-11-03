/**
 * Ported from public/library.js (2026-09-26): mounted into the site's <main> instead
 * of owning a page, listeners removed on navigation, data through the station
 * client so it works on the Pi and on the static site alike.
 *
 * The Library: a close-up bookshelf of essays, the thesis, the Livre miroir, and under the bookcase the
 * map table (ui/map-table.js, 2026-11-03 evening: the map room as a table seen in the shelves'
 * perspective, the maps on it in small format under a loupe). The thesis, clicked, opens on its card —
 * the boxed notice that stood between the shelf and the map room until then — instead of the desk.
 *
 * Everything on this page comes from GET /api/collections (the manifest in
 * collections/collection.json). The case is seen a little from the side
 * (2026-10-09), so each book is a real volume: a spine, a page block on top,
 * and a front cover turned slightly toward the reader — height from the kind
 * of work, thickness from the page count, leather from the department, and a
 * cover drawn from what the essay is about (site/js/ui/covers.js). Under the
 * pointer a book slides out of the row and turns its cover to face you.
 * rooms.css does the 3D; this file builds the volumes and positions the peek
 * card that carries the full title.
 */
import { esc } from '../../ui/util.js';
import { coverArt } from '../../ui/covers.js';
import { MIRROR, mirrorBook, mirrorHtml, openMirror } from '../../ui/mirror-book.js';
import { mountMapTable } from '../../ui/map-table.js';

const TEMPLATE = `<div class="room-head">
    <h2 id="libTitle">The Library</h2>
    <div class="chips" id="courseChips" role="group" aria-label="Filter by class"></div>
  </div>

  <section class="bookcase" id="bookcase" aria-label="Bookshelf">
    <p class="empty-room" id="shelfEmpty">Loading the shelves…</p>
  </section>

  <section class="maptable" id="maps" aria-labelledby="mapsTitle" hidden>
    <h3 class="mt-title" id="mapsTitle">The map room</h3>
  </section>
<dialog class="desk thesis-desk" id="thesisDesk" aria-labelledby="thesisTitle">
  <button class="close-x" type="button" data-close aria-label="Close">✕</button>
  <section class="thesis-card" id="thesisCard"></section>
</dialog>
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
    title: $('libTitle'), chips: $('courseChips'),
    thesis: $('thesisCard'), thesisDesk: $('thesisDesk'), bookcase: $('bookcase'), status: $('statusLine'),
    desk: $('desk'), deskCover: $('deskCover'), deskTitle: $('deskTitle'), deskMeta: $('deskMeta'),
    deskBlurb: $('deskBlurb'), deskActions: $('deskActions'), peek: $('peek'),
    maps: $('maps'), mapsTitle: $('mapsTitle'),
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

  /** A book's size, leather and resting angle — stable for a given id. */
  function volume(book, shelfId) {
    const r = hash(book.id);
    const kind = book.kind.toLowerCase();
    let h =
      book.featured ? 286
      : /slides/.test(kind) ? 214
      : /final|research|thesis|exam/.test(kind) ? 252
      : /short|response|memo|midterm/.test(kind) ? 222
      : 238;
    h += (r % 15) - 7;
    const pages = Number(book.pages) || 8;
    const t = book.featured ? 50 : Math.max(20, Math.min(40, Math.round(17 + pages * 1.5)));
    const d = Math.round(h * 0.7);
    const [hue, sat, lig] = DEPARTMENTS[department(book, shelfId)];
    const hh = hue + ((r >> 5) % 13) - 6;
    const ll = lig + ((r >> 9) % 9) - 4;
    const turn = -(20 + ((r >> 3) % 9));
    return { h, t, d, turn, color: `hsl(${hh} ${sat}% ${ll}%)`, deep: `hsl(${hh} ${sat}% ${Math.max(8, ll - 12)}%)`, ink: `hsl(${hh} 30% 90%)` };
  }

  /**
   * How a cover is laid out (2026-11-03, « the front covers stylized »): a gilt frame with corner
   * fleurons, a band across the top in a darker cloth, or a paper label pasted on — one per book,
   * stable for its id, so a shelf reads as a real run of editions rather than one template.
   */
  const BINDINGS = ['cv-framed', 'cv-band', 'cv-label'];
  const binding = (b) => (b.featured ? 'cv-framed' : BINDINGS[(hash(b.id) >> 11) % BINDINGS.length]);

  function bookHtml(b, shelfId, { lean = false, faceOut = false } = {}) {
    const v = volume(b, shelfId);
    const featured = b.featured;
    const acc = '#d9b45a';
    const ink = featured ? '#efe3c2' : v.ink;
    const style = `--h:${v.h}px;--t:${v.t}px;--d:${v.d}px;--turn:${v.turn}deg;--c:${featured ? '#171513' : v.color};--c2:${featured ? '#0b0a09' : v.deep}` + (lean ? ';--lean:3.5deg' : '');
    return (
      `<button type="button" class="book${featured ? ' thesis' : ''}${faceOut ? ' face-out' : ''}" data-id="${esc(b.id)}" data-dept="${chipKey(b, shelfId)}" style="${style}" aria-label="${esc(b.title)} — ${esc(b.course)}, ${esc(b.kind)}">` +
      `<span class="b3d" aria-hidden="true">` +
      `<span class="bf spine"><span class="book-title">${esc(b.title)}</span><span class="book-course">${esc(b.course)}</span></span>` +
      `<span class="bf bcover ${binding(b)}"><span class="cv-title">${esc(b.title)}</span><span class="cv-art">${coverArt(b.id, b.kind, { ink, acc })}</span><span class="cv-meta">${esc(b.course)}</span></span>` +
      `<span class="bf top"></span>` +
      `</span><span class="slot" aria-hidden="true"></span></button>`
    );
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

    // One piece of furniture (Ortis, 2026-10-13): every shelf takes the depth
    // and height of the deepest and tallest book in the whole case, so the
    // boards and the back line up instead of reading as separate strips.
    let depth = 0;
    let tallest = 0;
    el.bookcase.innerHTML = rows
      .map((group, ri) => {
        const label = group.map((s) => esc(s.label)).join('<span aria-hidden="true"> · </span>');
        // The thesis stands face-out at the end of its shelf, the way a shop
        // shows the book it is proudest of; everything else is spine-out.
        const faceOut = [];
        // The Livre miroir (2026-11-03) stands on the top shelf on its own, before the thesis.
        const mirror = ri === 0 ? mirrorHtml() : '';
        if (mirror) {
          BOOKS.set(MIRROR, mirrorBook);
          depth = Math.max(depth, mirrorBook.d);
          tallest = Math.max(tallest, mirrorBook.h);
        }
        const spines = group
          .map((shelf, gi) => {
            const books = [...shelf.books].sort((a, b) => a.course.localeCompare(b.course) || a.title.localeCompare(b.title));
            const rowBooks = books.filter((b) => !b.featured);
            const html = books
              .map((b) => {
                BOOKS.set(b.id, { ...b, shelfId: shelf.id });
                const v = volume(b, shelf.id);
                depth = Math.max(depth, v.d);
                tallest = Math.max(tallest, v.h);
                if (b.featured) { faceOut.push(bookHtml(b, shelf.id, { faceOut: true })); return ''; }
                // The last book of a run leans on the bookend, like real shelves.
                const i = rowBooks.indexOf(b);
                return bookHtml(b, shelf.id, { lean: i === rowBooks.length - 1 && rowBooks.length > 2 });
              })
              .join('');
            return (gi > 0 ? '<span class="bookend" aria-hidden="true"></span>' : '') + html;
          })
          .join('');
        // Each shelf is drawn as its own 3D layer; the one above paints over
        // the one below, so a shelf's back panel can reach up behind the
        // board above it without hiding it. The label is on the board's edge.
        return (
          `<div class="shelf" style="z-index:${rows.length - ri}">` +
          `<div class="shelf-3d">` +
          `<div class="case-back" aria-hidden="true"></div><div class="case-side" aria-hidden="true"></div>` +
          `<div class="shelf-row"><span class="bookend" aria-hidden="true"></span>${spines}<span class="bookend" aria-hidden="true"></span>${mirror}${faceOut.join('')}</div>` +
          `<div class="board-top" aria-hidden="true"></div><div class="board-front"><p class="shelf-label" data-label="${ri}">${label}</p></div>` +
          `</div></div>`
        );
      })
      .join('');
    el.bookcase.style.setProperty('--dmax', `${depth}px`);
    el.bookcase.style.setProperty('--hmax', `${tallest}px`);
    rebalance(rows);
  }

  /**
   * A shelf holds what fits on it (2026-11-03): in a narrower window the long McGill run used to run off
   * the case's edge. The books that do not fit move up to the top shelf, beside the Livre miroir, and the
   * top shelf's label says whose they are. Phones scroll their shelves sideways instead (rooms.css).
   */
  function rebalance(rows) {
    if (rows.length < 2 || window.matchMedia('(max-width: 760px)').matches) return;
    const shelves = [...el.bookcase.querySelectorAll('.shelf-row')];
    const top = shelves[0];
    const anchor = top.querySelector('.book.mirror') || top.querySelector('.book.face-out');
    // The face-out thesis pushes itself right with margin-left:auto: count its box, not the free space it takes.
    const used = (row) => [...row.children].reduce((sum, c) => {
      const cs = getComputedStyle(c);
      const left = c.classList.contains('face-out') ? 0 : parseFloat(cs.marginLeft);
      return sum + c.offsetWidth + left + parseFloat(cs.marginRight);
    }, 0);
    const room = (row) => row.clientWidth - parseFloat(getComputedStyle(row).paddingLeft) - parseFloat(getComputedStyle(row).paddingRight) - 6;
    const moved = new Map();
    let insertAt = null;
    for (let i = shelves.length - 1; i >= 1; i--) {
      const row = shelves[i];
      while (used(row) > room(row)) {
        const books = [...row.querySelectorAll('.book:not(.face-out)')];
        const last = books[books.length - 1];
        if (!last || books.length < 4) break;
        const w = last.offsetWidth + 6;
        if (used(top) + w > room(top)) break;
        if (!insertAt) {
          // the moved run gets its own bookend, so the Livre miroir still stands apart
          insertAt = Object.assign(document.createElement('span'), { className: 'bookend' });
          insertAt.setAttribute('aria-hidden', 'true');
          top.insertBefore(insertAt, anchor);
        }
        top.insertBefore(last, insertAt);
        insertAt = last;
        last.style.removeProperty('--lean');
        const shelfLabel = rows[i].map((s) => s.label.split(' · ')[0].split(' ')[0]).join(' · ');
        moved.set(shelfLabel, (moved.get(shelfLabel) || 0) + 1);
      }
      // The new last book of the run leans on the bookend again.
      const run = [...row.querySelectorAll('.book:not(.face-out)')];
      run.forEach((b, k) => { if (k === run.length - 1 && run.length > 2) b.style.setProperty('--lean', '3.5deg'); });
    }
    if (moved.size) {
      const label = el.bookcase.querySelector('[data-label="0"]');
      label.insertAdjacentHTML('beforeend', [...moved.keys()].map((k) => `<span aria-hidden="true"> · </span>${esc(k)} (suite)`).join(''));
    }
  }

  function renderChips() {
    const depts = new Map();
    for (const b of BOOKS.values()) {
      if (b.mirror) continue;
      const d = chipKey(b, b.shelfId);
      depts.set(d, (depts.get(d) || 0) + 1);
    }
    const order = ['IFP', 'UCPH', 'LACS', 'POLI', 'INTD', 'HISP', 'HIST', 'SOCI'];
    const keys = [...depts.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    el.chips.innerHTML =
      `<button type="button" class="chip" data-dept="" aria-pressed="true">All <span class="count">${[...BOOKS.values()].filter((b) => !b.mirror).length}</span></button>` +
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
    // The cover and the title open the thesis to read, like every book on the
    // shelf opens (Ortis, 2026-10-13: "nothing happens" when clicked).
    const read = (inner, cls, label = '') => (book.file
      ? `<a class="${cls}" href="${book.file.url}" target="_blank" rel="noopener"${label ? ` aria-label="${label}"` : ''}>${inner}</a>`
      : inner);
    const cover = book.cover ? `<img src="${book.cover}" alt="First page of the thesis" loading="lazy">` : '';
    el.thesis.innerHTML =
      (cover ? read(cover, 'thesis-cover', 'Read the thesis online') : '<div></div>') +
      `<div><p class="eyebrow">The thesis · ${esc(book.kind)}</p>` +
      `<h3 id="thesisTitle">${read(esc(book.title), 'thesis-read')}</h3>` +
      (book.subtitle ? `<p class="sub">${esc(book.subtitle)}</p>` : '') +
      (book.blurb ? `<p class="blurb">${esc(book.blurb)}</p>` : '') +
      `<div class="actions">` +
      (book.file ? `<a class="btn gold" href="${book.file.url}" download>Download the full thesis${size}</a>` : '') +
      (book.file ? `<a class="btn quiet" href="${book.file.url}" target="_blank" rel="noopener">Read online · ${book.pages ?? ''} pages</a>` : '') +
      `<a class="btn quiet" href="#maps" data-maps>The maps, on the table</a>` +
      `</div></div>`;
  }

  /** The thesis opens on its card, in the Gazette's boxed notice, not on the desk (Ortis, 2026-11-03). */
  function openThesis(id) {
    if (!el.thesis.innerHTML) return;
    history.replaceState(null, '', `#book=${encodeURIComponent(id)}`);
    if (!el.thesisDesk.open) el.thesisDesk.showModal();
  }

  // ------------------------------------------------------------ peek & desk --

  function showPeek(btn) {
    const b = BOOKS.get(btn.dataset.id);
    if (!b) return;
    el.peek.querySelector('b').textContent = b.title;
    el.peek.querySelector('span').textContent = [b.course, b.kind, b.pages ? `${b.pages} pages` : ''].filter(Boolean).join(' · ');
    el.peek.classList.add('show');
    // Measure after the text is in, then sit the card just above the book as
    // drawn (the pulled-out volume, projected), not its flat footprint.
    const r = (btn.querySelector('.b3d') || btn).getBoundingClientRect();
    const lift = 18;
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
    if (b.featured) { openThesis(id); return; }
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
      if (btn.dataset.id === MIRROR) openMirror(btn);
      else openDesk(btn.dataset.id);
    });
    on(window, 'scroll', hidePeek, { passive: true });

    el.desk.addEventListener('click', (e) => {
      if (e.target === el.desk || e.target.closest('[data-close]')) el.desk.close();
    });
    el.thesisDesk.addEventListener('click', (e) => {
      if (e.target === el.thesisDesk || e.target.closest('[data-close]')) el.thesisDesk.close();
    });
    for (const d of [el.desk, el.thesisDesk]) {
      d.addEventListener('close', () => {
        if (location.hash.startsWith('#book=')) history.replaceState(null, '', location.pathname + location.search);
      });
    }
    on(document, 'click', (e) => {
      const link = e.target.closest('[data-maps]');
      if (!link) return;
      e.preventDefault();
      if (el.desk.open) el.desk.close();
      if (el.thesisDesk.open) el.thesisDesk.close();
      el.maps.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // -------------------------------------------------------------- map table --

  let table = null;
  function renderMaps(maps) {
    if (!maps?.layers?.length) return;
    el.mapsTitle.textContent = maps.title;
    el.maps.hidden = false;
    table = mountMapTable(el.maps, maps);
    cleanups.push(() => table.destroy());
  }

  // ------------------------------------------------------------------- boot --

  await (async function boot() {
    try {
      const data = await ctx.client.get('/api/collections');
      const uni = data.university;
      // The intro under the title said how to use the shelf; Ortis took it out (2026-11-03): the shelf says it.
      el.title.textContent = uni.title;
      renderShelves(uni.shelves);
      renderThesis(uni.shelves.flatMap((s) => s.books).find((b) => b.featured));
      renderChips();
      wireShelf();
      renderMaps(uni.maps);
      const essays = [...BOOKS.values()].filter((b) => b.file).length;
      el.status.textContent = `${essays} works on the shelves · ${uni.maps.layers.length} maps`;
      const m = location.hash.match(/^#book=(.+)$/);
      const map = location.hash.match(/^#map=(.+)$/);
      if (location.hash === '#miroir') openMirror(el.bookcase.querySelector('.book.mirror'));
      else if (m) openDesk(decodeURIComponent(m[1]));
      else if (map && table) table.open(decodeURIComponent(map[1]));
      else if (location.hash === '#maps') el.maps.scrollIntoView();
    } catch (err) {
      el.bookcase.innerHTML = '<p class="empty-room">Could not load the shelves.</p>';
      el.status.textContent = 'lost the tower — try again in a moment';
      el.status.style.color = 'var(--live)';
    }
  })();

  cleanups.push(() => openMirror.close?.());
  return () => cleanups.forEach((f) => f());
}
