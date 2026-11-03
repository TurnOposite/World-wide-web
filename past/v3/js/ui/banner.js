/**
 * The banner's two doors, ZONE and ECHO. Each half owns half of the header and
 * opens its sub-menu on hover (mouse), focus (keyboard) or tap (touch — a second
 * tap, or a tap anywhere else, closes it). Esc closes; arrows move. It never
 * touches <main> or the <audio>, so the radio keeps playing across both halves.
 */
export function initBanner(nav = document.getElementById('banner')) {
  if (!nav) return () => {};
  const halves = [...nav.querySelectorAll('.half')];
  const btn = (h) => h.querySelector('.half-btn');
  const items = (h) => [btn(h), ...h.querySelectorAll('.half-menu a')];
  let pointer = 'mouse';
  let quiet = false; // Esc puts focus back on the word, which must not reopen the menu

  const set = (h, on) => {
    h.classList.toggle('open', on);
    btn(h).setAttribute('aria-expanded', String(on));
  };
  const closeAll = (except) => halves.forEach((h) => { if (h !== except) set(h, false); });
  const open = (h) => { closeAll(h); set(h, true); };

  for (const h of halves) {
    h.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') open(h); });
    h.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !h.contains(document.activeElement?.matches?.(':focus-visible') ? document.activeElement : null)) set(h, false);
    });
    h.addEventListener('pointerdown', (e) => { pointer = e.pointerType || 'mouse'; });
    btn(h).addEventListener('click', () => {
      if (pointer === 'mouse') open(h); // hover already opened it: a click must not close it
      else if (h.classList.contains('open')) set(h, false);
      else open(h);
    });
    h.addEventListener('focusin', (e) => { if (!quiet && e.target.matches(':focus-visible')) open(h); });
    h.addEventListener('focusout', (e) => { if (!h.contains(e.relatedTarget) && !h.matches(':hover')) set(h, false); });
    h.addEventListener('click', (e) => { if (e.target.closest('.half-menu a')) closeAll(); });
    h.addEventListener('keydown', (e) => {
      const list = items(h);
      const i = list.indexOf(document.activeElement);
      const go = (n) => { e.preventDefault(); list[(n + list.length) % list.length].focus(); };
      if (e.key === 'Escape') { set(h, false); quiet = true; btn(h).focus(); quiet = false; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { open(h); go(i + 1); }
      else if (e.key === 'ArrowUp') go(i - 1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const o = halves[(halves.indexOf(h) + (e.key === 'ArrowRight' ? 1 : halves.length - 1)) % halves.length];
        e.preventDefault(); open(o); btn(o).focus();
      }
    });
  }
  const outside = (e) => { if (!nav.contains(e.target)) closeAll(); };
  document.addEventListener('pointerdown', outside);
  return () => document.removeEventListener('pointerdown', outside);
}

/** Highlight the half that owns the current page (router calls this after it sets aria-current). */
export function markHalf(nav = document.getElementById('banner')) {
  nav?.querySelectorAll('.half').forEach((h) => h.classList.toggle('current', Boolean(h.querySelector('a[aria-current="page"]'))));
}
