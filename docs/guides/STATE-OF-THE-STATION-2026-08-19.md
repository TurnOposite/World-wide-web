# State of the station — 2026-08-19

What today's runs actually did, and the measured answer to "the music sucks."
Read from the logs (`docs/WORKLOG.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`)
plus a fresh scan of the laptop library.

---

## 1. What happened today

Four runs, in order.

### Run 1 — roadmap #5, era-staging (`WORKLOG` line 164)

Adding or removing a track used to re-deal the *live* programme: a listener
mid-song could be yanked somewhere else. Now a library change is deferred to the
next cycle boundary — the schedule stages the new library and swaps at the seam.

### Run 2 — the same item reopened and fixed for real (`WORKLOG` line 20)

A same-day audit found the fix broken in three ways: a revision-fingerprint
collision, a `byId`/schedule desync, and a documentation overclaim. All three
resolved, with a revert/reapply transcript recorded. **This is the second time
this project has caught a confident "done" that wasn't** — the first produced
`BRIEF.md` rule 9, which is why the transcript exists.

### Run 3 — library curation and reordering (`WORKLOG` line 1101)

- **Genre by filename, not by tag** (`server/lib/genre.js`). Almost nothing in
  this library carries usable ID3 genre, so classification is a rule engine over
  the path and filename. Auditable on purpose: a misfiled track is one line to
  fix.
- **Dedupe moved into the scan**, not a cleanup script.
- **Queue reordering** — `POST /api/queue/reorder`, permutation only, fenced by
  `STATION_KEY` and a 60-second no-touch window. This is the endpoint the DJ
  booth now drives.

### Run 4 — scheduled: the visualiser, the identity menu, the queue editor (`WORKLOG` line 1149)

- **`public/viz.js`** — five composited layers, no dependency, no bundler.
  Frames the album art, never draws over it. Genre keys the palette end to end.
  Three quality tiers with a dead band. Four bugs found by screenshots and tests
  that review would not have caught.
- **`docs/IDENTITY-OPTIONS.md`** — five directions, all five marks rendered at
  64/26/16px on the real background before any claim about legibility.
- **The queue editor** (`public/queue.js`) — drag/keyboard reorder, key held in
  memory only, panel hidden entirely when the server has no `STATION_KEY`.
- **152 tests pass, 0 fail.** Browser checks 32/32. The full `build-test.sh` was
  run in two halves because of a sandbox time cap — recorded honestly in the
  worklog rather than claimed as one clean run.

### Then, with you (`DECISIONS` line 1636)

Identity decided: **Option A keeps the name**, hybrid mark (A's tower + D's arcs
rotated sideways), **green logo**, credit reads **Zoneko**, "Guide" renamed
**"Echoes"**, new **Zone** tab with a world map. Spec in `docs/DESIGN-BRIEF.md`,
which is now the authority — `IDENTITY-OPTIONS.md` stays as the record of what
was considered.

Also settled in advance: **green is the fixed identity colour; genre colour is
confined to the background and visualiser.** The mark does not change hue.

### And a runbook

`docs/RUNBOOK-update-2026-08-19.md` — deploying from the USB, including the
booby-trap: `pi/install.sh` step 5 scans `/media/*/*` and `/mnt/*` for audio and
**repoints `MUSIC_DIR` at whatever it finds**, and setting `MUSIC_DIR`
explicitly does not prevent it. Ranked as roadmap #25.

### Built this session

- `dj/` — the DJ booth. Standalone, zero dependencies. See
  [`SPONTANEOUS-EMISSIONS.md`](./SPONTANEOUS-EMISSIONS.md).
- `.claude/agents/tower-dj.md` + `.claude/skills/tower-dj-booth/SKILL.md`.
- `usb/` — the USB rebuild kit, for when the stick is next plugged in.
- This document, and `docs/README.md` as the index.

---

## 2. Why the music sucks — measured, not guessed

Scanned `Radio Tower/music` today: **30 files, 12.48 hours of air.**

### The whole day is eight files

| Track | Length | Share of the air |
|---|---|---|
| 𝐔𝐓𝐎𝐏𝐈𝐀𝐍 𝐒𝐂𝐇𝐎𝐋𝐀𝐒𝐓𝐈𝐂 — Kester Spach | 121.5 min | **16.2%** |
| undersaken — weltschmerz 世界苦 | 79.8 min | 10.7% |
| DARK DESIRE — The Lost Epoch Collection | 63.4 min | 8.5% |
| 𝗟𝗢𝗦𝗧 𝗩𝗜𝗗𝗘𝗢𝗚𝗔𝗠𝗘 𝗠𝗔𝗟𝗟 幻街 | 61.0 min | 8.1% |
| Macroblank — 一生に一度 | 57.5 min | 7.7% |
| You finally discovered Blue Scholars | 56.9 min | 7.6% |
| Macroblank — 能界蘭極境 | 53.8 min | 7.2% |
| MICROMECHA — Underwater Quest | 43.3 min | 5.8% |

