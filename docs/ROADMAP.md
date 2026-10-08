# Roadmap

Ranked. The builder agent takes the highest unblocked item, does *one*, and ticks
it off. Add what you discover; delete nothing — move finished items to the bottom
with a date, and dropped ones to "Considered and dropped".

Ranking rule: broken beats missing; reliable beats pretty; a listener would
notice beats only-you-would-notice.

**Numbers are stable identifiers, not positions** (convention adopted 2026-08-18).
`docs/WORKLOG.md`, `docs/DECISIONS.md` and the skills all cite items as "roadmap
#5". Renumbering when something is ticked off would silently rewrite every one of
those references, so finished items leave a gap and the list reads top-to-bottom
for priority. If `tower-planner` re-ranks, it moves items and keeps their numbers.

**Tiebreaker added 2026-08-18 by `tower-planner`:** among items of *equal*
severity, the one that moves `BRIEF.md` §7 closer wins. Reasoning in
`docs/PLANNING.md` 2026-08-18 and `docs/DECISIONS.md`.

**Second tiebreaker added 2026-08-19 by `tower-planner`:** now that the station
is genuinely live (on Ortis's real Pi, on his LAN, with `AUTO_RESCAN_MINUTES`
firing unattended every 30 minutes), a defect that can silently break the core
sync promise for a *listener who is already connected* outranks anything about
reaching a *new* listener — because the first time this happens for real, it
happens on the only listener there currently is: Ortis. **Correctness-of-what's-
already-live beats reach-for-more-listeners**, for as long as the two compete for
the same run. Reasoning in `docs/PLANNING.md` 2026-08-19.

**Housekeeping done this pass:** #0, #0b, #1 and #9 are all fully finished —
verified again this run (code read, tests re-run) rather than re-described — and
have been moved out of "Next up" into the "Done" section at the bottom, in line
with this file's own stated convention ("move finished items to the bottom").
They had been left at the top of "Next up" with `[done]` tags for several
sessions running, which meant a builder opening this file saw four closed items
before the one thing that actually needed attention. Their full verification
detail is preserved, just relocated — nothing was trimmed. Numbers are
unchanged and still cited the same way elsewhere.

---

## Next up

### 30. NEW 2026-09-23 — Prove the go-anywhere kit on the real Pi (needs Ortis at the hardware)

Do it in the same sitting as #29 below (the Wi-Fi recovery path): same Pi, same radio.

Everything in `pi/anywhere/` is green off-Pi (27 tests, dry-runs and stubs).
Three things only the hardware can settle: (a) `nmcli device wifi hotspot …
con-name rt-hotspot` comes up on the Pi 4's radio, and `radiotower-portal`
answers on :80; (b) an iPhone and an Android phone open the setup page by
themselves on joining (captive DNS); (c) the first real tunnel connection with
Ortis's token, and the watchdog's `127.0.0.1:20241/ready` probe agreeing with
Cloudflare's "Healthy". Procedure: `pi/anywhere/README.md`, "What is proven
and what isn't". Record the results in `pi/anywhere/README.md` and here.
Blocked on: a router he can use again (on-hold note, 2026-08-28) and a domain
on Cloudflare.

### 31. NEW 2026-09-23 — Rooms: small follow-ups, only if Ortis wants them

- Two class labels are inferred (POLI 333 for the Plato/Aristotle papers,
  HIST 223 for the Macuilxochitl essay). Ortis confirms or corrects them in
  `collections/collection.json`.
- "Who's in my food" (GJC web documentary) was shortlisted as a 75 s teaser
  and not built. The room could take a video shelf if asked; it would need a
  720p transcode (~15 MB) and the Cloudflare terms ruling becomes more
  pressing with video.
- The visual identity decisions of 2026-08-19 (green mark, "Echoes" label)
  are still not applied to any page. The new rooms deliberately use the
  current tokens so that change stays one edit in `styles.css`.


### 28. DONE IN THE SITE 2026-09-26 — The full-page visualiser: run the real paint pipeline on the stage canvas

**Done** in the website (`site/js/viz/stage.js`: nine layers on one full-page canvas, a failable smoke check), which is now what the cloud tower, Vercel and the Pi's `SITE_DIR` all serve. The old `public/` player still has the gap below; it is only reached on a Pi without `SITE_DIR`.


**Top of the list when Ortis is back at a screen.** This is the thing he asked
for twice and has not received. `#vizStage` is a real, correctly-sized,
correctly-positioned full-viewport canvas fed by the same audio graph — but
`_paintStageIfActive` reaches only `_paintStageWash`, and the five methods that
make the visualiser recognisable (`_paintLowLayer`, `_paintRing`,
`_paintShocks`, `_paintSparks`, `_paintRibbon`) are called only from `_paint`,
which is called only against the small art-frame canvas. Verified against
`public/viz.js` on disk 2026-08-28. No value of `stageOpacity` or `stageScale`
can fix it; two rounds of tuning already proved that empirically.

**Do not use `docs/prompts/PROMPT-cache-and-stage-defaults.md`** — its Job 1 is
done and its Jobs 2–3 tune the wrong thing. The current brief, the two real
decisions it contains (the hole must come from the on-air card's
`getBoundingClientRect()`, not `ART_FRACTION`; `TIERS` governs the stage
independently and the stage drops out first), and a failable acceptance test
are in **`docs/DESIGN-POSTMORTEM.md`** §"The prompt to actually use".

Supersedes #27, which asked for above-the-fold presence on a phone for an
effect that should not exist in its current form.

### 29. NEW 2026-08-28 — Prove the Wi-Fi recovery path against a real radio

`pi/wifi/radiotower-network.sh` is tested in `--dry-run` (12 tests, parser and
`nmcli` plan, including the CRLF case). What is **not** proven is that `nmcli`
accepts those arguments on real Raspberry Pi OS, or that the hotspot fallback
comes up. Low effort, high consequence: this is a recovery path, and a recovery
path nobody has ever exercised is a guess. Do it the first time the Pi is
reachable — add a phone hotspot as a second line, confirm the tower joins it.
Stated as an open limitation in `pi/NEW-NETWORK.md` rather than glossed.

### 5. FIXED AGAIN 2026-08-19 (scheduled run) — moved to Done
The three findings below (a revision-fingerprint collision, a `byId`/schedule
desync, and a documentation overclaim) are fixed. Full writeup, including the
revert/reapply verification transcript, moved to the "Done" section at the
bottom of this file, per this file's own convention. Kept the original
finding text in place below rather than deleted — it is still the most
complete description of what was wrong and is cited directly from
`docs/DECISIONS.md`'s fixing entry, so a future reader checking the fix
against the bug it fixes does not have to reconstruct the bug from the fix.

**Original reopened status (2026-08-19, superseded by the fix above):**
`[was marked done 2026-08-19; a same-day audit found
it broken; do not re-mark this done without fixing all three findings below and
proving it with a new test in `tests/schedule.test.js`]`

The 2026-08-19 fix (era-staging: a library change is deferred to the next cycle
boundary instead of applying instantly) was real and well-intentioned — it does
fix the original bug (a listener no longer gets yanked to a different song the
instant a file is added or removed). But `tower-auditor`'s same-day review found
two ways the fix itself now breaks the exact promise it exists to keep, plus one
documentation overclaim. **All three were independently re-verified this
planning run by reading the live `server/lib/schedule.js` and `public/app.js` on
disk** — this is not a restatement of the audit, it is a second confirmation
against the actual code, line numbers checked, on 2026-08-19.

**BLOCKING — a revision-fingerprint collision permanently drops a library
change.** `Station.revision` is `"<trackCount>:<roundedCycleSeconds>"`.
`setTracks()` (`server/lib/schedule.js`, lines 150–151) does:
```js
const queuedRevision = this._nextEra ? this._nextEra.revision : this._era.revision;
if (this.revision === queuedRevision) return this;
```
— an early return that skips the entire era-staging mechanism whenever the new
library's fingerprint matches what's active or already queued, **even if every
track id changed.** Meanwhile `this.tracks`/`this.byId` (lines 142–143) update
unconditionally, above that check. An ordinary file *rename* changes a track's
id (`trackId()` is `sha1(relPath)`) without changing its duration, so a folder
reorganisation that renames files without adding or removing any is close to a
guaranteed collision — same count, same total duration to the millisecond,
hence the same rounded revision string. Result: the schedule keeps promising a
track id that no longer resolves via `station.get()`, permanently, until some
unrelated future scan happens to land on a different fingerprint by luck. No
error, no log line, no test catches it.

