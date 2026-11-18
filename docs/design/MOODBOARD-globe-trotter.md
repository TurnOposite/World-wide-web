# MOOD BOARD: Globe Trotter (Radio Tower · Echo · Zoneko)

**For:** the Claude Code session working on the site's design (repo `TurnOposite/World-wide-web`, live at globe-trotter-ochre.vercel.app).
**From:** Arthur, via his creative-direction session, 18 November 2026.
**Use:** this is the creative vision. It says what the site should feel like, which references to look at and which interactions to build. You decide the implementation. Where a reference and the repo's own rules disagree, the repo wins: read `BRIEF.md` and `CLAUDE.md` first, never weaken a test, never touch `music/`, never change `STATION_EPOCH`.

Everything below was checked against the live site, the actual Bandcamp pages Arthur follows and frames from the game footage, on 18/11/2026.

---

## 1. The idea in one paragraph

Globe Trotter is **two worlds you pick between like characters in a game**. **ZONE** is the console: a dark HUD and a radio that is always on, where you move through menus as in a JRPG. **ECHO** is the newspaper: off-white paper, red blackletter, ink and cut-out type. Persona 5 supplies the *menu grammar*: tilted labels, a selection shape that snaps from item to item, and a different entrance for every screen. Scott Pilgrim supplies the *select screen*: a stage, slots and a cast. The Bandcamp scene Arthur listens to (barber beats, vaporwave, future funk, lo-fi jazz) supplies the *texture*: Japanese as a second layer of type, old hardware as the frame, dither, glitch and mirrored banners. The site should feel like a game menu that also happens to be a working radio and a magazine.

**Three words:** *stylish, alive, readable.* Persona's menus give up some readability for style. We take the style and keep the readability.

---

## 2. What exists today (don't throw it away)

The structure is already right. This board is about **motion, selection and personality**, not a rebuild.

**ZONE (dark), current tokens**

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0b0d10` | page |
| `--bg-raise` / `--bg-raise-2` | `#12161b` / `#171c23` | panels |
| `--ink` | `#7dd3fc` | cyan ink, active tab fill |
| `--signal` | `#34d399` | green: play, artist name, "listening" dot |
| `--live` | `#ff4d4d` | live / alert red |
| `--warn` | `#fbbf24` | amber, currently the active RADIO tab outline |
| `--text` / `--text-dim` | `#e8edf3` / `#96a1ae` | type |
| Fonts | Chakra Petch (display), IBM Plex Mono (labels), system sans (body) | |

**ECHO (paper), current tokens**

| Token | Value | Role |
|---|---|---|
| `--paper` | `#f5f4f1` (panels `#f2f0eb`) | newsprint |
| `--ink` | `#151515` | text |
| `--red` | `#a8121c` (signal `#a3161f`) | masthead, kicker, active tab |
| `--mute` | `#55504b` | captions |
| Fonts | Old Standard TT (serif), blackletter masthead "Echo" | |

**Layout today:** desktop has a radial dial on the left (RADIO / ONDES / PLAYLISTS / ANTENNA / BOOTH), tilted paper tags on the right (UNE / ARTICLES / ARCHIVE / ATLAS) and a ZONE/ECHO toggle at the top. At narrower widths these become a row of **parallelogram tabs**: dark ones for Zone, paper serif ones for Echo. The ZONE/ECHO switch turns cyan in Zone and red in Echo. Panels carry codes such as `Z-01 · RADIO` and `E-01 · UNE`. The player bar sits at the bottom and the radio card has EVERYTHING / CHILL / ENERGY filters.

**Weak spots seen tonight:**
- The radio card shows a blank music-note square and "Unknown artist" when metadata is missing.
- Selecting a tab changes its colour but nothing *moves*.
- The two worlds swap without a transition.
- The amber outline on the active RADIO tab is a fourth accent that belongs to neither world.

---

## 3. The two worlds: references and how they split

Persona 5's **black / white / red** triad belongs to **ECHO**, which already has the red blackletter and the paper. Persona's **command-menu mechanics** (stacked tilted list, snapping selection shape, big preview on one side) belong to **ZONE**, which already has the dark HUD. Don't paint Zone red. Give Zone the motion and Echo the look.

