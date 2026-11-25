/**
 * The modules a first visit needs before the world's first frame, as one list the build writes into every shell
 * as <link rel="modulepreload"> (Lighter step 4, docs/plans/LIGHTER-2026-11-24.md).
 *
 * Without it the browser finds the chain one level at a time: main.js, then what main.js imports, then what those
 * import… four round trips on a phone before the world can be drawn. With it, every file of the chain is asked for
 * at once. The source does not change and nothing is bundled: this only reads the import lines.
 *
 * The roots are main.js and the world (main.js imports it with import(), always, unless ?boat=1). A dynamic import
 * anywhere else (a page, the boat, the call map) stays out: it is what a visitor asks for later.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ROOTS = ['js/main.js', 'js/world/world.js'];

// Static imports and re-exports only: `import x from './a.js'`, `import './a.js'`, `export { y } from './b.js'`.
const STATIC = /^\s*(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

/** Every module reachable by static imports from the roots, site-relative, shallowest first (the order to ask). */
export function startupModules(siteDir, roots = ROOTS) {
  const depth = new Map();
  const queue = roots.map((r) => [r, 0]);
  while (queue.length) {
    const [rel, d] = queue.shift();
    if (depth.has(rel)) continue;
    const file = path.join(siteDir, rel);
    if (!fs.existsSync(file)) continue;
    depth.set(rel, d);
    for (const m of fs.readFileSync(file, 'utf8').matchAll(STATIC)) {
      const spec = m[1] || m[2];
      if (!spec.startsWith('.')) continue;
      const next = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      if (!depth.has(next)) queue.push([next, d + 1]);
    }
  }
  return [...depth.keys()];
}

/** The shell with one modulepreload per start-up module, at the end of <head> (relative to <base>, like the rest). */
export function withPreloads(html, modules) {
  if (!/<script type="module" src="js\/main\.js"><\/script>/.test(html) || /rel="modulepreload"/.test(html) || !html.includes('</head>')) return html;
  const links = modules.map((m) => `<link rel="modulepreload" href="${m}">`).join('\n');
  return html.replace('</head>', `${links}\n</head>`);
}
