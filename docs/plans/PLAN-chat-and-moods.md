# Radio Tower — plan: the telegraph line, the streams, the phone, and the clean-up

Started 2026-11-10 (Claude, for Ortis). This file is the thread a later session picks up: read
"How to continue", do the first open step, add a line to the log at the bottom.

## How to continue

1. Work in the git clone (`radio-tower-live\` on the laptop, or a clone of
   `TurnOposite/World-wide-web`), never in the old `Radio Tower\` folder.
2. `bash scripts/build-test.sh` before and after. One step per run.
3. Take the first step below marked `open` whose "needs" are met. Steps marked **needs Ortis**
   wait for him.
4. When a step lands: tick it here, add the `docs/WORKLOG.md` and `docs/DECISIONS.md` entries.

No scheduled task continues this: all seven on the account were switched off on 2026-11-10.

## Where things stand (2026-11-10, evening)

| Asked | State |
|---|---|
| A chat for the people on board | **Built**: the telegraph line, one room, in the Antenna window. Name and icon; remembered only if ticked; kept on the tower |
| Icons from a folder he fills | **Built**: `site/assets/telegraph/` holds twelve placeholders; pictures dropped there are listed at the next build |
| Streams (two for now, beside Everything) | **Dial built, streams empty on purpose**: Chill and Energy show « no music yet ». The folders and the channels.json keys that fill them exist |
| A tempo slider | **Not built**: no track carries a BPM (step 2e) |
| The phone's /radio | **Built**: title and Tune in on the first screen at 390×844; waiting for his own phone |
| The Booth's big-screen button | **Built** |
| Echo's ash, a little more | **Built** |
| The Antenna in place of Zone's Atlas | **Built**; Zone's Atlas removed |
| Labels: alf, 2 Mello, Jet Set are game music, Moonchild is not | **Built** (rules); the rest of the review waits for his sheet |
| The Pi kit to an archive folder | **Done**: `archive/pi-kit/` |

## Step 0: the clean-up, tested in a vacuum

Method: a fresh copy of the repo per candidate, the candidate deleted, then `npm test` and
`node scripts/site-build.mjs`. The script is `vacuum-run.sh` beside this file. "Residual" means
failures outside the candidate's own tests, which is the real measure of how tangled it is.

| Candidate | Size | Result | Verdict |
|---|---|---|---|
| **Pi kit**: `pi/`, `usb/`, `split/`, `scripts/setup-pi.sh`, `scripts/setup-tunnel.sh`, `deploy/radiotower.service`, `deploy/cloudflared-config.yml`, `claude-tooling-to-install/`, and its 4 test files | 46 files, about 4,700 lines, 51 tests | 414 tests, **0 fail**, site builds | Clean cut. **Needs Ortis**: is the Pi retired for good? If yes, move to `archive/` in one commit |
| **The Pi-era pages in `public/`** (`index.html`, `app.js`, `schedule.*`, `library.*`, `photos.*`, `crates.*`, `sitenav.js`, `styles.css`, `collections.css`, `dev-panel.js`, `backdrops.js`) and `scripts/browser-smoke.mjs` | 17 files, about 3,300 lines | 19 failures, every one a test that pins those files; site builds | Removable, **after** one piece of work: self-test stage 6 (43 browser checks: audio plays, drift, rollover) drives this old player against a real server. Those checks must first be re-aimed at the site in tower mode, or the proof that audio really plays is lost. `public/viz.js`, `queue.js`, `cover-palette.js` stay: `site/js/lib/` is generated from them |
| **The claude.ai preview** (`scripts/site-preview.mjs`, `preview-smoke.mjs`) | 2 files, 390 lines | 1 failure (`tests/cloud-control.test.js` imports it) | Small. Remove only if the preview is no longer used |
| **The versions of the past** (`past/v1–v3`, `site/past/`, `scripts/site-past.mjs`, the version page) | 175 files, 2.7 MB | 5 failures and **the site build breaks** | Keep. Wired into the build, the Atelier and the map |
| **The classic shell** (`?classic=1`, `pages/home.js`) | spread over 6 site files and 2 tests | not cut: needs edits, not deletion | Keep for now. `docs/README.md` says "kept one release"; the world went live 2026-11-01. Revisit after the phone pass |
| **The channel machinery** | `channels.js` and the dial | not a candidate | Not obsolete: the mood streams are built on it |
| **Stale words** | `CLAUDE.md` opens with "A Raspberry Pi that hosts…"; the scheduled-task prompt | no code | Rewrite the opening of `CLAUDE.md` when the Pi question is answered |

Not tested: the full browser stages after each removal (only unit tests and the build were run on
the copies). Whoever does a removal runs the whole self-test.

- [x] 0a. Pi kit to `archive/pi-kit/` (2026-11-10; its README says what was where and how to bring it back)
- [ ] 0b. Re-aim stage 6 at the site in tower mode, then remove the Pi-era pages — open
- [x] 0c. `CLAUDE.md` opening paragraph and deployment section

## Step 1: the phone

- [x] 1c. /radio trimmed on a phone; checks at 390×844 in `scripts/site-smoke.mjs`
- [ ] 1a. Ortis's notes from his own phone (https://globe-trotter-ochre.vercel.app/radio and /antenna) — **needs Ortis**
- [ ] 1d. The line in the mini-player on a phone (the latest message, one line) — after 1a
- [ ] 1e. On a 667-high screen Tune in is still 50 px under the fold: decide after 1a whether the cover goes beside the title there

## Step 2: the streams

How a stream gets its music (all of it works today, `tests/channels.test.js`):

- a `Chill` or `Energy` folder at the top of the library: what is in one plays on that stream and
  never on the other;
- in `music\channels.json`, under the stream: `folders` (any folder already on the tower, at any
  depth, e.g. `"Crates/Bandcamp/an album"`), `genres` (labels; `match: "any"` makes it folder OR
  label), `excludeFolders`. The streams to copy are in `library/channels.programme.json`;
- then his usual `publish`. A stream with music leaves « no music yet » at the tower's next scan.

Copying a file into `Chill\` duplicates it on the tower; listing its folder in channels.json does not.

- [x] 2c. The dial, in the Antenna; /radio names the stream on air
- [ ] 2a. Ortis's corrected label sheet: **read 2026-11-11** — 59 of 529 rows, written out in [`LABELS-ortis-2026-11-11.md`](./LABELS-ortis-2026-11-11.md). He uses eight labels the tower does not have (Slushwave, Funk, Hyperpop, Bossa nova, Hip-hop, Breakcore, Beat tape, Pop): **needs Ortis** — new labels, or folded into the old ones? Then one rule per row in `server/lib/genre.js`, each with a test, and `npm run scan` on his laptop
- [ ] 2b. From the corrected labels, write the two folder lists into a copy of `channels.json`; print tracks, hours and the 20 most surprising members of each; he approves; he publishes — after 2a
- [ ] 2g. Does a stream need the programme's lanes (long mixes apart, favourites)? Today it is a plain shuffle — decide once one has content
- [ ] 2e. BPM: an offline measure in the library bot (no runtime dependency), a `_bpm.json` beside the music, `bpm` on each track, `minBpm` / `maxBpm` on a channel — after 2b
- [ ] 2f. The slider across tempo bands — after 2e
- [ ] 2h. A crossfade when the stream changes (a second audio element in `site/js/player.js`)

Figures of 2026-11-07, by the labels as they were: Barber Beats, Vaporwave, Ambient and Lo-fi about
242 h; Jazz, Video Game, Rock & Pop and French rap about 85 h, mostly long mixes; DnB and
Electronic about 37 h; 57 h with no label. undersaken alone is 1,313 tracks (107 h). His playlist
folders `Greetings`, `Breaking cores` and `Electronic Dance Martin` held no audio on the laptop.

## Step 3: the telegraph line

- [x] 3a/3b. Names, icons, text, the fences, the station key's removal (see `docs/DECISIONS.md`, 2026-11-10)
- [x] 3g. The cast (2026-11-11): a character select — slide for who, slide again for their clothes — eight characters of the station's own, four looks each (`site/js/ui/cast.js`); the character in the mini-player. A published game's characters are not used (`docs/DECISIONS.md`, 2026-11-11)
- [ ] 3h. More of the cast's customisation, if he wants it: more looks, a hat or a prop to swap, his own sprites in place of these — **needs Ortis**
- [ ] 3d. His own pictures in `site/assets/telegraph/` (square, under 60 KB each; `README.md` there): they follow the cast on the reel — **needs Ortis**
- [ ] 3e. How long the log is kept — **needs Ortis** (today: two files of 5 MB)
- [ ] 3f. Who is on the line (names of those tuned in), reactions to the track on air — open
- [ ] 3c. A game layer (time tuned in beside the name) — only if the line is used

## Log

| Date | Who | What |
|---|---|---|
| 2026-11-10 | Claude, with Ortis | Scan of `fc9faa7`; baseline self-test green; five removals tried in copies; library measured; first plan |
| 2026-11-10 | Claude, with Ortis | His decisions: Pi retired; streams by folders after the labels are revised; streams beside Everything; chat yes, a bank of pictures, remembering is the listener's choice |
| 2026-11-10 | Claude, with Ortis | Built and pushed: the Antenna (dial + telegraph line), empty Chill and Energy, the phone's /radio, the Booth's button, the ash, the label fixes. Zone's Atlas removed |
| 2026-11-10 | Claude, with Ortis | The Pi kit moved to `archive/pi-kit/` (46 files, as its own commit) |
| 2026-11-11 | Claude, with Ortis | Fired `c19227b` to the tower. The cast and the mini-player's character. The three flaky checks fixed at their cause. His label sheet read: 59 rows, eight new labels to decide |
