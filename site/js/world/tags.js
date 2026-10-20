/**
 * The menu is a scatter of tags, one per district: slanted, tilted, Zone's
 * down the left edge and Echo's down the right. They are real buttons in a
 * <nav>, so the menu reads as a list to a screen reader and Tab walks it in
 * order; on a phone they line up in a strip under the header.
 */
import { DISTRICTS } from './layout.js';

/** @param {(id: string) => void} onPick */
export function mountTags(onPick) {
  const nav = document.createElement('nav');
  nav.className = 'w-tags';
  nav.id = 'wTags';
  nav.tabIndex = -1;
  nav.setAttribute('aria-label', 'Monde — chaque étiquette déplace la caméra');
  for (const d of DISTRICTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `w-tag${d.faint ? ' faint' : ''}`;
    b.dataset.go = d.id;
    b.dataset.half = d.half;
    const [x, y, r] = d.tag;
    b.style.setProperty(d.half === 'echo' ? '--tr' : '--tl', `${x}%`);
    b.style.setProperty('--tt', `${y}%`);
    b.style.setProperty('--r', `${r}deg`);
    const span = document.createElement('span');
    const i = document.createElement('i');
    i.textContent = d.title;
    span.append(i);
    b.append(span);
    b.addEventListener('click', () => onPick(d.id));
    nav.append(b);
  }
  return {
    nav,
    mark(id) {
      nav.querySelectorAll('.w-tag').forEach((b) => {
        if (b.dataset.go === id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
      // On a phone the strip scrolls: keep the current tag in the middle of it.
      // By hand, not scrollIntoView, which would also scroll the hidden page.
      const cur = nav.querySelector('[aria-current]');
      if (cur && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2;
    },
  };
}
