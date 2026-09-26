/**
 * /atlas — where things were made, and where the signal comes from.
 *
 * docs/DESIGN-BRIEF.md §2 ("Zone") and the 2026-09-09 Atlas mock, as one map:
 * no map library, no tiles, no third-party call — an inlined Natural Earth
 * outline on the linear projection x = lon + 180, y = 90 − lat. Green pins are
 * places (hover, focus or tap for the dossier); the tower's own point pulses
 * with the logo's sideways waves. Its position is configuration
 * (config.json → station.origin), because Ortis changes continents.
 *
 * No listener point: a static site has no server-side geo-IP, and the brief
 * forbids guessing ("never guess a location").
 */
import { esc } from '../ui/util.js';

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

export function mapSvg(world, places, origin, { compact = false } = {}) {
  const [vx, vy, vw, vh] = world.viewBox;
  const grid = [];
  for (let x = 60; x < 360; x += 60) grid.push(`<line x1="${x}" y1="${vy}" x2="${x}" y2="${vy + vh}"/>`);
  for (const lat of [66.5, 23.5, 0, -23.5]) { const y = 90 - lat; grid.push(`<line x1="0" y1="${y}" x2="360" y2="${y}"/>`); }
  const pins = places.map((p, i) => {
    const { x, y } = project(p.lat, p.lon);
    const [nx, ny] = p.nudge || [5, 2.6];
    return `<g class="pin" data-i="${i}" tabindex="0" role="button" aria-label="${esc(p.city)}, ${esc(p.country)}">
      <circle class="halo" cx="${x}" cy="${y}" r="3"/><circle class="dot" cx="${x}" cy="${y}" r="1.5"/>
      ${compact ? '' : `<text x="${x + nx}" y="${y + ny}">${esc(p.city)}</text>`}
      <circle cx="${x}" cy="${y}" r="4.5" fill="transparent"/></g>`;
  }).join('');
  let tower = '';
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lon)) {
    const { x, y } = project(origin.lat, origin.lon);
    tower = `<g class="tower-pin" role="img" aria-label="Radio Tower broadcasts from ${esc(origin.place || '')}">
      <circle class="wave" cx="${x}" cy="${y}" r="4"/><circle class="wave" cx="${x}" cy="${y}" r="4"/><circle class="wave" cx="${x}" cy="${y}" r="4"/>
      <circle class="core" cx="${x}" cy="${y}" r="1.1"/></g>`;
  }
  return `<svg viewBox="${vx} ${vy} ${vw} ${vh}" role="group" aria-label="World map of places where work was made">
    <g class="atlas-grat">${grid.join('')}</g>
    <g class="map-land">${world.paths.map((d) => `<path d="${d}"/>`).join('')}</g>
    ${tower}${pins}</svg>`;
}

/** A dossier link is a path on this site or an https URL — never javascript: or data:. */
export const safeLink = (href) => (typeof href === 'string' && (/^https:\/\//.test(href) || /^[\w\-./#]+$/.test(href)) ? href : null);

export function dossierHtml(p) {
  if (!p) return '<p class="hint" style="margin:0">Chaque point est un endroit où quelque chose a été fait. Survole-le, ou tabule d\'un point à l\'autre.</p>';
  return `<p class="place">${esc(p.city)} <small>· ${esc(p.country)}</small></p>
    <p class="years">${esc(p.years || '')}</p>
    <ul>${(p.projects || []).map((pr) => `<li><b>${safeLink(pr.link) ? `<a href="${esc(safeLink(pr.link))}"${/^https:/.test(pr.link) ? ' target="_blank" rel="noopener"' : ' data-link'}>${esc(pr.name)}</a>` : esc(pr.name)}${pr.status && pr.status !== 'verified' ? `<i>${esc(pr.status)}</i>` : ''}</b><span>${esc(pr.what)}</span></li>`).join('')}</ul>`;
}

export function wirePins(svgRoot, places, show) {
  svgRoot.querySelectorAll('.pin').forEach((g) => {
    const i = Number(g.dataset.i);
    const on = () => {
      svgRoot.querySelectorAll('.pin').forEach((x) => x.classList.toggle('on', x === g));
      show(places[i], i);
    };
    g.addEventListener('mouseenter', on);
    g.addEventListener('focus', on);
    g.addEventListener('click', on);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on(); } });
  });
}

export async function mount(root, ctx) {
  root.innerHTML = `<div class="page-head"><h1>Atlas</h1>
      <p>Où ça s'est passé — les villes, ce qui y a été fait, et d'où la tour émet en ce moment.</p></div>
    <div class="atlas"><div class="mapbox" id="aMap"><p class="empty">…</p></div>
      <aside class="panel dossier" id="aDossier" aria-live="polite"></aside></div>`;
  const { world, places } = await load();
  const origin = ctx.config.station?.origin;
  const map = root.querySelector('#aMap');
  map.innerHTML = mapSvg(world, places, origin) +
    `<div class="map-legend"><span><i class="sw"></i> un lieu, un dossier</span>${origin ? `<span><i class="sw" style="background:none;border:1.5px solid var(--signal)"></i> la tour émet depuis ${esc(origin.place || '')}</span>` : ''}<span>Projection équirectangulaire · Natural Earth 1:110m</span></div>`;
  const dossier = root.querySelector('#aDossier');
  dossier.innerHTML = dossierHtml(null);
  wirePins(map, places, (p) => { dossier.innerHTML = dossierHtml(p); });
}
