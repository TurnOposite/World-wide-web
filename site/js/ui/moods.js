/**
 * Spontaneous Emissions in the browser — dj/dj.mjs's mood engine, same rules.
 *
 * `fold`, `resolveMood`, `scoreTrack` and `planEmission` are behaviour-for-
 * behaviour copies of the booth CLI's (which cannot be imported here: it
 * reads the disk). tests/site-moods.test.js runs both on the same inputs and
 * fails if they ever disagree. An emission is still only a *permutation of
 * the movable window* — it brings the mood forward, it never pulls a track in
 * from outside, and it never touches what is on air.
 */
import { movableWindow } from '../lib/queue-core.js';

export function fold(input) {
  if (!input) return '';
  let s = String(input).normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[\u{1D400}-\u{1D7FF}]/gu, (ch) => {
    const offset = (ch.codePointAt(0) - 0x1d400) % 52;
    return offset < 26 ? String.fromCharCode(65 + offset) : String.fromCharCode(97 + (offset - 26));
  });
  return s.toLowerCase().replace(/[_\-\[\]()（）【】]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function resolveMood(input, vocab) {
  const q = fold(input);
  if (!q) throw new Error('Name a mood.');
  for (const [name, rule] of Object.entries(vocab.moods)) {
    if (q === name || (rule.aliases || []).some((a) => fold(a) === q)) return { name, free: false, ...rule };
  }
  const words = q.split(' ').filter((w) => w.length > 2);
  const genres = {};
  const keywords = [];
  for (const w of words) {
    const hit = vocab.genres.find((g) => fold(g.slug).includes(w) || fold(g.label).includes(w));
    if (hit) genres[hit.slug] = 1;
    else keywords.push(w);
  }
  return { name: input, free: true, genres, keywords, prefer: null, why: 'free-text mood' };
}

export function scoreTrack(track, mood) {
  let score = 0;
  const hay = fold([track.title, track.artist, track.album, track.genreLabel].filter(Boolean).join(' '));
  const g = mood.genres?.[track.genreSlug];
  if (g) score += 100 * g;
  for (const kw of mood.keywords || []) if (hay.includes(fold(kw))) score += 40;
  for (const kw of mood.exclude || []) if (hay.includes(fold(kw)) || track.genreSlug === kw) score -= 200;
  const mins = (track.duration || 0) / 60;
  if (mood.prefer === 'short') score += mins <= 8 ? 20 : mins <= 20 ? 5 : -15;
  if (mood.prefer === 'long') score += mins >= 30 ? 20 : mins >= 10 ? 8 : -10;
  return score;
}

export function planEmission(slots, mood, { top = 0 } = {}) {
  const win = movableWindow(slots);
  if (!win) return { ok: false, error: 'no_movable_window', detail: 'Nothing upcoming can be moved right now — try again in a minute.' };
  const chosenSlots = slots.slice(win.from, win.to);
  const scored = chosenSlots.map((s, i) => ({ slot: s, i, score: scoreTrack(s, mood) }));
  const matched = scored.filter((s) => s.score > 0).length;
  let ordered;
  if (top > 0) {
    const picks = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, top);
    const chosen = new Set(picks.map((p) => p.i));
    ordered = [...picks, ...scored.filter((s) => !chosen.has(s.i))];
  } else {
    ordered = scored.slice().sort((a, b) => b.score - a.score || a.i - b.i);
  }
  const changed = ordered.some((s, idx) => s.i !== idx);
  return { ok: true, matched, changed, cycleIndex: win.cycleIndex, startWithin: win.startWithin, before: scored, after: ordered, ids: ordered.map((s) => s.slot.id) };
}
