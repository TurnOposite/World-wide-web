# Design brief — locked by Ortis, 2026-08-19

> **This file is the authority on identity and visual design.** It supersedes
> `docs/IDENTITY-OPTIONS.md`, which was a menu; the menu has now been chosen
> from. An agent implementing any of this reads *this* file, not the options
> file. Nothing here is speculative — every line is a decision Ortis made.
>
> Ranked implementation order is at the bottom, and mirrored into
> `docs/ROADMAP.md` as items #20–#24.

---

## 1. Identity — DECIDED

### Name and motto

**Option A stands.** The station stays **Radio Tower**. The motto stays
*"One signal. Everyone on the same second."*

Nothing in `STATION_NAME`, `STATION_TAGLINE`, the systemd unit, `pi/install.sh`
or any doc reference needs to move. This was chosen partly *because* it costs
nothing to keep.

### The mark

A **hybrid**: take Option A's tower, take Option D's sideways waves.

- The tower silhouette from Option A — two legs, three rungs, widest brace at
  the base. Keep it.
- **Drop Option A's upward-opening arcs.** Replace them with **Option D's
  concentric arcs, rotated to leave the tower sideways** — one set left, one
  set right, mirrored, radiating horizontally from the tower's tip rather than
  fanning upward from it.
- Keep the dot at the tip (the instant / the transmitter).
- Must still survive 16px. Option A was noted as the muddiest at favicon size
  because the cross-bracing fills in; if the sideways arcs make that worse,
  **thin the bracing to two rungs in a `<symbol>` variant used only for the
  favicon** rather than compromising the 64px mark.

Starting point to iterate from — this is a sketch, not a final path set:

```svg
<svg viewBox="0 0 32 32" width="32" height="32" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <!-- tower, from Option A -->
  <path d="M11 29 L16 14 L21 29"/>
  <path d="M12.7 24h6.6M13.8 20.5h4.4"/>
  <!-- the instant, at the tip -->
  <circle cx="16" cy="11" r="1.7" fill="currentColor" stroke="none"/>
  <!-- signal, sideways: Option D's arcs, mirrored left and right -->
  <path d="M20 6.5a7 7 0 0 1 0 9" stroke-width="2"/>
  <path d="M12 15.5a7 7 0 0 1 0-9" stroke-width="2"/>
  <path d="M23.5 3.5a11.5 11.5 0 0 1 0 15" stroke-width="1.6" opacity=".45"/>
  <path d="M8.5 18.5a11.5 11.5 0 0 1 0-15" stroke-width="1.6" opacity=".45"/>
</svg>
```

### Colour

**The logo is green.** This overrides Option A's proposed coral-to-violet
`--signal`. Green is the mark's colour and the station's accent colour.

Pick a green that holds up on the existing `#0b0d10` / `#12161b` dark ground
and does not fight the visualiser's pastels — start around `#4ade80` /
`#34d399` and check it against a real screenshot of the visualiser before
committing. Record the final hex in `docs/DECISIONS.md`.

**Note the conflict with §3.** The genre-reactive theming below wants the
accent driven live by the playing track. Resolution: **green is the station's
fixed identity colour — masthead mark, favicon, links, focus rings — and genre
colour is confined to the background/visualiser layer.** The mark does not
change hue with the music. If an implementer finds that unworkable, they raise
it rather than quietly picking one.

### Author credit — **Zoneko**

The site is credited to **Zoneko**, not Ortis.

- **Display layer only.** Anywhere a human reads it: the footer, an About
  line, `<meta name="author">`, the page title if it carries a byline.
- **Leave the code alone.** Repo paths, the service user, `SERVICE_USER`,
  commit authorship, doc prose addressed to Ortis — all stay as they are.
  Renaming them buys nothing and risks the installer. This was explicitly
  Ortis's call.

---

## 2. Navigation — DECIDED

### Rename: Guide → **Echoes**

The previous-and-next-tracks view is called **Echoes**.

Touches: the `<a class="ghost">` label in `public/index.html` (line ~34), the
`<title>` and any heading inside `public/schedule.html`, and any doc that names
the tab. **Keep the URL `/schedule.html`** — the route name is not user-facing
and changing it breaks bookmarks, the browser smoke test and `docs/`. Label
change only.

### New tab: **Zone**

A third view, a minimalistic world map.

- **A green point with waves radiating from it** at the broadcast origin —
  visually the same language as the logo, so the map reads as "the tower is
  here". Animated pulse, slow.
- **The origin must be configurable.** Ortis is changing continents within
  months. It goes in the env, e.g. `STATION_LAT` / `STATION_LON` /
  `STATION_PLACE`, surfaced through `/api/station` — *not* hardcoded in a JS
  file. Changing it must be one line in `/etc/radio-tower.env` and a restart.
