# The claude.ai preview build — retired 2026-11-25

Ortis, 2026-11-24 (LIGHTER step 3): « Retire the claude.ai preview build — yes ». It never ran in the self-test and
nothing published it; the site is on Vercel and the Oracle tower.

Kept here as text, not run:

| File | Was |
|---|---|
| `site-preview.mjs` | `scripts/site-preview.mjs` — built `dist-preview/`, one page the artifact host could serve (`npm run preview`) |
| `preview-smoke.mjs` | `scripts/preview-smoke.mjs` — drove that build in a browser with a stand-in database (`npm run preview:smoke`) |
| `ArtifactControl.js` | the control plane on claude.ai's shared database, from `site/js/engine/control.js` |
| `preview-plane.test.js` | its unit tests, the hash routes' and the artifact page's, from `tests/cloud-control.test.js` |

Also gone from the live code with it: the router's `mode: 'hash'` (`site/js/router.js`), the preview note
(`site/js/main.js`, `.preview-note` in `site.css` and `world.css`), the booth's « Shared preview » words, the
`config.control === 'artifact'` plane in `site/js/engine/transport.js`, and `site-build.mjs`'s `past` and `shells`
options (only the preview turned them off). `LocalControl` (`?control=local`) stays: the booth offers it.

To bring it back: `git log --follow` on these files; the commit that moved them is the one to revert.
