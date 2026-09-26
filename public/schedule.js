/**
 * Programme guide — "see what plays when, and plan ahead" (roadmap #0b).
 *
 * This is deliberately thin. `GET /api/schedule` already does the only hard
 * part (walking the station clock forward), so this file's whole job is:
 * ask for a window, turn each item's millisecond timestamp into a clock time
 * in the visitor's own timezone, and render a list. No stored state here
 * either — reloading the page, or coming back tomorrow, just asks again.
 */

import { backdropUrlForGenre, backdropUrl, createBackdropSwitcher } from './backdrops.js';

const $ = (id) => document.getElementById(id);

const el = {
  stationName: $('stationName'),
  guide: $('guide'),
  rangeLabel: $('rangeLabel'),
  statusLine: $('statusLine'),
  spanBtns: [...document.querySelectorAll('.span-btn')],
  backdropA: $('backdropA'), backdropB: $('backdropB'),
};

const setBackdrop = createBackdropSwitcher(el.backdropA, el.backdropB);

const STATE = { hours: 6 };

function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function status(text, tone = '') {
  el.statusLine.textContent = text;
  el.statusLine.style.color = tone === 'bad' ? 'var(--live)' : '';
}

async function loadStationName() {
  try {
    const res = await fetch('/api/station', { cache: 'no-store' });
    const data = await res.json();
    if (data?.station?.name) el.stationName.textContent = data.station.name;
  } catch { /* fine, the default heading stays */ }
}

async function loadGuide() {
  status('loading…');
  const now = new Date();
  const from = now.toISOString();
  const to = new Date(now.getTime() + STATE.hours * 3600_000).toISOString();

  try {
    const res = await fetch(`/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`schedule ${res.status}`);
    const data = await res.json();
    render(data);
    status(`ready — updated ${timeFmt.format(new Date())}`);
  } catch (err) {
    el.guide.innerHTML = '<li class="empty">could not load the schedule</li>';
    setBackdrop(backdropUrl('thatbirdominous'));
    status('lost the tower — retrying', 'bad');
  }
}

function render(data) {
  if (!data.items?.length) {
    el.guide.innerHTML = '<li class="empty">nothing scheduled — the library may be empty</li>';
    el.rangeLabel.textContent = '';
    // The empty-panel case this page can actually hit — same quiet-atmosphere
    // treatment as a no-art player card, not the genre map (there is no
    // track to key a genre off).
    setBackdrop(backdropUrl('thatbirdominous'));
    return;
  }

  // Key the page-wide backdrop off the on-air track (items[0]) — the same
  // choice the player page makes for the same track, so the two pages agree.
  setBackdrop(backdropUrlForGenre(data.items[0].genreSlug));

  el.rangeLabel.textContent = `next ${STATE.hours}h`;

  let lastDay = null;
  const rows = data.items.map((item, i) => {
    const start = new Date(item.startsAt);
    const day = dayFmt.format(start);
    const dayHeader = day !== lastDay ? `<li class="guide-day">${esc(day)}</li>` : '';
    lastDay = day;
    const nowBadge = i === 0 ? '<span class="idx guide-now" title="on air now">now</span>' : `<span class="idx">${timeFmt.format(start)}</span>`;
    return `${dayHeader}<li class="${i === 0 ? 'now' : ''}">${nowBadge}<span class="t">${esc(item.title)}</span><span class="a">${esc(item.artist)}</span><span class="d">${fmtDuration(item.duration)}</span></li>`;
  });

  el.guide.innerHTML = rows.join('');
}

el.spanBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    STATE.hours = Number(btn.dataset.hours);
    el.spanBtns.forEach((b) => b.classList.toggle('active', b === btn));
    loadGuide();
  });
});
el.spanBtns.find((b) => Number(b.dataset.hours) === STATE.hours)?.classList.add('active');

(async function boot() {
  await loadStationName();
  await loadGuide();
  setInterval(loadGuide, 60_000);
})();
