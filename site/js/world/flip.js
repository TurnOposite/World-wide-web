/**
 * The channel flip between Zone and Echo (the mood board's MB-05, docs/design/MOODBOARD-globe-trotter.md): crossing
 * from one half to the other plays a channel change of under 300 ms over the camera's own flight — a diagonal wipe
 * from teal to red (red to teal coming back), a frame or two of torn colour, a flash of static and scanlines — and
 * then the other world, clean. Glitch only in transit, never at rest.
 *
 * It answers every crossing (a tag, the switch, a swipe, back and forward: they all arrive through world.js), never
 * the first arrival of a visit, and not at all with less motion. Decoration: hidden from assistive technology, no
 * clicks taken, the audio never touched.
 */
export const FLIP_MS = 280;

/** Whether an arrival is a crossing that flips: a half before it, a different half now, and not an instant jump. */
export function flips(fromHalf, toHalf, { instant = false } = {}) {
  return Boolean(fromHalf) && fromHalf !== toHalf && !instant;
}

export function mountFlip(root, { reduced = matchMedia('(prefers-reduced-motion: reduce)') } = {}) {
  const el = document.createElement('div');
  el.className = 'w-flip';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<i class="w-flip-wipe"></i><i class="w-flip-tear"></i><i class="w-flip-static"></i>';
  // A square of static, made once and tiled.
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    const img = g.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    el.style.setProperty('--w-static', `url(${c.toDataURL()})`);
  } catch { /* no canvas: the flip plays without its static */ }
  root.append(el);
  // Over when the wipe says it is over, not on a clock: a crossing mounts the next page at the same moment, and the
  // animation may only start a few hundred milliseconds after the click. A timer cut it before it was ever seen
  // (2026-11-18). The long timer is only there in case the end never comes (a hidden tab).
  const wipe = el.querySelector('.w-flip-wipe');
  let timer = 0;
  const done = () => { clearTimeout(timer); el.classList.remove('go'); };
  wipe.addEventListener('animationend', done);
  return {
    el,
    play(toHalf) {
      el.dataset.last = toHalf;
      el.dataset.ms = String(FLIP_MS);
      if (reduced.matches) return;
      el.classList.remove('go', 'to-echo', 'to-zone');
      void el.offsetWidth;
      el.classList.add('go', toHalf === 'echo' ? 'to-echo' : 'to-zone');
      clearTimeout(timer);
      timer = setTimeout(done, 2000);
    },
  };
}
