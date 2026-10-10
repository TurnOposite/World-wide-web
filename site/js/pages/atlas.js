/**
 * /atlas — where things were made, where life happened, and where the signal
 * comes from.
 *
 * No map library, no tiles, no third-party call: an inlined Natural Earth
 * outline on the linear projection x = lon + 180, y = 90 − lat. Europe holds
 * five of the places within a few degrees of each other, so it is drawn a
 * second time, magnified, in the North Atlantic (a cartographer's inset) and
 * its pins live there. The tower's own point pulses with the logo's sideways
 * waves; its position is configuration (config.json → station.origin).
 *
 * Hovering a pin opens a postcard of the city (site/js/ui/postcards.js, or a
 * photo when places.json names one); resting on it unfolds the card into the
 * story of that time and its work — for Novo Hamburgo, the newspaper columns
 * themselves. Click pins a card open; Esc or a click elsewhere puts it away.
 * On a phone the card is a block under the map instead of a floating one.
 *
 * No listener point: a static site has no server-side geo-IP, and the brief
 * forbids guessing ("never guess a location").
 */
import { esc } from '../ui/util.js';
import { postcardSvg } from '../ui/postcards.js';

export const title = 'Atlas';

let WORLD = null;
let PLACES = null;

async function load() {
  const base = document.baseURI;
  if (!WORLD) WORLD = await (await fetch(new URL('data/world.json', base))).json();
  if (!PLACES) PLACES = await (await fetch(new URL('data/places.json', base))).json();
  return { world: WORLD, places: PLACES.places || [] };
}

export const project = (lat, lon) => ({ x: lon + 180, y: 90 - lat });

/** The Atlas page's window on the world: lon −130…150, lat 76…−50. */
export const VIEW = [50, 14, 280, 126];
/** Europe, in projected units, and where its magnified copy sits. */
export const EUROPE = { x: 173, y: 28, w: 29, h: 21 };
export const INSET = { x: 112, y: 22, s: 2 };

export const inEurope = (p) => {
  const { x, y } = project(p.lat, p.lon);
  return x >= EUROPE.x && x <= EUROPE.x + EUROPE.w && y >= EUROPE.y && y <= EUROPE.y + EUROPE.h;
};

/** Where a place is drawn: on the world, or inside the Europe inset. */
export function pinPoint(p) {
  const { x, y } = project(p.lat, p.lon);
  if (!inEurope(p)) return { x, y, inset: false };
  return { x: INSET.x + (x - EUROPE.x) * INSET.s, y: INSET.y + (y - EUROPE.y) * INSET.s, inset: true };
}

let mapSeq = 0;

