/**
 * /zone — Zone's Atlas: where the tower broadcasts from (Ortis, 2026-11-01).
 *
 * The evening the map of the places moved to Echo's side (pages/atlas.js),
 * the part of the Atlas that is the radio's stayed on Zone's: the tower's
 * point, pulsing on the map, and the card saying where it is and what time
 * it is there. Named Atlas too, because one day it carries one playlist per
 * place. The point follows Zone's rule (pages/zone.js resolveOrigin): in
 * tower mode the tower's own position wins over config.json's, and the point
 * moves when it changes.
 */
import { esc } from '../ui/util.js';
import { mapSvg, originCardHtml, towerSvg } from './atlas.js';
import { localTime, resolveOrigin } from './zone.js';

export const title = 'Atlas';

let WORLD = null;

export async function mount(root, ctx) {
  const { player, client, config } = ctx;
  root.innerHTML = `<div class="page-head"><h1>Atlas</h1>
      <p>Where the signal comes from, and what time it is there. One day, a playlist for every place on the map.</p></div>
    <div class="broadcast">
      <div class="mapbox broadcast-map" id="zMap"><p class="empty">…</p></div>
      <section class="zone-card panel broadcast-card" id="zOrigin" aria-live="polite"></section>
    </div>`;
  if (!WORLD) WORLD = await (await fetch(new URL('data/world.json', document.baseURI))).json();
  const originNow = () => resolveOrigin(player?.data?.station, config, { mode: client?.mode });
  let origin = originNow();
  const box = root.querySelector('#zMap');
  const card = root.querySelector('#zOrigin');
  box.querySelector('.empty').remove();
  box.insertAdjacentHTML('afterbegin', mapSvg(WORLD, [], origin) +
    `<div class="map-legend"><span id="zLg"${origin ? '' : ' hidden'}><i class="sw ring"></i> the tower broadcasts from <span>${esc(origin?.place || '')}</span></span><span>Natural Earth 1:110m</span></div>`);
  const svg = box.querySelector('svg');

  const paintTime = () => {
    const el = card.querySelector('#aTime');
    if (!el || !origin) return;
    const t = localTime(client?.now?.() ?? Date.now(), origin.timeZone);
    el.hidden = !t;
    if (t) el.querySelector('b').textContent = `${t.time}${t.offset ? ` · ${t.offset}` : ''}`;
  };
  // The tower's answer can come after the page, or change: the point, the legend and the card follow it.
  let key = '';
  const paint = () => {
    const next = originNow();
    const k = JSON.stringify(next);
    if (k === key) return;
    key = k;
    origin = next;
    svg.querySelector('.tower-pin')?.remove();
    const g = towerSvg(origin);
    if (g) svg.insertAdjacentHTML('beforeend', g);
    const lg = box.querySelector('#zLg');
    lg.hidden = !origin;
    lg.querySelector('span').textContent = origin?.place || '';
    card.innerHTML = originCardHtml(origin);
    paintTime();
  };
  paint();
  player?.addEventListener?.('station', paint);
  const tick = setInterval(paintTime, 15_000);
  return () => {
    player?.removeEventListener?.('station', paint);
    clearInterval(tick);
  };
}
