/**
 * The track-change caption (the mood board's MB-03, docs/design/MOODBOARD-globe-trotter.md). When the station changes
 * track, a caption slides in from the side — the artist on a skewed paper tag, the title in a tilted black shard that
 * scrambles and then settles like a signal locking on, the cover bleeding in at an angle — stays five seconds and
 * leaves faster than it came.
 *
 * It answers the station's own `track` event (player.js), never a timer, and not the first track of a visit: the
 * track you arrive on is not a change. A screen reader hears it once, politely. With less motion, a plain fade and no
 * scramble. It never takes a click and never touches the audio.
 */
import { esc, artistOf, blankCover } from './util.js';

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEFGHJKLMNPQRSTUVWXYZ#%&+=';

/**
 * The scramble, as frames: in frame i of n the first i/n of the title has settled, the rest is noise (spaces stay
 * spaces); the last frame is the title. Pure: `rnd` gives numbers in [0, 1).
 */
export function scrambleFrames(text, n, rnd) {
  const chars = [...String(text)];
  const frames = [];
  for (let i = 1; i <= n; i++) {
    const settled = Math.floor((chars.length * i) / n);
    frames.push(chars.map((c, k) => (k < settled || c === ' ' ? c : GLYPHS[Math.floor(rnd() * GLYPHS.length)])).join(''));
  }
  return frames;
}

export function mountCaption(player, { reduced = matchMedia('(prefers-reduced-motion: reduce)'), root = document.body, hold = 5200 } = {}) {
  const el = document.createElement('aside');
  el.className = 'cap';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="cap-art"></div><div class="cap-txt"><span class="cap-who"></span><span class="cap-what"><b></b></span></div>';
  const live = document.createElement('p');
  live.className = 'cap-live';
  live.setAttribute('aria-live', 'polite');
  root.append(el, live);
  const art = el.querySelector('.cap-art'), who = el.querySelector('.cap-who'), what = el.querySelector('.cap-what b');
  let lastId = null, timer = 0, frame = 0;

  function hide() {
    clearTimeout(timer);
    if (!el.classList.contains('in')) return;
    el.classList.remove('in');
    el.classList.add('out');
  }

  function show(t) {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    art.innerHTML = t.artUrl && t.hasArt !== false ? `<img src="${esc(t.artUrl)}" alt="">` : blankCover(t);
    who.textContent = artistOf(t);
    el.classList.remove('out', 'in');
    void el.offsetWidth;
    el.classList.add('in');
    live.textContent = `Now playing: ${t.title}, ${artistOf(t)}`;
    if (reduced.matches) what.textContent = t.title;
    else {
      let s = 1;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      const frames = scrambleFrames(t.title, 14, rnd);
      let i = 0;
      const step = () => { what.textContent = frames[i]; if (++i < frames.length) frame = requestAnimationFrame(() => setTimeout(step, 30)); };
      step();
    }
    timer = setTimeout(hide, hold);
  }

  player.addEventListener('track', (e) => {
    const t = e.detail;
    if (!t || t.id === lastId) return;
    const first = lastId === null;
    lastId = t.id;
    if (!first) show(t);
  });
  return { el, show, hide };
}
