/**
 * The station's clock, once (Lighter step 5, docs/plans/LIGHTER-2026-11-24.md): Paris time, never the visitor's.
 * The broadcast day runs 05:00 → 05:00 on Paris's clocks, like the programme (server/lib/programme.js), the room
 * of the telegraph line and the date badge; the part of the day is the badge's word; the sky is the boat's lake.
 *
 * Pure and dependency-free: it runs in the browser and under node --test alike.
 */

const PARIS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Paris's wall clock at instant `ms`: numbers, so nobody parses a formatted string twice. */
export function parisClock(ms = Date.now()) {
  const p = Object.fromEntries(PARIS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute) };
}

/** Minutes after midnight in Paris. */
export const parisMinutes = (ms = Date.now()) => { const c = parisClock(ms); return c.hour * 60 + c.minute; };

/** When the broadcast day turns, in Paris hours. */
export const DAY_STARTS = 5;

/**
 * The broadcast day instant `ms` belongs to (YYYY-MM-DD): what is said at 02:00 is still the evening before's.
 * Paris's own hour decides, not five hours taken off: on the two nights a year the clocks change that was an hour off
 * (05:00–06:00 filed under the wrong day, found 2026-11-17 against the tower's calendar).
 */
export function broadcastDay(ms, startHour = DAY_STARTS) {
  const c = parisClock(ms);
  const date = `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
  if (c.hour >= startHour) return date;
  const before = new Date(`${date}T12:00:00Z`);
  before.setUTCDate(before.getUTCDate() - 1);
  return before.toISOString().slice(0, 10);
}

/** The part of the day as the date badge says it (MB-09): the small hours are still the night. */
export const PARTS = [
  { from: 5, word: 'MATIN', jp: '朝' },
  { from: 12, word: 'APRÈS-MIDI', jp: '午後' },
  { from: 18, word: 'SOIR', jp: '夕方' },
  { from: 22, word: 'NUIT', jp: '夜' },
];
export function partOfDay(ms = Date.now()) {
  const h = parisClock(ms).hour;
  return h < PARTS[0].from ? PARTS[3] : [...PARTS].reverse().find((p) => h >= p.from);
}

/*
 * The sky, minute by minute — the boat's lake (boat/scene.js SKY, F2 ①, which Ortis picked for the whole site).
 * A copy, because the boat's code is left alone until his upgraded boat replaces it; tests/site-station-time.test.js
 * holds the two equal at every quarter hour, so neither can drift on its own.
 */
const SKY = [
  [0, { top: '#03050f', mid: '#0a1230', hor: '#1b2550', wHor: '#141d3c', wMid: '#09112a', wNear: '#03060f', star: 1, dark: 0.84, lant: 1, sun: '#9fb4ff', sunA: 0.12, sunEl: 0.42, mist: '#7f90c0', rip: '#c9dbff' }],
  [270, { top: '#03050f', mid: '#0b1432', hor: '#1e2a56', wHor: '#151f40', wMid: '#09112a', wNear: '#03060f', star: 0.95, dark: 0.82, lant: 0.9, sun: '#9fb4ff', sunA: 0.1, sunEl: 0.42, mist: '#7f90c0', rip: '#c9dbff' }],
  [330, { top: '#0e1a3e', mid: '#2c3d70', hor: '#8f7590', wHor: '#5f5b7c', wMid: '#2b3454', wNear: '#10172a', star: 0.45, dark: 0.6, lant: 0.45, sun: '#ffb48a', sunA: 0.35, sunEl: -0.02, mist: '#a59cb8', rip: '#e8dcf0' }],
  [360, { top: '#3b5c8e', mid: '#c48ca2', hor: '#ffc59a', wHor: '#f1b99a', wMid: '#8c8aa8', wNear: '#3e4a5e', star: 0.08, dark: 0.28, lant: 0.08, sun: '#ffd0a0', sunA: 0.85, sunEl: 0.03, mist: '#f3d6cf', rip: '#fff0e4' }],
  [420, { top: '#8fb0c4', mid: '#c6d4d2', hor: '#f1e6d6', wHor: '#e2dfd4', wMid: '#a9b8b4', wNear: '#5f7672', star: 0, dark: 0.04, lant: 0, sun: '#fff4e0', sunA: 0.7, sunEl: 0.1, mist: '#eaefeb', rip: '#f4f8f4' }],
  [600, { top: '#9cafad', mid: '#c9d3cf', hor: '#dfe5e0', wHor: '#d2dbd6', wMid: '#aebdb8', wNear: '#5f7672', star: 0, dark: 0, lant: 0, sun: '#fffaec', sunA: 0.75, sunEl: 0.15, mist: '#eaefeb', rip: '#f4f8f4' }],
  [960, { top: '#9cafad', mid: '#c9d3cf', hor: '#dfe5e0', wHor: '#d2dbd6', wMid: '#aebdb8', wNear: '#5f7672', star: 0, dark: 0, lant: 0, sun: '#fffaec', sunA: 0.75, sunEl: 0.15, mist: '#eaefeb', rip: '#f4f8f4' }],
  [1050, { top: '#94aab0', mid: '#d0d2c4', hor: '#eadcc0', wHor: '#ddd5c0', wMid: '#aab3a8', wNear: '#5c6b66', star: 0, dark: 0.05, lant: 0, sun: '#ffe2b0', sunA: 0.8, sunEl: 0.08, mist: '#efe6d6', rip: '#f8f2e6' }],
  [1110, { top: '#6f7fa8', mid: '#d39a8a', hor: '#f6b47a', wHor: '#e4a88a', wMid: '#8f8394', wNear: '#3b4152', star: 0.05, dark: 0.26, lant: 0.2, sun: '#ffb070', sunA: 0.9, sunEl: 0.01, mist: '#f0c8b4', rip: '#ffe6d6' }],
  [1170, { top: '#1f2c5a', mid: '#4a4f86', hor: '#b07a90', wHor: '#6d5f80', wMid: '#333b62', wNear: '#141a30', star: 0.4, dark: 0.6, lant: 0.7, sun: '#ff9a7a', sunA: 0.3, sunEl: -0.02, mist: '#a99ab8', rip: '#e6dcf4' }],
  [1230, { top: '#060a1c', mid: '#0f193c', hor: '#25305c', wHor: '#1a2446', wMid: '#0c1430', wNear: '#050812', star: 0.9, dark: 0.8, lant: 1, sun: '#9fb4ff', sunA: 0.12, sunEl: 0.42, mist: '#7f90c0', rip: '#c9dbff' }],
  [1440, { top: '#03050f', mid: '#0a1230', hor: '#1b2550', wHor: '#141d3c', wMid: '#09112a', wNear: '#03060f', star: 1, dark: 0.84, lant: 1, sun: '#9fb4ff', sunA: 0.12, sunEl: 0.42, mist: '#7f90c0', rip: '#c9dbff' }],
];
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mixHex = (a, b, f) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * f).toString(16).padStart(2, '0')).join('');

/** The sky at `min` minutes after midnight, Paris time: colours mixed between the two nearest hours. */
export function skyAt(min) {
  const m = ((min % 1440) + 1440) % 1440;
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1][0] <= m) i++;
  const [m0, a] = SKY[i], [m1, b] = SKY[i + 1], f = m1 > m0 ? (m - m0) / (m1 - m0) : 0;
  const out = {};
  for (const k of Object.keys(a)) out[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * f : mixHex(a[k], b[k], f);
  return out;
}

/** Minutes after midnight in Paris — or `?sky=HH:MM` from the address, to see the night by day. */
export function skyMinutes(ms = Date.now(), search = '') {
  const m = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(search).get('sky') || '');
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return Number(m[1]) * 60 + Number(m[2]);
  return parisMinutes(ms);
}
