/**
 * The daily programme: a broadcast day that starts at 05:00 in Paris.
 *
 * Until 2026-10-14 the tower played every track once per cycle, shuffled —
 * fine for 140 tracks, wrong for 1,800 where some are favourites and most
 * are albums still to be discovered. Ortis's rules (docs/PROGRAMME.md):
 *
 *   - the favourites (the "For Radio" and "For The Waves" folders) play
 *     every day;
 *   - the tracks already on the loop come round more often than the albums,
 *     but not necessarily every day;
 *   - every album track plays, over however many days that takes, and new
 *     downloads join without anything being re-listed by hand;
 *   - never the same artist twice in a row, as far as the music allows;
 *   - the day turns over at 05:00 Paris time, when nobody is listening.
 *
 * The station's one idea still holds: the programme is a pure function of
 * the library, the rules and the wall clock. Nothing is stored. A day is
 * rebuilt from scratch, identically, on any machine, as often as asked —
 * that is what lets a restart, a second server, or a test, agree with what
 * listeners heard.
 *
 * How a day is built
 * ------------------
 * Every track belongs to the first *lane* whose filter it matches:
 *
 *   perDay: 4  a few a day, in turn, at least `apart` songs     (Long mixes)
 *              apart and never two in a row
 *   every: 1   all of its tracks, every day                      (Favourites)
 *   every: N   a "pass" of N days: shuffled once per pass, then   (Loop, More
 *              cut into N equal-duration slices — each track       often, Less
 *              once per pass                                       often)
 *   fill       the time left over. An endless stream of passes,   (Albums)
 *              each a fresh shuffle of the lane, track by track,
 *              never album by album; every day takes the next
 *              stretch of it, as long as the day has room for
 *
 * The songs of the day are dealt so that each artist is spread as evenly as
 * the day allows, and within an artist the lanes take turns — so the
 * favourites land all through the day, not in a clump. The long mixes go in
 * evenly between them. If the day is a song short, encores (loop tracks not
 * heard today); the last track is cut at the end of the day.
 *
 * Where the albums' stretch starts on day d is the sum of the album time of
 * the days before it since `since` — measured, not built, and memoised. The
 * price: adding tracks to the albums changes their passes, and the pass in
 * progress is re-dealt from the next morning (the cycle in progress is
 * protected, as for every library change — schedule.js). Every track still
 * comes round within two passes. docs/DECISIONS.md, 2026-10-14.
 *
 * Time zones without Intl: the European summer-time rule (last Sunday of
 * March to last Sunday of October, at 01:00 UTC) is arithmetic, identical in
 * every engine; `Intl` time-zone data is not guaranteed to be.
 */
import { Station, seededShuffle } from './schedule.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/* --------------------------------------------------------------- clock -- */

/** Standard offset (hours) and whether the European summer-time rule applies. */
const ZONES = {
  UTC: [0, false],
  'Europe/London': [0, true],
  'Europe/Dublin': [0, true],
  'Europe/Lisbon': [0, true],
  'Europe/Paris': [1, true],
  'Europe/Amsterdam': [1, true],
  'Europe/Brussels': [1, true],
  'Europe/Berlin': [1, true],
  'Europe/Madrid': [1, true],
  'Europe/Rome': [1, true],
  'Europe/Zurich': [1, true],
  'Europe/Athens': [2, true],
  'Europe/Helsinki': [2, true],
};

/** 01:00 UTC on the last Sunday of a month (0-based), when Europe changes clocks. */
function lastSunday(year, month) {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1);
}

/** "05:00" → 300. Anything unreadable → null. */
export function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/**
 * The broadcast-day calendar. Day numbers count local calendar dates since
 * 1970-01-01; day d runs from `dayStarts` on its date to `dayStarts` on the
 * next — 24 hours, or 23 and 25 on the nights the clocks change.
 */
