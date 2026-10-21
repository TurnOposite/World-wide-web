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

## How a page sits in its district (phase 2)

- The router's `render` asks `world.show(match)` for the route's district and mounts the page
  in that district's **box** (`.w-box`) instead of `<main>`, which stays in the document empty,
  hidden and inert. Pages are unchanged: same `mount(root, ctx)`, same `cleanup`.
- **One page is live at a time**, as in the classic shell. The page the camera leaves is cleaned
  up by the router, then sleeps in its frame (inert, dimmed, its iframes and media removed so
  nothing keeps playing) while the camera flies away; once the camera has landed its frame is a
  **door** again: what it hosts and a real link to its address. Pages load when their address is
  opened, not before — mounting a page as the camera merely passes would start its timers and
  subscriptions for nothing.
- **Text at 1:1.** The camera scales the plane down to fit a frame (≈ 0.6–1 on a laptop); the
  box carries the inverse `zoom` (`layout.js` `pageZoom`), so the page lays itself out in the
  frame's on-screen width and its text reaches the screen at its own size.
- **A phone's frame is the screen** (`frameFor`): the free area under the tag strip, at most
  700 px tall so stacked frames never overlap, shown at scale 1 — the page inside is a phone page.
- **Tab follows the camera.** Past the live page's last control, Tab reaches the next district's
  door; focusing it flies the camera there (the address stays); Enter opens the page in place.
  ← → walk the map from anywhere but inside a page's box (the lightbox, the atlas and the dial
  keep their own arrows).
- The home (`/`) opens the Radio page in Z-01 — the world is the home. The classic « Seuil »
  page is not shown in the world (open question 2).
- An address that is no page of the map opens the "missing" page in a window over the world
  (`.w-lost`); the camera stays where it was, or lands on Radio on a cold link.

## Files

| File | What |
|---|---|
| `site/js/world/flag.js` | is the world on? (config, query, the tab's memory) |
| `site/js/world/layout.js` | the map: districts, codes, positions, which route lands where; the camera's arithmetic, a phone's frame size, the page zoom. No DOM — `tests/site-world.test.js` checks it |
| `site/js/world/camera.js` | the flight: easeInOutQuart, 380–820 ms by distance, a ≤12 % pull-back, motion blur on desktop while moving; a 160 ms fade under reduced motion |
| `site/js/world/tags.js` | the tag menu: real buttons in a `<nav>`, `aria-current` on the district shown |
| `site/js/world/minimap.js` | the world at 1/30, a pointer shortcut (`aria-hidden`: the tags say the same) |
| `site/js/world/world.js` | mounts all of it beside the classic shell; the router's `render` calls `world.show(match)` and mounts the page in the box it returns |
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
2. **Districts host the pages** — done 2026-10-21: `render` mounts each page into its
   district's box instead of `<main>`, one live page at a time, the others doors; text at
   1:1 (`zoom` against the camera's scale; a phone's frame is the screen); Tab follows the
   camera; every route answers on a cold link (15 addresses smoke-tested); the radio never
   cuts out across 20 pans, half of them cut short (smoke-tested).
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
- The featured Spotify embed: unchanged (the proposal suggests click-to-load). Since 2026-10-20
  the Spotify deck is one player for every playlist, on Playlists and on Zone.

## Known limits (for the phases ahead)

- Pages keep their classic styling inside the windows: the Gazette still draws its own night
  sides and its own Zone/Echo nav inside E-01…E-03, and Zone pages their own panels. Phases 3–4
  dress them.
- A phone held sideways (wider than 760 px, ~390 px tall) gets the desktop layout at the
  minimum scale: a short window. Phase 5 is the phone phase.
- The plane keeps `will-change: transform`; Chrome may draw a scaled frame slightly soft.
  Dropping it once the camera has landed is a phase 3 performance check.
