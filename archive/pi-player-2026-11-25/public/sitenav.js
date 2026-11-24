/**
 * The section bar shared by every page: Listen · Guide · Library · Photos ·
 * Crates. One definition here instead of five hand-copied <nav>s, so adding a
 * page is one line.
 *
 * On the pages that are not the player it also shows a small "on air" line
 * fed by /api/station. That is the whole point of the other rooms: while
 * you read an essay, the tower keeps broadcasting, and one click takes you
 * back to it at the live position (you can't rewind a radio, so there is
 * nothing to "resume").
 */

export const SECTIONS = [
  { href: '/', label: 'Listen', match: ['/', '/index.html'] },
  { href: '/schedule.html', label: 'Guide', match: ['/schedule.html'] },
  { href: '/library.html', label: 'Library', match: ['/library.html'] },
  { href: '/photos.html', label: 'Photos', match: ['/photos.html'] },
  { href: '/crates.html', label: 'Crates', match: ['/crates.html'] },
];

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderNav(host = document.getElementById('sitenav'), path = location.pathname) {
  if (!host) return;
  host.innerHTML = SECTIONS.map((s) => {
    const current = s.match.includes(path);
    return `<a href="${s.href}"${current ? ' aria-current="page"' : ''}>${esc(s.label)}</a>`;
  }).join('');
}

/** A one-line "on air" ticker. Quietly does nothing if the tower is unreachable. */
export function startOnAirTicker(host = document.getElementById('onairTicker')) {
  if (!host) return;
  let timer = null;
  async function tick() {
    clearTimeout(timer);
    let nextIn = 30_000;
    try {
      const res = await fetch('/api/station', { cache: 'no-store' });
      const data = await res.json();
      const t = data?.onAir;
      if (t) {
        host.hidden = false;
        host.innerHTML =
          `<a href="/" class="ticker-link" title="Tune in at the live position">` +
          `<span class="ticker-dot" aria-hidden="true"></span><span class="ticker-label">On air</span>` +
          `<span class="ticker-track">${esc(t.title)}</span><span class="ticker-artist">${esc(t.artist)}</span>` +
          `<span class="ticker-cta">Listen →</span></a>`;
        const left = Number(t.remaining);
        if (Number.isFinite(left) && left > 0) nextIn = Math.min(60_000, left * 1000 + 800);
      } else {
        host.hidden = true;
      }
    } catch {
      host.hidden = true;
    }
    timer = setTimeout(tick, nextIn);
  }
  tick();
}

renderNav();
startOnAirTicker();
