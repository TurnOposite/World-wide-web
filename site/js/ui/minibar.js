/**
 * The mini-player — the radio on every page. It reads the Player, never the
 * station directly, so it is always showing what this listener hears.
 */
import { fmt } from './util.js';
import { identity, initial, loadBank } from './telegraph.js';
import { castFace, castLabel } from './cast.js';

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
    const ch = player.data?.station?.channelLabel;
    artist.textContent = t ? (ch ? `${t.artist} · ${ch}` : t.artist) : 'No tracks yet';
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

  // The listener's character stands by the button once they have one (Ortis, 2026-11-11), and leads to the
  // Antenna, where it is changed. Nobody chosen, nothing shown: the bar is as it was.
  const me = $('mbMe');
  const paintMe = async (who = identity.get()) => {
    if (!me) return;
    me.replaceChildren();
    me.hidden = !who;
    bar.classList.toggle('has-me', Boolean(who));
    if (!who) return;
    me.setAttribute('aria-label', `On the telegraph line as ${who.name}${castLabel(who.icon) ? ` — ${castLabel(who.icon)}` : ''}. Open the Antenna`);
    me.title = `${who.name} — on the telegraph line`;
    const face = castFace(who.icon, 'mb-face', 34);
    if (face) { me.append(face); return; }
    const letter = document.createElement('span');
    letter.className = 'mb-face mb-letter';
    letter.textContent = initial(who.name);
    me.append(letter);
    const bank = who.icon ? await loadBank() : [];
    if (identity.get() !== who || !bank.some((i) => i.file === who.icon)) return;
    const img = document.createElement('img');
    img.className = 'mb-face';
    img.alt = '';
    img.width = 34;
    img.height = 34;
    img.src = new URL(`assets/telegraph/${who.icon}`, document.baseURI).href;
    me.replaceChildren(img);
  };
  identity.on(paintMe);
  paintMe();

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
