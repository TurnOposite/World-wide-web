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

## Ready to build

| # | What | Size | Where it starts |
|---|---|---|---|
| B1 | **A hard cap on what the tower can cost**, for Pay As You Go: with the server inside the Always Free shapes (2 OCPU, 12 GB, a boot disk under 200 GB), the one charge the tower can run up by itself is outbound traffic past 10 TB a month (≈ $0.0085/GB after it). A watchdog on the server reads the month's bytes sent (`/proc/net/dev` or `vnstat`) and, past ~9 TB, stops serving audio (Caddy answers 503 on `/api/track/*/stream`) until the 1st. Plus an Oracle compartment quota so no paid shape or volume can be created by mistake. | M | `deploy/cloud/` (install.sh writes the timer); Oracle console → Governance → Quotas |
| B2 | **No song twice across 05:00** (U2, once he says yes): when dealing day d, keep out of its first 3 hours anything played in the last 3 hours of day d − 1. Day d − 1's tail only depends on its own deal, so this needs no recursion. Ship it so it starts at a day boundary (a `from` date in the rules), or the day already on air re-deals mid-song. `npm run repeats -- --days 14` must then show no « same track » line. | M | `server/lib/programme.js` `buildDay`; `tests/programme.test.js` |
| B3 | **The Snowpoint doubles.** Ortis, 2026-11-13: keep them on air (« I love Snowpoint Lounge »), warn him if one plays close to its twin. Built: `scripts/repeats.mjs` and the weekly GitHub run `.github/workflows/repeats.yml` (fails, so GitHub emails him). Left: if the warnings bother him, the programme could keep twins 3 h apart the same way as B2. | S | after B2 |
| B4 | **The Livre miroir's last race**: leaving the Archive *with the book open* straight for `/echo/lectures` can end with the book shut (WORKLOG 2026-11-10 night). Fix: drop `#miroir` when the reader closes the book, not when the `close` event arrives. | S | `site/js/ui/mirror-book.js` |
| B5 | **Flaky checks that hide their cause**: « …and the music did not stop to show it » prints only the drift when it is `paused` or a swapped `<audio>` that failed (1 red in 4 runs, 2026-11-13); the cloud Booth's « it is a permutation » (1 in 5). Make each report what it saw, then fix at the cause as the 2026-11-11 three were. | S | `scripts/site-smoke.mjs` |
| B6 | **Re-aim self-test stage 6 at the site, then remove the Pi-era player** in `public/` (~3,300 lines) — plan step 0b. | M | `plans/PLAN-chat-and-moods.md` step 0 |
| B7 | **The telegraph line, harder to flood**: a room-wide ceiling (say 30 messages a minute, whoever sends them) on top of the per-address budget, and a mute that survives a restart (today a deploy forgives a silenced sender). Only matters once people use the line: 2 messages in total on 2026-11-13. | S | `server/lib/telegraph.js` |
| B8 | **The line in the mini-player on a phone** (the last message, one line) — plan step 1d. | S | `site/js/ui/minibar.js` |

## Waiting on Ortis

| # | What he asked (date) | Waiting on |
|---|---|---|
| W1 | **The two streams' music** — Chill and Energy are on the dial, empty (2026-11-10) | His word on 8 labels he used that the tower does not have: Slushwave, Funk, Hyperpop, Bossa nova, Hip-hop, Breakcore, Beat tape, Pop — their own, or folded in? Then plan steps 2a → 2b (`plans/LABELS-ortis-2026-11-11.md`) |
| W2 | **A tempo (BPM) slider** (2026-11-10) | W1 first; then BPM measured offline on the laptop (plan 2e, 2f). No track carries a tempo today |
| W3 | **His phone notes** on /radio and /antenna (2026-11-10). On a 375×667 screen Tune in is still 50 px under the fold (plan 1e) | Him, on his own phone. The real-phone checklist in `WORLD.md` has never been run |
| W4 | **His uni projects in the Archive, linked from the Atlas** (2026-11-03): « Who's in My Food? » (5 episodes), the night-skating report, the podcast « Echo Chamber » (poster), « Emily in Panam », « Sounds of Time » | Atlas option A or B (the mock: `Radio Tower\Claude outputs\atlas-projection-mock-2026-11-03.html`), the new room's name (« Projection » proposed), titles, the 3 missing files (classmates), and where 6.8 GB of video lives (not GitHub or Vercel: the Oracle server or Cloudflare R2) |
| W5 | **The Atlas rethought**: bigger, clearer, smoother, with a gallery of his photos from those places (2026-11-03) | Same A/B choice as W4 |
| W6 | **Photos on the world map** (2026-11-03: the Archive's Photos tab went, its address kept, « for the world map later ») | Comes with W5 |
| W7 | **Playlist descriptions**: 25 of 58 written (2026-11-03) | His words for the other 33 (`site/data/playlists.json` `vibe`; the private view `?atelier=1` marks the empty ones) |
| W8 | **The cast, further** (2026-11-11): more looks, a hat or prop, or his own drawings in place of the eight (a published game's characters were asked for and are not used — DECISIONS 2026-11-11) | His drawings, or a yes to more looks (plan 3h). His own pictures for the bank go in `site/assets/telegraph/` (plan 3d) |
| W9 | **A game layer on the line** — time tuned in, reactions to the track, who is on the line (2026-11-10) | Only once people use the line (plan 3c, 3f) |
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
