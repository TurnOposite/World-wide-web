/**
 * Crates: the station's library as record sleeves, sorted into the same
 * content categories the player shows (server/lib/genre.js), grouped by album.
 *
 * Deliberately NOT a jukebox (BRIEF.md: "synced station, not a jukebox —
 * nobody picks tracks"). There is no play button here. What a crate offers
 * instead is the one thing a radio can promise: when each track is next on
 * air, read from the same pure-function-of-time schedule the player uses.
 *
 * Data: /api/library (what exists), /api/schedule over the next 48h (when it
 * plays), /api/collections (hand-picked covers and notes for some crates).
 */

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fold = (s) => String(s ?? '').normalize('NFKC').toLowerCase().trim();

const el = {
  title: $('roomTitle'), intro: $('roomIntro'), chips: $('catChips'), cats: $('categories'), status: $('statusLine'),
  desk: $('crateDesk'), cover: $('crateCover'), dTitle: $('crateTitle'), meta: $('crateMeta'), note: $('crateNote'), tracks: $('crateTracks'),
};

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const LOOSE = '\u0000loose';

let crates = [];
let nextById = new Map();

function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** "now", "21:40", "Thu 09:15" — relative to the viewer's own clock. */
function fmtNext(slot) {
  if (!slot) return null;
  const now = Date.now();
  if (slot.startsAt <= now && now < slot.endsAt) return { text: 'on air now', now: true };
  const d = new Date(slot.startsAt);
  const sameDay = new Date().toDateString() === d.toDateString();
  return { text: `next ${sameDay ? '' : dayFmt.format(d) + ' '}${timeFmt.format(d)}`, now: false };
}

function buildCrates(tracks, picks) {
  const byKey = new Map();
  for (const t of tracks) {
    const cat = t.genreLabel || 'Unsorted';
    const album = t.album && t.album.trim() ? t.album.trim() : LOOSE;
    const key = `${cat}\u0001${album === LOOSE ? LOOSE : fold(album)}`;
    if (!byKey.has(key)) byKey.set(key, { key, category: cat, accent: t.genreAccent ?? 210, album, tracks: [] });
    byKey.get(key).tracks.push(t);
  }
  const out = [];
  for (const c of byKey.values()) {
    const artists = new Map();
    for (const t of c.tracks) artists.set(t.artist, (artists.get(t.artist) || 0) + 1);
    c.artist = c.album === LOOSE ? `${artists.size} artist${artists.size === 1 ? '' : 's'}` : [...artists.entries()].sort((a, b) => b[1] - a[1])[0][0];
    c.title = c.album === LOOSE ? `Loose tracks` : c.album;
    c.tracks.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    const pick = picks.find((p) => p.match?.album && c.album !== LOOSE && fold(c.album).includes(fold(p.match.album)));
    c.note = pick?.note || '';
    const withArt = c.tracks.find((t) => t.hasArt);
    c.cover = pick?.cover || (withArt ? `/api/track/${withArt.id}/art` : null);
    c.id = pick?.id || c.key.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    out.push(c);
  }
  // Categories by size, albums before loose tracks, then by title.
  const catSize = new Map();
  for (const c of out) catSize.set(c.category, (catSize.get(c.category) || 0) + c.tracks.length);
  out.sort(
    (a, b) =>
      catSize.get(b.category) - catSize.get(a.category) ||
      a.category.localeCompare(b.category) ||
      (a.album === LOOSE) - (b.album === LOOSE) ||
      a.title.localeCompare(b.title),
  );
  return out;
}

function crateNext(c) {
  let best = null;
  for (const t of c.tracks) {
    const s = nextById.get(t.id);
    if (s && (!best || s.startsAt < best.startsAt)) best = s;
  }
  return best;
}

function sleeveHtml(c) {
  const initials = c.title.split(/\s+/).slice(0, 3).map((w) => w[0]).join('').toUpperCase();
  const cover = c.cover
    ? `<img src="${esc(c.cover)}" alt="" loading="lazy" decoding="async">`
    : `<span class="gen" style="background:linear-gradient(145deg,hsl(${c.accent} 45% 32%),hsl(${(c.accent + 40) % 360} 50% 16%))">${esc(c.album === LOOSE ? c.category : initials)}</span>`;
  const next = fmtNext(crateNext(c));
  return (
    `<button type="button" class="sleeve" data-id="${esc(c.id)}" data-cat="${esc(c.category)}" style="--label:hsl(${c.accent} 70% 58%)">` +
    `<span class="sleeve-art"><span class="disc" aria-hidden="true"></span><span class="cover">${cover}</span></span>` +
    `<span class="s-title">${esc(c.title)}</span><span class="s-artist">${esc(c.artist)} · ${c.tracks.length} track${c.tracks.length === 1 ? '' : 's'}</span>` +
    (next ? `<span class="s-next${next.now ? ' now' : ''}">${esc(next.text)}</span>` : '<span class="s-next" style="color:var(--text-faint)">later this cycle</span>') +
    `</button>`
  );
}

