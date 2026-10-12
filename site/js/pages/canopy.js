/**
 * /canopy — the call map, on its own page.
 *
 * Ortis, 2026-10-12: "the visualisation of bird songs … a three-dimensional
 * graph with the sound categorised in it, slowly spinning, live synced with
 * the radio." The map itself lives in ../viz/callmap.js and paints on the
 * one full-page stage like every other layer; any page can show it through
 * the Canopy look. This page exists so it has a link of its own: the map
 * gets the room, whatever look the listener has chosen elsewhere, and the
 * text says in four lines how to read it.
 */
import { esc } from '../ui/util.js';

export const title = 'Canopy';

export function mount(root, ctx) {
  const { player, setScene, theatre } = ctx;
  root.innerHTML = `
    <section class="canopy" aria-label="Canopy">
      <div class="canopy-head page-head" id="cHead">
        <span class="eyebrow">Canopy · Radio Tower</span>
        <h1>Every sound on air, mapped like birdsong.</h1>
        <details id="cHow">
          <summary>How to read it</summary>
          <p>Each dot is one sound the station just played — a kick, a chord, a voice — placed by what it sounds like.
            Alike sounds land together and each kind gets a colour. Lines join sounds heard one after another;
            the white line is the music right now.</p>
          <p class="hint">It is how bioacousticians map the calls of a forest. Dots fade after about forty seconds,
            and the map turns so you can see its depth. Everyone hears the same second; each browser draws its own map.</p>
        </details>
        <p class="canopy-now" id="cNow">—</p>
        <div class="controls">
          <button class="tune" id="cTune" type="button">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path class="i-play" d="M7 5l12 7-12 7z" fill="currentColor"/><path class="i-pause" d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>
            <span id="cTuneLabel">Tune in</span>
          </button>
          <button class="btn" id="cFull" type="button">Full screen <span class="kbd">F</span></button>
        </div>
      </div>
    </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const head = $('cHead');
  // Open on a wide screen, where the column has room; one tap away on a phone, where the map needs it.
  if (innerWidth >= 980) $('cHow').open = true;
  const box = root.querySelector('.canopy');
  document.body.classList.add('on-canopy');

  setScene(() => {
    const bottom = document.getElementById('minibar')?.offsetHeight ?? 70;
    const full = document.body.classList.contains('theatre');
    const h = head.getBoundingClientRect();
    // Wide screens: the words in a column on the left, the map in the room to
    // their right. Narrow ones: words on top, map underneath.
    const wide = innerWidth >= 980;
    const mapRect = full ? null : wide
      ? { left: Math.max(0, h.right + 16), top: 0, right: innerWidth, bottom: innerHeight - bottom }
      : { left: 0, top: Math.max(0, h.bottom), right: innerWidth, bottom: innerHeight - bottom };
    return { mode: 'radio', layers: { callmap: true, bloom: true }, intensity: 0.95, mapRect, bottomInset: bottom };
  });

  $('cTune').addEventListener('click', () => player.toggle());
  $('cFull').addEventListener('click', () => theatre?.());

  const setPlaying = (on) => {
    box.classList.toggle('playing', on);
    $('cTuneLabel').textContent = on ? 'Mute' : 'Tune in';
  };
  const paint = () => {
    const t = player.onAir;
    $('cNow').innerHTML = t ? `<span class="dot"></span> ${esc(t.title)} <span class="by">— ${esc(t.artist)}</span>` : '—';
  };
  const onPlaying = (e) => setPlaying(e.detail);
  player.addEventListener('station', paint);
  player.addEventListener('track', paint);
  player.addEventListener('playing', onPlaying);
  setPlaying(Boolean(player.playing));
  paint();

  return () => {
    document.body.classList.remove('on-canopy');
    player.removeEventListener('station', paint);
    player.removeEventListener('track', paint);
    player.removeEventListener('playing', onPlaying);
  };
}
