/**
 * /portfolio and /portfolio/<room> — the three rooms of 2026-09-23
 * (Library, Photos, Crates), behind one door.
 */
export const title = 'Portfolio';

const ROOMS = {
  library: { label: 'Bibliothèque', load: () => import('./rooms/library.js') },
  photos: { label: 'Photos', load: () => import('./rooms/photos.js') },
  crates: { label: 'Crates', load: () => import('./rooms/crates.js') },
};

export async function mount(root, ctx) {
  const room = ROOMS[ctx.params.room] ? ctx.params.room : 'library';
  // In the world the Portfolio is Echo's Bibliothèque (E-06, 2026-11-03): rooms.css dresses it in the Gazette's paper there.
  root.classList.add('pf');
  root.innerHTML = `<div class="page-head"><h1>Portfolio</h1>
      <p>Les travaux — essais, mémoire et cartes de réseaux —, les photos de route, et les bacs de disques d'où la tour tire sa musique.</p></div>
    <nav class="room-tabs" aria-label="Rooms">${Object.entries(ROOMS).map(([k, r]) =>
      `<a href="portfolio/${k}" data-link${k === room ? ' aria-current="page"' : ''}>${r.label}</a>`).join('')}</nav>
    <div class="room" id="room"></div>`;
  document.title = `${ROOMS[room].label} — Portfolio`;
  const mod = await ROOMS[room].load();
  const stop = await mod.mount(root.querySelector('#room'), ctx);
  return () => { root.classList.remove('pf'); stop?.(); };
}
