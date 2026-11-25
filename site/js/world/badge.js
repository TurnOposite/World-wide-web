/**
 * The date badge in Zone's corner (the mood board's MB-09, after Persona 5's calendar): a big day number, the weekday,
 * and the time of day as a word, MATIN, APRÈS-MIDI, SOIR or NUIT, with its Japanese under it. It reads the station's
 * clock, Paris time, never the visitor's; the day turns at 05:00 like the broadcast day, so the small hours are still
 * the night of the day before. Echo prints its date under its own masthead, so the badge is Zone's only.
 */
import { broadcastDay, partOfDay } from '../lib/station-time.js';

// The weekday of a calendar date, in French: the date is read at noon UTC, so no clock change can move it.
const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short' });

/**
 * What the badge says at instant `ms`: the broadcast day's number and weekday, and the part of the day. Pure.
 * From the station clock (lib/station-time.js) since 2026-11-25, the one the line's log uses: the same answers as
 * the badge's own reading gave, from one place.
 */
export function badgeFor(ms) {
  const day = broadcastDay(ms);
  const part = partOfDay(ms);
  return { day: Number(day.slice(8)), weekday: WEEKDAY.format(new Date(`${day}T12:00:00Z`)).replace('.', '').toUpperCase(), word: part.word, jp: part.jp };
}

export function mountBadge({ now = () => Date.now() } = {}) {
  const el = document.createElement('div');
  el.className = 'w-badge';
  el.setAttribute('role', 'img');
  const paint = () => {
    const b = badgeFor(now());
    el.innerHTML = `<b aria-hidden="true">${b.day}</b><span class="wd" aria-hidden="true">${b.weekday}</span><span class="tp" aria-hidden="true">${b.word} <i>${b.jp}</i></span>`;
    el.setAttribute('aria-label', `${b.weekday} ${b.day}, ${b.word.toLowerCase()}, heure de Paris`);
  };
  paint();
  const timer = setInterval(paint, 30_000);
  return { el, paint, stop: () => clearInterval(timer) };
}
