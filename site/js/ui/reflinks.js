/**
 * Links written as refs (refs.js, docs/ATELIER.md): `<a href="gt:Z-04">` in a
 * page (an Echo article's `[l’Atlas](gt:Z-04)` is built as go/Z-04), get
 * the address the ref leads to today, the moment they enter the document —
 * so the browser's status bar, a middle-click and « copy link » all see a
 * real address, and the router takes the click like any other link.
 */
import { refOf, resolveRef } from '../refs.js';

/** The href, and what kind of link, for a ref against the map. */
export function hrefFor(ref, pages) {
  const hit = resolveRef(ref, pages);
  if (!hit || hit.kind === 'offline') return { href: `go/${refOf(ref)}`, kind: 'route' };
  return { href: hit.to, kind: hit.kind };
}

// Only gt: — a go/ link is already an address (the router and main.js follow it), and is often meant to be seen as one.
const SELECTOR = 'a[href^="gt:" i]';

/** Rewrite every ref link under `root`, now and as pages add more. */
export function watchRefLinks(root, getPages) {
  const fix = (a) => {
    const ref = refOf(a.getAttribute('href'));
    const { href, kind } = hrefFor(ref, getPages());
    a.dataset.ref = ref;
    a.setAttribute('href', href);
    if (kind === 'load') a.dataset.external = '';
    if (kind === 'external') { a.target = '_blank'; a.rel = 'noopener'; }
  };
  const sweep = (n) => {
    if (!(n instanceof Element)) return;
    if (n.matches(SELECTOR)) fix(n);
    n.querySelectorAll(SELECTOR).forEach(fix);
  };
  sweep(root);
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') sweep(m.target);
      else m.addedNodes.forEach(sweep);
    }
  });
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  return () => mo.disconnect();
}