export function mapSvg(world, places, origin, { compact = false, view = null } = {}) {
  const id = `wm${++mapSeq}`;
  const [vx, vy, vw, vh] = view || (compact ? world.viewBox : VIEW);
  const grid = [];
  for (let x = 60; x < 360; x += 30) grid.push(`<line x1="${x}" y1="${vy}" x2="${x}" y2="${vy + vh}"/>`);
  for (const lat of [66.5, 23.5, 0, -23.5]) { const y = 90 - lat; grid.push(`<line x1="${vx}" y1="${y}" x2="${vx + vw}" y2="${y}"${lat === 0 ? ' class="eq"' : ''}/>`); }

  const iw = EUROPE.w * INSET.s;
  const ih = EUROPE.h * INSET.s;
  const inset = `<g class="eu-lead" aria-hidden="true">
      <rect x="${EUROPE.x}" y="${EUROPE.y}" width="${EUROPE.w}" height="${EUROPE.h}" rx=".6"/>
      <path d="M${INSET.x + iw} ${INSET.y} L${EUROPE.x} ${EUROPE.y} M${INSET.x + iw} ${INSET.y + ih} L${EUROPE.x} ${EUROPE.y + EUROPE.h}"/></g>
    <g class="inset" aria-hidden="true">
      <rect class="inset-bg" x="${INSET.x}" y="${INSET.y}" width="${iw}" height="${ih}" rx="1.2"/>
      <svg x="${INSET.x}" y="${INSET.y}" width="${iw}" height="${ih}" viewBox="${EUROPE.x} ${EUROPE.y} ${EUROPE.w} ${EUROPE.h}">
        <use href="#${id}-land" class="map-land" style="stroke-width:.12"/></svg>
      <rect class="inset-edge" x="${INSET.x}" y="${INSET.y}" width="${iw}" height="${ih}" rx="1.2"/>
      ${compact ? '' : `<text class="inset-label" x="${INSET.x + 1.6}" y="${INSET.y + ih - 1.6}">Europe ×${INSET.s}</text>`}</g>`;

  const pins = places.map((p, i) => {
    const { x, y } = pinPoint(p);
    const [nx, ny] = p.nudge || [2.6, 1];
    const anchor = p.anchor === 'end' ? ' text-anchor="end"' : '';
    return `<g class="pin k-${esc(p.kind || 'lived')}" data-i="${i}" data-slug="${esc(p.slug || '')}" tabindex="0" role="button" aria-label="${esc(p.city)}, ${esc(p.country)}">
      <circle class="halo" cx="${x}" cy="${y}" r="2.1"/><circle class="dot" cx="${x}" cy="${y}" r=".95"/>
      ${compact ? '' : `<text x="${x + nx}" y="${y + ny}"${anchor}>${esc(p.city)}</text>`}
      <circle class="hit" cx="${x}" cy="${y}" r="3.4"/></g>`;
  }).join('');

  let tower = '';
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lon)) {
    const { x, y } = pinPoint(origin);
    tower = `<g class="tower-pin" role="img" aria-label="Radio Tower broadcasts from ${esc(origin.place || '')}">
      <circle class="wave" cx="${x}" cy="${y}" r="3"/><circle class="wave" cx="${x}" cy="${y}" r="3"/><circle class="wave" cx="${x}" cy="${y}" r="3"/>
      <circle class="core" cx="${x}" cy="${y}" r=".8"/></g>`;
  }
  return `<svg class="world-map" viewBox="${vx} ${vy} ${vw} ${vh}" role="group" aria-label="World map of the places where life and work happened">
    <defs><g id="${id}-land">${world.paths.map((d) => `<path d="${d}"/>`).join('')}</g></defs>
    <g class="atlas-grat">${grid.join('')}</g>
    <use href="#${id}-land" class="map-land"/>
    ${inset}${tower}${pins}</svg>`;
}