export function makeCalendar({ timeZone = 'Europe/Paris', dayStarts = '05:00' } = {}) {
  const [base, summer] = ZONES[timeZone] || ZONES['Europe/Paris'];
  const startMin = minutesOf(dayStarts) ?? 300;
  const offsetAt = (t) => {
    if (!summer) return base * HOUR;
    const y = new Date(t).getUTCFullYear();
    return t >= lastSunday(y, 2) && t < lastSunday(y, 9) ? (base + 1) * HOUR : base * HOUR;
  };
  /** UTC ms of local wall-clock time `minutes` after midnight starting date `day`. */
  const at = (day, minutes) => {
    const local = day * DAY + minutes * MINUTE;
    return local - offsetAt(local - base * HOUR);
  };
  return {
    timeZone: ZONES[timeZone] ? timeZone : 'Europe/Paris',
    startMin,
    offsetAt,
    at,
    dayOf: (t) => Math.floor((t + offsetAt(t) - startMin * MINUTE) / DAY),
    dayStart: (day) => at(day, startMin),
    /** `hhmm` inside day d: an hour earlier than the day's start belongs to the next date. */
    clockIn: (day, hhmm) => {
      const m = minutesOf(hhmm);
      if (m === null) return null;
      return at(day, m < startMin ? m + 24 * 60 : m);
    },
    /** 'YYYY-MM-DD' → day number. */
    dayOfDate: (iso) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
      return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : null;
    },
    dateOf: (day) => new Date(day * DAY).toISOString().slice(0, 10),
  };
}

/* --------------------------------------------------------------- rules -- */

/** Lower-case, accent-free, single-spaced — how names are compared. */
export function fold(s) {
  return String(s ?? '').normalize('NFKC').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[\s_]+/g, ' ').trim();
}

/**
 * The rules Ortis set on 2026-10-13, used when a spec says `"programme": true`.
 * `More often` and `Less often` are empty until he drops songs in those
 * folders — room kept for pushing a song up or down without new rules.
 */
export const DEFAULT_PROGRAMME = {
  timeZone: 'Europe/Paris',
  dayStarts: '05:00',
  since: '2026-10-14',
  lanes: [
    { name: 'Long mixes', minMinutes: 20, perDay: 4, apart: 3 },
    { name: 'Favourites', folders: ['For Radio', 'For The Waves'], every: 1 },
    { name: 'More often', folders: ['More often'], every: 3 },
    { name: 'Less often', folders: ['Less often'], every: 30 },
    { name: 'Albums', folders: ['Crates/Bandcamp'], fill: true },
    { name: 'Loop', every: 2 },
  ],
  aliases: {},
};

/**
 * Make a spec safe to build days from. Unknown or malformed pieces fall
 * back rather than throw: a typo in channels.json must not take the
 * station off air (server/index.js reads it on every rescan).
 */
export function normalizeProgramme(spec) {
  const src = spec && typeof spec === 'object' ? spec : DEFAULT_PROGRAMME;
  const lanesIn = Array.isArray(src.lanes) && src.lanes.length ? src.lanes : DEFAULT_PROGRAMME.lanes;
  const lanes = [];
  let fill = false;
  let spaced = false;
  for (const raw of lanesIn) {
    if (!raw || typeof raw !== 'object') continue;
    const lane = {
      name: String(raw.name || `Lane ${lanes.length + 1}`).slice(0, 40),
      folders: (Array.isArray(raw.folders) ? raw.folders : []).map((f) => fold(String(f).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))).filter(Boolean),
      crates: (Array.isArray(raw.crates) ? raw.crates : []).map(fold).filter(Boolean),
      minMinutes: Number.isFinite(raw.minMinutes) ? raw.minMinutes : null,
      maxMinutes: Number.isFinite(raw.maxMinutes) ? raw.maxMinutes : null,
      kind: 'every',
      every: 1,
    };
    if (raw.perDay !== undefined && !spaced) {
      // A few a day, in turn, kept apart by songs: the long mixes.
      lane.kind = 'spaced';
      lane.perDay = Number.isInteger(raw.perDay) && raw.perDay >= 0 && raw.perDay <= 48 ? raw.perDay : 4;
      lane.apart = Number.isInteger(raw.apart) && raw.apart >= 1 && raw.apart <= 50 ? raw.apart : 3;
      spaced = true;
    } else if ((raw.fill === true || raw.every === undefined) && !fill) {
      lane.kind = 'fill';
      fill = true;
    } else {
      lane.every = Number.isInteger(raw.every) && raw.every >= 1 && raw.every <= 365 ? raw.every : 1;
    }
    lanes.push(lane);
  }
  const aliases = {};
  for (const [k, v] of Object.entries(src.aliases && typeof src.aliases === 'object' ? src.aliases : {})) {
    if (fold(k) && fold(v)) aliases[fold(k)] = fold(v);
  }
  return {
    timeZone: ZONES[src.timeZone] ? src.timeZone : 'Europe/Paris',
    dayStarts: minutesOf(src.dayStarts) !== null ? src.dayStarts : '05:00',
    since: /^\d{4}-\d{2}-\d{2}$/.test(src.since ?? '') ? src.since : DEFAULT_PROGRAMME.since,
    lanes,
    aliases,
  };
}

