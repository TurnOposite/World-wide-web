export const title = 'Introuvable';
export function mount(root) {
  root.innerHTML = `<div class="page-head"><h1>Rien ici.</h1>
    <p>Cette page n'existe pas. La radio, elle, continue : <a href="radio" data-link>retour à l'antenne</a>.</p></div>`;
}