function render(music) {
  el.title.textContent = music.title;
  el.intro.textContent = music.intro;
  if (!crates.length) {
    el.cats.innerHTML = '<p class="empty-room">The library is empty, or still being scanned.</p>';
    return;
  }
  const cats = [...new Set(crates.map((c) => c.category))];
  el.cats.innerHTML = cats
    .map((cat) => {
      const list = crates.filter((c) => c.category === cat);
      const n = list.reduce((s, c) => s + c.tracks.length, 0);
      return (
        `<section class="category" data-cat="${esc(cat)}" aria-label="${esc(cat)}">` +
        `<div class="category-head"><h3>${esc(cat)}</h3><span class="count">${n} tracks</span></div>` +
        `<div class="crate-row">${list.map(sleeveHtml).join('')}</div></section>`
      );
    })
    .join('');
  el.chips.innerHTML =
    `<button type="button" class="chip" data-cat="" aria-pressed="true">All</button>` +
    cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('');
  const total = crates.reduce((s, c) => s + c.tracks.length, 0);
  el.status.textContent = `${total} tracks in ${crates.filter((c) => c.album !== LOOSE).length} albums across ${cats.length} categories`;
}

function openCrate(id) {
  const c = crates.find((x) => x.id === id);
  if (!c) return;
  el.dTitle.textContent = c.title;
  el.meta.textContent = `${c.artist} · ${c.category} · ${c.tracks.length} tracks · ${fmtDuration(c.tracks.reduce((s, t) => s + t.duration, 0))}`;
  el.note.textContent = c.note;
  el.cover.hidden = !c.cover;
  if (c.cover) el.cover.src = c.cover;
  el.tracks.innerHTML = c.tracks
    .map((t) => {
      const n = fmtNext(nextById.get(t.id));
      const when = n ? (n.now ? '<span class="onair-tag">now</span>' : esc(n.text.replace('next ', ''))) : '—';
      return `<li class="${n?.now ? 'now' : ''}"><span class="idx">${when}</span><span class="t">${esc(t.title)}</span><span class="d">${fmtDuration(t.duration)}</span></li>`;
    })
    .join('');
  if (!el.desk.open) el.desk.showModal();
}

async function loadSchedule() {
  const from = new Date(Date.now() - 2 * 3600_000).toISOString();
  const to = new Date(Date.now() + 46 * 3600_000).toISOString();
  const res = await fetch(`/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: 'no-store' });
  const data = await res.json();
  const now = Date.now();
  nextById = new Map();
  for (const it of data.items || []) {
    if (it.endsAt <= now) continue; // already played
    if (!nextById.has(it.id)) nextById.set(it.id, { startsAt: it.startsAt, endsAt: it.endsAt });
  }
}

function wire() {
  el.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    el.chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    el.cats.querySelectorAll('.category').forEach((s) => { s.hidden = Boolean(chip.dataset.cat) && s.dataset.cat !== chip.dataset.cat; });
  });
  el.cats.addEventListener('click', (e) => {
    const s = e.target.closest('.sleeve');
    if (s) openCrate(s.dataset.id);
  });
  el.desk.addEventListener('click', (e) => {
    if (e.target === el.desk || e.target.closest('[data-close]')) el.desk.close();
  });
}

(async function boot() {
  wire();
  try {
    const [col, lib] = await Promise.all([
      fetch('/api/collections', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('/api/library?limit=500', { cache: 'no-store' }).then((r) => r.json()),
      loadSchedule().catch(() => {}),
    ]);
    crates = buildCrates(lib.items || [], col.music?.crates || []);
    render(col.music);
    // The programme moves; keep the "next" times honest without a reload.
    setInterval(async () => {
      try {
        await loadSchedule();
        el.cats.querySelectorAll('.sleeve').forEach((node) => {
          const c = crates.find((x) => x.id === node.dataset.id);
          if (c) node.outerHTML = sleeveHtml(c);
        });
      } catch { /* keep the last good times */ }
    }, 60_000);
  } catch {
    el.cats.innerHTML = '<p class="empty-room">Could not reach the tower to fetch the crates.</p>';
    el.status.textContent = 'lost the tower — try again in a moment';
  }
})();