- **A blue point for the listener.** Tentative — the station is not public yet,
  so there is nothing to plot. Build it behind a flag. Get the position from
  the request's coarse geo-IP server-side, **not** the browser Geolocation API:
  a permission prompt on a radio station is a bad trade, and city-level is all
  the map needs. If no geo source is available, the blue point simply does not
  render — never guess a location.
- **Map rendering: no map library, no tiles.** A single inlined
  world-outline SVG (equirectangular, low-poly land paths, a few KB) with
  points positioned by a linear lat/lon → x/y projection. The project has a
  two-runtime-dependency budget and a no-build-step front end; a tile layer
  would violate both and would also phone out to a third party on every load,
  which is wrong for a station meant to run on a Pi in a house.

---

## 3. Genre-reactive layout — NOT A PRIORITY, but decided in shape

Ortis was explicit: *"this is not the priority at all."* It is recorded here so
it is not re-litigated, and ranked last.

### Re-categorisation comes first

The current groupings (`BarberBeats`, `Liminal Atmosphere`, `Upbeat`, `VGM`)
are **not good enough** and Ortis intends to rework them. Requirements:

- More genres, more precise.
- **A track can belong to several genres.** This is the structural change —
  the current model is one-folder-one-genre, and multi-membership breaks it.
- Ortis has started a **manual-categorisation subfolder inside `music/`** on
  the real library. That file is the input; the scanner must read it rather
  than infer everything from folder names. It was not present on the copy
  inspected on 2026-08-19 — an implementer must look at the real drive first
  and shape the parser around what is actually there, not around a guess.
- Genre metadata is a *sidecar*, never a rewrite of the audio files, and never
  a second copy of the library in memory (Pi Zero 2 W, 512MB).

### Then the theming

Driven by the genre of the currently playing track:

| Genre | Treatment |
|---|---|
| Lofi / barber beats | Background blue-pink-purple wash |
| Atmospheric | Frutiger Aero — glossy, aqua, lens-flare, 2007 |
| High BPM | Volume-reactive moving visuals (more motion, amplitude-driven) |
| Per-artist | Specific images called in for certain artists |
| VGM | The GIF from the game the track is from |

**Constraints an implementer must respect.** Everything above is a *download on
a Pi over a phone connection*. Assets are lazy-loaded, capped in size, and the
station must look correct and complete with none of them loaded. A missing GIF
is a non-event; a page that waits on one is a bug. Nothing here may touch the
station clock — theming reads `/api/station`, it never influences scheduling.

---

## 4. How to iterate on design without burning the limit

Ortis's question: Claude Design first, or prompt Claude Code directly?

**Neither, as the default. Iterate in the browser, on a static mock, and only
then hand a decided design to a coding agent.**

The expensive failure mode is round-tripping: describe → agent codes → look →
describe again. Each loop costs a full agent run for a change that is often two
CSS values. Cut the loop out:

1. **Ask for one self-contained HTML mock file** — every variant in it, side by
   side, on the real background colour, with real copy. No server, no build.
   Open it, look at all the options at once, pick.
2. **Give feedback by marking up that file**, or by naming the variant ("B, but
   the green from D"). Specific and cheap. "Make it feel more liminal" is what
   burns runs.
3. **Only then** hand the chosen variant to `tower-builder` as a spec with the
   hex codes and the SVG path data already settled. Coding a decided design is
   one cheap run; deciding a design inside a coding agent is many expensive ones.

**Claude Design is worth it for the mark specifically** — a logo is a shape
problem and shape problems are faster to judge visually than to describe. It is
*not* worth it for the page theming, where the thing being judged is motion and
colour against real playing audio, which only the live station can show.

**And for the map, prototype against a fake position first.** Do not wait on
the tunnel to be up to build the Zone tab; feed it hardcoded lat/lon, get the
projection and the pulse right, wire the env last.

---

## 5. Implementation order

Ranked. Mirrored into `docs/ROADMAP.md` as #20–#24. Each is one run.

1. **#20 — Green mark + Zoneko credit + Echoes rename.** All three are small,
   all three are pure display, none touches the clock. One run, one worklog
   line. Do these together; splitting them wastes runs.
2. **#21 — Zone tab, origin point only.** Config-driven lat/lon, inline map
   SVG, green pulsing point. No listener point.
3. **#22 — Listener blue point.** Blocked until the station is publicly
   reachable, because until then there is nothing to plot and nothing to test
   against.
4. **#23 — Genre re-categorisation.** Multi-genre membership, sidecar metadata,
   read the real manual-categorisation folder. Structural; do not start it in
   the same run as anything else.
5. **#24 — Genre-reactive theming.** Blocked by #23. Do the background washes
   first (cheap, no assets), per-artist images and VGM GIFs after.

---

*Sources for the options this brief chose between: `docs/IDENTITY-OPTIONS.md`
(Option A, Option D). Original request preserved verbatim in the 2026-08-19
entry of `docs/DECISIONS.md`.*
