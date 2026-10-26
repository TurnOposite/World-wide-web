/**
 * /zone — where the tower is broadcasting from (docs/DESIGN-BRIEF.md §2,
 * roadmap #21).
 *
 * One minimal world map and one point: green, with the logo's sideways arcs
 * leaving it slowly. Not the Atlas — no places, no postcards — only the
 * signal's origin, its name, and the time it is there.
 *
 * The origin is configuration. A tower that names one (STATION_LAT / LON /
 * PLACE in its env, surfaced in /api/station → station.origin) wins; else
 * the site's own config.json → station.origin. Neither → no point, and the
 * page says so rather than guessing.
 *
 * Same map as the Atlas (site/data/world.json, Natural Earth 1:110m) on the
 * same linear projection x = lon + 180, y = 90 − lat. No map library, no
 * tiles, no third-party call. The Atlas module is not imported: it pulls the
 * postcards (~26 KB) with it, and the projection is one line.
 *
 * The listener's blue point (roadmap #22) is built but off. It renders only
 * when config.json → zone.listener is true AND the tower's /api/station
 * carries a coarse, server-side geo-IP position in `listener`. Nothing serves
 * one today, so it does not render. Never the browser Geolocation API, never
 * a guess.
 */
import { esc } from '../ui/util.js';

export const title = 'Zone';

export const project = (lat, lon) => ({ x: lon + 180, y: 90 - lat });

/** A position worth drawing: finite, on the globe. */
export const isPoint = (p) => Boolean(p) && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

/**
 * Which origin to draw: the tower's (from /api/station) over the site's
 * (config.json). Returns null when neither is a real position.
 */
export function resolveOrigin(stationBody, config, { mode = 'cloud' } = {}) {
  const fromTower = stationBody?.origin;
  if (mode === 'tower' && isPoint(fromTower)) return { ...pick(fromTower), source: 'tower' };
  const fromSite = config?.station?.origin;
  if (isPoint(fromSite)) return { ...pick(fromSite), source: 'config' };
  return null;
}

const pick = (o) => {
  const out = { lat: Number(o.lat), lon: Number(o.lon), place: String(o.place ?? '').slice(0, 80) };
  if (typeof o.timeZone === 'string' && o.timeZone) out.timeZone = o.timeZone;
  return out;
};

/** The listener's point, only behind the flag and only from the server. */
export function resolveListener(body, config) {
  if (config?.zone?.listener !== true) return null;
  const l = body?.listener;
  return isPoint(l) ? { lat: Number(l.lat), lon: Number(l.lon), place: String(l.place ?? '').slice(0, 80) } : null;
}

/** "25.97° S, 32.58° E" */
export function coords({ lat, lon }) {
  const f = (v, pos, neg) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')}, ${f(lon, 'E', 'W')}`;
}

/** "14:32" and "GMT+2" at the origin, or null without a zone this browser knows. */
export function localTime(ms, timeZone) {
  if (!timeZone) return null;
  try {
    const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
    let offset = '';
    try {
      offset = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value || '';
    } catch { /* older engines: the time alone */ }
    return { time, offset };
  } catch {
    return null;
  }
}

// The logo's arcs (index.html #mark: inner arc from (±4, ∓4.5), radius 7),
// at map scale, centred on the point so `transform-box: fill-box` scales
// each pair around it.
const ARC = { a: 1.6, b: 1.8, r: 2.8 };
const arcs = (x, y) => {
  const { a, b, r } = ARC;
  return `<path d="M${x + a} ${y - b}A${r} ${r} 0 0 1 ${x + a} ${y + b}M${x - a} ${y + b}A${r} ${r} 0 0 1 ${x - a} ${y - b}"/>`;
};

