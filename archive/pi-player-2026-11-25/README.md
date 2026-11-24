# The Pi-era player — retired 2026-11-25

Ortis's backlog row B6: « Re-aim self-test stage 6 at the site, then remove the Pi-era player in public/ ». Done in
LIGHTER step 3 (docs/plans/LIGHTER-2026-11-24.md). The Pi was retired on 2026-11-10; the cloud tower serves the
website (`SITE_DIR`), and nobody reached this player any more, but the self-test still drove it on every run.

Kept here as text, not run:

| Here | Was |
|---|---|
| `public/` | the player the Pi served at `/`: `index.html`, `app.js`, `viz.js`, `queue.js`, `cover-palette.js`, `backdrops.js`, the programme guide and the three rooms' pages (Library, Photos, Crates), `assets/backdrops/` |
| `scripts/browser-smoke.mjs` | self-test stage 6 (43 checks) — drove that player in a real browser |
| `tests/backdrops.test.js` | the unit tests of `public/backdrops.js`, which the site never used |
| `server/devReload.js` | `server/lib/devReload.js`, the dev-only hot reload that watched `public/` |

## Where its promises went

- **The tower's own checks** (a listener in step with the tower's stream, the rollover to the next track, a booth move
  the tower itself records, « Back to the station clock ») are the site smoke's `tower` part (`scripts/smoke/tower.mjs`),
  driving the website pointed at the self-test's live tower.
- **Its UI checks** were already covered on the website, which was ported from this player (`site/js/player.js`,
  `site/js/ui/queue.js`, `site/js/pages/rooms/`).
- **The three shared modules** (`viz.js`, `cover-palette.js`, `queue.js`) were copied into the site by
  `scripts/site-sync.mjs`. The site's copies, `site/js/lib/viz-core.js`, `cover-palette.js` and `queue-core.js`, are
  the originals now. Their unit tests (`tests/viz.test.js`, `cover-palette.test.js`, `queue-ui.test.js`) read them.
- **The cache rule** (code revalidates, `/assets/` is held) is pinned by `tests/static-cache.test.js` on the site
  served through `SITE_DIR`, as the cloud tower serves it.
- **Without `SITE_DIR`** (a laptop's `npm start`, the tests) the tower serves only its API, and its root says where the
  website is (`tests/api.test.js`, last test).

Four tests went with it, because what they pinned is no longer served: « the player HTML and assets are served », « the
programme guide page and its script are served » (`tests/api.test.js`), « the three rooms are reachable from every
page through the section bar » (`tests/collections.test.js`), and « ART_FRACTION matches --art-fraction in
styles.css » (`tests/viz.test.js`: the site draws no ring around an `<img>`, so no CSS exists for it to match).

Agent and skill files in `.claude/` that still name `public/` describe the Pi era. `tower-selftest` was brought up to
date.

To bring it back: `git log --follow` on these files; the commit that moved them is the one to revert.