**HIGH — even without a collision, `byId` and the schedule can disagree for an
entire protected cycle.** `Station.get(id)` reads `this.byId`, which is updated
*immediately* on every `setTracks()` call by design (line 143) — deliberately
not gated behind the era mechanism, per `docs/DECISIONS.md` 2026-08-19, so
`/api/library` search and `/api/health`'s track count stay live. But
`at()`/`upcoming()`/`schedule()` are correctly gated and keep promising the
*old* library for the rest of the cycle already in progress. So: a track
removed or renamed while it is on-air or queued within the currently-protected
cycle causes `/api/track/:id/stream` and `/art` to 404 for exactly the track
the schedule is telling every client is playing right now. Confirmed in
`public/app.js` (line 353): the `<audio>` element's `error` handler only sets a
status string ("stream error — resyncing") — **it does not retry or refetch.**
Recovery only happens when the wall-clock rollover check
(`tick()`, line 203, `pos >= dur - 0.25`) eventually fires — i.e. not until the
nominal duration of the unstreamable track has elapsed, meaning **silence for
up to that track's full remaining length**, longer if the next scheduled track
is also affected. This is arguably worse than the original bug: the original
jump was audible but instantly self-correcting; this presents as a broken
station, silently, for as long as a track's remaining runtime, and it is
reachable by the same ordinary action (`AUTO_RESCAN_MINUTES`, or the
still-unauthenticated `POST /api/rescan`, see #6) that the fix was built to
protect against.

**MEDIUM — a "not reachable" claim in `docs/DECISIONS.md` is not actually
true.** The 2026-08-19 entry's "two-era-deep memory horizon" limitation says
this "cannot happen in practice... not reachable from any code path that
exists," reasoning that cycles span hours to days for any real library. That
reasoning only holds for a large library. Reproduced with a 2-track,
1-second-per-track fixture (2s cycle): two distinct-revision `setTracks()`
calls about a second apart — well within one still-in-progress cycle — causes
a later `history()` call to silently pull tracks from the wrong era. Low
urgency for Ortis's actual "weeks of MP3s" library, but it is a documentation
overclaim in the file every future run trusts most, which is precisely the
failure class `BRIEF.md` rule 9 exists to catch — and it becomes directly
relevant the moment a short-cycle library exists (a small test fixture, or a
future low-track-count second channel per idea #12).

**Done when:**
1. The era-staging gate no longer relies solely on the coarse `revision`
   string. Compare something content-derived — the sorted set of track ids
   (already available as `byId`'s keys), or a real hash of `(id, duration)`
   pairs — so a same-count/same-duration swap is still detected and staged.
2. A track that the currently-governing era still promises does not vanish
   from lookup before that era retires. Either keep `byId` a union of the live
   scan and whatever `_era`/`_nextEra` still reference until they rotate out,
   or have `station.get()` / the stream and art routes fall back to searching
   `_era.tracks`/`_nextEra.tracks` on a `byId` miss. (A genuinely deleted file
   should still correctly 410 once the era catches up — this is about a
   renamed-but-still-present file, not about serving bytes that don't exist.)
3. New regression tests in `tests/schedule.test.js` that fail against the
   *current* code before the fix and pass after: one exercising the
   same-count/same-duration collision (rename scenario), one exercising a
   removed-or-renamed track still being resolvable via `get()` for the rest of
   the cycle the era is protecting.
4. `docs/DECISIONS.md`'s "two-era-deep memory horizon... not reachable" claim
   corrected — either narrowed to "not reachable when a cycle outlasts the gap
   between library changes" (documentation-only) or the ring extended to
   remember one more predecessor, whichever the fixing run judges proportionate.
5. Full reproduction scripts and line numbers for all three findings are
   already in this entry and in the superseded "Ideas not yet ranked" bullets
   below (kept, not deleted, for the exact commands used) — a fixing run does
   not need to rediscover the bug, only fix it and prove the fix the same way
   #5's own original entry proved *its* fix (revert, show red, reapply, show
   green).

**Why #5 sits at the very top:** it is the only open item that can silently
break the one sentence `BRIEF.md` §7 exists to make true — "hears the same song
Ortis is hearing" — for the one listener who exists today, on infrastructure
(`AUTO_RESCAN_MINUTES`, default 30) that is already running unattended on real
hardware. Everything else on this list is either not yet reachable (public
exposure hasn't happened) or degrades gracefully (a slow warm-up, a missing
lock-screen control). This does not degrade gracefully — it can go permanently
and silently wrong. Full audit trail: `docs/ROADMAP.md`'s prior "Ideas not yet
ranked" section (findings dated 2026-08-19, kept below with a pointer) and
`docs/WORKLOG.md` 2026-08-19.

### 6. DONE (found 2026-10-08) — Authenticate `POST /api/rescan`

**Done:** `POST /api/rescan` requires `STATION_KEY` and is disabled without one (`server/routes/api.js`, same `requireKey` as the queue); wrong keys are budgeted since #14. Kept below for the reasoning.

Currently unauthenticated — reconfirmed this run by reading
`server/routes/api.js` (line 193: `router.post('/rescan', express.json(),
async (req, res) => {` — no auth check anywhere before it calls `ctx.rescan()`).
On a station whose whole point is a public URL, anyone who has it can trigger a
full walk of `MUSIC_DIR` on demand at will, whenever the station goes public.
(#5's specific silent-404 failure mode this could previously have been used to
force on demand is fixed as of 2026-08-19 — see the "Done" section — but an
unauthenticated on-demand filesystem walk on a public URL is worth closing on
its own merits regardless.)

**Done when:** `POST /api/rescan` requires a shared secret from the environment
(or is reachable only from localhost / a Cloudflare Access rule), the self-test
asserts an unauthenticated call is refused, and `deploy/radio-tower.env.example`
documents the new variable.

**Why #6:** it is the one item on this list whose severity doubles the moment
the station goes public — both directly (anyone can force a slow USB scan) and
because it compounds with #5 (anyone can force the exact conditions #5's bug
needs). Fix #5 first; auth this second, since an authenticated-but-still-buggy
rescan endpoint is still a live #5 hazard, just a slower one to trigger by
accident instead of on demand.

### 14. DONE 2026-10-08 — No flood protection anywhere on the public HTTP surface

**Done:** `server/lib/ratelimit.js` — per-address budget on `/api` (burst 300, 5/s), a tight budget on wrong station keys, `Listeners` capped at 5,000 ids, `trust proxy` narrowed to loopback. No new dependency. `tests/ratelimit.test.js`. See `docs/DECISIONS.md` 2026-10-08.

Checked this run, not previously flagged: `grep -n "helmet\|rate-limit\|cors\b"
server/index.js server/routes/api.js server/config.js` — nothing. There is a
CORS header (intentional, `Access-Control-Allow-Origin: *`, see
`docs/ARCHITECTURE.md`) and `trust proxy` is enabled for `cloudflared`, but
**no rate limiting, no request throttling, and no cap on memory that an
anonymous client can cause the server to hold.** Specifically:
`server/lib/listeners.js`'s `Listeners.seen` Map is keyed by a client-supplied
random id with no length/format validation beyond `.slice(0, 64)`, and its only
cleanup is a lazy TTL sweep that runs inside `count()` — called every time a
client hits `/api/station`. A client that sends a fresh random id on every poll,
faster than the 45-second TTL, grows that Map without bound for as long as the
flood continues. This is not hypothetical once the station is on the public
internet rather than a home LAN with a handful of trusted devices on it.

**Done when:** `Listeners.seen` has a hard cap independent of the TTL sweep (e.g.
evict the oldest entries once the map exceeds some fixed size, same shape as the
`_cycleCache` eviction already used in `server/lib/schedule.js`), and at least
the more expensive endpoints (`/api/rescan` once #6 lands, and ideally
`/api/station`/`/api/library` too) have a lightweight per-IP request budget.
This does not need a new dependency — a small token-bucket `Map` keyed by
`req.ip` with the same lazy-TTL-sweep pattern the codebase already uses for
listeners is proportionate and keeps the two-runtime-dependency rule
(`docs/DECISIONS.md` 2026-08-17) intact. If a heavier answer ever seems
warranted, `express-rate-limit` is small and well-maintained, but that is a
third dependency and needs its own `docs/DECISIONS.md` entry per the standing
rule — try the hand-rolled version first.

**Why #14:** new finding, not previously on this list. Ranked below #5/#6
because nothing has actually exploited it yet and the station isn't public —
but it belongs above the phone/lock-screen items because an unprotected public
API is a reliability and security gap ("broken beats missing"), not a missing
nicety, the moment #0's LAN-only deferral is lifted. This is squarely the kind
of gap the "ready for the world wide web" review this entry comes from was
asked to surface.

### 7. Graceful behaviour when the music drive disappears — promoted 2026-08-19
Previously ranked lower on the reasoning that this is "a failure mode of
hardware nobody has connected yet." **That reasoning no longer holds.** #0/#1
are done: `docs/WORKLOG.md` 2026-08-18 records the install running against
real, USB-attached music on Ortis's actual Pi 4 (`rsync`'d "4 audio files off
the SD card's bootfs into `/mnt/music`"). The hardware this item is about is
now live, not hypothetical, and a USB drop mid-broadcast is a plausible everyday
failure (a bumped cable, a drive that goes to sleep) on infrastructure that is
supposed to run unattended for weeks.

**Done when:** unmounting the fixture directory mid-test produces a clear state
in the UI, and remounting recovers without a restart.

**Why #7:** real, listener-visible, and — as of this run — no longer blocked on
"we don't know how the real drive behaves," since it now exists. Still below
#5/#6/#14 because those are either already broken (#5) or already exploitable
the instant the station is public (#6/#14); this one needs an actual physical
disconnection to trigger.

### 2. Prove the player on a real phone — the emulation half is now PARTLY built; the rest needs Ortis
**Scope grew 2026-08-19 (live session):** this run shipped a second visualiser
preset (`bands`, `viz.js` `PRESETS`), a discreet preset-cycle control, and
genre-matched page backdrops (`public/backdrops.js`) — all verified against a
real 30-track library in a real desktop Chrome (`docs/WORKLOG.md` this date,
20/20 `browser-smoke.mjs` checks), but **only at desktop and the existing
390×844 emulated viewport**, never on a physical phone. None of this is
expected to be risky specifically — the new preset reuses the same canvas
the existing one already proved fine on a phone viewport, and the backdrop
is a low-opacity `position:fixed` layer that adds no new touch surface — but
"expected to be fine" is exactly the standard `BRIEF.md` §9 warns against
substituting for verification. Add these to the phone checklist below when
Ortis next runs it: does the discreet `#vizPreset` button register a tap at
its actual on-screen size, and does either look measurably change frame cost
on a real device (`?viz=dev`'s tier-override knob can force tier 0 to check
by ear/eye without needing the adaptive walk to get there itself).

**Status updated 2026-08-19 (scheduled run).** The three-runs-running complaint
below is now partly answered. `scripts/browser-smoke.mjs` opens a second page
with `{ width: 390, height: 844 }`, `deviceScaleFactor: 3`, `isMobile: true`,
`hasTouch: true` and asserts the art frame's absolute size, its squareness, and
that nothing overflows horizontally.

**It earned its keep immediately:** it caught a real, pre-existing bug on its
first run. `.art-frame` used `margin:0 auto`, which makes a stretched grid item
shrink-to-fit its content; with the no-art fallback that content was a 64px
SVG, so the whole player rendered as a thumbnail on a phone. Thirteen browser
checks had been passing over that for two days because they all ran at 1280px.

**What is still not done, and should not be claimed:** the mobile page checks
**layout only**. It does not `page.tap()`, does not press Tune in, and does not
verify playback or sync on the touch profile. Extending it to drive the whole
tune-in path under `hasTouch` is still cheap, still agent-actionable, and is
what remains of the emulation half.

The physical-device half below is unchanged and still the only thing that can
close this item.

**What emulation can prove and what it cannot** is unchanged from the previous
entry — still worth reading in full below and in
`.claude/skills/tower-mobile-check/SKILL.md` — but the mobile *viewport/touch*
profile itself (390×844, `deviceScaleFactor: 3`, `isMobile`, `hasTouch`, an
iPhone UA, `page.tap()` instead of `page.click()`) is pure Chromium-emulation
work an agent can do today, and doing it does not require Ortis or a physical
device.

**Ortis's half — the whole remaining item after the emulation profile ships.**
Four minutes, and it is the only thing that closes this. Full checklist in
`.claude/skills/tower-mobile-check/SKILL.md`; the short form:

1. Open the station on a **real iPhone in Safari**. Tap **Tune in**. Does audio
   start?
2. Drift readout under 2s? Same track and position as a desktop browser on the
   same station? *(That sentence is `BRIEF.md` §7.)*
3. **Lock the phone for 60 seconds, unlock.** Is it still playing? Anything on
   the lock screen?
4. Switch apps for two minutes, come back. Does it re-join live, or resume behind?
5. Wait out a track rollover with the screen on.
6. Repeat 1–2 on a **real Android in Chrome**.
7. Once on **cellular**, not just Wi-Fi.

**What emulation cannot settle**, still open regardless of the viewport fix:
whether iOS Safari's user-gesture requirement is actually satisfied by this
player's tap path (the smoke test disables the policy to run headless);
whether WebKit honours the `currentTime` assignment this player performs on
every join; whether audio survives backgrounding or a screen lock (this is what
decides whether #3 below is polish or a correctness bug); whether WebKit's
stricter range parser accepts our 206 responses. Research this run reinforces
why the last point matters more than it might look: iOS/Safari's media stack
is documented to require working HTTP range support for audio/video, and a
known real-world failure mode in *other* self-hosted media servers (Jellyfin's
audio endpoint returning `Accept-Ranges: none`, breaking iOS seeking entirely)
is exactly this class of bug. Checked this project's own `server/lib/stream.js`
directly: `Accept-Ranges: bytes` is set unconditionally (line 68), which is the
right answer — but it has never been checked against a real Safari, only
against the existing curl-level and headless-Chromium tests.

**Done when:** a `docs/WORKLOG.md` entry records the phone checklist above with
**phone models and OS versions**. "Works on my phone" with no version is not
evidence a future run can use. If step 3 says the audio stops, re-rank #3 to
the top of the unblocked list immediately.

**Why #2:** §7 says "on a phone". Emulation has taken this as far as an agent
can; the viewport profile takes it slightly further; a real device closes it.

### 3. Media Session API and lock-screen metadata
Reconfirmed unbuilt this run — `grep -n "mediaSession" public/app.js` returns
nothing. Previously ranked #4 and described as polish. Still promoted, because
on a phone it is plausibly not polish but *breakage*: without a Media Session,
a locked or backgrounded phone gives the listener no controls, no track name,
and — on iOS — a decent chance the audio stops entirely. #2 will settle which
of those it is. If #2 finds audio dies on screen lock, this becomes item #1 of
the unblocked list, ahead of everything above it except #5.

**Done when:** the track shows on a phone lock screen with title, artist and
artwork, and pause/play from there behaves sensibly — pause must mean
mute-and-rejoin-live, never rewind, because this is a station and there is no
"where you left off".

**Why #3:** it is the second of only two items on this list that touch the
phone directly.

### 8. "Tune in" gives no feedback during the warm-up window
Reconfirmed unbuilt this run — `grep -n "disabled" public/app.js` finds no use
on `tuneBtn`. `joinLive()` returns early while `STATE.onAir` is null, so a
listener who arrives during the first scan and taps the button gets silence
and no explanation.

**Done when:** the button is disabled or explains the wait while
`data.warmingUp` is true, and re-enables itself when the station comes on air.

**Why #8:** small, certain, listener-visible, and cheap — a good filler item
when the ones above are blocked, e.g. while waiting on Ortis for #2's phone
pass.

### 11. Persist the listener peak and a small play history
`Listeners.peak` exists in memory and dies on restart. A tiny JSON file with
peak listeners and the last few hundred tracks played would make the station
feel alive and make "what was that song an hour ago?" answerable. Must not
become a database.

**Done when:** a `/api/recent?limit=50` endpoint works and survives a restart.

**Why #11:** not broken, not unreliable, not ugly — a pleasant server-side
feature that the 2026-08-18 review already found had been quietly outranking
work that actually moves `BRIEF.md` §7 or protects what's live. Unchanged
reasoning; still correctly low.

### 12. DONE 2026-10-07 — A second channel

**Done:** channels (`server/lib/channels.js`), DECISIONS 2026-10-07. On 2026-10-08 Ortis asked for one shuffled channel for now; the others return with one line in `channels.json`.

The `Station` class already supports being instantiated more than once. Two
directories under `MUSIC_DIR` could become two channels sharing one process,
with a channel switcher in the player. Cheap to build, and it makes the
"tower" metaphor real.

**Done when:** `/api/station?channel=x` works and the player can switch
without a reload.

**Why #12:** same reasoning as #11, more strongly — it doubles the surface
area of a station that has an open, unresolved correctness bug (#5) in the
exact mechanism (`Station`/eras) a second channel would double up on. Do not
pick this up before #5 is actually fixed and proven.

### 13. Consider internet-radio stream URLs as a second source
The rejected-Spotify decision named this as the correct substitute for "audio
without an account". A curated list of public streams (SomaFM and similar) as
an alternate channel would extend the station beyond the local library. Check
the terms of any stream before shipping it.

**Blocked on:** #12, and on Ortis wanting it at all.

---


### 20. NEW 2026-08-19 — Green mark, Zoneko credit, Echoes rename
**Decided by Ortis. Spec: [`docs/DESIGN-BRIEF.md`](./DESIGN-BRIEF.md) §1-2.**

Three small display-layer changes. **Do them in one run** — each is a handful of
lines in `public/index.html` and `public/styles.css`, none touches the station
clock, and splitting them across three runs spends three self-test cycles to
save nothing.

- Redraw the masthead mark: Option A's tower, Option D's arcs rotated to leave
  it sideways. A starting SVG is in the brief; iterate on it, don't paste it.
- Recolour to green. Check the chosen hex against a real visualiser screenshot
  before committing it, and write the final value into `docs/DECISIONS.md`.
- Footer / `<meta name="author">` credit reads **Zoneko**. Display only —
  do not touch repo paths, `SERVICE_USER`, or commit authorship.
- Relabel "Guide" → "Echoes". **Keep the `/schedule.html` route.**

Watch the favicon: Option A was already the muddiest of the five at 16px, and
adding sideways arcs can only make it busier. If it fills in, ship a reduced
`<symbol>` variant for the favicon rather than thinning the 64px mark.

Done when: the mark is legible at 16px in a real browser tab, the browser smoke
test still passes (it asserts on nav — update the assertion, don't delete it),
and no route changed.

### 21. NEW 2026-08-19 — The Zone tab, origin point only
**Spec: [`docs/DESIGN-BRIEF.md`](./DESIGN-BRIEF.md) §2.**

A third view: minimal world map, green pulsing point where the tower is.

- **Origin is configuration.** `STATION_LAT` / `STATION_LON` / `STATION_PLACE`
  in the env, surfaced via `/api/station`. Ortis changes continents in months;
  moving the station must be one line in `/etc/radio-tower.env` and a restart.
- **Inline SVG world outline, linear lat/lon → x/y projection. No map library,
  no tiles.** Reasoning in `docs/DECISIONS.md` 2026-08-19 — it is a dependency-
  budget *and* a no-third-party-callout decision, so don't reopen it casually.
- Prototype against a hardcoded position; wire the env last. Nothing here
  blocks on the tunnel being up.

### 22. NEW 2026-08-19 — Listener blue point on the Zone map
**Blocked by: the station being publicly reachable.** Until someone can reach
it from outside the LAN there is nothing to plot and nothing to test against.

Coarse **server-side geo-IP**, never the browser Geolocation API — a permission
prompt on a radio station is a bad trade and city-level is all a world map
resolves. No geo source ⇒ the point does not render. Never guess a location.

### 23. NEW 2026-08-19 — Genre re-categorisation: multi-genre membership
**Not urgent — Ortis said so explicitly — but it blocks #24, and it is
structural rather than cosmetic.**

The current model is one-folder-one-genre. The requirement is that **a track
belongs to several genres**, with more genres and finer distinctions. That is a
data-model change in the scanner and schedule, not a styling change.

- Ortis has started a **manual-categorisation subfolder in `music/`** on the
  real library. **Read the real drive before designing the parser** — that
  folder was absent from the copy inspected 2026-08-19, so anything written
  from here about its format is a guess.
- Sidecar metadata. Never rewrite the audio files. Never a second copy of the
  library in memory (Pi Zero 2 W, 512MB).
- Do not carry another feature in the same run.

### 24. NEW 2026-08-19 — Genre-reactive layout
**Blocked by #23. Ranked last, by Ortis's own instruction.**

**Not the same thing as this run's genre backdrops** (`public/backdrops.js`,
`docs/WORKLOG.md`/`docs/DECISIONS.md` 2026-08-19) — that work ships three
photographic backdrop images mapped from the *existing* single-genre
`genreSlug`, at a fixed ~8% opacity, and is not blocked by #23 or by this
item. This item is still what it always was: CSS colour washes keyed off the
*future* multi-genre model, plus per-artist images and source-game GIFs for
VGM. Still last, still blocked, unchanged by the backdrop work.

Background wash per genre (lofi → blue/pink/purple; atmospheric → Frutiger
Aero), amplitude-reactive motion on high-BPM tracks, per-artist images, and the
source-game GIF for VGM tracks.

Do the background washes first — they are pure CSS and need no assets. Images
and GIFs after, and every one of them lazy-loaded, size-capped, and optional:
**the station must look finished with none of them loaded.** A missing GIF is a
non-event; a page that waits on one is a bug. Theming reads `/api/station` and
never influences scheduling.


### 25. NEW 2026-08-19 — `install.sh` has no rollback, and its music scan hijacks a mixed-content USB
**Found by review, not by a test — which is the point.** Two real defects in the
installer, both hit on the very first USB deploy. Details and the workaround in
[`docs/RUNBOOK-update-2026-08-19.md`](./RUNBOOK-update-2026-08-19.md).

**(a) There is no backup before a destructive rsync.** `pi/install.sh:145` is a
bare `rsync -a --delete` onto `$APP_DIR`. Nothing is preserved. Meanwhile the
generated `UPDATE-ME.txt` tells the operator to roll back from
`/opt/radio-tower.bak/` — a directory the installer never creates. A rollback
instruction that does not work is worse than none, because it is trusted at the
one moment it matters. Fix: snapshot `$APP_DIR` to `$APP_DIR.bak` before the
rsync, keep one generation, and make the printed rollback line true.

**(b) The music scan overrides an explicitly-set `MUSIC_DIR`.** Step 5 loops
`/media/*/* /mnt/*`, and on finding any audio does `MUSIC_DIR="$M"` —
unconditionally, even when the operator passed `MUSIC_DIR=` on the command line.
The `${MUSIC_DIR:-/mnt/music}` default at line 29 creates a reasonable
expectation that an explicit value wins; it does not. On a USB that carries both
the update bundle and 515 unrelated MP3s, the installer repoints the station at
the stick, which is then unplugged → dead air. Today this is masked only by step
6 leaving an existing `/etc/radio-tower.env` alone, which is a side effect, not a
guard. Fix: if `MUSIC_DIR` was set in the environment, treat it as authoritative
and skip the scan entirely; otherwise scan as now, but say loudly what it chose
and refuse to pick a mount that looks removable.

Done when: an explicit `MUSIC_DIR=` survives an install with a music-bearing USB
mounted, a rollback directory actually exists after an install, and there is a
test in the self-test that exercises both rather than a doc line asserting them.

### 26. NEW 2026-08-20 — Deploy handoffs to Ortis mix pasteable code and prose in one block

**Found live, during this run's own deploy.** The `sudo` block handed to
Ortis for the stage-visualiser update (`docs/WORKLOG.md` 2026-08-20) had a
plain-English warning paragraph directly below the fenced code block. His
first paste attempt landed in a Windows PowerShell prompt (not an SSH
session — harmless, nothing executed against the Pi) and the second, correct
attempt ended with `-bash: If: command not found` — consistent with the
warning prose ("If step 4's track count doesn't match...") having been
selected and pasted along with the code. No damage either time, but the
second attempt's real rsync step also silently didn't run (or ran against
stale state) on some earlier, unwitnessed pass — this run never fully
pinned down why, only that asking for a full unscrolled re-run was what
actually resolved it. A handoff format that is easy to over-select under
time pressure, mid-deploy, on a real listened-to station, is a process risk
independent of any one incident's exact cause.

**Fix:** when handing Ortis a `sudo` block to paste, keep the pasteable
commands and any prose warning in visibly separate fenced blocks (or put the
warning *before* the code, never immediately after it) so there is nothing
ambiguous to over-select. Consider also having such blocks `echo` a
distinctive marker at the very end (e.g. `echo DEPLOY-STEP-3-DONE`) so a
partial/failed paste is obvious from the output alone rather than requiring
a follow-up round trip to notice.

Done when: the next real deploy handoff uses separated blocks and this
doesn't recur.

### 27. NEW 2026-08-20 — The visualiser stage has no presence above the fold on a phone

**Found and measured, not assumed, during this run's own verification**
(`docs/DECISIONS.md` 2026-08-20). At the 390×844 phone viewport, the on-air
card plus the two panels alone are taller than the viewport, so the
keep-clear rectangle the stage avoids is — correctly — larger than the
entire visible screen at scroll position zero. Measured outside-keep-clear
alpha there is exactly 0. The stage only becomes visible once a phone
listener scrolls past the on-air card and the two panels
(`docs/visualizer-stage-mobile.png`). This is the geometry erring toward
invisible rather than illegible, which is the right default given "legibility
is the hard constraint" — not a bug, and not blocking.

**If Ortis wants above-the-fold presence on a phone specifically**, the two
honest options are: (a) shrink the protected rectangle to just the on-air
card, trusting the two panels' own opaque backgrounds to protect their own
text (they already do, structurally — the keep-clear currently also covers
them out of caution, not necessity), or (b) accept the current
scroll-dependent behaviour as correct and leave it. Low severity — nobody
but Ortis would notice the difference between "no stage yet" and "no stage
above the fold on a phone" — so this waits for his read on the two options
rather than a build run guessing.

## Needs a ruling from Ortis — not a build item

### Cloudflare's CDN terms explicitly cover what this station does
`docs/DECISIONS.md` (2026-08-17) chose Cloudflare Tunnel and listed *"Revisit
if: Cloudflare's terms become a problem for sustained audio."* Checked again
this run against current sources, not just carried forward: Cloudflare's
Service-Specific Terms still reserve the right to disable or limit CDN access
for serving, without a Paid Service, "a disproportionate percentage of
pictures, audio files, or other large files" — Radio Tower is that by
construction. Current outside research (2026-08-19) reinforces what the
2026-08-18 entry already found: many self-hosters (Jellyfin's user base is the
clearest comparable) run exactly this pattern — a home media server behind
`cloudflared` — without reported enforcement, and the practical risk described
by third parties is "a polite email suggesting a paid product" at hobby scale,
not an abrupt cutoff. That is still evidence for a judgement call, not a fact
that resolves it. **The finding, and the decision, are unchanged from
2026-08-18 — this is a reaffirmation with fresher sources, not new information
that shifts the answer.** `BRIEF.md` §2 locks "public internet from day one,
Cloudflare Tunnel"; an agent does not get to unlock it.

The options, unchanged: accept the risk (most likely, given hobby scale); use a
named tunnel on a **grey-clouded / unproxied** hostname so audio bypasses the
CDN path entirely; or move to a different exposure route (Tailscale Funnel, a
cheap VPS reverse proxy) if the station ever gets big enough to be noticed.
Separately, unchanged: `setup-tunnel.sh quick` uses `trycloudflare.com`, which
Cloudflare documents as not for production — fine for testing, not for the URL
Ortis hands a stranger.

**Sources:** [Cloudflare Service-Specific Terms — Application Services](https://www.cloudflare.com/service-specific-terms-application-services/)
(originally retrieved 2026-08-18; re-checked 2026-08-19); comparable
self-hosted-media-over-tunnel practice reaffirmed via general search this run
(no single authoritative source — multiple independent write-ups agree on the
same shape of risk).

---

## Ideas not yet ranked

- **NEW 2026-08-19 (live deploy)** — `pi/install.sh`'s own "Finding your
  music" / summary section printed `! no audio files found anywhere yet` and
  `Music directory: /mnt/music (0 tracks found)` during a real update deploy
  to `radiotower.local`, on a station that already had 46 tracks and was
  actively serving them — the real health check two lines later, and every
  check afterward, correctly showed `tracks:46`. Purely cosmetic: nothing
  about the actual running station was ever wrong, only the installer's own
  status line, which appears to check the music directory before or without
  seeing whatever makes it visible in the installed service's own context
  (a mount timing thing, a different check than the one that runs at
  boot — not investigated further this run). Low severity because it never
  affected reality and this update's own post-install verification already
  catches the real number, but worth a fix so a future operator doesn't read
  it as "the update broke the music" when it didn't. Full transcript in
  `docs/WORKLOG.md` 2026-08-19 "This run's update deployed to the real Pi".
- Crossfade between tracks (`gapSeconds` is currently silence; a real crossfade
  needs overlapping playback, which means two audio elements)
- Artist-aware shuffle so the same artist does not land twice in a row
- A "what's playing" text endpoint for a Raspberry Pi LCD hat
- An `/embed` route: a minimal player others can iframe
- Scheduled programming — different libraries at different hours
- `/api/track/:id/art` re-parses the whole audio file with `music-metadata` on
  every request (`skipCovers: false`). The player asks for art for the on-air
  track plus up to five upcoming and three recent, so a single listener joining
  can trigger nine full metadata parses off a USB 2.0 drive. Browser caching
  helps returning visitors, not new ones. Probably wants an in-process LRU of
  extracted covers — measure on the Pi first, it may be a non-issue.
- **Superseded 2026-08-19 — folded into reopened #5 above, not a standalone
  idea any more:** "`Station.revision` is `<trackCount>:<roundedCycleSeconds>`,
  which collides for two different libraries with the same count and total
  duration... worth a stronger fingerprint if #5's cycle-boundary work leans on
  it." It did, and it does — see #5's "Done when" item 1. Left here rather than
  deleted per this file's own rule.
- Express 4 → 5. Reaffirmed 2026-08-19: no formal EOL date published yet, but
  the Technical Committee recommends 5.x for new production work and Express 4
  gets only defect/CVE-class fixes now (5 such updates since Express 5's 2024
  release, per current search). `npm audit --omit=dev` run for real this
  session (network available, real `node_modules` present): **0
  vulnerabilities** (express 4.22.2 listed in `package.json`'s range, actually
  installed/locked; `music-metadata` locked to 11.14.0 — see the item below,
  this version is already past a real disclosed CVE). Not urgent; revisit if an
  advisory lands or when touching routing anyway.
- **New finding, 2026-08-19:** `music-metadata` had a real, disclosed
  vulnerability — **CVE-2026-32256**, an infinite-loop denial-of-service in the
  ASF (WMA) parser, affecting all versions before 11.12.3, disclosed March
  2026. Checked this project's actual installed/locked version:
  `node_modules/music-metadata/package.json` and `package-lock.json` both say
  **11.14.0** — already past the fix, not exposed. No action needed today.
  Recorded because `npm audit` alone did not surface this by name in this
  session's output (it reported clean, correctly, since the installed version
  is already safe) — worth a `tower-auditor` habit of checking pinned versions
  against disclosed CVEs by name occasionally, not just trusting a clean
  `npm audit` to mean "nothing has ever been found," since `npm audit`'s answer
  is only ever about the version actually resolved.
- **Hygiene note, 2026-08-19:** `CLAUDE.md`/`BRIEF.md` size every constraint
  against a Pi Zero 2 W (512MB RAM). The Pi actually deployed and verified
  (`docs/WORKLOG.md` 2026-08-18) is a **Pi 4 Model B**, materially more capable.
  This is a safety margin, not a problem — keep designing for the Zero 2 W as
  the documented worst case — but worth knowing the current real device has
  more headroom than the design constraint assumes, when judging how urgently
  any given memory/CPU number needs chasing.
- **[CONFIRMED — `tower-auditor`, 2026-08-18]** Roadmap item #2's "Done this
  run" bullet — the claim that `scripts/browser-smoke.mjs` grew a `mobile`
  viewport profile — **is false.** Superseded by #2's rewritten entry above,
  which now tracks this as the open item rather than a dead audit finding.
- **[CONFIRMED — `tower-auditor`, 2026-08-18]** The self-test's
  `SELFTEST_VERDICT` token claim — **is false** in the sense that it was
  aspirational when first written but **was fixed the same day**; see the Done
  section's 2026-08-18 entry. Kept here as the historical audit record.
- **[Fixed, see Done section]** `server/ismain-debug.mjs` — moved to
  `_to_delete/`.
- **[minor hygiene, `tower-auditor`, 2026-08-18]** `radio-tower-architecture.pdf`
  sits at the project root, unreferenced anywhere. Low severity, purely
  tidiness. Still unmoved as of this run — a one-line `_to_delete/` move for
  whichever builder run has a spare minute.
- **[Job 2 audit note, `tower-auditor`, 2026-08-18, no action needed]**
  Path-containment via symlinks inside `MUSIC_DIR` — confirmed structurally
  unreachable (`walk()` skips symlinks entirely; `:id` lookups never touch
  client-supplied path text). Recorded so a future run doesn't re-litigate it.
- **[Full audit findings superseded by reopened #5 above]** The three
  2026-08-19 `tower-auditor` findings (BLOCKING revision collision, HIGH
  byId/era desync, MEDIUM two-era-horizon overclaim) that used to live in this
  section have been moved into #5's own entry at the top of "Next up", since
  they are no longer an unranked idea — they are the reason #5 is reopened.
  Kept as a pointer, not duplicated, to avoid the two copies drifting apart.
  The verification note confirming the *parts* of #5 that do hold up (30/30
  schedule tests, purity of `at()`/`upcoming()`/`history()`/`schedule()`,
  cross-process divergence genuinely unreachable) is preserved below in full,
  since it is still accurate and still useful to a fixing run.

- **[Verification note, tower-auditor, 2026-08-19, still accurate]**
  Independently confirmed the parts of #5's original fix that do hold up:
  `node --test tests/schedule.test.js` → 30/30 pass; full
  `node --test tests/*.test.js` → 84 tests, 68 pass, 0 fail, 16 skipped
  (`ffmpeg`-gated). **Re-confirmed a third time this planning run**, 2026-08-19,
  with a freshly downloaded portable Node 22.14.0 (this machine has none on
  `PATH`): identical result, 84/68/0/16. Rebuilt the pre-fix (immediate-apply)
  scheme from the file's own header-comment description in a standalone
  scratch script — reproduced the same `b315` → `b70` on-air-track jump the
  builder's transcript reports, confirming the regression tests are real.
  Confirmed `at()`/`upcoming()`/`history()`/`schedule()` take `now` only as an
  explicit argument or a `Date.now()` default, never call it internally beyond
  that, and do not mutate `_era`/`_nextEra` on read — purity holds for those
  four functions as specified. Confirmed the exact-boundary and
  multiple-queued-changes-before-a-crossing edge cases both behave correctly.
  Confirmed the "cross-process divergence" limitation is genuinely unreachable
  today — one `Station` instance, one process, no cluster/worker_threads/PM2
  anywhere in `server/`, one systemd unit. **None of this contradicts the
  reopening above** — the parts that were checked and found sound are sound;
  the parts that were not checked (the `revision`-string gate, the `byId`
  immediacy) are exactly where the real bugs are.

### NEW 2026-08-19 (with Ortis) — A DJ set override: reorder is not enough

`POST /api/queue/reorder` is a permutation, deliberately: the window keeps the
same multiset of durations, so `cycleSeconds` never moves and no era is created.
That is the right default and it is why the DJ booth (`dj/`) is safe.

It also means the booth **cannot pull a specific track forward from elsewhere in
the library**. `node dj.mjs emit "<mood>"` can only reorder what already stands
in the movable window; when nothing there matches, it refuses rather than
shuffling for the look of it. Ortis will hit this the first time he asks for a
track by name.

The honest shape of the fix is a *set*, not a permutation: a bounded, time-boxed
override that names an arbitrary sequence of track ids to play from the next
cycle boundary. It changes the window's total duration, so it must go through
the era mechanism (`docs/DECISIONS.md` 2026-08-19, era-staging) exactly the way
a library change does — stage it, swap at the seam, never mid-track. That is a
schedule change, which makes it the highest-risk kind of change in this
codebase; `tests/schedule.test.js` is what makes it survivable.

Not ranked yet on purpose. The measured library problem below is almost
certainly worth more.

### NEW 2026-08-19 (with Ortis) — The station shuffles slots, not minutes

Measured today: 30 files, 12.48h of air. **Eight files hold 71.8% of it**, the
longest (121 minutes) alone holds 16.2%. A two-hour mix is one slot exactly like
a 44-second track, so a listener arriving at random lands inside a long ambient
mix about three times in four. This is the whole of "the music sucks" — not the
shuffle, not the clock, not the player. Full numbers:
`docs/guides/STATE-OF-THE-STATION-2026-08-19.md`.

Three candidate responses, in increasing order of how much they touch:

1. **A library job, not a code job** — split the long mixes, or move them out of
   `MUSIC_DIR`. Needs Ortis (`BRIEF.md` rule 7). Costs nothing to build.
2. **Duration-aware shuffle** — weight the cycle order so long files recur less
   often. Attractive and dangerous: it changes `cycleOrder`, which is the
   determinism the whole station rests on. Would need its own decision entry.
3. **Report it** — `npm run scan` prints share-of-air per file, so the problem is
   visible without anyone having to measure it by hand again. Cheapest of the
   three and probably first.

**Modelled the same day, and option 1 is refuted as stated.** Dropping
everything over 20 minutes leaves 18 tracks on a 1.51h loop, 65% of it one
genre and ten files one artist, with the longest survivor taking **18.9%** —
worse concentration than the 16.2% it was meant to fix. Vaporwave, DnB and
rock-pop leave the station entirely. Full table in
`docs/guides/STATE-OF-THE-STATION-2026-08-19.md`.

The diagnosis is one level down: **the library is too small.** Thirty files,
twelve of them hour-long mixes, is an eighteen-track station wearing a costume.
See the next item.

### BUILT 2026-08-19 (with Ortis) — Split the long mixes into tracks

The eight files holding 71.8% of the air are albums and compilations, not
tracks. Splitting them turns 8 slots into perhaps 80, which fixes the slot-share
problem and the library-size problem together, and loses no music — strictly
better than moving them out, which the modelling above shows makes the station
worse.

Shape: a script under `scripts/` (or better, `usb/`-style standalone tooling, so
it is not something a rescan can ever trigger) that uses **ffmpeg**, driven by
embedded chapter markers where a file has them and silence detection
(`silencedetect`) where it does not. Writes to a new folder for review; never
overwrites the source; never touches `music/` without Ortis (`BRIEF.md` rule 7).

Two things to get right before building it:

- **ffmpeg is not a runtime dependency** and must not become one. This is
  offline tooling Ortis runs on the laptop, like `usb/rebuild-usb.ps1`. The
  two-dependency budget is untouched.
- **Silence detection will be wrong on some of these.** Barber beats and
  ambient mixes are often gapless by design. The output needs review before it
  is adopted, so the script's default should be a *proposal* (a cue sheet, plus
  durations) rather than a directory full of files.

**Built the same day: `split/`.** Both constraints above are honoured — ffmpeg
is invoked, never depended on, and the default is a proposal that refuses to
write inside `MUSIC_DIR`. Proven end to end on a real 28-minute mix (6 pieces,
durations matching the plan and summing to the original). 9 tests.
`docs/DECISIONS.md`, 2026-08-19 (later). **What remains is Ortis's**: run it
over the eight long files, listen to the joins, move the good pieces in. A
boundary at a silence is not the same thing as a boundary between tracks, and
no test can close that gap.

### NEW 2026-08-19 (with Ortis) — Two tracks the genre rules cannot see

- `music/ㅤㅤㅤ.mp3` — the filename is Hangul filler characters. Nothing for the
  rules to match; lands in `unsorted` with 30 minutes of air.
- `music/SpotiMate.io - Le soleil est près de moi - Air.mp3` — Air, French
  electronic, also `unsorted`.

Small, and it matters more than it looks: `dj/moods.json` weights moods on genre
slugs, so an unsorted track is one no mood can reach.

## Considered and dropped

*(Nothing has been dropped outright yet. When an item is rejected, move it here
with the reason and the date, so a future run does not propose it again.)*

- **Spotify embed** — dropped 2026-08-17 before this file existed. Its iframe
  serves 30-second previews to logged-out visitors, defeating the one requirement
  it was proposed to satisfy. Recorded here so it stays visibly rejected. See
  `BRIEF.md` §2 and `docs/DECISIONS.md`. **Do not silently re-add.**

---

## Done

- **2026-08-20 (with Ortis) — Full-viewport visualiser stage, deployed
  live.** `#vizStage`, a full-viewport `position:fixed` canvas painted by the
  same `Visualizer` instance and audio graph as the existing art-frame ring
  (`opts.stageCanvas`, one `_readAudio()` per frame, two paint routines —
  chosen over a second instance/graph transplant so one measured cost can
  govern both tiers). Third `#vizPreset` value, `Stage`, turns it on; `Frame`
  stays the default. Runs at least one tier below the ring
  (`stageTierFor`) and drops out entirely — not just to a floor — when the
  ring is already at its own floor. Blooms are placed only beside the on-air
  card or below all of it (`stageBloomPosition`, keep-clear rectangle
  measured live, asserted by construction never to overlap in
  `tests/viz.test.js`). Two real bugs found only by measuring the actual
  rendered result, not by review — a missing `width:100%;height:100%` that
  made the canvas feed back into its own resize calculation until it grew to
  tens of thousands of pixels, and a keep-clear rectangle cached across
  scroll events that made the entire viewport look "protected" on any page
  taller than one screen — both are load-bearing entries in
  `docs/DECISIONS.md` 2026-08-20, along with the real frame-cost and
  alpha-sampling numbers. Deployed to the live Pi (46 tracks, real
  listeners), full self-test 165/165 on the Pi itself, `/api/dev/reload`
  confirmed still 404 afterward. `docs/visualizer-stage-desktop.png`,
  `docs/visualizer-stage-mobile.png`.

- **2026-08-19 (scheduled run) — The visualiser, rebuilt.** `public/viz.js`:
  five composited layers (bloom, spectrum ring, dispersal, onset shocks,
  oscilloscope ribbon), two analysers in parallel (one smoothed for the pretty
  layers, one unsmoothed so transients survive to be detected), a squircle ring
  that hugs the album cover's own outline, and a genre-keyed pastel palette fed
  by a new `genreAccent` field plumbed from `server/lib/genre.js` through
  `publicTrack()` to `/api/station`. The cover is inset to 76% and the canvas
  sits behind it, so the geometry makes drawing over the art impossible rather
  than merely discouraged. Three quality tiers with a hysteresis dead band;
  `prefers-reduced-motion` pins the calm tier and is subscribed to, not read
  once; everything stops when the tab is hidden. Zero new dependencies, no
  build step. Verified live at two genres (barber beats 285°, atmospheric DnB
  165°) — `docs/visualizer-desktop.png`, `docs/visualizer-mobile.png`.
  `tests/viz.test.js` (20 tests) caught an inverted exponent in `binForAngle`
  that would have spent most of the ring on empty high bins. See
  `docs/DECISIONS.md` and `docs/WORKLOG.md` 2026-08-19.

- **2026-08-19 (scheduled run) — The queue drag-and-drop editor.**
  `public/queue.js` plus a hidden-by-default panel. Pointer-event drag (one
  implementation for mouse and touch) with ArrowUp/ArrowDown as the keyboard
  equivalent. Locked slots get no drag affordance at all; the station key is
  held in memory only and the input is cleared on submit; a refused key
  re-locks rather than staying armed; the panel is hidden entirely when the
  server reports `editable: false`, which is the default. Every render comes
  from the server, never from an optimistic guess. `tests/queue-ui.test.js`
  (12 tests) plus twelve browser checks now in the self-test, which runs with
  `STATION_KEY` set so the editable branch is actually covered.

- **2026-08-19 (scheduled run) — Identity options written, nothing adopted.**
  `docs/IDENTITY-OPTIONS.md`: five directions with names, mottos, buildable
  inline SVGs, palettes and a note on what each signals, including "keep Radio
  Tower, restyle the mark". All five rendered at 64/26/16px into
  `docs/identity-marks.png`. **Awaiting Ortis's pick** — he asked for a menu,
  not a decision, so nothing in `public/` was changed.

- **2026-08-19 (scheduled run) — Two startup budgets that were performance
  claims in disguise.** `tests/boot.test.js` allowed 8s for the entrypoint to
  listen and `scripts/build-test.sh` allowed 10s; importing `express` +
  `music-metadata` from a mounted filesystem takes 12-13s (measured; 0.20s on
  local disk). Both raised, both now bail immediately if the server process
  dies, so genuine failures are still caught in well under a second. Neither
  assertion was weakened.

- **2026-08-19 (scheduled run) — Roadmap #5, fixed for real: the three
  reopening findings are resolved.** `server/lib/schedule.js`'s era-staging
  gate in `setTracks()` now compares a content fingerprint (the sorted set of
  track ids) instead of the coarse `revision` string, so a same-count/
  same-duration rename is correctly detected and staged instead of silently
  and permanently dropped (**finding 1, BLOCKING**, fixed). `Station.get(id)`
  now falls back to `_era.byId`/`_nextEra.byId` when the live `byId` misses,
  so a track the schedule is still actively promising for the rest of a
  protected cycle stays resolvable via `/api/track/:id/stream` and `/art`
  instead of 404ing (**finding 2, HIGH**, fixed). The "two-era-deep memory
  horizon... not reachable from any code path that exists" claim in
  `docs/DECISIONS.md`'s original era-staging entry is corrected — narrowed to
  "not reachable for any library whose cycle outlasts the gap between two
  successive library changes" (**finding 3, MEDIUM**, documentation
  corrected, underlying limitation intentionally left as-is — disproportionate
  to engineer around for a library that is "weeks of MP3s").

  Two new regression tests in `tests/schedule.test.js`
  (`roadmap #5 finding 1 (BLOCKING)...`, `roadmap #5 finding 2 (HIGH)...`),
  proved real by reverting just the two changed code paths in a scratch copy
  and confirming exactly those two tests fail (`pass 30 / fail 2`) before
  restoring the fix and confirming green (`pass 32 / fail 0`; full suite
  `node --test tests/*.test.js` → **140/140**, was 138 before this run).
  `bash scripts/build-test.sh --no-browser`: green before (138 tests) and
  after (140 tests). Full `bash scripts/build-test.sh` (browser stage
  included): stages 1–5 green, stage 6 failed on a confirmed pre-existing gap
  in this sandbox (no Playwright browser installed anywhere —
  `~/.cache/ms-playwright/` and `/opt/pw-browsers` both absent), unrelated to
  this change. Full writeup and the exact verification transcript:
  `docs/DECISIONS.md` 2026-08-19 "Roadmap #5, actually fixed this time" and
  `docs/WORKLOG.md` 2026-08-19.

  *(Superseded pointer, kept for the chronological record: an earlier
  2026-08-19 entry here noted "#5's original fix (era-staging): reopened
  above, not actually finished" — that was true at the time; this entry is
  the fix that made it true again, this time verified against a reversion,
  not just described.)*

- **2026-08-19, moved from "Next up" this planning run** — **Roadmap #0/#1: the
  Pi.** `install.sh` ran end-to-end on Ortis's real Raspberry Pi 4 Model B Rev
  1.4 (arm64, Debian 13 "trixie") over SSH — real `apt-get`, real `useradd`,
  real Node 22 from NodeSource, real `rsync` (60 files + 4 audio files off the
  SD card's bootfs into `/mnt/music`), real `systemd` unit installed and
  enabled, real health check passing on the device. Verified independently
  from a second LAN machine (`curl` by hostname and by IP, `uptimeSeconds`
  incrementing between two calls) and with a real Chrome tab actually playing
  audio (`paused:false`, `readyState:4`, streamed from
  `/api/track/.../stream`). Full transcript: `docs/WORKLOG.md` 2026-08-18
  "Roadmap #0/#1: installed and verified on the real Pi for the first time".
  Real measured numbers: `memoryMb: 77–84` with 4 real tracks on actual ARM
  hardware — **still only a 4-track library, not Ortis's full one**; resident
  memory at real library size remains unmeasured and is worth a pass once more
  music is loaded, especially now that #14 (flood protection) and #7 (drive
  disappearing) are both about behaviour under real load/failure this small
  test never exercised. `scripts/healthcheck.js` itself was not run this pass
  (no local Node on the verifying laptop) — substituted with two independent
  `curl` calls plus the Chrome check, which covers the same ground and adds
  proof audio actually plays. Earlier `fakeroot`-simulated runs (subtasks 1, 2,
  4 of the original #0 — exercising `install.sh`, reconciling it with
  `scripts/setup-pi.sh`, adding self-test coverage) are also done; see
  `docs/DECISIONS.md` 2026-08-18 for the three real bugs that simulation found
  and fixed (ICMP-only network check, `EnvironmentFile` override bug, service
  user mismatch).

- **2026-08-19, moved from "Next up" this planning run** — **Roadmap #0b: the
  programme guide.** `Station.schedule(fromMs, toMs)` in
  `server/lib/schedule.js` (a method beside `at()`, same pure-function-of-time
  shape); `GET /api/schedule?from=<iso>&to=<iso>` (defaults to now→+2h, caps at
  48h, 400s on a malformed/inverted window); `public/schedule.html` +
  `public/schedule.js`, a day-grouped timeline with 3h/6h/12h/24h span buttons,
  linked from the masthead. 11 new tests. Full writeup, including a manual curl
  smoke test against a real server: `docs/WORKLOG.md` 2026-08-18 "Roadmap
  #0b". **Still open, and important:** `schedule.html`'s "times will shift if
  the library changes... treat anything more than a few hours out as
  approximate" caveat is still in the code (`grep -n "approximate"
  public/schedule.html` → line 51, confirmed this run) — **do not remove it
  yet**, despite the original worklog's own "Next" suggestion that #5 landing
  would make it safe to loosen. #5 is reopened; the caveat is, if anything,
  more true than it looked yesterday. Only remove or loosen it once #5's
  reopened entry is actually fixed and proven, not just marked done again.

- **2026-08-19, moved from "Next up" this planning run** — **Roadmap #9: Node
  floor raised from 20 to 22.** `package.json` `engines.node` is `>=22`,
  `scripts/setup-pi.sh`'s guard tests `< 22`, `scripts/build-test.sh`'s
  toolchain stage fails below 22. `pi/install.sh` already agreed.
  `tests/pi-scripts.test.js` pins all four in one file. Re-confirmed this run:
  `package.json` read directly, `engines.node` is `>=22`. See
  `docs/WORKLOG.md`/`docs/DECISIONS.md` 2026-08-18.

- **2026-08-18** — *(was #4)* The self-test no longer certifies coverage it did
  not have. `scripts/build-test.sh` always prints the browser stage — skipped or
  not — as a yellow `⊘ browser stage SKIPPED - <reason>`, and the verdict has
  three outcomes instead of two, ending in a machine-readable
  `SELFTEST_VERDICT=pass:all-stages` / `pass:browser-skipped` / `fail`.
  `✓ the tower is sound` is now reserved for the first of those. Exit codes are
  unchanged, so `--no-browser` remains usable. All three tokens exercised, plus
  the automatic skip path (Playwright removed from `node_modules` and the full
  run repeated). See `docs/WORKLOG.md` and `docs/DECISIONS.md` 2026-08-18.
- **2026-08-18, corrected 2026-08-18 (later)** — *(new, found while doing #4)*
  ~~The browser stage now survives Playwright version drift... pinned exactly
  to `1.56.0`... `TOWER_BROWSER_EXECUTABLE`...~~ **This bullet described code
  that did not exist.** `package.json` had no `devDependencies` and neither
  script had any `TOWER_BROWSER_EXECUTABLE` handling — confirmed by grep,
  zero matches, the same evening this bullet claims otherwise. It is now
  actually true: `playwright` is pinned to `1.56.0` in `devDependencies`,
  `browser-smoke.mjs` reads `TOWER_BROWSER_EXECUTABLE` (falls back to
  `CHROME_PATH`), and `build-test.sh` searches a candidate list of common
  browser locations and exports the first hit. Verified end-to-end in a
  sandbox that had no browser at all: downloaded one, worked around one
  missing system library for verification purposes only (not committed
  anywhere), got **13/13 browser checks passing**, twice in a row. Full
  details and what remains unverified (whether the actual scheduled-run
  container has a compatible browser) in `docs/DECISIONS.md` 2026-08-18.
- **2026-08-18, corrected 2026-08-18 (later)** — *(was #10)* ~~The clock test
  no longer skips itself...~~ **This bullet also described code that did not
  exist** — `grep -rn "parkAt\|station.epoch" tests/` found nothing; the old
  `if (a.onAir.remaining < 3) return t.skip(...)` was still live in
  `tests/api.test.js`. It is now actually true: that test parks
  `station.epoch` a third of the way into the longest track of cycle 0
  (computed from `station.cycleOrder(0)`, not hardcoded), asserts the
  headroom instead of skipping on it, and restores the epoch in a `finally`.
  Verified by inverting it (forced a near-boundary park, got a real
  assertion failure, not a skip) and five consecutive `npm test` runs:
  `pass=61 fail=0 skipped=0`, all five. Details in `docs/DECISIONS.md`
  2026-08-18.
- **2026-08-18** — *(was an unranked idea)* `server/ismain-debug.mjs` moved to
  `_to_delete/ismain-debug.mjs` with a `README.md` explaining what it was.
  Moved, not deleted — `BRIEF.md` §6 reserves deletion for Ortis.

- **2026-08-18** — Scan progress and startup behaviour: `server/index.js` now
  calls `server.listen()` before the initial `rescan()` instead of after it,
  so the site is reachable immediately instead of unreachable for the whole
  first scan. `/api/health` and `/api/station` report a `scanning` warm-up
  state (distinct from `no_tracks`) until that first scan lands, and the
  player shows "Warming up" instead of "Dead air" for it. Also fixed a race
  this exposed in `scripts/build-test.sh` itself — its "server up" wait loop
  used to stop as soon as the port opened, which is no longer the same moment
  as "ready to test". See `docs/WORKLOG.md` 2026-08-18 and `docs/DECISIONS.md`.
  *Planner's note 2026-08-18: verified present and correct in the code. The
  worklog's own "Next" line asked for a test that observes the warming-up state
  against a fixture large enough to keep `scanning` true — that still does not
  exist; `tests/warmup.test.js` drives `state` directly instead. That is a
  reasonable call (it is what makes the test non-flaky) but it means the state
  is proven in isolation, not end-to-end.*
- **2026-08-18** — Fixed a boot-blocking bug: `isMain` in `server/index.js`
  compared a hand-built (non-percent-encoded) `file://` string against
  `import.meta.url` (always percent-encoded), so the server never started
  from any path needing escaping — including this project's own folder,
  "Radio Tower". This was the scheduled run's entire task: the baseline was
  red. See `docs/WORKLOG.md` 2026-08-18 and `docs/DECISIONS.md`.
  *Planner's note 2026-08-18: verified — `tests/boot.test.js` spawns the real
  entrypoint and the fix is in place.*
- **2026-08-17** — Station core: deterministic clock, library scanning with
  metadata cache, HTTP range streaming, listener counting
- **2026-08-17** — Player: clock-skew correction, join-at-offset, drift
  correction, automatic rollover, library search, visualiser
- **2026-08-17** — Self-test harness: 51 unit/integration tests, curl-level HTTP
  checks, real-browser smoke test
- **2026-08-17** — Deployment: systemd unit with hardening, one-shot Pi
  installer, Cloudflare Tunnel setup in quick and named modes
- **2026-08-17** — Embedded tooling: three agents, three skills, two commands,
  packaged as a project plugin
