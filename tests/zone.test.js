/**
 * The Zone tab (docs/DESIGN-BRIEF.md §2, roadmap #21/#22): the broadcast
 * origin is configuration (env on a tower, config.json on the site), the
 * point lands where the projection says, and a listener point never appears
 * without a server-side geo source behind a flag.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { originFromEnv, validTimeZone } from '../server/lib/origin.js';
import { project, isPoint, resolveOrigin, resolveListener, coords, localTime, zoneSvg } from '../site/js/pages/zone.js';
import { project as atlasProject } from '../site/js/pages/atlas.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORLD = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data/world.json'), 'utf8'));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/config.json'), 'utf8'));

test('STATION_LAT / LON / PLACE / TZ become the origin; anything half-set or off the globe is no origin', () => {
  assert.deepEqual(originFromEnv({ STATION_LAT: '-25.97', STATION_LON: '32.58', STATION_PLACE: ' Maputo ', STATION_TZ: 'Africa/Maputo' }),
    { lat: -25.97, lon: 32.58, place: 'Maputo', timeZone: 'Africa/Maputo' });
  assert.deepEqual(originFromEnv({ STATION_LAT: '52.37', STATION_LON: '4.9' }), { lat: 52.37, lon: 4.9, place: '' }, 'a place name is optional');
  assert.equal(originFromEnv({}), null, 'unset: the site falls back to config.json');
  assert.equal(originFromEnv({ STATION_LAT: '52.37' }), null, 'half-set is not a position');
  assert.equal(originFromEnv({ STATION_LAT: '', STATION_LON: '4.9' }), null);
  assert.equal(originFromEnv({ STATION_LAT: 'north', STATION_LON: '4.9' }), null);
  assert.equal(originFromEnv({ STATION_LAT: '91', STATION_LON: '4.9' }), null, 'off the globe');
  assert.equal(originFromEnv({ STATION_LAT: '10', STATION_LON: '-181' }), null);
  assert.equal(originFromEnv({ STATION_LAT: '0', STATION_LON: '0', STATION_TZ: 'Mars/Olympus' }).timeZone, undefined, 'an unknown zone is dropped, the point kept');
  assert.equal(validTimeZone('Europe/Amsterdam'), 'Europe/Amsterdam');
  assert.equal(validTimeZone(''), null);
});

test('the projection is the Atlas\'s: x = lon + 180, y = 90 − lat', () => {
  for (const [lat, lon] of [[-25.97, 32.58], [52.37, 4.9], [0, 0], [-55, -70], [71, 179]]) {
    assert.deepEqual(project(lat, lon), atlasProject(lat, lon));
  }
  const p = project(-25.97, 32.58);
  assert.ok(Math.abs(p.x - 212.58) < 1e-9 && Math.abs(p.y - 115.97) < 1e-9, JSON.stringify(p));
});

test('the tower\'s origin wins in tower mode; config.json otherwise; nothing real → no point', () => {
  const cfg = { station: { origin: { lat: -25.97, lon: 32.58, place: 'Maputo' } } };
  const tower = { origin: { lat: 52.37, lon: 4.9, place: 'Amsterdam', timeZone: 'Europe/Amsterdam' } };
  assert.deepEqual(resolveOrigin(tower, cfg, { mode: 'tower' }), { ...tower.origin, source: 'tower' });
  assert.deepEqual(resolveOrigin({}, cfg, { mode: 'tower' }), { lat: -25.97, lon: 32.58, place: 'Maputo', source: 'config' }, 'a tower that names none');
  // In the browser's own station, `origin` in the body *is* config.json's — never a third source.
  assert.equal(resolveOrigin(tower, cfg, { mode: 'cloud' }).source, 'config');
  assert.equal(resolveOrigin({ origin: { lat: 'x', lon: 4 } }, {}, { mode: 'tower' }), null);
  assert.equal(resolveOrigin(null, null), null);
  assert.equal(isPoint({ lat: 95, lon: 0 }), false);
});

test('the site\'s configured origin is a real point (and is still Maputo — see WORKLOG 2026-10-19)', () => {
  const o = resolveOrigin(null, CONFIG);
  assert.ok(o, 'config.json → station.origin');
  assert.equal(o.place, 'Maputo');
});

test('the map draws the origin at the projected x/y, inside the world\'s viewBox', () => {
  const origin = { lat: -25.97, lon: 32.58, place: 'Maputo' };
  const svg = zoneSvg(WORLD, origin);
  const core = /<circle class="zo-core" cx="([\d.-]+)" cy="([\d.-]+)"/.exec(svg);
  assert.ok(core, 'a core point');
  assert.equal(Number(core[1]), 212.58);
  assert.equal(Number(core[2]), 115.97);
  const [vx, vy, vw, vh] = WORLD.viewBox;
  assert.ok(core[1] >= vx && core[1] <= vx + vw && core[2] >= vy && core[2] <= vy + vh);
  assert.equal((svg.match(/class="zw"/g) || []).length, 3, 'three arcs leave the point');
  assert.equal((svg.match(/<path d=/g) || []).length, WORLD.paths.length + 3, 'every land path, plus one path per wave');
  assert.match(svg, />Maputo<\/text>/);
  assert.doesNotMatch(svg, /zone-listener/);
  assert.doesNotMatch(zoneSvg(WORLD, null), /zone-origin/, 'no origin, no point');
  assert.doesNotMatch(zoneSvg(WORLD, { ...origin, place: '<img onerror=x>' }), /<img/, 'the place name is escaped');
});

test('the listener point needs the flag AND a server-side position — never one without the other', () => {
  const body = { listener: { lat: 48.85, lon: 2.35, place: 'Paris' } };
  assert.equal(resolveListener(body, {}), null, 'flag off (the default): nothing, even with a position');
  assert.equal(resolveListener({}, { zone: { listener: true } }), null, 'flag on, no geo source: nothing');
  assert.equal(resolveListener({ listener: { lat: null, lon: 2 } }, { zone: { listener: true } }), null);
  assert.deepEqual(resolveListener(body, { zone: { listener: true } }), { lat: 48.85, lon: 2.35, place: 'Paris' });
  assert.equal(CONFIG.zone?.listener, undefined, 'the site ships with the flag off');
  assert.match(zoneSvg(WORLD, null, { listener: { lat: 48.85, lon: 2.35, place: 'Paris' } }), /<circle cx="182.35" cy="41.15"/);
});

test('the origin reads as coordinates and as its own local time', () => {
  assert.equal(coords({ lat: -25.97, lon: 32.58 }), '25.97° S, 32.58° E');
  assert.equal(coords({ lat: 52.37, lon: -4.9 }), '52.37° N, 4.90° W');
  const noonUtc = Date.UTC(2026, 9, 19, 12, 0);
  assert.equal(localTime(noonUtc, 'Africa/Maputo').time, '14:00');
  assert.equal(localTime(noonUtc, 'Europe/Amsterdam').time, '14:00', 'CEST');
  assert.equal(localTime(Date.UTC(2026, 11, 1, 12, 0), 'Europe/Amsterdam').time, '13:00', 'CET');
  assert.equal(localTime(noonUtc, undefined), null, 'no zone, no time');
  assert.equal(localTime(noonUtc, 'Not/AZone'), null);
});