/** Does a track pass a lane's filter? A lane with no filter takes whatever is left. */
function laneMatches(t, lane) {
  const mins = (t.duration || 0) / 60;
  if (lane.minMinutes !== null && mins < lane.minMinutes) return false;
  if (lane.maxMinutes !== null && mins >= lane.maxMinutes) return false;
  if (lane.folders.length || lane.crates.length) {
    const rel = fold(String(t.relPath ?? ''));
    const inFolder = lane.folders.some((f) => rel === f || rel.startsWith(`${f}/`));
    const crates = [t.crate, ...(Array.isArray(t.crates) ? t.crates : [])].filter(Boolean).map(fold);
    const inCrate = lane.crates.some((c) => crates.includes(c));
    if (!inFolder && !inCrate) return false;
  }
  return true;
}

/* ------------------------------------------------------------- artists -- */

const SPLIT = /\s*(?:&|\+|,|;|\/|\band\b|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\bvs\.?)\s*/i;

/**
 * Who a track is by, as a set of folded names: "undersaken & GORE" is both,
 * so it may follow neither. An alias maps a second name to the first
 * ("Saken 天" → "undersaken") when they are the same person. A file with
 * no artist tag is often named "Artist - Title" (the long mixes are); else
 * it is by nobody in particular and never clashes.
 */
export function artistsOf(t, aliases = {}) {
  let raw = String(t?.artist ?? '').trim();
  if (!raw || /^unknown artist$/i.test(raw)) {
    const m = /^(.+?)\s+[-–—]\s+\S/.exec(String(t?.title ?? ''));
    raw = m ? m[1].trim() : '';
  }
  if (!raw) return [];
  const names = raw.split(SPLIT).map(fold).filter(Boolean).map((n) => aliases[n] || n);
  const whole = aliases[fold(raw)];
  return [...new Set(whole ? [whole, ...names] : names)];
}

const clash = (a, b) => a.length > 0 && b.length > 0 && a.some((n) => b.includes(n));

/* ----------------------------------------------------------- utilities -- */

/** FNV-1a — a stable 32-bit seed from a string. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const seed = (...parts) => hash(parts.join('|'));
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Deal items so every group is spread as evenly as its size allows — the
 * same card-dealing as schedule.js interleave(), with two differences: the
 * caller orders each group (so a group can spread its own lanes), and
 * "the same group" is a clash test, so a collaboration counts against both
 * artists.
 *
 * The repair pass pulls a non-clashing item forward, but only from the next
 * `reach` slots. When one artist is most of the day (undersaken is about
 * three tracks in four), the even deal already gives the shortest runs
 * there can be; an unbounded repair "fixes" each pair by spending the other
 * artists early and leaves a wall of one artist at the end of the day —
 * measured on the real library, 2026-10-13: a 131-track run.
 */
