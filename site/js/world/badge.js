/**
 * The date badge in Zone's corner (the mood board's MB-09, after Persona 5's calendar): a big day number, the weekday,
 * and the time of day as a word, MATIN, APRÈS-MIDI, SOIR or NUIT, with its Japanese under it. It reads the station's
 * clock, Paris time, never the visitor's; the day turns at 05:00 like the broadcast day, so the small hours are still
 * the night of the day before. Echo prints its date under its own masthead, so the badge is Zone's only.
 */
const PARTS = [
  { from: 5, word: 'MATIN', jp: '朝' },
  { from: 12, word: 'APRÈS-MIDI', jp: '午後' },
  { from: 18, word: 'SOIR', jp: '夕方' },
  { from: 22, word: 'NUIT', jp: '夜' },
];
const FMT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', hour: 'numeric', hourCycle: 'h23' });

/** What the badge says at instant `ms`: the broadcast day's number and weekday, and the part of the day. Pure. */
export function badgeFor(ms) {
  const hourNow = Number(FMT.formatToParts(new Date(ms)).find((p) => p.type === 'hour').value);
  // Before 05:00 it is still the night of the day before, as on the station's calendar.
  const dayMs = hourNow < 5 ? ms - 5 * 3600_000 : ms;
  const parts = Object.fromEntries(FMT.formatToParts(new Date(dayMs)).map((p) => [p.type, p.value]));
  const part = hourNow < 5 ? PARTS[3] : [...PARTS].reverse().find((p) => hourNow >= p.from);
  return { day: Number(parts.day), weekday: parts.weekday.replace('.', '').toUpperCase(), word: part.word, jp: part.jp };
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
