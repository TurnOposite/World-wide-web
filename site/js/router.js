/**
 * Client-side navigation, so the music never stops between pages.
 *
 * The one thing the Wix free plan could not do (RADIO-TOWER-COMPAT.md §3:
 * "no player that survives page navigation") is the reason this file exists.
 * Real URLs (/radio, /atlas, /ecrits/voyages), History API, and a <base href>
 * so the same files work at a domain root or under /radio-tower/ on GitHub
 * Pages — scripts/site-build.mjs rewrites <base> and writes a copy of the
 * shell at every route so a cold link to /atlas answers 200, not 404.
 */

export class Router {
  /**
   * @param {object} o
   * @param {Array<{pattern: RegExp, load: () => Promise<object>, name: string}>} o.routes
   * @param {(page: object, match: object) => void} o.render
   */
  constructor({ routes, render }) {
    this.routes = routes;
    this.render = render;
    this.basePath = new URL(document.baseURI).pathname.replace(/\/?$/, '/');
    this.current = null;
  }

  /** Path relative to the site root, without leading/trailing slashes. */
  routeOf(pathname = location.pathname) {
    let p = decodeURIComponent(pathname);
    if (p.startsWith(this.basePath)) p = p.slice(this.basePath.length);
    else if (p + '/' === this.basePath) p = '';
    return p.replace(/^\/+|\/+$/g, '').replace(/index\.html$/, '');
  }

  href(route) {
    return this.basePath + route.replace(/^\/+/, '');
  }

  start() {
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href]');
      if (!a || a.target || a.hasAttribute('download') || a.dataset.external !== undefined) return;
      const url = new URL(a.href, document.baseURI);
      if (url.origin !== location.origin || !url.pathname.startsWith(this.basePath)) return;
      // Files (PDFs, images, JSON) are real downloads, not routes.
      if (/\.[a-z0-9]{2,5}$/i.test(url.pathname) && !url.pathname.endsWith('.html')) return;
      e.preventDefault();
      this.go(url.pathname + url.search + url.hash);
    });
    window.addEventListener('popstate', () => this.resolve({ fromPop: true }));
    return this.resolve();
  }

  go(to, { replace = false } = {}) {
    // Relative to the site root (<base>), like every link on the site.
    const url = new URL(to, document.baseURI);
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      return Promise.resolve();
    }
    history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
    return this.resolve();
  }

  async resolve({ fromPop = false } = {}) {
    const route = this.routeOf();
    for (const r of this.routes) {
      const m = route.match(r.pattern);
      if (!m) continue;
      const page = await r.load();
      this.current = { name: r.name, route, params: m.groups || {} };
      document.querySelectorAll('.tabs a, .room-tabs a').forEach((a) => {
        const target = this.routeOf(new URL(a.href, document.baseURI).pathname);
        const on = target && (route === target || route.startsWith(target + '/'));
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      await this.render(page, this.current, { fromPop });
      return;
    }
  }
}