/** The map, as a string: land, the equator, and the points that exist. */
export function zoneSvg(world, origin, { listener = null } = {}) {
  const [vx, vy, vw, vh] = world.viewBox;
  const r = (n) => Math.round(n * 100) / 100;
  let guides = '';
  let tower = '';
  if (origin) {
    const { x, y } = project(origin.lat, origin.lon);
    guides = `<line x1="${vx}" y1="${r(y)}" x2="${vx + vw}" y2="${r(y)}"/><line x1="${r(x)}" y1="${vy}" x2="${r(x)}" y2="${vy + vh}"/>`;
    const label = origin.place ? `<text class="zo-label" x="${r(x + 6)}" y="${r(y + 1.6)}"${x > vx + vw - 60 ? ` text-anchor="end" dx="-10"` : ''}>${esc(origin.place)}</text>` : '';
    tower = `<g class="zone-origin" data-lat="${origin.lat}" data-lon="${origin.lon}" role="img" aria-label="The tower broadcasts from ${esc(origin.place || coords(origin))}">
      <g class="zw">${arcs(r(x), r(y))}</g><g class="zw">${arcs(r(x), r(y))}</g><g class="zw">${arcs(r(x), r(y))}</g>
      <circle class="zo-halo" cx="${r(x)}" cy="${r(y)}" r="2.6"/><circle class="zo-core" cx="${r(x)}" cy="${r(y)}" r="1.35"/>${label}</g>`;
  }
  let you = '';
  if (listener) {
    const { x, y } = project(listener.lat, listener.lon);
    you = `<g class="zone-listener" role="img" aria-label="You are listening from around ${esc(listener.place || coords(listener))}"><circle cx="${r(x)}" cy="${r(y)}" r="1.1"/></g>`;
  }
  return `<svg class="zone-map" viewBox="${vx} ${vy} ${vw} ${vh}" role="group" aria-label="World map: where Radio Tower broadcasts from">
    <g class="zone-guides" aria-hidden="true"><line class="eq" x1="${vx}" y1="90" x2="${vx + vw}" y2="90"/>${guides}</g>
    <g class="zone-land" aria-hidden="true">${world.paths.map((d) => `<path d="${d}"/>`).join('')}</g>
    ${tower}${you}</svg>`;
}

let WORLD = null;

export async function mount(root, ctx) {
  const { player, client, config } = ctx;
  root.innerHTML = `<div class="page-head"><h1>Zone</h1>
      <p>Where the signal comes from. One tower, one point on the map; everyone tuned in hears it from here.</p></div>
    <section class="zone">
      <div class="zone-mapbox" id="zMap"><p class="empty">…</p></div>
      <div class="zone-card panel" id="zCard" aria-live="polite"></div>
    </section>`;
  if (!WORLD) WORLD = await (await fetch(new URL('data/world.json', document.baseURI))).json();
  const box = root.querySelector('#zMap');
  const card = root.querySelector('#zCard');

  let key = '';
  let origin = null;
  const paintTime = () => {
    const el = card.querySelector('#zTime');
    if (!el || !origin) return;
    const t = localTime(client.now?.() ?? Date.now(), origin.timeZone);
    el.hidden = !t;
    if (t) el.querySelector('b').textContent = `${t.time}${t.offset ? ` · ${t.offset}` : ''}`;
  };

  const paint = () => {
    const body = player.data;
    const next = resolveOrigin(body?.station, config, { mode: client.mode });
    const listener = resolveListener(body, config);
    const k = JSON.stringify([next, listener]);
    if (k === key) return;
    key = k;
    origin = next;
    box.innerHTML = zoneSvg(WORLD, origin, { listener });
    if (!origin) {
      card.innerHTML = `<h2>Origin</h2><p class="zone-place">Not set</p>
        <p class="hint">Neither the tower nor the site says where it is, so the map shows no point rather than a guess.</p>`;
      return;
    }
    card.innerHTML = `<h2>Broadcasting from</h2>
      <p class="zone-place" id="zPlace">${esc(origin.place || 'Somewhere')}</p>
      <p class="zone-coords">${esc(coords(origin))}</p>
      <p class="zone-time" id="zTime" hidden>Local time <b></b></p>
      <p class="hint" id="zSource">${origin.source === 'tower' ? 'Position given by the tower itself.' : 'Position from the site’s settings.'}</p>
      ${listener ? `<p class="zone-you"><i aria-hidden="true"></i> you, roughly${listener.place ? `: ${esc(listener.place)}` : ''}</p>` : ''}`;
    paintTime();
  };

  paint();
  player.addEventListener('station', paint);
  const tick = setInterval(paintTime, 15_000);
  return () => {
    player.removeEventListener('station', paint);
    clearInterval(tick);
  };
}
