/**
 * The bar over a version of the past (docs/ATELIER.md). scripts/site-past.mjs
 * puts this module in the <head> of every frozen copy under past/<id>/; it is
 * today's code, so an old page gets today's menu without a line of it being
 * edited. It reads the same map as the world (data/layout.json) and offers:
 * today's pages, the other versions, and « this page today » — the same page
 * under today's name, when there is one (refs.js sameRoute).
 *
 * Inside the world (the version's window, ?embed=1, or any frame of this
 * site) there is no bar: the world's own tags are all around it. The old
 * page is also kept silent there — the world's mini-player is the one radio
 * — by refusing its <audio> the right to play, which every old player
 * already treats as « the browser blocked autoplay ».
 */
import { resolveLayout } from '../js/world/model.js';
import { TODAY, sameRoute } from '../js/refs.js';

const id = document.querySelector('meta[name="gt-past"]')?.content || '';
const today = new URL('../', import.meta.url);
const own = new URL(`past/${id}/`, today);

let framed = false;
try { framed = window.top !== window && window.top.location.origin === location.origin; } catch { framed = false; }
const embedded = framed || new URLSearchParams(location.search).get('embed') === '1';

if (embedded) {
  document.documentElement.classList.add('gt-embedded');
  const refuse = () => Promise.reject(new DOMException('This version plays inside the world, whose own player is the radio.', 'NotAllowedError'));
  HTMLMediaElement.prototype.play = refuse;
  const style = document.createElement('style');
  style.textContent = '.gt-embedded #minibar,.gt-embedded .theatre-exit{display:none!important}.gt-embedded body{padding-bottom:0!important}';
  document.head.append(style);
} else {
  mountBar().catch((err) => console.warn('past bar:', err.message));
}

/** The route the old page is showing, as its own router sees it. */
function routeNow() {
  let p = decodeURIComponent(location.pathname);
  if (p.startsWith(own.pathname)) p = p.slice(own.pathname.length);
  else if (`${p}/` === own.pathname) p = '';
  return p.replace(/^\/+|\/+$/g, '');
}

async function mountBar() {
  const file = await (await fetch(new URL('data/layout.json', today), { cache: 'no-cache' })).json();
  const pages = resolveLayout(file).pages;
  const me = pages.find((p) => p.id === id);
  const past = pages.filter((p) => p.era === 'past');
  const now = pages.filter((p) => p.era !== 'past' && p.route !== null && p.id !== 'booth');

  const bar = document.createElement('nav');
  bar.className = 'gt-past-bar';
  bar.setAttribute('aria-label', 'Globe Trotter — aujourd’hui et les autres versions');
  const a = (href, text, cls = '') => {
    const l = document.createElement('a');
    l.href = href;
    l.textContent = text;
    if (cls) l.className = cls;
    // A link out of this version is a page load, not a route of the old app.
    l.dataset.external = '';
    return l;
  };
  const group = (label, ...items) => {
    const g = document.createElement('span');
    g.className = 'gt-g';
    const b = document.createElement('b');
    b.textContent = label;
    g.append(b, ...items);
    return g;
  };

  const stamp = document.createElement('span');
  stamp.className = 'gt-stamp';
  stamp.textContent = me ? `${me.code} · ${me.title}${me.since ? ` · ${range(me)}` : ''}` : `Archive ${id}`;
  const back = a(new URL(me?.route || '', today).href, '← Le monde d’aujourd’hui', 'gt-back');
  const here = a(today.href, 'Cette page aujourd’hui →', 'gt-here');
  const versions = past.map((p) => ({ p,
    l: p.kind === 'external'
      ? Object.assign(a(p.url, `${p.title} ↗`), { target: '_blank', rel: 'noopener' })
      : a(new URL(`past/${p.id}/`, today).href, p.title, p.id === id ? 'gt-me' : '') }));
  bar.append(back, stamp, group('Aujourd’hui', ...now.map((p) => a(new URL(p.route, today).href, p.title))), group('Versions', ...versions.map((v) => v.l)), here);

  const style = document.createElement('style');
  style.textContent = `
.gt-past-bar{position:relative;z-index:60;display:flex;align-items:center;gap:14px;overflow-x:auto;white-space:nowrap;
  padding:8px 14px;background:#0c0e18;color:#dce3ee;font:500 13px/1.3 ui-monospace,Menlo,Consolas,monospace;
  border-bottom:1px solid #2e3858;scrollbar-width:thin}
.gt-past-bar a{color:#dce3ee;text-decoration:none;border-bottom:1px solid transparent}
.gt-past-bar a:hover,.gt-past-bar a:focus-visible{color:#fff;border-bottom-color:#5aaebf}
.gt-past-bar .gt-g{display:inline-flex;gap:10px;align-items:baseline;padding-left:14px;border-left:1px solid #2e3858}
.gt-past-bar b{font-weight:400;color:#8f99af;text-transform:uppercase;letter-spacing:.12em;font-size:11px}
.gt-past-bar .gt-stamp{padding:2px 8px;border:1px solid #c4a160;color:#c4a160;letter-spacing:.06em}
.gt-past-bar .gt-me{color:#c4a160}
.gt-past-bar .gt-back{color:#34d399}
.gt-past-bar .gt-here{margin-left:auto;color:#5aaebf}
.gt-past-bar .gt-here[hidden]{display:none}`;
  document.head.append(style);
  document.body.prepend(bar);

  // « This page today » follows the old app's router: its pushState, Back and Forward.
  const sync = () => {
    const r = me ? sameRoute(routeNow(), TODAY) : null;
    here.hidden = r === null;
    if (r !== null) here.href = new URL(r, today).href;
    // The other versions open on the same page when they had it, on their home when not.
    for (const { p, l } of versions) {
      if (p.kind !== 'external') l.href = new URL(`past/${p.id}/${sameRoute(routeNow(), p.routes) ?? ''}`, today).href;
    }
  };
  for (const k of ['pushState', 'replaceState']) {
    const orig = history[k].bind(history);
    history[k] = (...args) => { const out = orig(...args); queueMicrotask(sync); return out; };
  }
  addEventListener('popstate', sync);
  sync();
}

function range(p) {
  const d = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return p.until ? `${d(p.since)} → ${d(p.until)}` : `depuis le ${d(p.since)}`;
}
