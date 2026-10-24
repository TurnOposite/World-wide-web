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

## The Zone skin (phase 3)

- **Glass over the visualiser.** The station's visualiser (`#stage`, behind the whole world) is
  Zone's background: the ground in front of it is a haze (`.w-dark`, 55 % night), not a wall.
  Zone's windows are clear glass (`--w-glass`, 74 %; 88 % on a phone) with cut corners. Not
  frosted: a `backdrop-filter` over the always-moving visualiser re-blurs every frame, and it
  took the page from 39 to 18 fps in headless Chrome. The window's edge is drawn *over* the glass
  (`.w-win::after`: four sides and the two cut diagonals), because a solid backing under it would
  hide what the glass shows.
- **Pages keep their code.** The classic pages take their colours, radii and faces from
  `site.css`'s tokens; inside a Zone window those tokens are re-pointed (`.w-zone-d .w-box`), so
  Radio, Ondes, Zone, Atlas, Portfolio, Playlists and the Booth wear the skin without a line of
  page code changing. Panels stay nearly opaque: the glass shows the visualiser around the text,
  never under it.
- **Faces.** Chakra Petch (400, 600, 700) for Zone's UI, IBM Plex Mono (400) for codes and data,
  self-hosted Latin subsets in `site/fonts/` (~44 KB, OFL, credited in `OFL.txt`), loaded only by
  `world.css` — the classic site never fetches them.
- **« Écran »** (`screen.js`), the HUD's screen menu: **Fond** — Grille (lines on the ground,
  drifting with the camera), Pluie (slanted dashes falling; a transform, no repaint), Vide (the
  haze alone); **Bulles de verre** — quelques-unes (10), beaucoup (26), aucune; **Menu** —
  étiquettes éparses or **Pile** (the tags stacked down the left, a Persona pause menu; a phone
  keeps its strip); **Lignes de balayage** — oui / non (the world's own; the classic overlay
  steps aside). Radio buttons in four groups; every arrow stays inside the panel (the world's
  ← → would otherwise walk the map); Esc closes it onto its button. Kept per browser in
  `localStorage` (`gt.world.screen`) — a viewer's taste, never the broadcast look, which stays
  the visualiser panel's (V).
- **Bubbles** (`bubbles.js`): ≤ 26, ~30 fps, faded across the seam; the loop itself stops on
  Echo, in a hidden tab, with none asked for, and under reduced motion (none at all). Half on a
  phone.
- **One light sweep** crosses the window the camera rests on every 9 s (a transform). Under
  reduced motion: no bubbles, no sweep, no rain — smoke-tested with `document.getAnimations()`.
- **Crisp text.** The plane gets `will-change: transform` only while it flies; kept after
  landing, Chrome drew the scaled windows from a bitmap and their text went soft.

## The Echo skin (phase 4)

- **The window is the sheet.** In the world, `ui/echo-front.js`'s `frame()` gives Echo's pages
  (the Une, an article, Lectures, Archives) the bare Gazette column: the nameplate and the
  page, without the classic night sides, silhouettes, ash canvas or Zone/Média line. The column
  drops its own paper, margins and shadow inside the window (`.w-echo-d .echo-in-world`); the
  window's tab is an ink label in Old Standard. The classic pages are unchanged.
- **The night sides became Echo's ground.** The silhouettes (`layout.js` `FIGURES`, the same
  six symbols — shapes, not people) stand on the paper in the gutters between Echo's windows,
  never over one (unit-tested); ink with a thin red rim, static. The ash falls on the far
  layer's paper behind the windows (`ash()` with `ink: true`: dark flakes, fewer, Gazette-red
  embers), running only while the camera is on Echo and stopping once a flight back to Zone has
  landed; under reduced motion it is drawn once and lies still. For the ash to show, the
  plane's paper (`.w-ground`) fades out as the camera crosses (`1 − --w-mix`): at rest on Echo
  the paper you see is the far layer's.
- **The seam** is a torn edge of paper (`.w-tear`, an SVG tile repeated down a mask) over a
  2 px red rim, where Zone's scan dashes run out. It shows from Zone; over Echo it fades with the
  plane's paper.