**Eight files out of thirty hold 71.8% of the day.** The station shuffles
*slots*, not minutes — a two-hour mix is one slot, exactly like a 44-second
undersaken track. So the shuffle is fair and the result is not: put the station
on at random and you land inside a long ambient mix roughly three times in four.

That is the whole of "the music sucks." It is not the shuffle, not the clock,
not the player.

### The genre balance follows from it

| Genre | Files | Share of air |
|---|---|---|
| barber-beats | 19 | 50.2% |
| vaporwave | 2 | **24.4%** |
| dnb-jungle | 2 | 9.7% |
| rock-pop | 1 | 7.6% |
| unsorted | 2 | 4.7% |
| vgm | 4 | 3.5% |

Two vaporwave files are a quarter of the station. Four VGM tracks are 3.5% — so
"put some game music on" almost never happens by itself. Everything else in
`server/lib/genre.js` (ambient, lofi, jazz, chanson, classical, french-rap,
electronic, trip-hop) has **zero** tracks.

That last fact bit immediately: the first draft of `dj/moods.json` weighted
`liminal` and `study` on `ambient`, which would have matched nothing at all.
Caught by measuring before shipping, and the measured distribution is now
recorded at the top of that file.

### Two files are misclassified

- `music/ㅤㅤㅤ.mp3` — the filename is Hangul filler characters, so there is
  nothing for the rules to match. Lands in `unsorted`, 30 minutes of air.
- `music/SpotiMate.io - Le soleil est près de moi - Air.mp3` — Air, French
  electronic. Also `unsorted`. A `chanson`/`electronic` rule would catch it.

### Correction, same day: moving the long files out makes it *worse*

The obvious fix — pull everything over 20 minutes out of `MUSIC_DIR` — was
modelled before recommending it. It does not survive the modelling:

| | tracks | cycle | longest file's share | genre mix |
|---|---|---|---|---|
| now | 30 | 12.48h | 16.2% | barber-beats 50, vaporwave 24, dnb 10, rock-pop 8 |
| drop >40min | 22 | 3.53h | 16.0% | barber-beats 57, unsorted 16, dnb 14, vgm 13 |
| drop >20min | 18 | **1.51h** | **18.9%** | **barber-beats 65, vgm 29** |
| drop >12min | 17 | 1.22h | 9.1% | barber-beats 80, vgm 13 |

Cutting the long files leaves **eighteen tracks**, ten of them the same artist
(silph skyline), on a **90-minute loop** — and the longest survivor still takes
18.9% of the air, a *worse* concentration than before. Vaporwave, DnB and
rock-pop disappear from the station entirely.

So the real diagnosis is one level down: **the library is too small.** Thirty
files, twelve of which are hour-long mixes, is effectively an eighteen-track
station. The long mixes are not the disease; they are what is hiding it.

### What to do about it, in order

1. **Split the long mixes into tracks — don't delete them.** They are albums and
   compilations: eight files become perhaps eighty slots, which fixes the
   slot-share problem *and* the library-size problem in one move, and loses no
   music. Needs a tool (ffmpeg, driven by embedded chapters where they exist and
   silence detection where they don't). Filed on the roadmap.
2. **Harvest from the USB's 515.** The cleanup in `usb/` inventories them
   anyway; promoting the good ones into the curated tree is the cheapest way to
   add variety. See [`USB-CLEANUP.md`](./USB-CLEANUP.md).
3. **Rename the two unsorted files** so the genre rules can see them, or add two
   lines to `server/lib/genre.js`.
4. **Only then is a "Long Mixes/" folder worth considering** — once there is a
   library underneath it that can carry the day on its own.

Nothing under `music/` moves without you (`BRIEF.md` rule 7).

Verify any of this yourself:

```bash
cd dj
node dj.mjs files --big      # the oversized ones, with sizes
node dj.mjs library          # how the station classified everything
node dj.mjs doctor           # and whether the station is even reading this folder
```

---

## 3. The other thing that makes "not the right files" true

`node dj.mjs doctor` compares the folder the booth reads against
`/api/health`'s `musicDir`. On the Pi these are routinely **different**: the
installer's music scan repoints `MUSIC_DIR` at any USB stick it finds, and that
stick carries ~515 backup MP3s. If the Pi is playing files you don't recognise,
check that before anything else — see [`USB-CLEANUP.md`](./USB-CLEANUP.md) and
roadmap #25.

---

## 4. Still open

- **Roadmap #2** — prove the player on a real phone. Needs your phone.
- **Roadmap #6, #14** — `POST /api/rescan` is unauthenticated; no rate limiting
  anywhere on the public HTTP surface. Both matter before the tunnel is public.
- **Roadmap #7** — graceful behaviour when the music drive disappears.
- **Roadmap #20–24** — the design brief: green mark, Zoneko credit, Echoes
  rename, the Zone tab, multi-genre membership.
- **Roadmap #25** — the installer's music scan hijacking a mixed-content USB.
- **Cloudflare's CDN terms** — flagged, needs a ruling from you, not a build.