/** A dossier link is a path on this site or an https URL — never javascript: or data:. */
export const safeLink = (href) => (typeof href === 'string' && (/^https:\/\//.test(href) || /^[\w\-./#]+$/.test(href)) ? href : null);

const MONTHS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const day = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };

function projectsHtml(p) {
  const list = (p.projects || []).filter((pr) => pr.name && pr.name !== '—');
  if (!list.length) return '';
  return `<ul class="pc-work">${list.map((pr) => {
    const link = safeLink(pr.link);
    const place = link && /^atlas#([\w-]+)$/.exec(link);
    const name = place ? `<button type="button" class="pc-jump" data-place="${esc(place[1])}">${esc(pr.name)}</button>`
      : link ? `<a href="${esc(link)}"${/^https:/.test(link) ? ' target="_blank" rel="noopener"' : ' data-link'}>${esc(pr.name)}</a>` : esc(pr.name);
    return `<li><b>${name}${pr.status && pr.status !== 'verified' ? `<i>${esc(pr.status)}</i>` : ''}</b><span>${esc(pr.what)}</span></li>`;
  }).join('')}</ul>`;
}

function pressHtml(press) {
  if (!press) return '';
  const col = press.column;
  const ser = press.series;
  const first = col?.items?.[0]?.date;
  const last = col?.items?.[col.items.length - 1]?.date;
  return `<section class="pc-press" aria-label="Articles — ${esc(press.outlet)}">
    ${col ? `<h3>${esc(col.title)}</h3>
      <p class="pc-sub">${col.items.length} chroniques · ${esc(press.outlet)} · du ${day(first)} au ${day(last)} 2024 · en portugais</p>
      <div class="clips" tabindex="0" aria-label="Les chroniques, faire défiler">${col.items.map((c) => `<a class="clip" href="${esc(c.pages[0])}" target="_blank" rel="noopener" title="${esc(c.title)}">
        <img src="${esc(c.thumb)}" alt="" loading="lazy" decoding="async" width="120" height="165"><span class="d">${day(c.date)}</span><span class="t">${esc(c.title)}</span></a>`).join('')}</div>` : ''}
    ${ser ? `<h3>${esc(ser.title)}</h3><p class="pc-sub">série en ${ser.items.length} stations du RER B</p>
      <ol class="rer">${ser.items.map((s) => `<li><a href="${esc(s.pages[0])}" target="_blank" rel="noopener"><span class="stn" aria-hidden="true"></span><b>${esc(s.stop.split(',')[0])}</b><span>${esc(s.title)} · ${day(s.date)}</span></a>${s.pages[1] ? `<a class="p2" href="${esc(s.pages[1])}" target="_blank" rel="noopener" aria-label="${esc(s.title)}, suite">suite</a>` : ''}</li>`).join('')}</ol>` : ''}
  </section>`;
}

/** Cancellation lines and the years, as a postmark over the corner of the picture. */
function stampSvg(p) {
  const yrs = (p.years || '').replace(/\s+/g, ' ').trim();
  const big = (yrs.match(/\d{4}/g) || []).slice(-1)[0] || '·';
  const ring = `${p.city} · ${p.country} ·`.toUpperCase();
  return `<svg class="pc-stamp" viewBox="0 0 64 64" aria-hidden="true">
    <defs><path id="pcs-${esc(p.slug)}" d="M32 32 m-23 0 a23 23 0 1 1 46 0 a23 23 0 1 1 -46 0"/></defs>
    <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width=".8"/>
    <text font-size="5.6" letter-spacing=".9"><textPath href="#pcs-${esc(p.slug)}">${esc(ring)}</textPath></text>
    <text x="32" y="35.5" text-anchor="middle" font-size="10.5" font-weight="700">${esc(big)}</text></svg>`;
}

/** The card's full contents for one place. */
export function dossierHtml(p) {
  if (!p) return '';
  const pic = p.photo && safeLink(p.photo) ? `<img src="${esc(p.photo)}" alt="${esc(p.city)}">` : postcardSvg(p.slug);
  const story = (p.story || []).map((s) => `<p>${esc(s)}</p>`).join('');
  const pending = !story && !(p.projects || []).some((pr) => pr.name && pr.name !== '—') && !p.press;
  return `<div class="pc-img"><div class="pc-pic">${pic}</div><div class="pc-name"><h2 class="place">${esc(p.city)}</h2><span>${esc(p.region ? `${p.region}, ${p.country}` : p.country)}</span></div>${stampSvg(p)}</div>
    <div class="pc-head"><span class="pc-badge k-${esc(p.kind || 'lived')}">${esc(p.badge || '')}</span>${p.years ? `<span class="years">${esc(p.years)}</span>` : ''}</div>
    <div class="pc-more"><div class="pc-more-in">
      ${story ? `<div class="pc-story">${story}</div>` : ''}
      ${projectsHtml(p)}
      ${pressHtml(p.press)}
      ${pending ? `<p class="pc-pending">${p.status === 'à compléter' ? 'Le récit de ces années viendra ici.' : 'Rien d’écrit pour l’instant.'}</p>` : ''}
    </div></div>`;
}

/**
 * Wire every pin of a map. `on` is either one function (called with the place
 * whenever a pin is hovered, focused or clicked — the home page's mini-map) or
 * an object of handlers { enter, leave, focus, blur, click }.
 */
export function wirePins(svgRoot, places, on) {
  const h = typeof on === 'function' ? { enter: on, focus: on, click: on } : on;
  svgRoot.querySelectorAll('.pin').forEach((g) => {
    const i = Number(g.dataset.i);
    const mark = () => svgRoot.querySelectorAll('.pin').forEach((x) => x.classList.toggle('on', x === g));
    const call = (k, e) => { if (h[k]) { if (k !== 'leave' && k !== 'blur') mark(); h[k](places[i], i, g, e); } };
    g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') call('enter', e); });
    g.addEventListener('pointerleave', (e) => call('leave', e));
    g.addEventListener('focus', (e) => call('focus', e));
    g.addEventListener('blur', (e) => call('blur', e));
    g.addEventListener('click', (e) => call('click', e));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); call('click', e); } });
  });
}

