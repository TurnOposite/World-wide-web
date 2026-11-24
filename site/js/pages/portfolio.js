/**
 * /portfolio and /portfolio/<room> — the Archive (Ortis, 2026-11-03, evening: the Bibliothèque's
 * window renamed, in the place of the old Archives). Two rooms behind one door: the Bibliothèque (the
 * bookcase, the map table under it) and the Crates.
 *
 * The Photos room keeps its code and its address (/portfolio/photos) but has no tab: Ortis wants the
 * photographs on the world map one day, not in a tab here. /echo/archives, the old Archives' address,
 * mounts this page and moves to /portfolio.
 */
export const title = 'Archive';

const ROOMS = {
  library: { label: 'Bibliothèque', load: () => import('./rooms/library.js') },
  crates: { label: 'Crates', load: () => import('./rooms/crates.js') },
  photos: { label: 'Photos', load: () => import('./rooms/photos.js'), tab: false },
};

/** His other places on the internet, by short name (Ortis, 2026-11-24: the full addresses were « not pretty »). */
export const ELSEWHERE = [
  ['@Warframe', 'https://warframe.market/profile/maxn3'],
  ['@Discord', 'https://discord.com/users/595913529132056596'],
  ['@Instagram', 'https://www.instagram.com/definetlynotn/'],
  ['@YouTube', 'https://www.youtube.com/@TurnOposite'],
];

export async function mount(root, ctx) {
  if (ctx.router.current?.name === 'archives') {
    ctx.router.go('portfolio', { replace: true });
    return;
  }
  const room = ROOMS[ctx.params.room] ? ctx.params.room : 'library';
  // In the world the Archive stands on Echo (E-04): rooms.css dresses it in the Gazette's paper there.
  root.classList.add('pf');
  root.innerHTML = `<div class="page-head"><h1>Archive</h1>
    <p class="pf-elsewhere">Elsewhere: ${ELSEWHERE.map(([n, u]) => `<a href="${u}" target="_blank" rel="me noopener">${n}</a>`).join(' · ')}</p></div>
    <nav class="room-tabs" aria-label="Rooms">${Object.entries(ROOMS).filter(([k, r]) => r.tab !== false || k === room).map(([k, r]) =>
      `<a href="portfolio/${k}" data-link${k === room ? ' aria-current="page"' : ''}>${r.label}</a>`).join('')}</nav>
    <div class="room" id="room"></div>`;
  document.title = `${ROOMS[room].label} — Archive`;
  const mod = await ROOMS[room].load();
  const stop = await mod.mount(root.querySelector('#room'), ctx);
  return () => { root.classList.remove('pf'); stop?.(); };
}