### ZONE: the console

| Reference | What to take |
|---|---|
| **Persona 5 command menu.** [UI reference video, chapters for each menu](https://www.youtube.com/watch?v=ZjMRZlNvGFA); main menu at 02:09 | A stacked list running down at an angle, mixed-case cut-out letters. The selected item gets a **jagged colour shard behind it with a cyan offset echo** and grows. A giant number and date badge sits in a corner. The background is halftone or radial. |
| **Persona 5 Persona list** (same video, ~05:00) | A compact list in a tilted black panel, top-left. The selected row becomes a **bar that overshoots the list's width** with a cyan offset shadow. The selected item appears **large on the other half of the screen**, divided by a sweeping curve. This is the *list → big preview* pattern. |
| **Persona 5 party panel** (Skill menu, ~02:10) | Stacked tilted cards with a small tab label (LEADER / PARTY). The active card gets a red and cyan double outline. The screen splits diagonally into black and white. |
| [**Pizza Hotline**](https://pizzahotline.bandcamp.com) | Navigation named like hardware: **SOFTWARE / HARDWARE / HOTLINE**. Pale grid, chrome logo, PS1-era low-poly. Zone's RADIO / ANTENNA / BOOTH is the same move and can be pushed further. |
| [**slowerpace 音楽**](https://slowerpace.bandcamp.com) | 1-bit dithered statue banner. Covers parody objects: CD-ROM, BSOD, cereal box, PlayStation case, OS boot screen. The idea is **obsolete hardware as a frame for content**. |
| [**Arctic Contact**](https://arcticcontact.bandcamp.com) (the label that pressed Snowpoint's vinyl) | Sky blue `#6EB8DA`, a wide white wordmark with **red Japanese 北極接触 stamped across it**, red links. Covers: a CRT TV on a snowy peak ("weather channel"), a VHS sports still, an early-2000s web page. |
| [**Poolsuite FM**](https://www.creativeboom.com/work/poolside-fm-gets-a-refresh-with-a-90s-operating-system-in-your-browser-with-super-summer-music-and-vhs-visuals/) | An internet radio dressed as a 90s operating system. It is the nearest cousin to Radio Tower. Study it, then **don't** become it: we're a game menu, not a desktop OS. |

### ECHO: the paper

| Reference | What to take |
|---|---|
| **Persona 5 ransom-note type.** UI lead Masayoshi Suto took it from Sex Pistols covers ([The Star/NYT](https://www.thestar.com.my/tech/tech-news/2024/10/20/exuberant-video-game-menus-designed-with-da-vinci-in-mind)) | Mixed letters on short labels (section names, the kicker "REPORTAGE", tag chips). **Never on body text.** |
| [**Oblique Occasions**](https://obliqueoccasions.bandcamp.com) | Pure black, a huge white grotesque name with its **Japanese translation set underneath** (斜めの機会), red collage covers. Shows what one big name plus a subtitle line can carry. |
| [**Mabisyo**](https://mabisyo.bandcamp.com) | Black and red, **red barbed or zig-zag ornamental bands** above and below a wide, sharp display wordmark, red-and-black manga duotone covers. The most "Persona" page in Arthur's follows. |
| [**Turn Undead**](https://turnundead.bandcamp.com) | Black, a red hand holding a white cassette with kanji, big white rounded caps, red links. Covers use katakana titles (デウス), brand pastiche, classical sculpture. |
| [**ultimateria万**](https://ultimateria.bandcamp.com) | Deep indigo, a **huge blackletter wordmark** over glitchy violet ink swirls, chaotic layered collage, a vertical rainbow spine with katakana. Blackletter is what Echo's masthead already uses. Push it this far only in hero moments. |
| [**silph skyline ◓**](https://silphskyline.bandcamp.com) | Manga panels **mirrored left and right** around the name in a white box, two-colour riso-print covers, Japanese titles. |

### Shared texture (both worlds)

| Reference | What to take |
|---|---|
| [**cøuиtessa**](https://countessa.bandcamp.com) | RGB-split glitched katakana, mirrored lettering, magenta and cyan, **barcodes and data labels** on covers. Glitch is for transitions only, never at rest. |
| [**saken**](https://saken.bandcamp.com) | Dark violet gradient, lowercase serif name **faded into a corner**, solarised and inverted photo covers. |
| [**Zoa Deschanel**](https://zoadeschanel.bandcamp.com) | Acid yellow-green with a coral bar, warped blue letters, a **camcorder timestamp ("2:02 PM") burnt into images**. |
| [**Emapea**](https://emapea.bandcamp.com) | Warm 70s sunburst arcs in sepia, hand-inked logo, mid-century flat illustration. This is the warm counterweight: lo-fi jazz is on the radio a lot. |
| **Signalwave / broken transmission.** Vaporwave subgenre built like flipping TV or radio channels ([genre map, JP](https://scrapbox.io/zatto/vaporwave)) | The model for switching between ZONE and ECHO and for changing tracks. |
| [**Iconography of Vaporwave**](https://daily.bandcamp.com/features/vaporwave-iconography-column) (Bandcamp Daily) | Background reading on the scene's visual vocabulary. |

**Patterns across the scene to reuse:** Japanese as a second line under Latin names · old hardware and OS as the frame · mirrored banners · texture from the medium (dither, RGB split, solarise, burnt-in timestamp) rather than added ornament · one huge name.

---

## 4. Motion language (the most important section)

Persona's menus are fast but never a plain cut: each screen has its own entrance, and Atlus builds each menu as a separate program ([Kotaku](https://kotaku.com/-metaphor-refantazio-persona-5-menu-ui-hashino-1851667088)). We copy the principle, not the assets.

| Rule | Spec |
|---|---|
| **Snap, don't drift** | Selection moves take **120–180 ms** with a sharp ease-out and a tiny overshoot, e.g. `cubic-bezier(.2,1.4,.4,1)`. No slow fades over 250 ms on interaction. |
| **Entrances have direction** | Panels enter from an edge on a slight angle (translate + 2–4° rotate), **220–320 ms**, children staggered **30–50 ms**. Each section has its own direction (see §6, MB-07). |
| **Exits are faster than entrances** | About 60% of the entrance time. |
| **Things are tilted** | Labels and shards rotate **−4° to +4°**, alternating down a list. Body text, the player controls and the progress bar stay straight. |
| **Double offset** | Selected things get a hard offset shadow in a second colour, 3–6 px, no blur. This is the Persona red + cyan echo. Zone: `--ink` cyan over `--signal` green or `--live` red. Echo: `--red` over `--ink` black. |
| **Glitch only in transit** | RGB split, scanline tear or a channel flip lasts **≤ 200 ms** during a change, then the screen is clean. |
| **Idle is calm** | Nothing loops at rest except the live indicators (listening dot, LIVE pulse, the spectrum) and maybe one slow ambient layer. |
| **Reduced motion** | With `prefers-reduced-motion: reduce` (or a toggle in the existing *Réglages · Écran* panel), replace every movement with an instant swap or a ≤ 100 ms fade. Keep the tilt and the colour, drop the motion. |
| **Sound (optional, off by default)** | Persona-like UI ticks on selection, *never* over the music unless the user opts in. The radio is the soundtrack. |

---

## 5. Type and colour

**Zone type:** Chakra Petch for display and tabs, already a good fit. IBM Plex Mono for codes (`Z-01`), timestamps and data labels. Add **Japanese as a second line** in hero spots, for example ZONE / ゾーン or RADIO / ラジオ, set small and dim beneath, like Oblique Occasions. Suggested font: Noto Sans JP (open licence, subset to the glyphs used).

**Echo type:** keep the blackletter masthead and Old Standard TT. For **ransom-note labels**, build them from 3–4 typefaces already on the page (Old Standard, Chakra Petch, Plex Mono, the blackletter) plus inverted chips (paper on ink, ink on red). Don't add a Persona-imitation font. If one heavy condensed sans is needed for kickers, use an open one such as Anton or Bebas Neue ([font notes](https://madegooddesigns.com/persona-5-font/)).

**Colour:**
- Zone stays **cyan + green on near-black**, with `--live` red reserved for LIVE and selection echoes. **Drop the amber outline** on the active tab and use the double-offset selection (§4) instead.
- Echo stays **paper + ink + `--red`**. Red is the Persona red here.
- **Per-lane accent (new):** each radio lane can own one accent used only while it is selected (see MB-02). Candidates drawn from the references: sky `#6EB8DA` (Arctic Contact), acid `#d9e04f`-ish (Zoa Deschanel), sunburst sepia (Emapea), violet (saken, ultimateria). Check contrast on `--bg`.

---

## 6. Components to build

Each item is a self-contained branch. Ordered by impact for the effort.

### MB-01 · Selection shard (both worlds)
**Ref:** Persona 5 command menu (video 02:09), Persona list (~05:00).
**What:** one shared element sits *behind* the selected tab or list item: a jagged polygon (clip-path) with a hard offset copy in the second colour. On selection change it **jumps** to the new item (120–180 ms, overshoot) and re-randomises its shape slightly each time. The selected label scales about 1.08 and tilts the other way. Replaces the amber outline.
**Where:** Zone tab row and dial, Echo paper tags, the EVERYTHING / CHILL / ENERGY filter, the Echo tag chips (Tout / mouvement lycéen / reportage).
**Done when:** keyboard arrows move it too, focus-visible matches it, and with reduced motion it simply appears.

### MB-02 · Lane select (Scott Pilgrim character select)
**Ref:** [Complete Edition walkthrough, select screen at 0:57](https://www.youtube.com/watch?v=fsWXGw3UsmI&t=55s). Red theatre curtains frame "PLEASE SELECT A CHARACTER". Four **columns, one per player**. The active slot shows its character in full colour with **▲ ▼ arrows to cycle**, name and "LEVEL 7" in gold beneath. Empty slots show **blue-tinted silhouettes** and "PRESS Ⓐ TO JOIN". The screen is itself a homage to Super Mario Bros. 2 ([HG101](https://www.hardcoregaming101.net/scott-pilgrim-vs-the-world-the-game/)).
**What:** make the radio's lanes (EVERYTHING / CHILL / ENERGY, and the curated lanes such as the Snowpoint Lounge lane) a cast on a stage. Each lane is a slot with a "character card" (cover mosaic or emblem, name, a stat line: tracks, hours, "in rotation every 4 days"). The selected lane is in full colour and applies its **per-lane accent**; the others are tinted silhouettes. ▲ ▼ (or swipe) cycles. Optional curtain or stage frame drawn in CSS, original rather than pixel-copied.
**Twist:** the **"1 listening"** count becomes join slots: one lit slot per current listener, the rest "PRESS ▶ TO JOIN". The multiplayer metaphor fits a synced radio exactly.
**Done when:** it works with one thumb on mobile, and it never interrupts playback.

### MB-03 · Track-change caption (Persona dialogue box)
**Ref:** Persona 5 dialogue ([video 01:47](https://www.youtube.com/watch?v=ZjMRZlNvGFA&t=110s)). The speaker portrait **bleeds out of the bottom-left corner**. The name sits on a **skewed white tag**. The line itself is in a **black spiky, tilted polygon** with white text.
**What:** when the station changes track, a caption slides in **from the side** (right on desktop, bottom on mobile): a skewed name tag with the artist, then a tilted black polygon with the title. The title **scrambles, then settles** (GSAP ScrambleText or a small hand-rolled version) like a signal locking on. The cover art bleeds in from the edge at an angle. It stays about 5 s, then exits fast.
**Tools:** GSAP SplitText and ScrambleText have been free since 3.13 ([docs](https://v-gsap-nuxt.vercel.app/usage/splittext), [notes](https://skills.sh/microck/gsap-skills/gsap-text)). Vanilla JS works, no React.
**Done when:** it fires on the station's track-change event (not on a timer), it's announced politely to screen readers (`aria-live="polite"`), and reduced motion gives a plain fade.

### MB-04 · Selected-item marquee band (Scott Pilgrim difficulty select)
**Ref:** [same walkthrough, 0:51](https://www.youtube.com/watch?v=fsWXGw3UsmI&t=51s). The chosen option, "SUPREME MASTER", **repeats as a full-width scrolling band** behind the menu.
**What:** a thin full-width ticker behind or under the active section repeats its name (RADIO · RADIO · ラジオ · RADIO …) or, on the radio, the current track. Slow, about 40 px/s. Mono or display caps at low contrast.
**Where:** Zone panel header (behind `Z-01 · RADIO`). In Echo, a ticker of the latest headline under the masthead, like a news crawl.
**Done when:** it pauses on hover and focus and stops under reduced motion.

### MB-05 · ZONE ⇄ ECHO channel flip
**Ref:** signalwave / broken transmission (channel surfing), cøuиtessa's RGB split, Persona's diagonal black/white split.
**What:** switching worlds plays a ≤ 300 ms **channel change**: a diagonal wipe (cyan → red), a 1–2 frame RGB-split tear, a flash of static or scanlines, then the other world in place. The toggle itself behaves like MB-02 in miniature: two "characters", and the chosen one steps forward.
**Done when:** the URL updates (`/` ⇄ `/echo` already exists), back and forward replay the flip, and reduced motion gives an instant swap.

### MB-06 · Atlas as an overworld (Scott Pilgrim map)
**Ref:** [same walkthrough, 1:02](https://www.youtube.com/watch?v=fsWXGw3UsmI&t=60s): Toronto as a pixel overworld island, **numbered stage nodes linked by paths**, the current stage's name in a banner at the bottom, button prompts in the corner.
**What:** Echo's ATLAS (and optionally Zone's ONDES) as a stylised map, original and not pixel-copied. Places from the articles are **numbered nodes on paths**. The selected node shows its name in a bottom banner, and a small marker walks between nodes when you move.
**Done when:** it falls back to a plain list on small screens and for screen readers.

### MB-07 · A different entrance for each section
**Ref:** Persona's one-program-per-menu principle.
**What:** give each section its own way in, so moving through the site feels like moving through game menus:

| Section | Entrance idea |
|---|---|
| RADIO | Card drops from the top with a slight bounce, tilt settles to 0 |
| ONDES | Sweeps in on a curve from the right, like the Persona list's curved divider |
| PLAYLISTS | Cards fan out from a stack, a lane-select echo |
| ANTENNA | Scanline wipe from the top, signal bars fill |
| BOOTH | Slides up like a drawer |
| UNE | Masthead stamps in (scale 1.15 → 1, ink press), then the columns drop |
| ARTICLES | Rows slide in from alternating sides |
| ARCHIVE | Files flip like index cards |
| ATLAS | Map zooms out from the selected node |

Keep each under 320 ms, interruptible, and skip it entirely under reduced motion.

### MB-08 · Side text on scroll (Echo articles)
**Ref:** Persona captions arriving from the edges. Persona 3 Reload menus rebuilt in HTML/CSS/JS ([MenuRecreations](https://spikehd.github.io/MenuRecreations/menus/p3reload)).
**What:** in long reads, pull quotes, kickers and image captions **slide in from alternating sides** as they enter the viewport, at a slight angle, landing straight.
**How:** CSS scroll-driven animations (`animation-timeline: view()` with `animation-range`) need no JavaScript. Wrap them in `@supports` so other browsers just show the text ([Chrome guide](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/scroll-entry-exit-effects), [text reveal patterns](https://alvarotrigo.com/fullPage/tools/text-reveal-on-scroll/), [Josh Comeau](https://joshwcomeau.com/animation/scroll-driven-animations)). Masked line reveals for headlines ([Osmo](https://www.osmo.supply/resource/masked-text-reveal)).
**Done when:** text is fully readable without the animation, and nothing moves while you're reading a paragraph (only the elements entering).

### MB-09 · Date and time badge (Persona calendar)
**Ref:** Persona 5's top-left date widget (video 01:47): a big hand-drawn day number, the weekday, the time of day in Japanese (放課後, "after school"), a weather icon.
**What:** Zone gets a corner badge with the **station clock**: big day number, weekday, a time-of-day word (MATIN / APRÈS-MIDI / SOIR / NUIT, with a small Japanese line). It can tint the radio slightly by time of day. Echo already prints the date under the masthead ("MERCREDI 18 NOVEMBRE 2026"), so keep it there in the paper style.
**Done when:** it uses the same clock as the station (Paris time), not the visitor's.

### MB-10 · Cover-art treatments and the empty state
**Ref:** slowerpace (1-bit dither), saken (solarise), cøuиtessa (RGB split + barcode), Zoa Deschanel (burnt-in camcorder timestamp).
**What:**
- When a track **has art**, show it clean, with an optional subtle per-lane treatment on the *background copy only*: dithered or solarised, blurred behind the card.
- When it has **no art and no artist** (today: a grey note icon and "Unknown artist"), make the empty state a designed object instead of an apology. A generated "cassette" or "CD-ROM" label with the title in mono, a barcode built from the track ID, and a camcorder-style timestamp of when it started. Write "Artiste inconnu · transmission anonyme" or similar rather than "Unknown artist".
**Done when:** no blank square ever appears on air.

---

## 7. Guardrails (don't skip)

- **No copied assets.** No Persona or Atlus logos, the stylised 5, character art, UI textures or fonts. No Scott Pilgrim sprites, curtains ripped from the game or Ubisoft assets. Recreate the *mechanics* with original shapes, CSS and your own drawings. The repo is public, and fan projects get taken down (see Arthur's Snowpoint research).
- **No rehosted Bandcamp art** beyond what the radio already serves for its own library. Link to artists' pages, don't copy their banners.
- **Readable first.** Body text straight, contrast at least AA, tilt only on labels and shards.
- **Keyboard and screen reader:** every menu works with arrows, Enter and Esc (the game controls feel *and* accessibility). `aria-live` on the track caption. Map and lane select have list fallbacks.
- **Performance:** animate only `transform`, `opacity` and `clip-path`. No layout thrash. Mobile first: the narrow-width tab row is where most visitors are.
- **Playback is sacred.** No transition, overlay or select screen may pause, restart or desync the stream.
- **Reduced motion respected everywhere** (§4).

---

## 8. Suggested order

1. **MB-01 Selection shard.** Biggest change in feel for the least code, and it touches every menu.
2. **MB-03 Track-change caption.** Makes the radio feel alive and is the "text from the sides" Arthur asked for.
3. **MB-10 Empty state.** Fixes "Unknown artist" on air.
4. **MB-05 Channel flip.**
5. **MB-02 Lane select.**
6. **MB-07 Section entrances**, then **MB-04 marquee**, **MB-08 side text**, **MB-09 date badge**.
7. **MB-06 Atlas overworld** last (largest).

Each one goes on its own `claude/site-desk-<topic>` branch with a Vercel preview, per the site-desk rules. Nothing goes to `main` until Arthur writes "push live".

---

## 9. Reference index

**Persona 5 (menus and navigation)**
- [UI reference video, title → every menu, with chapters](https://www.youtube.com/watch?v=ZjMRZlNvGFA): title 01:08 · dialogue 01:47 · Skill 02:09 · Item 02:35 · Equip 03:20 · Persona 04:47 · Status 07:05 · Confidants 08:34
- [Menu animation check video (JP)](https://www.youtube.com/watch?v=zfAwYO7SQTA)
- [P5 Royal vs Strikers UI comparison](https://www.youtube.com/watch?v=Jph48DYwBTo): main menu 00:04 · command menu 01:00 · battle 03:20
- [P5 Scramble menus](https://www.youtube.com/watch?v=zsoZ14Nva14) · [Examining P5's menus](https://www.youtube.com/watch?v=DxOGkhLfPf8) · [Render breakdown](https://www.youtube.com/watch?v=RtmAoMJ10V0)
- [Atlus at CEDEC 2017 on the UI (Siliconera)](https://www.siliconera.com/?p=668266) · [Sakurai on P5's UI](https://sourcegaming.info/2016/11/24/the-aims-of-ui-sakurais-famitsu-column-vol-515/) · [Hashino: one program per menu (Kotaku)](https://kotaku.com/-metaphor-refantazio-persona-5-menu-ui-hashino-1851667088) · [Suto: Sex Pistols ransom notes](https://www.thestar.com.my/tech/tech-news/2024/10/20/exuberant-video-game-menus-designed-with-da-vinci-in-mind) · [The readability trade-off (Medium)](https://medium.com/theuglymonster/can-persona-5s-ui-be-justified-by-its-style-076c3c6c530b)
- Code rebuilds: [MenuRecreations, P3 Reload in HTML/CSS/JS](https://spikehd.github.io/MenuRecreations/menus/p3reload) · [P3R pause menu, plain HTML/CSS/JS](https://archive.hackclub.com/archive/HYJSo/mhtml/html) · [P3R UI in Godot + write-up](https://breadpack.itch.io/persona-3-reload-ui) · [P5 menu in Godot](https://www.youtube.com/watch?v=hyGhRtzGmxA) (star background 00:35, polygon animation 03:26)

**Scott Pilgrim vs. the World: The Game**
- [Complete Edition Part 1](https://www.youtube.com/watch?v=fsWXGw3UsmI): title 0:44 · difficulty marquee 0:51 · **character select 0:57** · overworld map 1:02
- [Full 2010 walkthrough](https://www.youtube.com/watch?v=B9ZO_XCSsuQ) · [Character Select music (Anamanaguchi)](https://www.youtube.com/watch?v=L9irHfi0_hU) · [Scott Pilgrim EX palette select (2026)](https://www.youtube.com/shorts/Qi_5T9H47zU)

**Arthur's Bandcamp follows**
[Pizza Hotline](https://pizzahotline.bandcamp.com) · [Oblique Occasions](https://obliqueoccasions.bandcamp.com) · [Mabisyo](https://mabisyo.bandcamp.com) · [Turn Undead](https://turnundead.bandcamp.com) · [ultimateria万](https://ultimateria.bandcamp.com) · [slowerpace 音楽](https://slowerpace.bandcamp.com) · [silph skyline](https://silphskyline.bandcamp.com) · [saken](https://saken.bandcamp.com) · [cøuиtessa](https://countessa.bandcamp.com) · [Arctic Contact](https://arcticcontact.bandcamp.com) · [Zoa Deschanel](https://zoadeschanel.bandcamp.com) · [Emapea](https://emapea.bandcamp.com) · Snowpoint Lounge (page emptied: [Discogs](https://www.discogs.com/artist/10705012-Snowpoint-Lounge), [Internet Archive](https://archive.org/details/3-pd8rgy))

**Vaporwave, retro radio, retro UI**
[Iconography of Vaporwave](https://daily.bandcamp.com/features/vaporwave-iconography-column) · [Subgenre map incl. signalwave (JP)](https://scrapbox.io/zatto/vaporwave) · [Poolsuite FM](https://www.creativeboom.com/work/poolside-fm-gets-a-refresh-with-a-90s-operating-system-in-your-browser-with-super-summer-music-and-vhs-visuals/) · [98.css](https://github.com/jdan/98.css) (plus XP.css, 7.css, NES.css, if a retro window is ever needed for ARCHIVE)

**Motion and text techniques**
[Scroll entry/exit effects (Chrome)](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/scroll-entry-exit-effects) · [Scroll-triggered animations are coming (Chrome)](https://developer.chrome.com/blog/scroll-triggered-animations) · [Horizontal reveals](https://devtoolbox.dedyn.io/blog/css-scroll-animations-guide) · [Text reveal on scroll](https://alvarotrigo.com/fullPage/tools/text-reveal-on-scroll/) · [Josh Comeau on scroll-driven animation](https://joshwcomeau.com/animation/scroll-driven-animations) · [GSAP SplitText (free since 3.13)](https://v-gsap-nuxt.vercel.app/usage/splittext) · [ScrambleText](https://skills.sh/microck/gsap-skills/gsap-text) · [Osmo masked reveal](https://www.osmo.supply/resource/masked-text-reveal) · [web.dev 3D game menu component](https://web.dev/articles/building/a-3d-game-menu-component)

---

## 10. Open questions for Arthur (don't block on them)

1. **"Futahero"**: not found as an artist or genre. Read here as *future funk*. If it's a name, the board gets a line for it.
2. **Japanese second lines:** keep them as decoration only, or translate properly (ZONE → ゾーン, RADIO → ラジオ, ECHO → エコー)?
3. **Lane characters:** which lanes are the "cast" (EVERYTHING / CHILL / ENERGY only, or the curated lanes such as Snowpoint Lounge too)?
4. **UI sounds:** none, or opt-in ticks?