export async function mount(root, ctx) {
  root.innerHTML = `<div class="page-head"><h1>Atlas</h1>
      <p>Où ça s'est passé — les villes où j'ai vécu, ce qui y a été fait, et d'où la tour émet en ce moment.</p></div>
    <div class="atlas">
      <div class="mapbox" id="aMap"><p class="empty">…</p>
        <article class="postcard" id="aDossier" aria-live="polite" hidden></article></div>
      <nav class="atlas-index" id="aIndex" aria-label="Les lieux"></nav>
    </div>`;
  const { world, places } = await load();
  const origin = ctx.config.station?.origin;
  const box = root.querySelector('#aMap');
  const card = root.querySelector('#aDossier');
  const index = root.querySelector('#aIndex');

  box.querySelector('.empty').remove();
  box.insertAdjacentHTML('afterbegin', mapSvg(world, places, origin) +
    `<div class="map-legend"><span><i class="sw"></i> un lieu — survole-le pour sa carte postale</span>${origin ? `<span><i class="sw ring"></i> la tour émet depuis ${esc(origin.place || '')}</span>` : ''}<span>Europe agrandie ×${INSET.s} · Natural Earth 1:110m</span></div>`);
  const svg = box.querySelector('svg');

  index.innerHTML = places.map((p, i) => `<button type="button" class="ai-chip k-${esc(p.kind || 'lived')}" data-i="${i}"><b>${esc(p.city)}</b>${p.years ? `<span>${esc(p.years)}</span>` : ''}</button>`).join('');

  const cleanups = [];
  const on = (t, ...a) => { t.addEventListener(...a); cleanups.push(() => t.removeEventListener(...a)); };
  const narrow = window.matchMedia('(max-width: 759px)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  let current = -1;
  let pinned = false;
  let hideT = 0;
  let openT = 0;

  const pinEl = (i) => svg.querySelector(`.pin[data-i="${i}"]`);
  const mark = (i) => {
    svg.querySelectorAll('.pin').forEach((x) => x.classList.toggle('on', Number(x.dataset.i) === i));
    index.querySelectorAll('.ai-chip').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.i) === i)));
    box.classList.toggle('has-card', i >= 0);
  };

  /** Float the card beside its pin, inside the map where it can. */
  function place() {
    if (current < 0 || narrow.matches) { card.style.left = card.style.top = ''; return; }
    const pin = pinEl(current)?.querySelector('.dot');
    if (!pin) return;
    const b = box.getBoundingClientRect();
    const r = pin.getBoundingClientRect();
    const px = r.left + r.width / 2 - b.left;
    const py = r.top + r.height / 2 - b.top;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const gap = 22;
    let left = px + gap + cw <= b.width - 8 ? px + gap : px - gap - cw;
    left = Math.max(8, Math.min(left, b.width - cw - 8));
    let top = py - 70;
    top = Math.max(8, Math.min(top, b.height - ch - 8));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    card.classList.toggle('flip', left < px);
  }

  function show(i, { open = false } = {}) {
    clearTimeout(hideT);
    if (i !== current) {
      // glide from pin to pin while a card is up; appear in place otherwise
      card.classList.toggle('moving', current >= 0 && !narrow.matches);
      current = i;
      card.innerHTML = `<button type="button" class="pc-close" aria-label="Fermer la carte">✕</button>${dossierHtml(places[i])}`;
      card.classList.remove('open');
      card.hidden = false;
      card.classList.remove('in');
      // next frame: let the card be measured closed, then fade it in where it belongs
      requestAnimationFrame(() => card.classList.add('in'));
    }
    mark(i);
    if (open || narrow.matches) expand();
    place();
  }

  function expand() {
    clearTimeout(openT);
    if (card.classList.contains('open')) return;
    card.classList.add('open');
    place();
    // the card grows; keep following its pin while it does
    if (!reduce.matches) { const t0 = performance.now(); const f = (t) => { place(); if (t - t0 < 520) requestAnimationFrame(f); }; requestAnimationFrame(f); }
  }

  function hide() {
    clearTimeout(openT);
    clearTimeout(hideT);
    if (current < 0) return;
    current = -1;
    pinned = false;
    card.hidden = true;
    card.classList.remove('open', 'in');
    mark(-1);
  }
  const hideSoon = (ms = 280) => { if (pinned || narrow.matches) return; clearTimeout(hideT); hideT = setTimeout(hide, ms); };

  wirePins(svg, places, {
    enter: (p, i) => { if (narrow.matches) return; show(i); clearTimeout(openT); openT = setTimeout(expand, 650); },
    leave: () => { clearTimeout(openT); hideSoon(); },
    focus: (p, i) => show(i, { open: true }),
    blur: (p, i, g, e) => { if (!card.contains(e.relatedTarget)) hideSoon(400); },
    click: (p, i) => {
      pinned = true;
      show(i, { open: true });
      if (narrow.matches) card.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'nearest' });
    },
  });

  on(card, 'pointerenter', () => { clearTimeout(hideT); expand(); });
  on(card, 'pointerleave', () => hideSoon(360));
  on(card, 'focusout', (e) => { if (!card.contains(e.relatedTarget) && !e.relatedTarget?.closest?.('.pin')) hideSoon(400); });
  on(card, 'click', (e) => {
    if (e.target.closest('.pc-close')) { hide(); return; }
    const jump = e.target.closest('[data-place]');
    if (jump) {
      const j = places.findIndex((p) => p.slug === jump.dataset.place);
      if (j >= 0) { pinned = true; show(j, { open: true }); }
    }
  });
  // A vertical wheel over the strip of clippings scrolls it sideways.
  on(card, 'wheel', (e) => {
    const strip = e.target.closest('.clips');
    if (!strip || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const max = strip.scrollWidth - strip.clientWidth;
    if ((e.deltaY < 0 && strip.scrollLeft <= 0) || (e.deltaY > 0 && strip.scrollLeft >= max)) return;
    e.preventDefault();
    strip.scrollLeft += e.deltaY;
  }, { passive: false });

  on(index, 'pointerover', (e) => {
    const c = e.target.closest('.ai-chip');
    if (!c || e.pointerType !== 'mouse' || narrow.matches) return;
    show(Number(c.dataset.i));
  });
  on(index, 'pointerout', (e) => { if (e.target.closest('.ai-chip') && !e.relatedTarget?.closest?.('.ai-chip')) hideSoon(); });
  on(index, 'click', (e) => {
    const c = e.target.closest('.ai-chip');
    if (!c) return;
    pinned = true;
    show(Number(c.dataset.i), { open: true });
    if (narrow.matches) card.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'nearest' });
  });

  on(document, 'pointerdown', (e) => {
    if (current < 0 || card.contains(e.target) || e.target.closest?.('.pin') || e.target.closest?.('.ai-chip')) return;
    hide();
  });
  on(document, 'keydown', (e) => { if (e.key === 'Escape' && current >= 0) { const back = pinEl(current); hide(); back?.focus({ preventScroll: true }); } });
  on(window, 'resize', place);

  // atlas#novo-hamburgo opens that card
  const deep = (location.hash || '').slice(1);
  const k = places.findIndex((p) => p.slug && p.slug === deep);
  if (k >= 0) { pinned = true; show(k, { open: true }); }

  return () => cleanups.forEach((f) => f());
}
