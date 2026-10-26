/**
 * /go/<ref> — the short link (refs.js, docs/ATELIER.md). main.js follows a
 * ref that leads somewhere before this page is ever drawn; what reaches it
 * is a ref that cannot be followed today, and it says why rather than
 * showing a blank « not found ».
 */
import { esc } from '../ui/util.js';
import { refOf, resolveRef } from '../refs.js';

export const title = 'Lien';

export function mount(root, ctx) {
  const ref = refOf(ctx.params.ref);
  const hit = resolveRef(ref, ctx.sitePages || []);
  if (hit?.kind === 'offline') {
    root.innerHTML = `<div class="page-head"><h1>${esc(hit.page.title)} est hors ligne.</h1>
      <p>Le lien <code>go/${esc(ref)}</code> mène à une version passée du site qui n’est pas publiée en ce moment. La radio, elle, continue : <a href="radio">retour à l’antenne</a>.</p></div>`;
    return null;
  }
  root.innerHTML = `<div class="page-head"><h1>Ce lien ne mène nulle part.</h1>
    <p><code>go/${esc(ref)}</code> ne désigne aucune page du site. Les liens courts ressemblent à <code>go/Z-04</code> (l’Atlas), <code>go/E-02/un-article</code> ou <code>go/v1/atlas</code>. <a href="radio">Retour à l’antenne</a>.</p></div>`;
  return null;
}
