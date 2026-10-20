# The world — the site as one place (redesign, in phases)

The site is being rebuilt as **one continuous world**: **Zone** (the radio, dark) fills the
left half of a 5200 × 2600 plane, **Echo** (the journal, light) fills the right half, and a
"camera" — one transform on the plane — flies to the district a page belongs to. The menu is
a scatter of slanted **tags**. Nothing is dropped: the engine (station clock, player,
router, control plane) is not touched; only the shell, the layout and the skin change.

Approved by Ortis on 2026-10-20. The old site is kept on two archive branches,
`archive/site-v1-2026-10-20` (the site as it was live before 20/10) and
`archive/site-v2-echo-2026-10-20` (the Zone/Echo version). Never delete or rewrite them.

## See it

Behind a flag until the last phase:

- `?world=1` on any address turns it on for the tab (remembered in `sessionStorage`, because
  the site's links are relative and drop the query); `?world=0` or `?classic=1` turns it off.
- `config.json` → `"world": true` turns it on for everyone. It ships `false`.

With the flag off, `main.js` loads `world/flag.js` and nothing else from `world/`; the page
is the classic one, and the site smoke test checks that no world and no `world.css` appear.

## Files

| File | What |
|---|---|
| `site/js/world/flag.js` | is the world on? (config, query, the tab's memory) |
| `site/js/world/layout.js` | the map: districts, codes, positions, which route lands where; the camera's arithmetic. No DOM — `tests/site-world.test.js` checks it |
| `site/js/world/camera.js` | the flight: easeInOutQuart, 380–820 ms by distance, a ≤12 % pull-back, motion blur on desktop while moving; a 160 ms fade under reduced motion |
| `site/js/world/tags.js` | the tag menu: real buttons in a `<nav>`, `aria-current` on the district shown |
| `site/js/world/minimap.js` | the world at 1/30, a pointer shortcut (`aria-hidden`: the tags say the same) |
| `site/js/world/world.js` | mounts all of it beside the classic shell; the router's `render` calls `world.show(match)` |
| `site/css/world.css` | loaded only when the world is on; direction A « Velvet Grid » tokens, prefixed `--w-` |

## The map

| District | Code | Route | Half |
|---|---|---|---|
| Radio | Z-01 | `/radio` (and the home) | Zone |
| Ondes | Z-02 | `/ondes` | Zone |
| Zone | Z-03 | `/zone` | Zone |
| Atlas | Z-04 | `/atlas` | Zone |
| Portfolio | Z-05 | `/portfolio…` | Zone |
| Playlists | Z-06 | `/playlists` | Zone |
| Booth | Z-07 | `/booth` (faint tag, still key-gated) | Zone |
| Une | E-01 | `/echo` | Echo |
| Articles | E-02 | `/echo/<slug>` (its tag moves only the camera) | Echo |
| Lectures | E-03 | `/echo/lectures…`, `/ecrits…` | Echo |
| Archives | E-04 | none yet (phase 4: press, tag index, feed) | Echo |

A tag with a route goes through the router — a real address, Back and Forward work, a cold
link lands with the camera already there and no flight. ← → walk the districts in map order
(replacing the history entry, so Back returns to where the walk began). The Zone ⇄ Echo
switch flies to Radio or Une.

## Phases (one tested step per run)

1. **Shell behind a flag** — done 2026-10-20: the plane, eleven empty districts, the tags,
   the camera, the switch, the minimap, the phone tag strip. The classic page still mounts
   into `<main>`, which stays in the document hidden and inert.
2. **Districts host the pages** — `render` mounts each page into its district instead of
   `<main>`; pages mount lazily when approached and keep their `cleanup`; Tab follows the
   camera; every route answers on a cold link; the radio never cuts out across 20 pans.
3. **Zone skin** — the tokens, cut-corner glass windows, the « Écran » settings menu
   (background Grille / Pluie / Vide, bubbles, tag scatter or stack, scanlines), the
   station's visualiser as the Zone background. Self-host Chakra Petch + IBM Plex Mono.
4. **Echo skin + the seam** — the Gazette inside district windows, cross-world links
   (« À l'antenne » → Radio, Archives → Portfolio), the Archives index.
5. **Phone + switch-over** — swipe between the halves, scroll inside each; flip the flag,
   keep the classic shell one release as `?classic=1`; checked on a real phone.

## Open questions (assumed until Ortis answers)

- Direction: **A « Velvet Grid »** is built (the proposal's recommendation).
- The home: the world itself, camera on Radio (not a zoomed-out overview first).
- The brand green stays `#34d399` (the proposal's dimmer `#3fae86` needs his yes).
- The featured Spotify embed: unchanged until phase 2 (the proposal suggests click-to-load).
