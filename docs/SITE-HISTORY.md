# The site's history: how it came to look the way it does

Written 2026-11-22 for a designer joining the project, and for the Claude session they work with. It is the
companion of [`DESIGN-HANDOFF.md`](./DESIGN-HANDOFF.md): that page says **how** to change the design, this one says
**why it is the way it is**, what was tried and dropped, and which questions are closed. Give both to your Claude
as its first reading.

Everything here comes from the repository itself (`DECISIONS.md`, `WORKLOG.md`, the design documents and the git
log). Each era ends with the documents that hold the detail. Where this page and `DECISIONS.md` disagree,
`DECISIONS.md` wins: it is dated, and it is appended to, never rewritten.

---

## The site today, in one paragraph

**Globe Trotter** (https://globe-trotter-ochre.vercel.app) is one continuous world in two halves. **Zone**, on the
left, is the radio: dark, a console, with a visualiser behind glass windows. **Echo**, on the right, is the
journal: white paper, ink, red. A camera flies between the windows, and the menu is a scatter of slanted tags.
Under all of it plays **Radio Tower**: one synced stream, so everyone who opens the site hears the same track at
the same second, with no account. Since 18 November a second front, **the boat** (a 3D scene on a karst lake),
can stand in for the map on a laptop (`?boat=1`).

---

## 1. August 2026: a radio on a Raspberry Pi

The project started on 17 August as **a Raspberry Pi in Ortis's home serving a website that plays his MP3s**. Four
decisions from that first day still hold everything up ([`BRIEF.md`](../BRIEF.md) §2):

- **A radio, not a jukebox.** One stream, everyone on the same second, nobody can seek. The schedule is computed
  from a fixed start date (`STATION_EPOCH`), so any browser works out what is playing without asking anyone.
- **Public from day one**, no account, no tracking.
- **Plain HTML, CSS and JavaScript, no build step**, two runtime dependencies at most.
- **No Spotify for the radio**: its embed plays only 30-second previews to visitors who are not logged in.

On **19 August** Ortis chose the identity ([`DESIGN-BRIEF.md`](./DESIGN-BRIEF.md), picked from the five options
in [`IDENTITY-OPTIONS.md`](./IDENTITY-OPTIONS.md)): the name **Radio Tower** and its motto « One signal. Everyone
on the same second. »; a mark that is a tower with **sideways arcs**; **green** as the fixed identity colour, with
the music's colour kept to the background and the visualiser; the credit **Zoneko**; a tab called **Zone** with a
world map and a pulsing point where the station broadcasts from.

The same week the **visualiser** was built: rings, shocks and sparks around the album cover, then a full-page
version.

**The lesson of August**, written down on the 28th in [`DESIGN-POSTMORTEM.md`](./DESIGN-POSTMORTEM.md), and the
most useful page in the repository for a designer: Ortis's design requests did not land, for four reasons. His
browser was running cached old code, so correct changes looked like nothing; the brief made the limits
measurable and the goal an adjective, so the builder satisfied the limits; the checks proved the feature was
cheap and safe, never that it was there; and a deploy was half-broken by prose pasted into a shell. The rules
that came out of it are still the rules here:

1. **State the goal as something that can fail** (« at least 25 % of the canvas is painted », not « fills the page »).
2. **Protect legibility with geometry** (an opaque panel behind the text), **not with faintness**.
3. **Safe must never mean invisible.** If the limits make the feature impossible, say so before shipping.
4. **Ortis's eye is the acceptance test**, so a new look ships behind a switch, not as the default, and a bad one
   costs a click instead of a redeploy.

The Pi went quiet on 28 August (no home Wi-Fi) and was retired on 10 November. Its code is in `archive/pi-kit/`.

## 2. September: off the Pi, onto the web

On **9 September** Ortis made a first **Globe Trotter on Wix**, with 28 of his tracks and no server.
It proved the idea a static site could carry: since the schedule is pure arithmetic, a browser holding the track
list can be the station.

On **26 September** he asked to « build the modern website with map, portfolio and working radio with an actually
functioning queue change and visuals control … make it all cloudy ». That day's build is the site's real
beginning: the shell with a **player that survives page changes**, the router, the full-page visualiser and its
control panel, and the pages Radio, Atlas, Écrits, Portfolio and the Booth (the DJ's private page). An
accessibility check (axe) has run on every page since that day. Hosting went to **Vercel**; from 7 October the
music itself comes from a small **Oracle Cloud server** (« the tower »), because the library is tens of gigabytes.

Detail: `DECISIONS.md` 2026-09-26 and 2026-10-07, [`CLOUD.md`](./CLOUD.md), [`LIVE.md`](./LIVE.md).

## 3. Early October: the rooms get their character

Between 9 and 13 October the pages stopped being panels and became places:

- **The Atlas**: a map of the cities in Ortis's life, each pin with a postcard. The pictures are **drawn as SVG
  scenes, not fetched**, so the site calls no third party (a real photo can replace a drawing).
- **The Écrits**: his texts as stones in **a pond**. The water is decoration; every link works without it
  (keyboard, screen reader, reduced motion, a phone without WebGL).
- **The Portfolio**: a **3D bookshelf** with drawn covers, the thesis and a map room.
- **Canopy**: a 3D « call map » of the music on air, which Ortis wanted as **a look of the Radio page, not a page**.
- On 13 October, a round of his review: **the Atlas speaks English, the Écrits stay French**, one bookcase, a
  quieter Radio. The language rule since then: **Zone's interface in English, Echo in French.**

The site as it stood from 8 to 20 October is frozen as **Version 1** (see section 9).

## 4. 18–20 October: two halves, Zone and Echo

On **18–19 October** the site gained a newsroom, **Echo**: articles written in Markdown, a feed, a print style
([`ECHO.md`](./ECHO.md)). Its front page went through two looks in two days: first a **red newspaper with
silhouettes and falling ash**, then the **Gazette**: white paper, thin ink rules, night on the sides.

On **20 October** Ortis split the site into **two halves**: **Zone** is the radio tower (Radio, Ondes, Playlists,
the Atlas, the Booth), **Echo** is the journal. « Echoes », the programme page, was renamed **Ondes**, in his
words because « Echo and Echoes are not the same thing ». The same day he reopened « No Spotify » for one thing
only: his **Spotify playlists** play on the Playlists page in one embedded player (the radio itself stays his
MP3s). This is **Version 2**.

## 5. 20–25 October: the world

Also on 20 October, Ortis approved the redesign that is the site today ([`WORLD.md`](./WORLD.md)): **one
continuous world**, a plane 5,200 × 2,600 wide, Zone on the left and Echo on the right, a **camera** that flies to
the window a page lives in, and **slanted tags** for the menu. It was built in five tested phases behind a switch,
with the old site kept online the whole time:

1. **The camera, the tags and the districts** (20/10).
2. **Pages open inside their windows at full size** (21/10). The map scales the windows, never the text: a page
   always reads at its own size.
3. **Zone's skin** (22/10): **clear glass windows over the visualiser** (deliberately *not* frosted, unlike the
   first mock-up), cut corners, the fonts **Chakra Petch** and **IBM Plex Mono**, and « Écran », a menu where the
   reader picks the background.
4. **Echo's skin** (23/10): the window is the bare Gazette sheet, and a **torn paper seam** with a thin red rim
   between the halves.
5. **The phone** (24/10): **swipe sideways to cross to the other half**, scroll inside each; a phone on its side
   is still a phone. On **25/10** the world became the default.

**Version 3** (25 October to 3 November) is the world in its first form.

## 6. 26 October: the Atelier

Ortis asked for a way to change the layout at once, without code. The answer is the **Atelier**
([`ATELIER.md`](./ATELIER.md)): the map is data (`site/data/layout.json`), and **`?atelier=1` on any address lets
you drag, resize and tilt every window and tag on the live site**. It also brought the past online (each old
version a window of its own, which Ortis can switch on and off), short links (`go/Z-04`) and `fire`, the command
that publishes. **For a layout change, the Atelier is the first tool to reach for.**

## 7. November: Ortis lives in it, and trims

From 1 November the changes come from Ortis using the site day to day. The pattern to notice: **he removes as
often as he adds.**

- **1 November:** Zone and the Atlas merged (« they're one and the same »); the Portfolio left Zone; **every window
  must show its whole page without scrolling inside it** (« self-contained in its entirety and fit in the
  screen »); all windows bigger; the Booth bigger, its lights first.
- **3 November:** the bookshelf came back on Echo as the **Bibliothèque**, then became **the Archive**. The texts
  went *into a book on the shelf*, the **Livre miroir**, whose pages turn under the pointer with nothing telling
  you so: he wanted them **harder to find**. The first real article, « Don't shoot the pianist », went on the
  front page. The playlists were sorted by most saved, with his own photos as covers.
- **7 November:** **Echo's paper went plain.** The silhouettes, the flag and the fist around the windows went, in
  his words: « the tabs themselves are pretty, but around the tabs it just does not work … keep the white style
  before we find anything ». The white style is the standing look until something better is found.
- **10–13 November:** **the Antenna** took the Atlas's place on Zone: the **streams** (Everything, Chill, Energy)
  on a dial, and the **telegraph line**, a chat with no account that empties every day at 05:00, the station's
  daily turn. Its avatars are **the cast**, a fighting-game style character select. Ortis first asked for a
  published game's characters; the decision was to **take the gesture and not the characters**, so the cast is
  the station's own (the Operator, the Keeper, the Courier, the Archivist and others), pixel sprites stored as
  data, until he draws his own (BACKLOG W8).
- **17 November:** a **cassette reel behind Zone's menu and a 1920s globe behind Echo's**, drawn as realistic
  objects. Ortis turned them down the next day (section 8).

## 8. 18 November: the mood board, and the boat

On **18 November** Ortis wrote the creative direction that now leads the design:
[`design/MOODBOARD-globe-trotter.md`](./design/MOODBOARD-globe-trotter.md). Read it whole. In short: **two worlds
you pick between like characters in a game.** Zone is a console (a dark HUD, JRPG menus), Echo is a newspaper
(off-white paper, red blackletter, ink, cut-out type). **Persona 5** lends its **menu grammar** (tilted labels, a
selection shape that snaps from item to item, a different entrance for every screen); **Scott Pilgrim** lends
its **select screen** (a stage, slots, a cast); the Bandcamp scene he listens to (barber beats, vaporwave, future
funk, lo-fi jazz) lends its **texture** (Japanese as a second layer of type, old hardware as the frame, dither,
glitch). Three words: **stylish, alive, readable.** The mechanics are borrowed, **never the look**: nothing is
copied from the games.

The same day came his verdict on the reel and the globe: **« a little soulless and without character »**,
realistic photo objects on a pared-back background did not work. They were redrawn that night as **flat,
clear-cut shapes**: a tuning scale for Zone, a paper sunburst for Echo, each with a needle. **That verdict is a
rule for everything since: flat, clear-cut shapes, not realistic objects.**

That night the mood board's components were built and put live: MB-01 the **selection shard**, MB-02 the
**streams as a lane select**, MB-03 a **caption at each track change**, MB-04 a **marquee** behind the window you
are in, MB-05 a **channel flip** when crossing between Zone and Echo, MB-07 **a different entrance per section**,
MB-08 **side text** on Echo, MB-09 a **date badge** (MATIN, APRÈS-MIDI, SOIR, NUIT with their Japanese), MB-10
« **Anonymous transmission** » with a flat cassette when a track has no cover. MB-06, **the Atlas as an
overworld**, waits for his choice between two options.

**The boat** came the same day: Ortis asked for the front menu as **an old Chinese boat on a karst lake** (rounded
peaks, still water), seen in first person from a hammock. The laptop is Radio, a small phone with an antenna is
Playlists, the radio machines are the Antenna, the scroll is Ondes, the lantern is the Booth, and the desk behind
you is Echo. Moving between them borrows Persona 5's « stop time », a frozen scene between camera angles. It is
built in CSS 3D, with no 3D library, and lives **behind `?boat=1`, never the default**.

On **22 November**: the boat was taken **off phones** at his word; it was repaired for ordinary laptops (it had
been drawing planes 380,000 px wide on an Intel graphics chip); its **sky keeps the station's time** (dawn at
06:00, the Milky Way at night); **ripples and mist move with the bass**; the Antenna's **lever** switches the
streams; the objects themselves open their places when clicked. It runs at about 30 frames a second on his
laptop. **Ortis is preparing an upgraded version of the boat himself**, to be integrated in its place (its files
so far: `Radio Tower\Claude outputs\boat-files-2026-11-22\` on his laptop). What he asked next, after trying it,
is BACKLOG **F3**.

## 9. Seeing the past

- **The versions, live:** Version 1 (8–20 October), Version 2 (20 October) and Version 3 (25 October – 3
  November) are frozen under `past/` and shown, framed, as windows on the map (Ortis switches them on and off in
  the Atelier). Short links: `go/v1/atlas` and so on.
- **The branches:** `archive/site-v1-2026-10-20` and `archive/site-v2-echo-2026-10-20`. Never delete or rewrite them.
- **The classic shell** (the site before the world) still opens with `?classic=1`.
- **Screenshots:** `docs/screenshots/`, including before/after comparisons from 16 and 17 November.
- **Every change, dated:** `git log`, and `WORKLOG.md` for what each session did.

---

## What is settled: don't reopen it

Each of these was Ortis's decision. Bringing one back means asking him first, with a reason.

| Settled | Since | Where |
|---|---|---|
| One synced stream, nobody seeks; the music never stops for a design reason | 17/08 | `BRIEF.md` |
| No build step, no framework; a new library needs a written reason | 17/08 | `BRIEF.md`, `DECISIONS.md` |
| Name Radio Tower, sideways-arc mark, green as the identity colour, music colour in the background only | 19/08 | `DESIGN-BRIEF.md` |
| Two halves, **Zone** (radio, dark, English) and **Echo** (journal, paper, French); « Ondes » not « Echoes » | 20/10 | `DECISIONS.md` |
| One world with a camera, slanted tags for the menu, text always at its own size | 20/10 | `WORLD.md` |
| Glass over the visualiser on Zone, not frosted | 22/10 | `WORLD.md` |
| Every window shows its whole page, no scrolling inside the windows | 01/11 | `DECISIONS.md` |
| The texts live in the Livre miroir, deliberately hard to find | 03/11 | `DECISIONS.md` |
| Echo stays plain white paper, no figures around the windows, until something better is found | 07/11 | `DECISIONS.md` |
| The cast is the station's own; nothing copied from games, films or brands | 11/11 | `DECISIONS.md` |
| Flat, clear-cut shapes, not realistic photo objects | 18/11 | `DECISIONS.md` |
| The mood board is the creative direction | 18/11 | `design/MOODBOARD-globe-trotter.md` |
| The boat is a second front behind `?boat=1`, not the default, and not on phones | 18/11, 22/11 | `DECISIONS.md` |

## What is open: fair game

| Open | Waiting for |
|---|---|
| **Who signs the site**: the one credit line shown on both halves (Zoneko, Globe Trotter, Radio Tower or his own name) | Ortis |
| **MB-06**, the Atlas as an overworld, option A or B | Ortis's pick |
| **C1**, the Archive's books as a pile on phones: two or three variants, mocked first | a designer |
| **F1**, the boat's next version | Ortis's upgraded files |
| **F2 ⑧**, one event every hour on the lake: a crate boat with an album, a bottle with the line's latest message, or a shooting star at night | Ortis's pick |
| **F3**, the boat better lived in: window borders that belong to the scene, the phone on a stand, furniture and rugs (keep the coffee cup), the Antenna's machines on the boat, Echo's paper flat on the desk | asked, to build |
| **W8**, the cast in Ortis's own drawings | his drawings |
| A different look for Echo than the white paper | a proposal Ortis likes |

The full, current list is [`BACKLOG.md`](./BACKLOG.md); it wins over this table.

## How Ortis gives design feedback, from the record

- **He reacts to what he sees live, in his own words**, and those words are quoted in `DECISIONS.md`. Read them
  rather than a summary.
- **He prunes.** Figures, lines, windows and tabs have gone as often as they arrived. A proposal that removes
  something is welcome.
- **He wants character.** « Soulless » was the verdict on clean but generic objects. Personality comes from the
  mood board's references, never from copying their art.
- **Show, don't describe.** A preview link (a Vercel preview, or a switch like `?boat=1`) gets a real answer; a
  paragraph does not.
