# Backlog — everything Ortis asked for that is not on the site yet

**Started 2026-11-13** from a review of every request since 2026-10-29 (Ortis: « you should be filing
somewhere all the ideas that are not implemented, all the prompts … have them ready to go. If I mention …
use the usage to work through a problem, then you should be working on these »).

**This is the to-do list.** Claude Code, a cloud agent on GitHub, or a claude.ai chat — whichever opens it:

1. Work in the git clone (`radio-tower-live\` on the laptop, or `TurnOposite/World-wide-web`), never in the old
   `Radio Tower\` folder, which holds the music and the laptop-only bits (its `POINTER.md` says what).
2. When Ortis says to spend usage on the backlog: take the **first open item in « Ready to build »**, one per
   run. `bash scripts/build-test.sh` before and after; never push without his word (he says « push » or
   « fire »). Tick it here with the date and commit, and add the `docs/WORKLOG.md` and `docs/DECISIONS.md` entries.
3. Items marked **needs Ortis** wait for an answer from him. Ask them together, in one message, when he is there.
4. New request, not done in the same session? Add it here, in his words, with the date.
5. Older, ranked engineering items live in [`ROADMAP.md`](./ROADMAP.md) (most of it is Pi-era). The step-by-step
   for the streams, the line and the phone stays in [`plans/PLAN-chat-and-moods.md`](./plans/PLAN-chat-and-moods.md);
   this file points to it and does not repeat it.

Size: **S** = under an hour of work, **M** = a session, **L** = several sessions.

---

## Urgent

| # | What | State | Needs |
|---|---|---|---|
| U1 | **The Oracle account is on the Free Tier** (screenshots, 2026-11-13: plan type Free Tier, the trial's Universal Credits suspended since 5 Nov). Oracle can stop an Always Free server that looks idle for 7 days — CPU, network and memory all under 20 % — and the tower looks idle (0 listeners, 128 MB of 12 GB). Stopped is not deleted: it can be started again from the console. | Explained to him 2026-11-13; his worry: a budget alert does not stop spending | **needs Ortis**: go Pay As You Go or not. If yes, B1 first or right after |
| U2 | **The same song twice across 05:00.** `scripts/repeats.mjs` on 2026-11-13, 14 days ahead: 13 tracks play in the last hours of a broadcast day and again in the first hour of the next, as close as 12 min (« zanzibar » 17/11 04:40 → 05:00, « Heavy Smoke » 21/11 04:52 → 05:13). Each day is dealt on its own (`buildDay`), and nothing looks at the day before. | Found, not fixed | **needs Ortis**: changing `buildDay` changes what plays from the moment the tower takes it (see the note under B2) |

## New on 2026-11-16 — the handoff to Claude Code

Ortis, 2026-11-16: « first task for him is code all of the list … with those items as well », then, the same
evening in Claude Code: « build all new infra and push ». The seven below are the « new infra »; the order to take
everything in is the handoff's: N6 → B2 → B1 → N2 (with B7, part of W9) → N1 A → N3 → N4 → B4, B5, B8 → N1 B → N5 →
B6 → N7 → C1's mock → the W items as his answers come.

| # | What (his words where he gave them) | State |
|---|---|---|
| N1 | **« Phone notification for messages in antenna »** | **Built 2026-11-16** (`3a3b792`). A — his phone through ntfy: **off until he does the three steps** in [`NOTIFICATIONS.md`](./NOTIFICATIONS.md). B — « tell me when someone writes » for listeners: on with this code. **Not proven on a real iPhone** |
| N2 | **« More parameters in the chat logs for admin with history beyond what's not kept and restore option »** | **Built 2026-11-16** (`7fadded`): the Booth's « Line » side, the log's fields, restore, un-silence, the export. Left: how many days the log should go back (`TELEGRAPH_LOG_KEEP_DAYS`, today no limit but the size) — his number |
| N3 | **Live status** | **Built 2026-11-16** (`acb0487`): `npm run status`, `commit` in `/api/health`, the Booth's « Status » side |
| N4 | **Phone ↔ desktop comparison** | **Built 2026-11-16** (`08a9c25`): `npm run compare`. What it flags on the phone is W3's list |
| N5 | **Fire from the cloud** | **Built 2026-11-16** (`65bd575`), **not switched on**: he makes the deploy key — [`FIRE-FROM-CLOUD.md`](./FIRE-FROM-CLOUD.md), six steps |
| N6 | **The tooling points at the backlog** | **Done 2026-11-16** (`3ead4f6`) |
| N7 | **A ready exit from Oracle** | **Written 2026-11-16** (`0a78fcb`): [`EXIT-ORACLE.md`](./EXIT-ORACLE.md). Three pieces of work it names (P1 the daily programme in the browser, P2 the Worker chat, P3 the bot's R2 destination) wait for his word |

### Questions for Ortis, together (2026-11-16)

1. **Notifications:** will you do the three ntfy steps (`NOTIFICATIONS.md`)? And on your iPhone: add the site to the
   Home Screen, open it from there, Antenna → « tell me when someone writes » — does a notification arrive, phone locked?
2. **The private chat log:** how many days back? (Today: everything, until two files of 5 MB are full.)
3. **Fire from GitHub:** will you make the deploy key and the secret (`FIRE-FROM-CLOUD.md`)?
4. **Oracle:** Pay As You Go once the cost cap (B1) exists? And from `EXIT-ORACLE.md`: build P1 and P3 now so the
   exit is an afternoon; the whole library on R2 (≈ $0.62 a month) or a 10 GB station for nothing?
5. **The 8 labels** (W1): Slushwave, Funk, Hyperpop, Bossa nova, Hip-hop, Breakcore, Beat tape, Pop — their own, or folded in?
6. **B2** (no song twice across 05:00): the handoff treats your « code all of the list » as a yes. It re-deals the
   day at the moment it starts: which morning?
7. **Atlas** A or B, the new room's name, the uni projects' titles and files (W4–W6); **your phone notes** on /radio and /antenna (W3).

## Ready to build

| # | What | Size | Where it starts |
|---|---|---|---|
| B1 | **A hard cap on what the tower can cost**, for Pay As You Go: with the server inside the Always Free shapes (2 OCPU, 12 GB, a boot disk under 200 GB), the one charge the tower can run up by itself is outbound traffic past 10 TB a month (≈ $0.0085/GB after it). A watchdog on the server reads the month's bytes sent (`/proc/net/dev` or `vnstat`) and, past ~9 TB, stops serving audio (Caddy answers 503 on `/api/track/*/stream`) until the 1st. Plus an Oracle compartment quota so no paid shape or volume can be created by mistake. | M | `deploy/cloud/` (install.sh writes the timer); Oracle console → Governance → Quotas |
| B2 | **No song twice across 05:00** (U2, once he says yes): when dealing day d, keep out of its first 3 hours anything played in the last 3 hours of day d − 1. Day d − 1's tail only depends on its own deal, so this needs no recursion. Ship it so it starts at a day boundary (a `from` date in the rules), or the day already on air re-deals mid-song. `npm run repeats -- --days 14` must then show no « same track » line. | M | `server/lib/programme.js` `buildDay`; `tests/programme.test.js` |
| B3 | **The Snowpoint doubles.** Ortis, 2026-11-13: keep them on air (« I love Snowpoint Lounge »), warn him if one plays close to its twin. Built: `scripts/repeats.mjs` and the weekly GitHub run `.github/workflows/repeats.yml` (fails, so GitHub emails him). Left: if the warnings bother him, the programme could keep twins 3 h apart the same way as B2. | S | after B2 |
| B4 | **The Livre miroir's last race**: leaving the Archive *with the book open* straight for `/echo/lectures` can end with the book shut (WORKLOG 2026-11-10 night). Fix: drop `#miroir` when the reader closes the book, not when the `close` event arrives. | S | `site/js/ui/mirror-book.js` |
| B5 | **Flaky checks that hide their cause**: « …and the music did not stop to show it » prints only the drift when it is `paused` or a swapped `<audio>` that failed (1 red in 4 runs, 2026-11-13); the cloud Booth's « it is a permutation » (1 in 5). Make each report what it saw, then fix at the cause as the 2026-11-11 three were. | S | `scripts/site-smoke.mjs` |
| B6 | **Re-aim self-test stage 6 at the site, then remove the Pi-era player** in `public/` (~3,300 lines) — plan step 0b. | M | `plans/PLAN-chat-and-moods.md` step 0 |
| ~~B7~~ | **Done 2026-11-16 with N2** (`7fadded`) — ~~The telegraph line, harder to flood~~: a room-wide ceiling (say 30 messages a minute, whoever sends them) on top of the per-address budget, and a mute that survives a restart (today a deploy forgives a silenced sender). Only matters once people use the line: 2 messages in total on 2026-11-13. | S | `server/lib/telegraph.js` |
| B8 | **The line in the mini-player on a phone** (the last message, one line) — plan step 1d. | S | `site/js/ui/minibar.js` |

## Waiting on Ortis

| # | What he asked (date) | Waiting on |
|---|---|---|
| ~~W1~~ | **Done 2026-11-17** (`dfc1497`, `docs/STREAMS.md`): filled from his sheet by his rule of that day. ~~The two streams' music~~ (2026-11-10) | His word on 8 labels he used that the tower does not have: Slushwave, Funk, Hyperpop, Bossa nova, Hip-hop, Breakcore, Beat tape, Pop — their own, or folded in? Then plan steps 2a → 2b (`plans/LABELS-ortis-2026-11-11.md`) |
| W2 | **A tempo (BPM) slider** (2026-11-10) | W1 first; then BPM measured offline on the laptop (plan 2e, 2f). No track carries a tempo today |
| W3 | **His phone notes** on /radio and /antenna (2026-11-10). On a 375×667 screen Tune in is still 50 px under the fold (plan 1e) | Him, on his own phone. The real-phone checklist in `WORLD.md` has never been run |
| W4 | **His uni projects in the Archive, linked from the Atlas** (2026-11-03): « Who's in My Food? » (5 episodes), the night-skating report, the podcast « Echo Chamber » (poster), « Emily in Panam », « Sounds of Time » | Atlas option A or B (the mock: `Radio Tower\Claude outputs\atlas-projection-mock-2026-11-03.html`), the new room's name (« Projection » proposed), titles, the 3 missing files (classmates), and where 6.8 GB of video lives (not GitHub or Vercel: the Oracle server or Cloudflare R2) |
| W5 | **The Atlas rethought**: bigger, clearer, smoother, with a gallery of his photos from those places (2026-11-03) | Same A/B choice as W4 |
| W6 | **Photos on the world map** (2026-11-03: the Archive's Photos tab went, its address kept, « for the world map later ») | Comes with W5 |
| W7 | **Playlist descriptions**: 25 of 58 written (2026-11-03) | His words for the other 33 (`site/data/playlists.json` `vibe`; the private view `?atelier=1` marks the empty ones) |
| W8 | **The cast, further** (2026-11-11): more looks, a hat or prop, or his own drawings in place of the eight (a published game's characters were asked for and are not used — DECISIONS 2026-11-11) | His drawings, or a yes to more looks (plan 3h). His own pictures for the bank go in `site/assets/telegraph/` (plan 3d) |
| W9 | **A game layer on the line** — time tuned in, reactions to the track, who is on the line (2026-11-10) | Only once people use the line (plan 3c, 3f). Not built with N2 on 2026-11-16: the log now holds what « who is on the line » would need (a per-day sender tag), nothing shows it to listeners |
| W10 | **Snowpoint every 4 days** (≈ 3.3 h a day) and **Behold's 91 songs at the albums' pace** — keep, more, or less? (Vault questions 95, 96) | His answer; one number in `music\channels.json`, then `publish` |
| W11 | **The long mixes cut down** to their best parts in Adobe Audition (2026-11-07) | His directives, mix by mix |
| W12 | **84 untagged files** from the phone, left on the USB key (2026-11-07) | Who they are |

## Concepts — not to push yet

### C1 — The phone's library as a pile of books (Ortis, 2026-11-13)

« On the phone version, the library, you have to kind of scroll to the side to see all the books … We could have
them as a pile, piled up, one on top of the other, but laid horizontally instead of vertically. It could be like a
messy pile, something a bit stylish … all the names, obviously, on the side of the book … wherever you click on
one, the books that are on top of it on the pile kind of go up to allow it to move out of the pile and open. …
a concept that you shouldn't push now because it might be hard. »

- **Where:** the Archive's Bibliothèque on a phone (`site/js/pages/rooms/library.js`, `rooms.css`; today a
  sideways-scrolling bookcase). Desktop keeps the bookcase.
- **What:** every book lying flat, spine out, titles readable on the spines; the stack a little untidy (each book
  offset and turned a degree or two, set by a seeded random so the pile is the same on every visit); the thesis
  and the Livre miroir in it too, or on top.
- **The gesture:** a tap on a spine — the books above it lift together (a few px up, a slight tilt), the chosen
  one slides out sideways and opens (the peek card / the thesis card / the Livre miroir as now); closing slides
  it back and the books above settle. Nothing scrolls sideways; a tall pile scrolls down with the page.
- **Before any code:** one HTML mock with two or three variants of the pile (tidy, messy, two piles), as he likes
  to choose design (`radio-tower-identity` note: one mock, all variants side by side, he picks by name). Then build.
- **Proof:** the site smoke at 390×844: no sideways overflow in the Archive, every book's spine visible, a tap
  on a lower book lifts the ones above and opens it.

---

## Done from this list

| Date | What | Commit |
|---|---|---|
| 2026-11-13 | The telegraph line empties every morning at 05:00 Paris (« make it that chat disappears every 24 hours ») — the room only; the tower's log is kept | (this push) |
| 2026-11-13 | The Livre miroir turns back: from the pond to the introduction (the left page's edge and corner, a tap at its left edge on a phone, ← →) | (this push) |
| 2026-11-13 | `scripts/repeats.mjs` + a weekly GitHub run: the same song twice within 3 hours, Snowpoint twins included | (this push) |
| 2026-11-16 | N6 — the tooling reads this file; `tower-deploy` rewritten for Oracle and fire | `3ead4f6` |
| 2026-11-16 | N2 + B7 — the line's log for the station: more fields, the whole history, restore, un-silence; a ceiling for the room; a silence that survives a restart | `7fadded` |
| 2026-11-16 | N1 — notifications for the line (ntfy for his phone, Web Push for listeners who ask) | `3a3b792` |
| 2026-11-16 | N3 — `npm run status`, the commit in `/api/health`, the Booth's Status side | `acb0487` |
| 2026-11-16 | N4 — `npm run compare`: every route at three sizes on one page, with flags | `08a9c25` |
| 2026-11-16 | N5 — fire from GitHub (built; waits for his deploy key) | `65bd575` |
| 2026-11-16 | N7 — `docs/EXIT-ORACLE.md` | `0a78fcb` |

## Touch-ups chosen by Ortis, 2026-11-16 (night) — **built 2026-11-17** (`74b3f86`): T1, T2, T4; T3 superseded (« the notifications should only be accessible to me »: the bell is in the Booth)

« Homogenize with the rest of the experience » — his four answers, to build next (one commit, before/after pictures):

| # | What | His choice |
|---|---|---|
| T1 | The Booth desk's Music / Line / Status tabs | **A switch like ZONE \| ECHO** (joined, slanted, the open side filled teal) |
| T2 | The Line side's rows | **Keep the cards.** (Mine to add: the sender's character in each card as on the Antenna, corners squared like the world's panels, the « kept … » hint moved into the note) |
| T3 | « tell me when someone writes » on the Antenna | **A bell button** beside Join (« Tell me » / « On · stop »), and beside change · leave once joined |
| T4 | The Status side | **Three lamps on top** (GitHub · Site · Tower: green same commit, red behind, grey unknown), the sentence under them, then the rows |

Also: the Status side's CSS classes share the `sp-` prefix with the Spotify deck — rename them (`stat-`). The smoke's label checks for the notify link move with T3.
Fire from GitHub: the deploy key pair exists on the laptop (`~\.ssh\radio-tower-github`, made 2026-11-16); steps 3–6 of `FIRE-FROM-CLOUD.md` are his.

## Designs waiting for his look (2026-11-17)

| # | What | Where |
|---|---|---|
| D1 | **The dials behind the side menus**: a cassette reel behind Zone's tags (turns one tooth at each change of page), an engraved 1920s globe behind Echo's (turns 30°) | **His word, 2026-11-18: no** (« soulless », photo-real objects on a pared-back ground; keep the semicircles). **Redrawn flat with MB-01, 2026-11-19** (`a460e13`) |
| D2 | **Fire from GitHub**: the tower half is done (2026-11-17) | his half: the `TOWER_DEPLOY_KEY` secret on GitHub (`docs/FIRE-FROM-CLOUD.md` step 5), then Actions → fire → Run |

## The front menu: the boat and the mood board (2026-11-18)

Two requests the same night, about the same front.

**The boat.** Ortis, 2026-11-18: « Make an elaborate version of the menus following the Persona 5 smooth transition
between different angles through a stop in time of a scene in motion that indicates you will continue it after your
decision … each window is a very smaller part of an ensemble that is not just a 2D plane. The ensemble scenery is an
old Chinese traditional boat floating in the middle of an Asian fjord of what may look like Thailand, but with the most
Chinese code inspiration, and round the mountaintops with a gentle, stable lake background. In the boat is a radio
station. Which plays on a laptop screen, which is what we enter with. Then if you go into playlists, it has the form of
a little phone that's on the table, antenna. You look to the right and there's like a communication device, maybe we do
this in the first person, or someone that's sitting down in that boat in like a hammock … have it for tonight as a
design proposal, and how all of this would work. »

**The mood board.** Then his creative-direction session's brief, [`design/MOODBOARD-globe-trotter.md`](./design/MOODBOARD-globe-trotter.md)
(copied from his Downloads, unchanged): « the creative vision … You decide the implementation. » Persona 5's menu
grammar for Zone, its black/white/red look for Echo, Scott Pilgrim's select screen, the texture of the Bandcamp labels
he follows. « This board is about motion, selection and personality, not a rebuild. »

**How they fit.** The board works on today's map and its items are ready to build now. The boat is a new shell for the
same pages and waits for his answers. Neither blocks the other: what the board builds (the selection, the caption, the
entrances, the empty cover) lives in the menus and the pages and would move into the boat as it is. One real
difference: the boat's prototype took Persona's mechanics only, in ink and mist; the board puts Persona's look on Echo
and its menu mechanics on Zone. That answers the boat's question on how far the Persona nod goes: if the boat is built,
its menus follow the board.

**His correction, the same night, on the Antenna:** « The antenna and the phone, I mean, are two different things. The
antenna and the chat room should live on the side of the boat. It's like a big, maybe another computer, or you can see
the antenna transmitting. Maybe it has like three modes. It's a bunch of machines and servers come together. There's
very few screens or just small ones with the essential stuff written. The three modes of the antenna. Maybe it's like a
cursor that has like the very top position, or 45 degrees to the right and 45 more with the three streams. And then
there's like electric cables coming out of it, and it's a zoom that connects to the digital world where the characters
live and the chat lives. »

| # | What | State | Needs |
|---|---|---|---|
| F1 | **The boat**, as the front menu: the windows become things on a boat on a karst lake (laptop = Radio, where you arrive; the little phone = Playlists; the machines on the boat's side = Antenna: a transmitting mast, servers with few small screens, a selector with three positions (straight up, 45° right, 90° right) for the three streams, and cables whose zoom leads into the digital world where the characters and the line live; the hanging scroll = Ondes; the lantern = Booth; the desk behind you = Echo), and the camera moves between them, stopping the scene while you choose | **Proposal, 2026-11-18**: a working prototype (CSS 3D boat and a canvas lake, no library, 60 fps headless at 1440 and 390 wide), concept frames, a build plan and the tests' state, on a private page (https://claude.ai/artifact/UXd4Cfrnzo1a2m9TjuHg7C); copy in `Radio Tower\Claude outputs\boat-station-2026-11-18\`. Proposed order: tests first (`TESTS-REVIEW.md` sections 4 then 3), the 3D camera behind `?boat=1`, the shell, the stop in time, phones, art, the switch | **needs Ortis**: go or not; first person or someone in the hammock; Echo at the stern or a second boat; a sound for the lake or none; a night look |

**Ready to build, from the board**, in its order. Each on its own branch with a preview; nothing reaches `main`
until he writes « push live » (the board's rule; the « site-desk rules » it mentions are not in this repo).

| # | What | Size | Where it starts |
|---|---|---|---|
| MB-01 | **Built 2026-11-19** (`a460e13`, live). **Selection shard**: one jagged clip-path shape with a hard offset copy in the second colour sits behind the selected tab or item and jumps to the next one (120–180 ms, slight overshoot, a new shape each time); the label grows a little and tilts the other way. Replaces the amber outline on the active tab. Zone's tabs and dial, Echo's tags, the Everything / Chill / Energy filter, Echo's tag chips; arrows move it, focus matches it, reduced motion just shows it | M | `site/js/world/tags.js`, `dials.js`, `site/css/world.css` |
| MB-03 | **Track-change caption**: on the station's track change (not a timer), a skewed name tag and a tilted black polygon slide in from the side, the title scrambles then settles, the cover bleeds in; about 5 s; `aria-live="polite"`; reduced motion: a fade | M | `site/js/player.js`, `site/js/ui/minibar.js` |
| MB-10 | **No blank square on air**: art shown clean when there is some; without art or artist, a generated cassette or CD-ROM label, a barcode from the track id and a camcorder timestamp of its start, and « Artiste inconnu » rather than « Unknown artist ». The track on air at 02:05 on 18/11 had neither | S–M | `site/js/ui/covers.js` |
| MB-05 | **Zone ⇄ Echo channel flip**, ≤ 300 ms: diagonal wipe (cyan to red), a frame or two of RGB tear, static, then the other world; the address changes and back / forward replay it; reduced motion: an instant swap | M | `site/js/world/world.js`, `camera.js` |
| MB-02 | **Lane select**: the lanes as a cast on a stage (Scott Pilgrim's select screen, drawn from scratch), each lane's card and accent, ▲ ▼ or swipe to cycle, the listeners as lit join slots; one thumb on a phone, never interrupts playback | L | `site/js/ui/channels.js` |
| MB-07 | **A different entrance for each section** (the board's table: Radio drops in, Ondes sweeps on a curve, the Booth slides up like a drawer, the Une stamps in…), each under 320 ms and interruptible | M | `site/js/world/world.js`, the pages |
| MB-04 | **Marquee band**: the active section's name (or the track) repeating slowly behind Zone's panel header; Echo's latest headline as a crawl under the masthead; pauses on hover and focus | S | `site/css/world.css` |
| MB-08 | **Side text on scroll** in Echo's long reads: pull quotes and captions slide in from alternating sides, CSS scroll-driven animation under `@supports`, nothing moves inside a paragraph | S | `site/css/rooms.css`, `site/js/pages/articles.js` |
| MB-09 | **Date badge** on Zone from the station's clock (Paris): big day number, weekday, MATIN / APRÈS-MIDI / SOIR / NUIT with a small Japanese line | S | `site/js/world/world.js` |
| MB-06 | **The Atlas as an overworld**: numbered places on paths, the selected one's name in a banner, a list for small screens and screen readers. Settle together with W5 (the Atlas rethought), which waits on his A or B | L | `site/js/pages/atlas.js` |

Notes for whoever builds these:
- The board's guardrails hold for every item: nothing copied from Persona, Atlus or Scott Pilgrim (logos, art,
  textures, fonts; the repo is public), no rehosted Bandcamp art, body text straight and at least AA, animate only
  `transform`, `opacity` and `clip-path`, playback never paused or desynced, reduced motion everywhere.
- The board suggests GSAP's SplitText and ScrambleText for MB-03. That would be a front-end dependency on a site with no
  build step: a hand-rolled scramble is a few lines; if GSAP is used anyway, a `DECISIONS.md` line first.
- Its four open questions (« Futahero », Japanese lines translated or decorative, which lanes are the cast, UI sounds)
  do not block anything.

