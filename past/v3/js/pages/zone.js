/**
 * Where the tower is broadcasting from (docs/DESIGN-BRIEF.md §2, roadmap
 * #21): the rules, not a page. Until 2026-11-01 this was the /zone page — one
 * minimal map and one green point. Ortis then found Zone and the Atlas « one
 * and the same », so the Atlas (pages/atlas.js) draws the point, the card and
 * the playlists, and /zone opens it. What stays here is which point to draw
 * and how to tell its time; the Atlas imports it.
 *
 * The origin is configuration. A tower that names one (STATION_LAT / LON /
 * PLACE in its env, surfaced in /api/station → station.origin) wins; else
 * the site's own config.json → station.origin. Neither → no point, and the
 * page says so rather than guessing.
 *
 * The listener's blue point (roadmap #22) is a rule without a drawing since
 * the merge: it may only exist when config.json → zone.listener is true AND
 * the tower's /api/station carries a coarse, server-side geo-IP position in
 * `listener`. Nothing serves one today. Never the browser Geolocation API,
 * never a guess.
 */
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
