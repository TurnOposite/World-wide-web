/**
 * Photos: albums laid out as justified rows, opened in a lightbox.
 *
 * The justified layout is pure CSS (collections.css `.justified`): each tile
 * gets flex-grow in proportion to its aspect ratio, so every row fills the
 * width without cropping anything badly. This file only builds the tiles and
 * drives the lightbox (arrows, keyboard, swipe). The manifest carries each
 * photo's width and height so tiles have their final shape before the image
 * arrives — no layout jump on a slow Pi uplink.
 */

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const el = {
  title: $('roomTitle'), intro: $('roomIntro'), chips: $('albumChips'), albums: $('albums'),
  lb: $('lightbox'), lbImg: $('lbImg'), lbCap: $('lbCap'), status: $('statusLine'),
};

let flat = []; // every photo in page order, for the lightbox to walk
let current = -1;

function render(photos) {
  el.title.textContent = photos.title;
  el.intro.textContent = photos.intro;
  const albums = photos.albums.filter((a) => a.items.length);
  if (!albums.length) {
    el.albums.innerHTML = '<p class="empty-room">No photos listed yet.</p>';
    return;
  }
  flat = [];
  el.albums.innerHTML = albums
    .map((a) => {
      const tiles = a.items
        .map((p) => {
          const i = flat.push({ ...p, album: a.title }) - 1;
          const r = p.w && p.h ? (p.w / p.h).toFixed(4) : 1.3333;
          return (
            `<button type="button" class="ph" style="--r:${r}" data-i="${i}" aria-label="${esc(p.caption || 'Photo')} — open">` +
            `<i></i><img src="${p.thumb}" alt="${esc(p.caption)}" loading="lazy" decoding="async">` +
            (p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : '') +
            `</button>`
          );
        })
        .join('');
      return (
        `<section class="album" id="album-${esc(a.id)}" aria-labelledby="h-${esc(a.id)}">` +
        `<div class="album-head"><h3 id="h-${esc(a.id)}">${esc(a.title)}</h3><p>${esc(a.subtitle)} · ${a.items.length} photos</p></div>` +
        `<div class="justified">${tiles}</div></section>`
      );
    })
    .join('');

  el.chips.innerHTML = albums
    .map((a) => `<a class="chip" href="#album-${esc(a.id)}">${esc(a.title)} <span class="count">${a.items.length}</span></a>`)
    .join('');
  el.status.textContent = `${flat.length} photos in ${albums.length} albums`;
}

function show(i) {
  if (!flat.length) return;
  current = (i + flat.length) % flat.length;
  const p = flat[current];
  el.lbImg.src = p.url;
  el.lbImg.alt = p.caption || '';
  el.lbCap.innerHTML = `<b>${esc(p.caption)}</b> · ${esc(p.album)} · ${current + 1} / ${flat.length}`;
  // Warm the neighbours so arrowing through feels instant.
  for (const d of [1, -1]) new Image().src = flat[(current + d + flat.length) % flat.length].url;
  if (!el.lb.open) el.lb.showModal();
}

function wire() {
  el.albums.addEventListener('click', (e) => {
    const t = e.target.closest('.ph');
    if (t) show(Number(t.dataset.i));
  });
  el.lb.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]')?.dataset.step;
    if (step) return show(current + Number(step));
    if (e.target.closest('[data-close]') || e.target === el.lb || e.target.classList.contains('lb-inner')) el.lb.close();
  });
  el.lb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(current + 1);
    if (e.key === 'ArrowLeft') show(current - 1);
  });
  let x0 = null;
  el.lb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.lb.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    x0 = null;
  });
}

(async function boot() {
  wire();
  try {
    const res = await fetch('/api/collections', { cache: 'no-cache' });
    render((await res.json()).photos);
  } catch {
    el.albums.innerHTML = '<p class="empty-room">Could not reach the tower to fetch the photos.</p>';
    el.status.textContent = 'lost the tower — try again in a moment';
  }
})();
