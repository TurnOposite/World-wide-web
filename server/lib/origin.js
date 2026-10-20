/**
 * Where the tower broadcasts from: the green point on the site's Zone map
 * (docs/DESIGN-BRIEF.md §2, roadmap #21).
 *
 * Configuration, not code. Ortis changes continents within months, so moving
 * the station is one edit to /etc/radio-tower.env and a restart:
 *
 *   STATION_LAT=-25.97  STATION_LON=32.58  STATION_PLACE=Maputo
 *   STATION_TZ=Africa/Maputo     (optional: the map shows the local time)
 *
 * Unset or invalid → null, and /api/station says nothing about an origin; the
 * site then falls back to its own config.json → station.origin. A half-set or
 * out-of-range position is treated as unset rather than guessed at — a point
 * in the wrong ocean is worse than no point.
 */

const num = (raw) => {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/** An IANA zone this runtime knows ("Europe/Amsterdam"), or null. */
export function validTimeZone(tz) {
  const s = String(tz ?? '').trim();
  if (!s) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: s });
    return s;
  } catch {
    return null;
  }
}

/** @returns {{lat: number, lon: number, place: string, timeZone?: string} | null} */
export function originFromEnv(env = process.env) {
  const lat = num(env.STATION_LAT);
  const lon = num(env.STATION_LON);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const origin = { lat, lon, place: String(env.STATION_PLACE ?? '').trim().slice(0, 80) };
  const tz = validTimeZone(env.STATION_TZ);
  if (tz) origin.timeZone = tz;
  return origin;
}
