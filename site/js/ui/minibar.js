/**
 * The mini-player — the radio on every page. It reads the Player, never the
 * station directly, so it is always showing what this listener hears.
 */
import { fmt } from './util.js';

export function mountMinibar({ player, stage }) {
  const $ = (id) => document.getElementById(id);
  const bar = $('minibar');
  const tune = $('mbTune');
  const title = $('mbTitle');
  const artist = $('mbArtist');
  const badge = $('mbBadge');
  const prog = $('mbBar');
  const time = $('mbTime');
  const spec = $('mbSpec');

  tune.addEventListener('click', () => player.toggle());

  const paint = () => {
    const t = player.onAir;
    title.textContent = t ? t.title : 'Dead air';
    artist.textContent = t ? t.artist : 'No tracks yet';
  };
  player.addEventListener('station', paint);
  player.addEventListener('playing', (e) => {
    bar.classList.toggle('playing', e.detail);
    document.body.classList.toggle('playing', e.detail);
    tune.setAttribute('aria-label', e.detail ? 'Mute' : 'Tune in');
    badge.textContent = e.detail ? 'ON AIR' : 'LIVE';
  });
  player.addEventListener('tick', (e) => {
    const { pos, dur, pct } = e.detail;
    prog.style.width = `${pct * 100}%`;
    time.textContent = `${fmt(pos)} / ${fmt(dur)}`;
  });

  // The little spectrum repaints with the stage, at most ~30 fps.
  let last = 0;
  const loop = (ts) => {
    requestAnimationFrame(loop);
    if (document.hidden || ts - last < 33 || spec.offsetParent === null) return;
    last = ts;
    stage.drawMini(spec);
  };
  requestAnimationFrame(loop);
  paint();
}