export function dealSpread(items, groupOf, orderGroup, clashes, s, { reach = 3 } = {}) {
  const groups = new Map();
  for (const it of items) {
    const g = groupOf(it);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  const names = [...groups.keys()].sort();
  const dealt = [];
  names.forEach((name, gi) => {
    const list = orderGroup(groups.get(name), name);
    const offset = ((hash(`${s}|${name}`) % 10_000) + 0.5) / 10_000;
    list.forEach((it, k) => dealt.push({ it, pos: (k + offset) / list.length, gi }));
  });
  dealt.sort((a, b) => a.pos - b.pos || a.gi - b.gi);
  const out = dealt.map((d) => d.it);
  for (let i = 1; i < out.length; i++) {
    if (!clashes(out[i - 1], out[i])) continue;
    let j = i + 1;
    while (j < out.length && j <= i + reach && clashes(out[i - 1], out[j])) j++;
    if (j >= out.length || j > i + reach) continue;
    const [moved] = out.splice(j, 1);
    out.splice(i, 0, moved);
  }
  return out;
}

/**
 * dealSpread(), and the case it cannot handle: one artist who is more than
 * half the day. Dealt among thirty others, their tracks bunch wherever the
 * others' offsets happen to cluster (runs of 9–10 on the real library). So
 * the others are dealt first, among themselves, and the dominant artist goes
 * into the gaps between them, as evenly as the counts allow — runs of
 * ceil(U / (others + 1)), the shortest there can be: 3 at 70 %.
 */
export function spreadArtists(items, groupOf, orderGroup, clashes, s) {
  const sizes = new Map();
  for (const it of items) sizes.set(groupOf(it), (sizes.get(groupOf(it)) || 0) + 1);
  let top = null;
  for (const [g, n] of sizes) if (top === null || n > sizes.get(top) || (n === sizes.get(top) && g < top)) top = g;
  if (top === null || sizes.get(top) * 2 <= items.length + 1) return dealSpread(items, groupOf, orderGroup, clashes, s);

  const others = dealSpread(items.filter((it) => groupOf(it) !== top), groupOf, orderGroup, clashes, s);
  const mine = orderGroup(items.filter((it) => groupOf(it) === top), top);
  const gaps = others.length + 1;
  const U = mine.length;
  // Which gaps get the extra track: rotated by a seeded amount, so it is not
  // always the start of the day that gets the longest runs.
  const shift = hash(`${s}|gaps`) % gaps;
  const out = [];
  let k = 0;
  for (let g = 0; g < gaps; g++) {
    const r = (g + shift) % gaps;
    const n = Math.floor(((r + 1) * U) / gaps) - Math.floor((r * U) / gaps);
    for (let i = 0; i < n && k < U; i++) out.push(mine[k++]);
    if (g < others.length) out.push(others[g]);
  }
  while (k < U) out.push(mine[k++]);
  return out;
}

/**
 * Never two tracks of one album in a row: the albums are mixed track by
 * track (Ortis, 2026-10-13). Inside a run of one artist — undersaken has a
 * hundred albums — a track is swapped with a later one of the same group
 * from another album, so the pattern of artists does not move at all.
 */
export function separateAlbums(list, groupOf, albumOf, { reach = 24 } = {}) {
  const out = list.slice();
  const same = (a, b) => Boolean(a && b) && albumOf(a) === albumOf(b);
  for (let i = 1; i < out.length; i++) {
    if (!same(out[i - 1], out[i])) continue;
    for (let j = i + 1; j < out.length && j <= i + reach; j++) {
      if (groupOf(out[j]) !== groupOf(out[i]) || same(out[i - 1], out[j]) || same(out[j], out[i + 1])) continue;
      // Where out[i] lands must not pair it with its own album either.
      if (same(out[j - 1], out[i]) && j - 1 !== i) continue;
      if (same(out[i], out[j + 1])) continue;
      [out[i], out[j]] = [out[j], out[i]];
      break;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- plan -- */

/**
 * Split a library into lanes, once per era: which lane each track is in,
 * each lane's total, how often the rotations really come round. Days are
 * built from this, and the albums' place in their stream is memoised on it.
 */
export function planLibrary(tracks, rules, calendar, gapSeconds = 0) {
  const lanes = rules.lanes.map((l) => ({ ...l, tracks: [], seconds: 0 }));
  for (const t of [...tracks].sort(byId)) {
    const lane = lanes.find((l) => laneMatches(t, l));
    if (!lane) continue;
    lane.tracks.push(t);
    lane.seconds += t.duration + gapSeconds;
  }
  const spaced = lanes.find((l) => l.kind === 'spaced' && l.tracks.length) || null;
  const fill = lanes.find((l) => l.kind === 'fill' && l.tracks.length) || null;

  // Everything but the albums has its time set in advance. If together it
  // would leave the albums less than a tenth of the day, the rotations slow
  // down rather than crowd them out; the favourites stay daily.
  const fixed = lanes.filter((l) => l.kind === 'every' && l.tracks.length);
  const daily = fixed.filter((l) => l.every === 1).reduce((s, l) => s + l.seconds, 0);
  const longs = spaced ? (Math.min(spaced.perDay, spaced.tracks.length) * spaced.seconds) / spaced.tracks.length : 0;
  const rotating = fixed.filter((l) => l.every > 1).reduce((s, l) => s + l.seconds / l.every, 0);
  const room = Math.max(0, 86_400 * 0.9 - daily - longs);
  const slow = rotating > room && rotating > 0 ? rotating / Math.max(room, 1) : 1;
  for (const l of fixed) l.period = l.every === 1 ? 1 : Math.min(365, Math.ceil(l.every * slow));

  return {
    lanes,
    spaced,
    fill,
    gapSeconds,
    calendar,
    since: calendar.dayOfDate(rules.since) ?? 0,
    passCache: new Map(),
    fillAt: new Map(), // day -> where that day's albums start in their stream (seconds)
  };
}

/** One pass of a lane: a seeded shuffle and where each track starts in it. */
function passOf(plan, lane, pass) {
  const key = `${lane.name}|${pass}`;
  let p = plan.passCache.get(key);
  if (!p) {
    const order = seededShuffle(lane.tracks, seed('pass', lane.name, pass));
    const starts = [];
    let acc = 0;
    for (const t of order) { starts.push(acc); acc += t.duration + plan.gapSeconds; }
    p = { order, starts, seconds: acc };
    if (plan.passCache.size > 256) plan.passCache.clear();
    plan.passCache.set(key, p);
  }
  return p;
}

/**
 * The tracks of an endless stream of passes whose start falls in
 * [from, to) — seconds since the lane's anchor. Each track is in exactly
 * one window per pass, so walking day by day plays every track once.
 */
function streamWindow(plan, lane, from, to, { max = 5000 } = {}) {
  const out = [];
  const L = passOf(plan, lane, 0).seconds;
  if (!(L > 0) || !(to > from)) return out;
  let pass = Math.floor(from / L);
  while (out.length < max) {
    const p = passOf(plan, lane, pass);
    const base = pass * L;
    if (base >= to) break;
    // First index whose start is ≥ from (binary search).
    let lo = 0;
    let hi = p.order.length;
    const want = from - base;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (p.starts[mid] < want) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < p.order.length && base + p.starts[i] < to && out.length < max; i++) out.push(p.order[i]);
    pass++;
  }
  return out;
}

/** The slice of an every-N lane that day d plays: equal-duration slices of a per-pass shuffle. */
function rotationSlice(plan, lane, d) {
  const n = d - plan.since;
  const period = lane.period;
  if (period <= 1) return lane.tracks;
  const pass = Math.floor(n / period);
  const j = n - pass * period;
  const p = passOf(plan, lane, pass);
  const lo = (j * p.seconds) / period;
  const hi = ((j + 1) * p.seconds) / period;
  return p.order.filter((_, i) => p.starts[i] >= lo && p.starts[i] < hi);
}

/**
 * Day d's long mixes: the next `perDay` of their stream — a fresh shuffle
 * of them all per pass, so each comes round in turn, never twice in a day.
 */
function longPicks(plan, d) {
  const lane = plan.spaced;
  if (!lane) return [];
  const m = lane.tracks.length;
  const k = Math.min(lane.perDay, m);
  const out = [];
  for (let g = (d - plan.since) * k, end = g + k; g < end; g++) {
    const pass = Math.floor(g / m);
    out.push(passOf(plan, lane, pass).order[g - pass * m]);
  }
  return [...new Set(out)];
}

const slotSeconds = (list, gap) => list.reduce((s, t) => s + t.duration + gap, 0);

/** The albums' share of day d: the day, less everything that plays in it for sure. */
function fillSeconds(plan, d) {
  const len = (plan.calendar.dayStart(d + 1) - plan.calendar.dayStart(d)) / 1000;
  let set = slotSeconds(longPicks(plan, d), plan.gapSeconds);
  for (const lane of plan.lanes) if (lane.kind === 'every' && lane.tracks.length) set += slotSeconds(rotationSlice(plan, lane, d), plan.gapSeconds);
  return Math.max(0, len - set);
}

/**
 * Where day d's albums start in their stream: the sum of the album time of
 * every day since `since`. The days before d are not built for this, only
 * measured (a rotation slice and a few long mixes each), and the sums are
 * kept on the plan — a year of days is a few milliseconds, once per era.
 * This is what makes the albums fill each day exactly, whatever the long
 * mixes take, and still play every track once per pass.
 */
function fillStart(plan, d) {
  if (plan.fillAt.has(d)) return plan.fillAt.get(d);
  if (!plan.fillAt.size) plan.fillAt.set(plan.since, 0);
  const known = [...plan.fillAt.keys()];
  if (d > plan.since) {
    let day = Math.max(...known.filter((k) => k <= d));
    let x = plan.fillAt.get(day);
    while (day < d) { x += fillSeconds(plan, day); day++; plan.fillAt.set(day, x); }
    return x;
  }
  let day = Math.min(...known.filter((k) => k >= d));
  let x = plan.fillAt.get(day);
  while (day > d) { day--; x -= fillSeconds(plan, day); plan.fillAt.set(day, x); }
  return x;
}

/**
 * Put the long mixes into the day's songs: evenly through the day, never two
 * in a row, at least `apart` songs between any two. Near each even spot, the
 * place that makes the shortest run of one artist wins — an undersaken mix
 * dropped into a run of his songs would make it four or five long (measured
 * on the real library, 2026-10-13). If the day has too few songs to keep
 * them apart, the extra mixes wait for their next turn.
 */
export function spaceOut(songs, longs, apart, clashes) {
  const N = songs.length;
  if (!longs.length) return songs;
  const k = Math.min(longs.length, Math.floor(N / Math.max(1, apart)) + 1);
  const s = Math.max(apart, N / k);
  const offset = Math.max(0, (N - (k - 1) * s) / 2);
  /** The run of one artist the mix would sit in, placed before songs[t]. */
  const runAt = (t, long) => {
    let n = 1;
    for (let i = t - 1; i >= 0 && clashes(songs[i], long); i--) n++;
    for (let i = t; i < N && clashes(songs[i], long); i++) n++;
    return n;
  };
  const at = [];
  for (let j = 0; j < k; j++) {
    const want = Math.round(offset + j * s);
    const lowest = j ? at[j - 1] + apart : 0;
    let best = null;
    for (const dlt of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
      const t = want + dlt;
      if (t < lowest || t > N) continue;
      const run = runAt(t, longs[j]);
      if (!best || run < best.run) best = { t, run };
      if (run === 1) break;
    }
    at.push(best ? best.t : Math.max(lowest, Math.min(N, want)));
  }
  const out = [];
  let j = 0;
  for (let i = 0; i <= N; i++) {
    while (j < k && at[j] === i) out.push(longs[j++]);
    if (i < N) out.push(songs[i]);
  }
  return out;
}

/**
 * Day d, in order, filling exactly from its start to the next day's start.
 * Each entry is a library track, except the last, which is a copy cut to
 * the time left (`cut: true`, `fullDuration` kept) when it would overrun.
 */
export function buildDay(plan, d, { calendar, rules, gapSeconds = 0 }) {
  const dayStart = calendar.dayStart(d);
  const dayEnd = calendar.dayStart(d + 1);
  const aliases = rules.aliases || {};
  const who = new Map();
  const artists = (t) => {
    if (!t) return [];
    if (!who.has(t)) who.set(t, artistsOf(t, aliases));
    return who.get(t);
  };
  const laneOf = new Map();

  // 1. What plays today, lane by lane.
  const songs = [];
  const seen = new Set();
  const take = (t, lane) => { if (!seen.has(t.id)) { seen.add(t.id); laneOf.set(t, lane.name); songs.push(t); } };
  for (const lane of plan.lanes) {
    if (!lane.tracks.length) continue;
    if (lane.kind === 'every') for (const t of rotationSlice(plan, lane, d)) take(t, lane);
  }
  if (plan.fill) {
    const from = fillStart(plan, d);
    for (const t of streamWindow(plan, plan.fill, from, from + fillSeconds(plan, d))) take(t, plan.fill);
  }

  // 2. The songs, dealt: artists spread out, lanes taking turns within an
  // artist. A track's group is its busiest artist today, so a collaboration
  // sits with whoever it is hardest to keep apart.
  const count = new Map();
  for (const t of songs) for (const a of artists(t)) count.set(a, (count.get(a) || 0) + 1);
  const groupOf = (t) => {
    const names = artists(t);
    if (!names.length) return `~${t.id}`;
    return names.reduce((best, a) => ((count.get(a) || 0) > (count.get(best) || 0) || ((count.get(a) || 0) === (count.get(best) || 0) && a < best) ? a : best));
  };
  const s = seed('day', d);
  const orderGroup = (list, name) => {
    // Lanes take turns inside the group; each lane's share is shuffled.
    const byLane = new Map();
    for (const t of list.sort(byId)) {
      const l = laneOf.get(t);
      if (!byLane.has(l)) byLane.set(l, []);
      byLane.get(l).push(t);
    }
    return dealSpread(
      [...byLane.entries()].flatMap(([l, ts]) => seededShuffle(ts, seed(s, name, l))),
      (t) => laneOf.get(t),
      (ts) => ts,
      () => false,
      seed(s, name),
    );
  };
  const clashes = (a, b) => clash(artists(a), artists(b));
  const albumOf = (t) => fold(t.album) || String(t.relPath ?? '').split('/').slice(0, -1).join('/') || t.id;
  let programme = separateAlbums(spreadArtists(songs, groupOf, orderGroup, clashes, s), groupOf, albumOf);

  // 3. The long mixes, spaced through the day.
  if (plan.spaced) programme = spaceOut(programme, longPicks(plan, d), plan.spaced.apart, clashes);

  // 4. Encores if the day is short — the albums stop on a track boundary, so
  // it can be by a song: loop and favourite tracks not heard today first.
  let end = dayStart + slotSeconds(programme, gapSeconds) * 1000;
  if (end < dayEnd) {
    const rotation = plan.lanes.filter((l) => l.kind === 'every' && l.tracks.length);
    const spare = seededShuffle(rotation.flatMap((l) => l.tracks).filter((t) => !seen.has(t.id)), seed(s, 'encore'));
    const pool = [...spare, ...seededShuffle(songs, seed(s, 'again'))];
    let guard = 0;
    while (end < dayEnd && pool.length && guard++ < 100_000) {
      const prev = programme[programme.length - 1];
      const left = (dayEnd - end) / 1000;
      // Nothing that would be cut before its middle, if something shorter will do.
      const fits = (t) => t.duration <= left || left >= t.duration / 2;
      let i = pool.findIndex((t) => fits(t) && !clashes(prev, t));
      if (i < 0) i = pool.findIndex(fits);
      if (i < 0) i = pool.reduce((best, t, k) => (t.duration < pool[best].duration ? k : best), 0);
      const [t] = pool.splice(i, 1);
      programme.push(t);
      end += (t.duration + gapSeconds) * 1000;
      if (!pool.length) pool.push(...seededShuffle(songs.length ? songs : programme, seed(s, 'again', guard)));
    }
  }

  // 5. Fit: drop whatever starts at or after the end, cut the last one.
  let at = dayStart;
  const out = [];
  for (const t of programme) {
    if (at >= dayEnd) break;
    const slot = (t.duration + gapSeconds) * 1000;
    if (at + slot > dayEnd) {
      const left = (dayEnd - at) / 1000 - gapSeconds;
      if (left > 0.5) out.push(cutCopy(t, left));
      else if (out.length) out[out.length - 1] = cutCopy(out[out.length - 1], out[out.length - 1].duration + left);
      at = dayEnd;
      break;
    }
    out.push(t);
    at += slot;
  }
  return out;
}

/** A track's slot shortened to `seconds`: same id, so it streams the same file. */
function cutCopy(t, seconds) {
  const copy = Object.create(Object.getPrototypeOf(t));
  Object.assign(copy, t, { duration: Math.max(0.5, Math.round(seconds * 1000) / 1000), fullDuration: t.fullDuration ?? t.duration, cut: true });
  for (const k of ['crate']) if (t[k] !== undefined) Object.defineProperty(copy, k, { value: t[k], enumerable: false, configurable: true, writable: true });
  return copy;
}

/* ------------------------------------------------------------- station -- */

/**
 * A Station whose cycle is one broadcast day. Everything else — eras, the
 * DJ's permutations, upcoming/history/schedule, the fence — is Station's,
 * unchanged: a day is a cycle with an order and a start, which is all those
 * need. A library change, or new rules, take over at the next 05:00.
 *
 * The calendar (time zone, start hour) is fixed for the life of the
 * process: moving it would move the start of the day already on air.
 */
export class DailyStation extends Station {
  /**
   * @param {Array} tracks
   * @param {object} opts         Station's, plus:
   * @param {object} [opts.programme]  rules (normalizeProgramme); DEFAULT_PROGRAMME if absent
   */
  constructor(tracks = [], { programme = null, ...opts } = {}) {
    super([], { ...opts, order: 'shuffle' });
    this.order = 'daily';
    this.rules = normalizeProgramme(programme);
    this.calendar = makeCalendar(this.rules);
    this.setTracks(tracks);
  }

  /**
   * Same as Station's, plus `programme`: new rules are staged like a new
   * library — they govern from the next day boundary on.
   */
  setTracks(tracks, { now = Date.now(), programme } = {}) {
    if (programme !== undefined && this.calendar) {
      const next = normalizeProgramme(programme);
      if (next.timeZone !== this.rules.timeZone || next.dayStarts !== this.rules.dayStarts) {
        console.warn('[programme] a new time zone or start of day takes effect at the next restart');
        next.timeZone = this.rules.timeZone;
        next.dayStarts = this.rules.dayStarts;
      }
      this.rules = next;
    }
    return super.setTracks(tracks, { now });
  }

  _rulesKey() {
    return this.rules ? JSON.stringify(this.rules) : '';
  }

  _fingerprintOf(tracks) {
    return `${super._fingerprintOf(tracks)}#${this._rulesKey()}`;
  }

  _buildEra(tracks, startTimeMs, startAbsCycle) {
    const era = super._buildEra(tracks, startTimeMs, startAbsCycle);
    era.fingerprint = this._fingerprintOf(tracks);
    if (this.calendar && tracks.length) {
      era.rules = this.rules;
      era.plan = planLibrary(tracks, this.rules, this.calendar, this.gapSeconds);
    }
    return era;
  }

  _nextBoundary(baseline, now) {
    const day = this.calendar.dayOf(now) + 1;
    return { startAbsCycle: day, startTimeMs: this.calendar.dayStart(day) };
  }

  _locate(now) {
    const day = this.calendar.dayOf(now);
    const era = this._eraForCycle(day);
    if (!era.plan) return null;
    return { cycleIndex: day, pos: (now - this.calendar.dayStart(day)) / 1000 };
  }

  _startOfCycle(day) {
    return this.calendar.dayStart(day);
  }

  _naturalOrder(era, day) {
    if (!era.plan) return [];
    return buildDay(era.plan, day, { calendar: this.calendar, rules: era.rules, gapSeconds: this.gapSeconds });
  }

  get isEmpty() {
    return !this._eraForCycle(this.calendar.dayOf(Date.now())).plan;
  }

  /** Which lane each of a day's tracks came from — for the programme guide and the booth. */
  laneOf(trackId, day = this.calendar.dayOf(Date.now())) {
    const era = this._eraForCycle(day);
    return era.plan?.lanes.find((l) => l.tracks.some((t) => t.id === trackId))?.name ?? null;
  }
}

export default DailyStation;