- **Cross-world links.** The Une gets R9's side column in the world: « À l'antenne » (the track
  on air, live, and « ← Aller à la radio », which flies back across the seam) and a Lectures
  teaser. Archives links to Zone's Portfolio and to each Atlas card that carries press. Both are
  ordinary links through the router: the flight is the camera following the address.
- **Archives** (`pages/archives.js`, `/echo/archives`, E-04) has an address: the press (every
  column and series on the Atlas's cards — today the Jornal NH, 26 + 4, the PDFs open in a new
  tab), every article by tag, the collections (→ Portfolio) and the Atom feed. It is on the
  classic site too (the Gazette's Média line links it). `site-echo.mjs` refuses the article slugs
  `lectures` and `archives`, which would be shadowed by those pages.
- **On paper** an article prints from the world as from the classic site (`world.css`'s print
  block lays the district in view out flat and hides the rest; `site.css`'s print rules do the
  rest) — smoke-tested at A4 width: same column, headline, body and notes, same PDF page count.

## The phone (phase 5)

- **A swipe goes to the other half.** On a phone, a quick sideways swipe across the page in view
  — at least 64 px, 1.6 times more across than down, under 650 ms (`layout.js` `SWIPE`,
  `swipeHalf`) — does what the switch does: the finger moving left brings the Une (Echo lies to
  the right), moving right brings Radio back. A swipe towards the half already in view does
  nothing. Through the router, like a tag: a real address, Back returns. The page still scrolls
  up and down inside its window as before.
- **What is not a swipe.** A gesture that scrolled the page (the box moved more than 12 px), a
  slow drag, a pinch or a zoomed-in screen, a start within 24 px of the screen's edge (where the
  phone's own Back lives), and anything in the page that takes a sideways gesture itself: a strip
  that scrolls across (the channels dial, the press clips, the shelf), an element with its own
  `touch-action` (the queue's grip, the pond, the atlas map), a form field, an open dialog (the
  lightbox). The gesture is timed with the touch events' own `timeStamp`, so a busy phone that
  handles both ends late does not turn a slow drag into a swipe.
- **The browser keeps out of it.** Left to Chrome, a sideways pan over the page overscrolls into
  its own Back (measured: a browser-initiated popstate). The root's `overscroll-behavior-x` did not
  stop it — the page's box is a scroller and lets the pan back in — so on a phone the viewport and
  each box say `touch-action: pan-y pinch-zoom`; a strip that scrolls sideways is a scroller of its
  own and keeps its pan. Pinch-zoom stays. Safari's edge swipe is the system's, hence the edge rule.
- **A phone on its side is a phone** (`PHONE_MEDIA`: at most 760 px wide *or* 500 px tall). Height
  is what it lacks, so the brand, the switch, the tags and « Écran » share one line (`fitStrip`
  measures the room between the switch and « Écran »), and the frame starts under it
  (`SHORT_TOP`, 64 px) and ends above the mini-player, at 1:1. A phone frame is never wider than
  736 px — the map's tightest gap side by side (Atlas → Portfolio) — and is centred, so on a wide
  phone on its side the neighbours stay apart and a little of the visualiser shows at the sides.

## Files

| File | What |
|---|---|
| `site/js/world/flag.js` | is the world on? (config, query, the tab's memory) |
| `site/js/world/layout.js` | the map: districts, codes, positions, which route lands where; the camera's arithmetic, a phone's frame size (upright or on its side), the page zoom, the swipe rule. No DOM — `tests/site-world.test.js` checks it |
| `site/js/world/camera.js` | the flight: easeInOutQuart, 380–820 ms by distance, a ≤12 % pull-back, motion blur on desktop while moving; a 160 ms fade under reduced motion |
| `site/js/world/tags.js` | the tag menu: real buttons in a `<nav>`, `aria-current` on the district shown |
| `site/js/world/minimap.js` | the world at 1/30, a pointer shortcut (`aria-hidden`: the tags say the same) |
| `site/js/world/screen.js` | « Écran »: the four settings as data (unit-tested), their storage, the panel |
| `site/js/world/bubbles.js` | the glass bubbles behind Zone's windows, and when their loop runs |
| `site/js/ui/echo-front.js` | the Gazette's frame and ash, shared by the classic Echo pages; in the world, the bare column (`inWorld()`), the sprite and the ink ash for Echo's ground |
| `site/js/pages/archives.js` | `/echo/archives`: the press, the articles by tag, the collections, the feed (its index functions are unit-tested) |
| `site/js/world/world.js` | mounts all of it beside the classic shell; the router's `render` calls `world.show(match)` and mounts the page in the box it returns |
| `site/css/world.css` | loaded only when the world is on; direction A « Velvet Grid » tokens, prefixed `--w-`; Zone's `@font-face` |
| `site/fonts/ChakraPetch-*.woff2`, `IBMPlexMono-400.woff2` | Zone's faces (Latin subsets from Fontsource, OFL) |

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
| Archives | E-04 | `/echo/archives` | Echo |

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
3. **Zone skin** — done 2026-10-22: glass windows with cut corners over the station's
   visualiser, the classic pages re-skinned through their tokens, « Écran » (Grille / Pluie /
   Vide, bubbles, scatter or stack, scan lines), Chakra Petch + IBM Plex Mono self-hosted,
   the plane crisp at rest. Smoke-tested: the faces load from the site, no backdrop blur, the
   layer dropped and the bubbles stopped on landing on Echo, each « Écran » choice applies and survives a reload,
   nothing in the world moves under reduced motion, axe on the open menu.
4. **Echo skin + the seam** — done 2026-10-23: the Gazette as the bare column inside Echo's
   windows, its silhouettes and ash moved onto Echo's paper, the torn seam, « À l'antenne » →
   Radio and Archives → Portfolio, the Archives page (`/echo/archives`, classic too).
   Smoke-tested: the Une bare in its window with the live box, the figures and the ash running
   (and still under reduced motion), the crossing to Radio with the radio playing and the ash
   stopped, the torn edge seen from Zone, Archives listing every piece of press, the crossing to
   Portfolio, the article printing as on the classic site.
5. **Phone + switch-over**, in two steps.
   - **5a, the phone** — done 2026-10-24: a swipe goes to the other half, scroll inside each;
     a phone on its side is laid out as a phone (one-line header, the frame at 1:1); frames
     capped so they never overlap on any phone. Smoke-tested with real touches (CDP): both
     directions with the radio playing through and the tag strip following; a scroll, a slow
     drag, a start at the edge, a strip that scrolls sideways and a drag surface each stay put
     (this check caught Chrome's own Back); at 844 × 390 the header on one line, the frame at
     1:1 above the mini-player, nothing overflowing, the swipe working.
   - **5b, the switch-over** — flip the flag (`config.json` `"world": true`), keep the classic
     shell one release as `?classic=1` (remembered for the tab), the real-phone checklist.

## Open questions (assumed until Ortis answers)

- Direction: **A « Velvet Grid »** is built (the proposal's recommendation).
- The home: the world itself, camera on Radio (not a zoomed-out overview first).
- The brand green stays `#34d399` (the proposal's dimmer `#3fae86` needs his yes).
- The featured Spotify embed: unchanged (the proposal suggests click-to-load). Since 2026-10-20
  the Spotify deck is one player for every playlist, on Playlists and on Zone.

## Known limits (for the phases ahead)

- Zone's pages wear the skin through their tokens (phase 3); a page that hard-codes a colour
  keeps it.
- R9's « ♪ next on air » markers on the Lectures list are not built: the score box on each
  scored text (already there) says when its music next plays.
- The swipe is checked in headless Chrome with real touch events, not on a phone: how it feels
  under a thumb (the 64 px / 650 ms thresholds), Safari's own edge swipe and the Android back
  gesture need the real-phone checklist (phase 5b).
- Not measured in the cloud: frame rate. The proposal's target (60 fps camera on a desktop,
  ≥ 45 on a phone) needs a real machine's profiler. In headless Chrome (software drawing) the
  world on Radio runs at ~39 fps against ~41 for the classic page; the costs that were cut are
  listed above (no backdrop blur, bubbles and rain stop when unseen, transforms only).
- « Écran » has no « Direction » row (A / B / C from the proposal's mock-up): A is built, and
  choosing between directions is Ortis's question, not a reader setting.
