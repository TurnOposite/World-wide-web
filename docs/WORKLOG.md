# Work log

Append a dated entry per working session. Newest at the top. Never rewrite an
old entry — if something turned out to be wrong, say so in a new one.

Shape:

```markdown
## YYYY-MM-DD — one line summary

**Ran:** build-test result before → after
**Changed:** files
**Why:** reasoning, not the diff
**Verified:** the specific checks that prove it
**Next:** what you'd do with another hour
```

---

## 2026-08-20 (with Ortis) — Full-viewport visualiser stage, deployed to the live Pi

**Ran:** baseline `bash scripts/build-test.sh --no-browser` — GREEN except the
3 pre-existing ffmpeg/python3 fixture failures (confirmed matching
`docs/DECISIONS.md`'s own documented baseline before touching anything), 134
tests. After: same 3 pre-existing failures, 140 tests (28 new, all in
`tests/viz.test.js`).

**Changed:**
- `public/viz.js` — a second, optional canvas (`opts.stageCanvas`) on the
  same `Visualizer` instance: two new pure helpers (`stageTierFor`,
  `stageBloomPosition`), a `stageQuality` getter, `_paintStageIfActive` /
  `_resizeStage` / `_stageKeepClear` / `_paintStageWash` / `_seedStageBlooms`,
  a third `PRESETS.stage` entry, and three new `defaultKnobs()` fields
  (`stageOpacity`, `stageScale`, `stageTierOverride`).
- `public/index.html` — new `<canvas id="vizStage">`, positioned right after
  `.backdrop`.
- `public/styles.css` — `#vizStage` rule, `position:relative;z-index:1` on
  `main`/`.masthead`/`footer`, a reduced-motion `display:none` belt-and-brace.
- `public/app.js` — wires `el.vizStage` into both the initial `Visualizer`
  construction and `hotSwapViz()`.
- `public/dev-panel.js` — two new sliders, a second tier-override button row
  (factored into a shared `buildTierRow` helper), `knobsToSnippet` excludes
  both tier overrides.
- `tests/viz.test.js` — 6 new tests for the two pure stage helpers, extended
  the `defaultKnobs()`/`PRESETS` tests to cover the new fields.
- `docs/visualizer-stage-desktop.png`, `docs/visualizer-stage-mobile.png` —
  real screenshots, referenced from `docs/DECISIONS.md`.

**Why:** Ortis saw the station live and said the space either side of the
on-air card, and the whole page below it, reads as dead black. Full writeup
of every judgement call — which of the brief's two architecture options was
chosen and why, two real bugs caught only by actually measuring the result
rather than trusting the code, and the honest phone-viewport limitation — is
in `docs/DECISIONS.md` 2026-08-20, not repeated here.

**Verified:**
- `node --test tests/*.test.js`: 140 pass / 0 fail / 25 skipped (unchanged
  skip count — the ffmpeg-gated fixture tests).
- `node scripts/browser-smoke.mjs` against a real server with the real
  30-track library, real Chrome (`TOWER_BROWSER_EXECUTABLE`): **20/20**,
  twice in a row.
- A throwaway Playwright script (not committed, this project's established
  pattern) screenshotted all three presets at a desktop viewport (1280×900)
  and a phone viewport (390×844, `deviceScaleFactor 3`), and separately at a
  wide desktop viewport (1920×1080) both at the top of the page and scrolled
  to the bottom — the scrolled shots are what actually show the effect
  clearly, since the on-air card and two panels alone exceed a typical
  phone's viewport height. Frame-cost numbers (rAF-measured, real, not
  claimed) and the keep-clear alpha-sampling numbers are both tabulated in
  `docs/DECISIONS.md` rather than duplicated here.
- `bash scripts/build-test.sh --no-browser`: 3 failures, all three the
  pre-existing ffmpeg/python3 gap — no new failures. Full run (browser stage
  included) fails the same way it already did before this change (cascading
  from the empty-fixture-library gap, not from the stage) — independently
  confirmed not a regression by the direct `browser-smoke.mjs` run above.

**Deployed to the real Pi, live, with Ortis:** staged the update the same
way as the 2026-08-19 deploy — `tar -czf - --exclude=node_modules
--exclude=.cache --exclude=.git --exclude=music --exclude=_to_delete
--exclude=archive --exclude=.claude-plugin . | ssh ortis@radiotower.local
"tar -xzf - -C ~/rt-update"` — then `npm install` and
`bash scripts/build-test.sh --no-browser` **on the Pi itself**, over a
non-privileged SSH session, before anything privileged happened. Result:
**165/165 tests, every stage green** — the Pi has both `ffmpeg` and
`python3`, so every check this session's own Windows sandbox can't run
(fixture generation, range requests, timing) ran for real there. Handed
Ortis the exact `sudo` block (backup, install via
`sudo bash scripts/setup-pi.sh`, verify) rather than attempting it myself.

**A real deploy hiccup, caught and corrected, not glossed over:** Ortis's
first paste attempt landed in a Windows PowerShell prompt on his laptop, not
an SSH session on the Pi — every line failed with "not recognized" errors,
harmlessly (nothing touched the Pi). Guided him to `ssh
ortis@radiotower.local` first. The **second** attempt (a real bash session)
printed a healthcheck and a 404 for `/api/dev/reload` that looked like
success — but checking independently from this session
(`grep -c vizStage /opt/radio-tower/public/index.html` etc.) showed **0**:
the live files were still yesterday's, unchanged mtimes, despite the service
having genuinely restarted around that time. `set -euo pipefail` in
`pi/install.sh` means the script would have aborted on a real failure, so a
restart happening at all without new files landing was the puzzle — asked
Ortis to re-run just the install line and paste the full, unscrolled output
rather than guessing further blind (no `sudo` access from this session to
diagnose it directly). That full output showed `✓ copied 1040 files` this
time — a real rsync run — and a follow-up `grep`/`wc -l` from this session
confirmed the new files (`vizStage` present, `viz.js` 1290 lines matching
this session's own edited file) actually landed. What happened on the first
attempt is not fully explained (most likely: the block's warning paragraph
below the code fence — *"If step 4's track count doesn't match..."* — got
pasted along with the code and the shell choked partway on the plain-English
`If` line, or terminal scrollback simply didn't show a real error); worth
naming as a **process fix, not a mystery to leave standing**: future
handoffs to Ortis should keep the pasteable block and any prose warning
visibly separated (a distinct fenced block, prose entirely outside it)
rather than trusting a reader mid-deploy to tell them apart under time
pressure. Filed as a `docs/ROADMAP.md` note below.

**Confirmed live, independently of Ortis's paste:**
`grep MUSIC_DIR /etc/radio-tower.env` → `/mnt/music`, `STATION_EPOCH` →
`2026-01-01T00:00:00Z` — both unchanged. `curl .../api/health` → `tracks:46`
(unchanged) and the **same** `nowPlayingId` (`f609bb3a8bf0`) across both
restarts — the station-clock promise holding on a real, listened-to station
again. `curl .../api/dev/reload` → **404**, the one thing the brief
specifically asked to be confirmed after deploy. `/viz.js`, `/styles.css`,
`/dev-panel.js` all → 200. Listener count dipped and recovered across both
restarts (4 → reconnect), as expected — nothing in the sync design requires
a listener to do anything.

**Not fixed, recurrence of an already-filed issue:** `pi/install.sh`'s
"Finding your music" step again printed `! no audio files found anywhere
yet` / `(0 tracks found)`, flatly contradicted by the real health check
(`tracks:46`) both times it ran tonight. This is the exact cosmetic-only bug
`docs/WORKLOG.md` 2026-08-19 already filed and `docs/ROADMAP.md` already
tracks — recorded here only as confirmation it still reproduces, not as a
new finding.

**Next:** the honest phone-above-the-fold limitation in `docs/DECISIONS.md`
is the natural next visualiser item if Ortis wants more presence there
without loosening the legibility rule. Otherwise: whatever `docs/ROADMAP.md`
ranks highest next.

---

## 2026-08-19 (scheduled run) — Roadmap #5, fixed for real: the reopening audit's three findings resolved

**Ran:** baseline `bash scripts/build-test.sh --no-browser` GREEN, 138 tests →
implemented → GREEN, 140 tests. Full `bash scripts/build-test.sh` (browser
stage included, this sandbox has ffmpeg/python3/node all present): stages
1–5 green, stage 6 (browser) failed on a confirmed pre-existing gap (see
"Found but not fixed" below), unrelated to this change.

**Changed:**
- `server/lib/schedule.js` — three things, all inside the already-highest-risk
  file, per `docs/ROADMAP.md` #5's reopened "Done when" list:
  1. New `fingerprintTracks(tracks)` helper (sorted track ids, joined). Every
     era snapshot from `_buildEra()` now carries `.fingerprint` alongside the
     existing `.revision`.
  2. `setTracks()`'s "nothing new to stage" early-return now compares that
     fingerprint instead of the coarse `revision` string
     (`count:cycleSeconds`). A same-count/same-duration rename (an ordinary
     file move — `trackId()` is `sha1(relPath)`) used to leave `revision`
     unchanged, which made the old gate return early and never stage the
     real change — permanently, since every later no-op rescan hit the same
     false match. This is roadmap #5's finding 1, BLOCKING.
  3. `_buildEra()` now also builds a per-era `byId` map. `Station.get(id)`
     checks the live `byId` first (unchanged — still synchronous), then
     falls back to `_era.byId`/`_nextEra.byId`. Fixes finding 2, HIGH: a
     track the schedule is still actively promising for the rest of a
     protected cycle no longer 404s from `/api/track/:id/stream` and `/art`
     just because a rescan already moved it out of the live view.
- `tests/schedule.test.js` — 2 new regression tests, one per finding, both
  using a 2-track fixture where t1 is "renamed" (same duration, new id) while
  its cycle is in progress: one asserts the renamed content actually governs
  cycle 1 once the boundary passes (finding 1), one asserts `get('t1')` still
  resolves while the old era is still promising it (finding 2).
- `docs/DECISIONS.md` — new dated entry, "Roadmap #5, actually fixed this
  time", with the full design reasoning and the revert/reapply verification
  transcript. Also corrects (append-only, not edited in place) the earlier
  2026-08-19 era-staging entry's "two-era-deep memory horizon... not
  reachable from any code path that exists" claim — finding 3, MEDIUM — to
  "not reachable for any library whose cycle outlasts the gap between two
  successive library changes." The underlying limitation itself is
  unchanged; only the overclaim about it is corrected. Judged extending the
  era ring to remember a third predecessor disproportionate to the actual
  risk for a library that is "weeks of MP3s" — documented rather than
  engineered around, matching the option the roadmap's own "Done when" #4
  explicitly allowed.
- `docs/ROADMAP.md` — #5's reopened entry now points at "Done" instead of
  carrying the live `NOT SAFE TO SHIP` status (original finding text kept in
  place, not deleted, since `docs/DECISIONS.md`'s fixing entry cites it
  directly). New "Done" entry with the full verification summary. #6's own
  text lightly corrected — it referenced #5's now-fixed silent-404 failure
  mode as a live risk; still worth doing on its own merits, reworded to say
  so instead of pointing at a bug that no longer exists.

**Why:** `docs/ROADMAP.md` #5 sat at the very top of "Next up", explicitly
marked `NOT SAFE TO SHIP` by a same-day audit of the previous fix — the only
open item that can silently break `BRIEF.md` §7's one sentence ("hears the
same song Ortis is hearing") for the one listener who exists today, on
infrastructure (`AUTO_RESCAN_MINUTES`) already running unattended on his real
Pi. This is exactly what this run's own instructions ask for: the
highest-ranked unblocked item, one coherent change, proved with a test that
fails without it.

**Verified:**
- Proved both new tests are real, not trivially passing, per `BRIEF.md` rule
  9: made a scratch copy reverting *only* the two changed code paths (the
  `setTracks()` gate back to comparing `revision`; `get()` back to
  `byId`-only lookup — kept the harmless-if-unused `fingerprintTracks()`
  helper and the era `byId` field in place, since neither is read by the
  reverted paths), swapped it in, ran `node --test tests/schedule.test.js`:
  `# pass 30 / # fail 2`, both failures exactly the two new tests
  (`not ok 23 - roadmap #5 finding 1 (BLOCKING)...`,
  `not ok 24 - roadmap #5 finding 2 (HIGH)...`). Restored the fixed file from
  a pre-edit backup, `diff`'d the restored file against the backup to confirm
  byte-identical restoration, reran: `# pass 32 / # fail 0`. Re-read
  `server/lib/schedule.js` on disk afterward (not the diff I meant to apply)
  to confirm the fix — not the reverted copy — is what actually landed.
- Full `node --test tests/*.test.js`: **140/140 pass**, up from 138 before
  this run (+2 new tests; nothing existing changed behaviour — neither the
  fingerprint gate nor the `get()` fallback alters what any pre-existing
  assertion checks).
- `bash scripts/build-test.sh --no-browser`: green before (138 tests) and
  after (140 tests), full transcript inspected both times — toolchain,
  test suite, live HTTP surface (health/station/range-requests/traversal/
  determinism-over-2857-instants), and performance (1.4–2.4ms average
  `/api/station`, 75–86MB resident) all pass in both runs.
- Full `bash scripts/build-test.sh` (browser stage included — this sandbox
  has a display, unlike several prior runs' containers): stages 1–5 green.
  Stage 6 failed: `browserType.launch: Executable doesn't exist at
  .../ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell`.
  Confirmed this is a pre-existing gap in this specific sandbox, not caused
  by this change: `ls ~/.cache/ms-playwright/` and `ls /opt/pw-browsers` both
  report "No such file or directory" — genuinely no browser installed
  anywhere here, and nothing in this run's diff touches
  `scripts/browser-smoke.mjs` or the browser-candidate search in
  `scripts/build-test.sh`. Per this run's own instructions, a browser-stage
  failure does not block a green headless result from standing.

**Found but not fixed, filed here rather than in `docs/ROADMAP.md`, since it's
an environment gap on this sandbox, not a station defect:** no Playwright
browser exists anywhere on this machine (`~/.cache/ms-playwright/`,
`/opt/pw-browsers` both absent, no system `chromium`/`chromium-browser`/
`google-chrome` on `PATH`). This is the same class of gap prior runs have hit
on other containers — this scheduled task's environment is not guaranteed to
carry a prebuilt browser from run to run. Did not install one: `npx
playwright install` needs network and disk this run was not asked to spend,
and per `docs/DECISIONS.md` 2026-08-18's own reasoning, a self-test that
downloads ~150MB before it can answer "is the station still working?" is the
wrong shape for the default path. `--no-browser` is the documented escape
hatch for exactly this case.

**Assumed:**
- That finding 3 (the doc overclaim) is better fixed by narrowing the false
  claim than by extending the two-era ring to three — the roadmap's own
  "Done when" #4 explicitly offered both options and asked the fixing run to
  judge proportionality; a third era's bookkeeping (expiry, which of three
  eras "owns" a given cycle) is real added complexity in the single riskiest
  file in the repo, for a scenario that needs a library short enough for two
  distinct changes to land inside one still-in-progress cycle — not
  Ortis's actual library.
- That `get()`'s era-fallback is allowed to resolve an id slightly longer
  than the strict minimum (until the next real content change, since `_era`
  itself is not force-rotated on a no-op `setTracks()` call after
  `_nextEra` has already gone time-effective) — always a superset of what
  finding 2 asks for, never a gap, and a stale id that outlives its
  usefulness there still 410s correctly once `resolveTrackPath()` can't find
  its bytes. Recorded as a deliberate non-fix in `docs/DECISIONS.md` rather
  than silently expanding this run's scope to also force prompt `_era`
  rotation, which the roadmap item never asked for.
- Not a git repository (confirmed again this run) — no branch, no commit for
  this run's changes; edited the real files in place per this run's own
  instructions.

**Next:** #6 (authenticate `POST /api/rescan`) is next in `docs/ROADMAP.md`
and is now purely about closing an unauthenticated-write-endpoint gap on its
own merits — the specific #5 failure mode it used to compound with is fixed.
After that: #14 (flood protection) and #7 (graceful behaviour when the music
drive disappears) are both promoted and unblocked. Separately, worth a future
`tower-auditor` pass specifically re-checking this fix the way the previous
one was checked and found wanting — this run tried to hold itself to the same
bar (revert, show red, reapply, show green, re-read the file after editing),
but an independent second look is exactly what caught the previous attempt's
gaps and this one has not had that yet.

---

## 2026-08-19 — Roadmap #5: adding/removing a track no longer re-deals the live programme

**Assumption stated up front:** this session runs directly on what looks like
Ortis's own Windows 11 machine (`C:\Users\barri\...`), not the Linux sandbox
containers every prior 2026-08-18 entry describes. Confirmed: no `node`, no
`ffmpeg`, no `python3`/`python3.exe` on `PATH` anywhere on this machine
(checked the registry uninstall keys, common install paths, WSL — genuinely
absent, not just off `PATH`). Rather than either stalling the run or silently
installing dev tools system-wide, downloaded a **portable, unzipped** Node
22.14.0 build into the session scratchpad (not `C:\Program Files`, not
`node_modules`, no PATH/registry changes, nothing left behind in the repo or
the machine) and used that for every `node`/`npm` command below. `ffmpeg` and
`python3` were not installed anywhere, portable or otherwise — see "Found but
not fixed" below for what that cost this run's verification.

**Ran:** `node --test tests/*.test.js` (baseline, before touching anything):
**79 tests, 63 pass, 0 fail, 16 skipped** (all 16 skips are `hasFfmpeg`-gated
integration tests in `tests/api.test.js`, skipping cleanly rather than
failing — this machine has no `ffmpeg`). → after: **84 tests, 68 pass, 0
fail, 16 skipped** — same 16 skips, +5 new tests, all passing.
`bash scripts/build-test.sh --no-browser`: stages 1–2 green before and after
(identical to baseline); stages 4–5 fail before and after this change, for
reasons unrelated to it (see "Found but not fixed").

**Changed:**
- `server/lib/schedule.js` — `Station` no longer applies a library change to
  the schedule the instant `setTracks()` is called. It stages the new
  library as an "era" that only starts governing `at()`/`upcoming()`/
  `history()`/`schedule()` once the wall clock reaches the end of whichever
  cycle is already in progress — computed once, at the moment the change is
  noticed. `Station.tracks`/`byId`/`cycleSeconds`/`revision` still update
  immediately (library search and health track-count stay live); only the
  actual programme is deferred. Internally this replaced the old
  `slotAt(globalSlotIndex)` integer scheme (which assumed a constant track
  count, no longer true across a library change) with a
  `{ cycleIndex, withinCycle }` cursor stepped one slot at a time — see
  `docs/DECISIONS.md` 2026-08-19 for the full design, including two
  documented, accepted limitations (a two-era-deep memory horizon that no
  real code path can reach, and cross-process divergence if two servers'
  rescans detect the same change at different real moments — not live today,
  since this station runs as one process).
- `tests/schedule.test.js` — 5 new tests: adding one track and removing one
  track, each mid-run on a 500-track/229-day-past-epoch fixture matching the
  roadmap's own reproduction, leave the currently-playing track and offset
  byte-for-byte unchanged; the deferred library takes effect exactly at the
  computed cycle boundary (checked just-before and at-the-instant); two
  independent `Station` instances still agree across a deferred change when
  fed the same `now`; a station's very first scan (empty → populated) is
  *not* deferred, since there's nothing playing yet to protect.
- `docs/DECISIONS.md` — new dated entry with the full design and the
  pre-fix/post-fix verification transcript.

**Why:** roadmap #5, explicitly named as next in the 2026-08-18 "Roadmap
#0/#1" entry's own **Next** line, now that the station is genuinely live on
Ortis's Pi and `AUTO_RESCAN_MINUTES` (default 30) will trigger this
automatically the first time he drops new music in. Read the item's own
"Done when" wording and built exactly that: cache the active cycle, apply a
new library only at the next boundary, keep `at()` a pure function of time.

**Verified:**
- **Proved the new tests are real regression tests, not tests that pass
  trivially**, per `BRIEF.md` rule 9: this project has no git history (see
  every prior entry's "not a git repository" note), so there is no `git
  stash`/`git diff` to lean on. Instead, retyped the pre-fix
  `server/lib/schedule.js` byte-for-byte from the version this session read
  at its very start (before any edit), swapped it in over the fixed file,
  reran `node --test tests/schedule.test.js`, and confirmed the two tests
  encoding the roadmap's "Done when" criterion **fail** —
  `'adding one track mid-run...'` and `'removing a track mid-run...'` — with
  the on-air track id changing from `b315` (before the library edit) to
  `b70` (after adding one track) and to `b275` (after removing one), a real
  jump matching the shape of the roadmap's own 10.6-hour measurement. Exact
  result: `pass 28, fail 2` (the other 3 new tests happened to still pass
  against the old code, since they don't specifically probe the retroactive-
  jump behavior). Restored the fixed file, reran: `pass 30, fail 0`. Then
  re-read `server/lib/schedule.js` on disk afterward to confirm the restore
  actually landed the fixed version, not the old one left behind by the
  swap (rule 9's own instruction, applied literally).
- Full `node --test tests/*.test.js` after the fix: 84/84 minus 16 skips =
  68 pass, 0 fail — same skip count as the pre-change baseline, so nothing
  that used to run and pass is now silently skipped or newly broken.
- `bash scripts/build-test.sh --no-browser`, full output inspected both
  before and after: stage 1 (toolchain/syntax) and stage 2 (test suite)
  green in both runs, identical. Stages 4/5 fail identically in both runs
  (see below) — same error text, same missing tools, confirming this
  change did not cause or worsen them.

**Found but not fixed, filed here rather than in ROADMAP.md since it's an
environment gap on this specific machine, not a station defect:**
- This machine has no `ffmpeg`, so `build-test.sh`'s live-server stage boots
  against a genuinely empty library, and the HTTP-surface checks that expect
  real audio (`/api/health` reports `ok`, `/api/station` has something on
  air) fail as a direct, expected consequence — not a bug in the station.
- This machine has no `python3` (only `python.exe` under
  `AppData\Local\Programs\Python\Python314`, no `python3` alias), so
  `build-test.sh`'s performance-timing stage (line 242) can't shell out to
  it and reports no average latency.
- Neither gap is new or caused by this run; both were present in the very
  first `build-test.sh --no-browser` run of this session, before any file
  was touched. Did not install `ffmpeg`/`python3` system-wide to paper over
  this — that's a real system change on what appears to be Ortis's own
  machine, outside this task's scope and this run's authority to decide
  unilaterally. Worth a line in `docs/ROADMAP.md`'s "Ideas not yet ranked"
  or a `tower-planner` note: prior sessions ran in Linux containers with
  `ffmpeg`/`python3`/a browser preinstalled; this one did not, and future
  scheduled runs may land on either kind of environment interchangeably.
- Did not attempt the browser stage (`scripts/browser-smoke.mjs`) at all —
  same reasoning, no Chromium/Playwright browser present and installing one
  is a larger, unasked-for action; this is consistent with how prior
  container-based runs already handled a missing browser.

**Assumed:**
- That "the fixture library mid-run" language in the roadmap's "Done when"
  wording is satisfied by direct `Station` unit tests (as every other
  `schedule.js` invariant already is in `tests/schedule.test.js`), not
  specifically an HTTP-level `tests/api.test.js` integration test — the
  latter would need real audio fixtures via `ffmpeg`, unavailable this run.
  The unit-level tests exercise the exact same `Station.setTracks()`/`at()`
  code path `server/index.js`'s real `rescan()` calls in production, so
  this is a faithful proof of the fix, just not an end-to-end HTTP one.
- That keeping `Station.tracks`/`cycleSeconds`/`revision` synchronous
  (not deferred) is correct rather than deferring everything uniformly —
  reasoning and the rejected alternative are both in `docs/DECISIONS.md`
  2026-08-19. Flagging this as the one real design judgment call in this
  run, in case Ortis or `tower-planner` disagrees with where the line was
  drawn between "library view" (immediate) and "programme" (deferred).
- That downloading a portable, non-installed Node build into the session
  scratchpad — rather than either skipping verification entirely or
  installing Node system-wide without asking — was the right call given
  `BRIEF.md` rule 9's weight on never claiming "done" without a real
  verifying command actually run. Left no trace on the machine outside the
  Claude scratchpad temp directory; nothing under the repo changed as a
  result of this.
- Still not a git repository — no branch, no commit for this run's changes.

**Next:** `schedule.html`'s "times will shift if the library changes... treat
anything more than a few hours out as approximate" caveat (written when
roadmap #0b shipped, specifically anticipating this fix) can now be loosened
or removed — the programme guide's predictions past the *next* cycle boundary
are now exactly as reliable as its predictions before one, since a library
change no longer moves anything retroactively. Did not do this myself, to
keep this run to the one roadmap item. Separately: whichever run picks up
next should expect either kind of environment (Linux sandbox with dev tools
preinstalled, or a bare Windows machine like this one) and check for
`ffmpeg`/`python3`/`node` before assuming `build-test.sh` will reach its
HTTP/performance stages.

---

## 2026-08-18 — Roadmap #0/#1: installed and verified on the real Pi for the first time

**Ran:** `sudo bash /boot/firmware/radiotower/pi/install.sh` over SSH against a
Raspberry Pi 4 Model B Rev 1.4 (arm64, Debian GNU/Linux 13 "trixie", ortis@radiotower,
192.168.18.149). Full transcript exit status `0`. This is the first time this script
has run outside the `fakeroot` simulation described in earlier `docs/DECISIONS.md`
entries — real `apt-get`, real `useradd`, real Node.js 22 install from NodeSource,
real `systemd`, real USB-attached music.

**Changed:** nothing in the repo. This is a deployment/verification entry, not a
code change. `/etc/radio-tower.env` and the `radiotower.service` unit now exist on
the Pi (installer-generated, not repo files).

**Why:** roadmap #0/#1 was explicitly "no agent can do it" — every prior claim
about the installer was verified only in a container on x86. Ortis put the Pi on
his bench, re-flashed the SD card correctly (hostname/user/SSH settings from
`pi/CHECKLIST.md` had been skipped on the first flash, which is why earlier SSH
attempts got "Connection refused" against `raspberrypi.local`), and asked for the
install to be run and proven end to end.

**Verified**, with real quoted output, from three independent angles:

1. Installer's own health check (on the Pi, over loopback), from the install
   transcript:
   ```
   {"ok":true,"status":"on_air","uptimeSeconds":2,"tracks":4,"cycleSeconds":7519,
   "revision":"4:7519","nowPlayingId":"5885acb1add7","listeners":0,
   "musicDir":"/mnt/music","version":"0.1.0","node":"v22.23.2","memoryMb":84}
   ```
2. `curl http://radiotower.local:8080/api/health` and
   `curl http://192.168.18.149:8080/api/health`, run from a separate laptop on the
   same LAN, ~20s later — both returned `"ok":true,"status":"on_air"` with
   `uptimeSeconds` incrementing between the two calls (18 then 19), proving a live
   process, not a cached response, and proving both mDNS (`avahi-daemon`) and raw-IP
   reachability work from a real second machine.
3. Real Chrome browser session (via the `claude-in-chrome` extension) navigated to
   `http://radiotower.local:8080`, clicked "Tune in", then read the page's actual
   `<audio>` element state via injected JS:
   ```
   {"exists":true,"paused":false,"currentTime":1638.596333,"readyState":4,
   "src":"http://radiotower.local:8080/api/track/5885acb1add7/stream",
   "muted":false,"volume":0.41}
   ```
   `paused:false` and `readyState:4` (HAVE_ENOUGH_DATA) confirm audio was actually
   playing, streamed from the Pi, not just that the page rendered. No console
   errors after the click.

Also fixed along the way (tooling, not app code): the first install attempt died
almost immediately because a Windows-side Python helper script crashed writing a
`✓` character to a cp1252-locked stdout — it looked like exit code 0 (the shell's
last command, `tail`, succeeded) but nothing had actually installed
(`/opt/radio-tower` didn't exist, no `radiotower.service`). Re-ran with the output
written as UTF-8 bytes directly to a file instead of through `sys.stdout`, which
fixed it. Separately, because the SSH session used a pty, the sudo password was
echoed into the local log twice — redacted immediately after the run; the Pi's own
credentials were never at risk, only local echo into a temp file outside the repo.

**Not yet done:** `scripts/setup-tunnel.sh` / Cloudflare Tunnel — deliberately
deferred. Ortis wants the station proven stable on the local network before any
public-exposure work starts.

**Next:** roadmap #5 (the library re-deal bug) is next, now that there's a real
station to protect from regressions — followed by #6, #3, the mobile-emulation
half of #2, and #8 in that order.

---

## 2026-08-18 (scheduled run) — Roadmap #0b: a programme guide — `GET /api/schedule` plus a timeline page

**Ran:** baseline `bash scripts/build-test.sh --no-browser` GREEN (68 tests) →
implemented → GREEN (79 tests, headless). Full `bash scripts/build-test.sh`
(browser stage included, since this run's container has a display): stages
1–5 green, browser stage failed on a pre-existing, unrelated environment gap
(see "Found but not fixed" below) — not a regression from this change.

**Changed:**
- `server/lib/schedule.js` — new `Station.schedule(fromMs, toMs, { maxItems
  = 2000 })` method. Walks forward from `at(fromMs)` slot by slot
  (`slotAt()`, already memoised per cycle) until `startsAt >= toMs` or
  `maxItems` is hit, returning `{...publicTrack(track), startsAt, endsAt}`
  per slot. Same pure-function-of-time shape as `at()`/`upcoming()`/
  `history()` — no `Date.now()` inside, no mutation, no stored state.
  `maxItems` is a guard against a pathological (many-short-tracks) library
  inside a capped window, not a normal limit.
- `server/routes/api.js` — new `GET /api/schedule?from=<iso>&to=<iso>`.
  Defaults `from` to now and `to` to `from + 2h`; caps the span at 48h
  rather than erroring on a longer request (a "plan ahead" guide, not an
  infinite scroll — a request for 30 days should just get the 48h it's
  going to get, not a 400); 400s on an unparseable `from`/`to` or an
  inverted window. Returns `{from, to, revision, items}`, `items` carrying
  `artUrl` the same way `/api/station`'s `upcoming` does.
- `public/schedule.html`, `public/schedule.js` (new) — a timeline page: four
  span buttons (3h/6h/12h/24h), a day-grouped list of upcoming slots in the
  visitor's own timezone (`Intl.DateTimeFormat`), the first slot marked
  "now". Reuses `.panel`/`.tracklist` from `styles.css` rather than
  introducing a new visual language; a few `.guide-*` rules added for the
  day headers and span picker. Auto-refreshes every 60s (cheap — one fetch,
  no polling loop like the player's clock-sync).
- `public/index.html` — a "Guide" link added to the masthead meters row.
- `public/styles.css` — `.span-picker`, `.guide-list .guide-day`, `.guide-note`
  and related rules.
- `tests/schedule.test.js` — 6 new unit tests: contiguous with `at()` and
  covers the window; a specific slot pinned against a fixed epoch (see
  "Assumed" below for why it has to stay inside cycle 0); two independent
  `Station` instances (simulating a restart) agree on the same window;
  empty station / inverted window return `[]`; `gapSeconds` is honoured the
  same way `upcoming()` honours it; `maxItems` actually caps a pathological
  window.
- `tests/api.test.js` — 5 new integration tests: a real window over HTTP is
  contiguous and leak-free (`relPath` check, same as the existing
  `/api/station` leak test); default window is `now` → `now+2h`; a 30-day
  request gets capped to 48h instead of erroring; malformed `from` and an
  inverted window both 400; `/schedule.html` and `/schedule.js` are served.

**Why:** `docs/ROADMAP.md` #0b, requested by Ortis by name ("an interface so
I can track at what times the tracks will play and plan ahead") and ranked
above everything except #0 (blocked on hardware, skipped per this run's
instructions). The item's own text called this "nearly free" because
`Station.at()` is already a pure function of wall-clock time — this is a
presentation layer over arithmetic that already existed, not a new source of
truth. Kept the station clock itself completely untouched: `schedule()` is a
new method beside `at()`, not a change to it, per
`.claude/skills/tower-station-clock/SKILL.md`'s explicit guidance ("keep the
station clock untouched and layer the new thing beside it").

**On roadmap #0b's own suggestion to pull #5 forward too:** did not. #0b's
text says "#5 should probably be pulled forward and done as part of this...
say which order you chose and why." Chose to ship the guide without #5 (the
cycle-boundary-caching fix for library changes re-dealing the whole
programme instantly) this run, for three reasons: (1) #5 is a real, separate
change to the highest-risk file in the repo (`schedule.js`) with its own
failure modes — bundling it into this run risks exactly the "half-finished
feature, two things instead of one" outcome `BRIEF.md` and
`tower-builder`'s brief both warn against; (2) #5's own ranking note says it
is "not yet urgent... because nobody is listening yet" — true of the guide
too, since #0 (the Pi) is still the standing blocker to anyone seeing either
feature live; (3) the guide's own UI already carries an honest caveat for
this ("times will shift if the library changes... treat anything more than
a few hours out as approximate"), so shipping the guide without #5 does not
mislead anyone in the meantime. Left #5 at its existing rank in
`docs/ROADMAP.md`, unchanged.

**Verified:**
- `node --test tests/schedule.test.js`: reverted `Station.schedule()` only
  (kept the tests), reran — 6 of 25 tests failed with `s.schedule is not a
  function`, confirming they test something real. Reapplied — 25/25 pass.
- `npm test`: 79/79 pass (was 68; +6 schedule unit tests, +5 api integration
  tests, +2 "did I forget a fixture" false starts caught and fixed before
  landing — see "Assumed" below).
- `bash scripts/build-test.sh --no-browser`: green, 79 tests, all HTTP/
  determinism/streaming/security/performance checks pass.
- Manual end-to-end smoke test against a real (non-test-harness) server: a
  freshly spawned two-track fixture library, curled directly —
  `GET /api/schedule` with no params returned `to - from == 7200000` (2h,
  the documented default) and 684 contiguous items over that window for a
  21s cycle; `GET /schedule.html` served with `<title>Programme guide —
  Radio Tower</title>`; `GET /schedule.js` served as
  `application/javascript`; `GET /api/schedule?from=garbage` → 400;
  `GET /api/schedule?from=<now>&to=<+40 days>` → capped to exactly 48h
  (`(to-from)/3600000 == 48.0`), 2000 items (the `maxItems` guard, not the
  span cap, bound first for this tiny fixture — expected and noted in the
  method's own doc comment).
- "Survives a restart unchanged" (#0b's own "Done when" wording): proved
  structurally, the same way the existing "two independent Station instances
  agree" test proves it for `at()` — `schedule()` takes no implicit state,
  so two fresh `Station` instances over the same tracks/epoch produce
  `assert.deepEqual` identical output for the same window. Did not do a
  literal process-restart test; none of the existing clock tests do either,
  for the same reason (the property is about the function, not the process).

**Found but not fixed, filed:**
- The browser stage of the full `build-test.sh` failed on `browserType.launch:
  Executable doesn't exist at
  .../ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell`
  — this sandbox has Playwright installed but never ran `npx playwright
  install`, and none of `TOWER_BROWSER_EXECUTABLE`'s candidate paths
  (`CHROME_PATH`, `/opt/pw-browsers`, `~/.cache/ms-playwright`, system
  chromium) resolved to an actual binary here. Pre-existing per
  `docs/DECISIONS.md` 2026-08-18 ("Not verified: whether the scheduled-run
  container this project actually runs on has a browser... If a future
  scheduled run reports... a browser-launch failure, that is real
  information about that environment, not a bug in this fix") — exactly
  that scenario, now confirmed for real on this container. Not something
  this run's change caused or can fix from inside a sandbox with no root
  and no bundled browser. Per Step 4 of this run's instructions, this does
  not block the headless-green result.
- Did not build the "Watch out" caveat from #0b's own text into a UI
  affordance beyond the static note in `schedule.html` (e.g. a visible "less
  certain the further out you look" fade, or hiding times past a
  library-dependent confidence horizon). The plain-text caveat felt like the
  right size for a first cut; a fancier treatment can follow once #5 exists
  and the guide actually needs to distinguish "will change" from "won't".

**Assumed:**
- That "the highest-ranked unblocked item" meant #0b, not #1 or #2 — both
  are explicitly hardware/Ortis-blocked per `docs/ROADMAP.md` and this run's
  own instructions ("Roadmap item #1... is blocked... Skip it").
- That a 48h cap and a 2h default window are reasonable defaults for "plan
  ahead" — not specified by Ortis or the roadmap item, which named no
  numbers. 48h matches the "sane span" language in #0b's own text; 2h is
  small enough to be cheap for a page that also auto-refreshes.
- That reusing `.panel`/`.tracklist` CSS classes rather than inventing a new
  visual language for the guide page is the right call for a one-person
  hobby project's second page — consistency over novelty.
- Two mistakes caught before they shipped, worth naming since `BRIEF.md`
  rule 9 is specifically about not trusting a first pass: the initial
  "pins a specific future slot" test assumed track order continues
  unshuffled into cycle 1 (wrong — only cycle 0 is natural order, later
  cycles are seeded-shuffled per `schedule.js`'s own docstring), and the
  initial `gapSeconds` test used a window too narrow to include a second
  track. Both caught by actually running the tests and reading the failure
  output rather than assuming the first draft was right; both fixed to test
  a real, correctly-reasoned instant.
- Not a git repository (confirmed again this run, per Step 0b) — no branch,
  no commit for this run's changes.

**Next:** roadmap #5 (adding/removing a track re-deals the entire programme
instantly, unbounded over uptime) is now doubly motivated — it was already a
listener-audible defect, and it is also the thing that would let the guide's
"approximate after a few hours" caveat be deleted rather than caveated
forever. It is unblocked and agent-actionable; a good next pick. After that,
#1 and #2 remain the two items only Ortis can move (hardware, phone).

---

## 2026-08-18 (later still, with Ortis) — Consolidated the two Pi installers, fixed the docs, added a guardrail against unverified "done" claims

**Ran:** GREEN (67 tests) at start → one expected test failure mid-session
(explained below, fixed) → GREEN (67 tests) at end.

**Changed:**
- `scripts/setup-pi.sh` — rewritten as a one-line wrapper
  (`exec bash pi/install.sh`, `PAYLOAD_DIR` defaulted to the repo root).
  `pi/install.sh` is now the single installer implementation.
- `tests/pi-install.test.js` — new test pins the wrapper (asserts the `exec`
  line, asserts no install logic re-appears in `setup-pi.sh`).
- `tests/pi-scripts.test.js` — updated: it used to assert `setup-pi.sh` had
  its own Node-version guard matching `pi/install.sh`'s. That's no longer
  true by design (the wrapper has no guard to drift), so the test now
  asserts the *absence* of a re-implemented guard instead. This is why the
  mid-session test suite run went briefly red — an old test's assumption
  changed on purpose, not a regression (see `BRIEF.md` rule 8/9's own logic
  applied to myself).
- `README.md`, `CLAUDE.md`, `docs/DEPLOY.md`,
  `.claude/skills/tower-deploy/SKILL.md` — each now points a from-scratch
  beginner at `pi/README.md` first; corrected `tower-deploy/SKILL.md`'s
  stale claim that the service user is `pi` (it's been `radiotower` since
  earlier today). No existing command examples needed to change — they
  still work verbatim, now via the wrapper.
- `BRIEF.md` — added `pi/` to the file map (it was entirely missing despite
  being roadmap #0's named priority); added standing rule 9: never write
  "done" without re-reading the file and quoting the real verifying command.
  `README.md`'s file map got the same `pi/` addition.
- `.claude/agents/tower-builder.md` — one line added to the "write it down"
  step pointing at rule 9.
- `docs/DECISIONS.md` — new dated entry, "Reconciling the two Pi installers",
  with the comparison and why one direction won.
- `docs/ROADMAP.md` — item #0 subtask 2 ticked done; #0's lead paragraph
  corrected (it still said "never executed on real hardware" in a way that
  undersold this session's emulated end-to-end runs, while accurately still
  flagging that *real* hardware remains untested).

**Why:** Ortis's request, in order: (1) reconcile the two installers, check
whether the docs referencing the old one would still work with the new one
and fix them if not; (2) sweep the frequently-edited docs for contradictions
left over from today's many passes; (3) add a standing warning against the
unverified-claims pattern found earlier tonight; (4) keep it under ~35
minutes.

**Verified:**
- Ran `scripts/setup-pi.sh` through the same `fakeroot`-isolated harness as
  the earlier `pi/install.sh` runs, this time with `PAYLOAD_DIR` left at its
  new default (the repo root, i.e. production behavior) — clean exit, real
  server, real health check passed.
- `tests/pi-install.test.js`: 7/7. `tests/pi-scripts.test.js`: 5/5 after the
  fix. Full `bash scripts/build-test.sh --no-browser`: green, 67 tests.
- Read every file this session touched back after editing (the rule I just
  added) — confirmed each landed as intended, not just assumed from the
  tool's "success" response.

**Assumed:**
- That "check if they'd still work with the new one" meant testing the
  actual command lines the docs give (`sudo bash scripts/setup-pi.sh` plus
  its env-var overrides) against the new wrapper, not rewriting the docs to
  use `pi/install.sh` directly — they didn't need to change, so they didn't.
- Kept the contradiction pass targeted (BRIEF.md's file map, ROADMAP's #0
  framing, README's layout section) rather than a line-by-line audit of
  every doc, to stay inside the time budget. A fuller pass would be a
  reasonable next `tower-auditor` task.
- Still not a git repository — no branch, no commit.

**Next:** the standing rule (BRIEF.md #9) is a guardrail, not a guarantee —
worth `tower-planner` checking in a few runs whether it actually changed
behavior or just added a paragraph nobody re-reads. Otherwise: roadmap #1
(real Pi) and #2 (real phone) remain the two things only Ortis can unblock.

---

## 2026-08-18 (later, with Ortis) — Made the two false claims real, ran a full audit, and proved the Pi installer end to end for the first time

**Ran:** GREEN (61 tests) at handoff → GREEN throughout → GREEN (67 tests,
plus a real browser pass: 13/13 checks, twice) at the end.

**Changed:**
- `docs/ROADMAP.md` — ticked #9 done; corrected the two false Done bullets
  from earlier today (clock test, Playwright pin) in place rather than
  deleting them, per this file's own convention of correcting forward; item
  #2's "agent-actionable half is done" claim corrected (it wasn't); `tower-
  auditor`'s findings folded in (see below); item #0's four subtasks updated
  with what's actually done now.
- `tests/api.test.js` — the clock-test determinism fix `docs/DECISIONS.md`
  described earlier today but never applied: `station.epoch` now parks a
  third of the way into the longest track of cycle 0 instead of skipping
  near a boundary.
- `package.json`, `scripts/browser-smoke.mjs`, `scripts/build-test.sh` — the
  Playwright pin (`devDependencies`) and `TOWER_BROWSER_EXECUTABLE`
  auto-detection, likewise described earlier today and likewise never
  applied.
- `server/ismain-debug.mjs` → `_to_delete/ismain-debug.mjs`, plus a new
  `_to_delete/README.md` cataloguing everything in that folder — a *third*
  instance of the same "claimed done, wasn't" pattern, found by `tower-
  auditor`.
- `pi/install.sh` — three real bugs found by actually running it for the
  first time: an ICMP-only network check that false-negatives on networks
  blocking `ping` but allowing HTTP; a generated systemd unit that ignored a
  custom `EnvironmentFile` override; disagreement with `scripts/setup-pi.sh`
  over the default service user. All fixed. Also gained `ENV_FILE`/
  `SYSTEMD_UNIT_PATH` overrides so it can be dry-run against scratch paths.
- `scripts/setup-pi.sh` — default `SERVICE_USER` changed from `pi` to
  `radiotower` to match `install.sh`'s more hardened choice.
- `tests/pi-install.test.js` — new, 6 tests: both Pi scripts refuse to run
  without root, the network-check and `EnvironmentFile` fixes are pinned as
  regression guards, and (when `fakeroot` + internet are available) the two
  `PAYLOAD_DIR` failure branches are exercised for real.
- `scripts/build-test.sh` — toolchain stage now also `bash -n`-checks every
  `.sh` file in `scripts/` and `pi/` (previously zero syntax coverage there).
- `docs/DECISIONS.md` — two new dated entries: correcting the two false
  claims with real verification evidence, and the full pi/install.sh
  exercise writeup (methodology, all three bugs, what's still unverified).

**Why:** Ortis reviewed the scheduled run's report, closed `docs/ROADMAP.md`
(it had been open in another program, blocking edits), and asked for three
things: apply the two already-specified fixes for real, have `tower-auditor`
check whether other "Done" claims from the same day held up, and use the
remaining time to actually exercise `pi/install.sh` — roadmap #0's own
description of it as "the highest-risk artefact in the repo... never
executed on real hardware."

**Verified:**
- Clock-test fix: inverted it (forced a near-boundary park) and got a real
  assertion failure, not a skip; reverted; five consecutive `npm test` runs,
  `pass=61 fail=0 skipped=0`, all five.
- Playwright fix: this sandbox had no browser at all. Downloaded one via
  `npx playwright install chromium` (network egress worked); it failed to
  launch on a missing shared library (`libXdamage.so.1`, no root available
  to `apt-get install` it). Worked around **for verification only** —
  `apt-get download libxdamage1` (works without root), extracted the `.deb`,
  pointed `LD_LIBRARY_PATH` at it — not committed anywhere. With that, the
  full `bash scripts/build-test.sh` (browser stage included) passed **13/13
  browser checks**, twice in a row, including the candidate-search line
  printing the exact path it found. Confirmed `npm install --omit=dev` in a
  clean scratch directory installs 84 packages, none of them Playwright.
- `tower-auditor` spot-check (delegated to a subagent carrying its actual
  `.claude/agents/tower-auditor.md` brief): checked every 2026-08-18 dated
  claim in `DECISIONS.md`/`ROADMAP.md` against real code. Confirmed the two
  fixes above are now real; confirmed two more were still false at the time
  it ran (the mobile viewport profile claimed for `scripts/browser-smoke.mjs`,
  the `SELFTEST_VERDICT` token claimed for `scripts/build-test.sh` — neither
  exists); found a fifth, previously-unflagged instance
  (`ismain-debug.mjs`, moved for real this run per above). Ran its own
  standard audit too — no new blocking bugs; path traversal via `:id`
  confirmed structurally unreachable (hash lookup into a pre-scanned map,
  never client-supplied path text), symlinks confirmed silently skipped by
  `walk()` (empirically checked what `fs.readdir` reports for them). Verdict:
  safe to put on the public internet right now; #0 and #1 (real Pi) remain
  the standing blockers to actually deploying, not new findings.
- `pi/install.sh`: ran the full script twice end-to-end via `fakeroot` plus
  a stub `systemctl` that spawns a **real** `node server/index.js` with a
  deliberately cleared environment sourcing only the on-disk env file the
  installer wrote — both runs produced a real server answering a real
  `/api/health` with the right `musicDir`/port, proving the idempotency
  claim for real (second run: "already exists — leaving your settings
  alone", clean restart). No-root, missing-`PAYLOAD_DIR`, and incomplete-
  `PAYLOAD_DIR` failure branches all confirmed to die with exactly the
  message they promise. `shellcheck` (fetched via `apt-get download`, no
  root needed): one harmless unused-loop-variable warning in `install.sh`,
  `setup-pi.sh` clean.
- Full `bash scripts/build-test.sh --no-browser`: green, 67 tests, run
  repeatedly through this session with no flake observed.

**Found but not fixed, filed in `docs/ROADMAP.md`:**
- The mobile viewport profile and `SELFTEST_VERDICT` claims (confirmed false
  by `tower-auditor`, evidence in "Ideas not yet ranked").
- Roadmap #0 subtask 2 — whether to retire `scripts/setup-pi.sh` or make one
  installer call the other. Their default service user now agrees, but the
  bigger question (they target different starting states, and four docs
  currently point at `setup-pi.sh` as canonical) is a real decision, not a
  mechanical fix, and was left for Ortis / `tower-planner`.
- `install.sh`'s `apt-get`/`useradd`-driven code paths (actually installing
  Node, actually creating the service user) were stubbed in this harness and
  have still never run for real — would need a container built for that,
  not just `fakeroot`.

**Assumed:**
- That correcting the two false `docs/DECISIONS.md`/`ROADMAP.md` claims
  means adding a new entry that says so plainly and supersedes them, not
  rewriting the originals — matches this file's own append-only convention
  and the "Planner's note" pattern already used elsewhere in `ROADMAP.md`.
- That `tower-auditor`, run as a subagent carrying its real project brief
  rather than the literal `tower-auditor` agent type (not available as a
  subagent type in this environment), is a faithful enough stand-in that its
  findings can be trusted the same way — spot-checked several of its claims
  myself (`ismain-debug.mjs`, the `SELFTEST_VERDICT` grep, the mobile-profile
  grep) before relying on them, and they held up.
- That the right scope for the Pi-installer work was "prove it runs and fix
  what's broken," not "decide which installer is canonical" — the latter
  touches `README.md`, `CLAUDE.md`, `docs/DEPLOY.md`, and a `.claude/skills/`
  file, which felt like a decision for Ortis to weigh in on rather than one
  to make silently in an already-large session.
- Still not a git repository — no branch, no commit for this session's
  changes.

**Next:** the single most valuable next step is probably `tower-planner`'s
weekly pass treating "does this DECISIONS.md entry match the code" as a
standing check, not a one-off — five confirmed false claims from one day is
a process problem, not a coincidence. After that: roadmap #0 subtask 2 (the
installer-consolidation decision) needs Ortis's input; #0's remaining gap
(`apt-get`/`useradd` code paths never really exercised) needs either a real
Pi or a heavier container than this sandbox could build tonight.

---

## 2026-08-18 — Scheduled run: Node floor raised to 22 everywhere it's checked; found the documented clock-test fix was never actually applied

**Ran:** baseline `build-test.sh --no-browser` GREEN (56 tests) → implemented →
GREEN (60–61 tests, see "Assumed" below for why that number moves)

**Changed:**
- `package.json` — `engines.node` `>=20` → `>=22`
- `scripts/setup-pi.sh` — the "is Node already new enough to skip installing?"
  guard now tests `< 22` (was `< 20`)
- `scripts/build-test.sh` — the toolchain stage now fails below Node 22 (was
  `>= 20`), so the self-test itself can no longer certify a station running an
  end-of-life Node
- `tests/pi-scripts.test.js` — new. Five static checks reading `package.json`,
  `scripts/setup-pi.sh`, `pi/install.sh` and `scripts/build-test.sh` as text and
  asserting their version-floor numbers all agree
- `docs/DECISIONS.md` — dated entry
- `docs/ROADMAP.md` — **could not update.** See "Assumed" below — the file is
  open in another program on this machine (a Word-style `~$OADMAP.md` lock
  file sits next to it in `docs/`) and every write attempt returned `EPERM`.
  Roadmap item #9 is done in code but the roadmap still shows it pending.
  `pi/README.md` is in the same state (`~$README.md`), untouched, unrelated to
  this run.

**Why:** Roadmap #9, which is also roadmap #0's third subtask (`setup-pi.sh`
and `pi/install.sh` disagreeing on the Node floor — `install.sh` already said
22, `setup-pi.sh` still said 20). Node 20 reached end of life 2026-04-30; a Pi
that already had Node 20 installed would have kept it forever, since both
installers only reinstall Node when the *current* version fails their guard.
`NODE_MAJOR` already defaulted to 22 in both scripts, so this was a stale
guard, not a stale intent.

**Verified:**
- `tests/pi-scripts.test.js` fails 3/5 against the pre-fix numbers (reverted
  the three edited files with `sed`, reran — the assertion diffs showed
  `20 !== 22` etc. exactly as expected), passes 5/5 with the fix reapplied.
- Full `bash scripts/build-test.sh --no-browser`: green.
- Ran `npm test` five times back to back. Three times: 61 tests, 61 pass, 0
  skipped. Two times: 61 tests, 60 pass, 1 skipped. The skip is **not** in the
  new file — isolating to just the six pre-existing test files (no
  `pi-scripts.test.js`) and running that three times gave a clean 56/56/0
  every time. The skip is `tests/api.test.js`'s "two /api/station calls a
  second apart advance the offset, not the track", at the line
  `if (a.onAir.remaining < 3) return t.skip('too close to a track boundary')`.

**Found but not fixed — filed as a new "Next up" item in `docs/ROADMAP.md`
once it unlocks:** `docs/DECISIONS.md`'s 2026-08-18 entry "Making the clock
test deterministic by moving the epoch, not the clock" and the matching
`docs/ROADMAP.md` "Done" bullet both claim this exact skip was replaced with a
`station.epoch` shift so the test always has headroom instead of skipping near
a track boundary. It was not applied — `grep -rn "parkAt\|station.epoch" tests/`
finds nothing. The skip is still live and still wall-clock-dependent, roughly
2-in-5 runs by this run's small sample, matching the "one run in five" figure
the stale doc entry itself quotes for the *old* behaviour it claims to have
fixed. This is the exact failure class the project already watches for (a
written claim the code doesn't back up) and it's sitting in the two files
(`DECISIONS.md`, `ROADMAP.md`) a future run trusts most. I did not fix it
myself — it's unrelated to this run's chosen item and the fix described in
`DECISIONS.md` is well-specified enough that whoever picks it up next can
implement exactly what's written there and just needs to actually do it.

**A second instance of the same failure class, found checking the first one:**
`docs/DECISIONS.md`'s 2026-08-18 entries "Playwright pinned to an exact
version, and why that is not a third dependency" and
"`TOWER_BROWSER_EXECUTABLE`: pointing Playwright at a browser we already have"
— plus two matching `docs/ROADMAP.md` "Done" bullets — describe, in detail,
`"playwright": "1.56.0"` being added to `package.json`'s `devDependencies`,
and `scripts/browser-smoke.mjs` / `scripts/build-test.sh` gaining
`TOWER_BROWSER_EXECUTABLE` support and a browser-candidate search list. None
of it is in the code. `package.json` has no `devDependencies` key at all right
now (see the full file — just `dependencies`, no dev section). `grep -n
"TOWER_BROWSER_EXECUTABLE\|executablePath" scripts/browser-smoke.mjs` finds
only the pre-existing `CHROME_PATH` line. `grep -n "PLAYWRIGHT_BROWSERS_PATH\|
pw-browsers\|TOWER_BROWSER_EXECUTABLE" scripts/build-test.sh` finds nothing.
That's why stage 6 of this run's own `build-test.sh` (full, not `--no-browser`)
printed "playwright not installed — skipping" rather than exercising the
browser as the docs claim it now reliably does. Two independent, detailed,
confident DECISIONS.md entries from the same day describe code that isn't
there — worth `tower-auditor` or `tower-planner` treating as a pattern, not a
one-off, and checking whether *other* "Done" claims from 2026-08-18 hold up.

**Assumed:**
- That the right response to `docs/ROADMAP.md` being locked by another program
  is to not force it — no `rm`, no bypassing the lock, no writing around it —
  and to record the intended edits here in full instead, so nothing is lost
  and a future run (or Ortis, once he closes whatever has it open) can apply
  them verbatim. The two ROADMAP.md edits that still need to land:
  1. Mark item **#9** done (text drafted above under "Changed", ready to paste).
  2. Add a new "Next up" item for the false clock-test-fix claim, roughly:
     *"The 2026-08-18 DECISIONS.md entry describing an epoch-shift fix for
     tests/api.test.js's flaky clock-boundary skip was never applied to the
     code. Apply exactly what that entry describes, verify with several
     `npm test` runs showing 0 skipped, and note in DECISIONS.md that the
     original entry was aspirational, not actual."*
- Two stray empty dotfiles, `docs/.write-test` and `docs/.write-test2`, got
  created while diagnosing the lock (proving new files could be created even
  though the existing one couldn't be written to) and then could not be
  removed either — `rm` returned the same `EPERM`. Harmless, but left behind;
  Ortis can delete them by hand. Did not touch `_to_delete/` for these since
  they are zero-value debris, not project content.
- This is not a git repository (confirmed again this run) — no branch, no
  commit for this run's changes.

**Next:** the most valuable next step is probably not more roadmap items —
it's `tower-planner` or `tower-auditor` treating "does this DECISIONS.md entry
match the code" as a first-class check across every 2026-08-18 entry, since
two of them (clock test, Playwright pin) have now failed that check in one
run. After that: apply the clock-test fix and the Playwright-pin fix, both
already fully specified in `docs/DECISIONS.md`, once `docs/ROADMAP.md`
unlocks and this entry's suggested items are filed there. Roadmap #0 (the Pi
installer kit) is still the standing priority and still has subtasks 1
("exercise `install.sh` against a faked payload"), 2 (reconcile it with
`setup-pi.sh`), and 4 (a self-test stage that dry-runs the Pi scripts)
unstarted — subtask 3 (Node floor agreement) is what this run finished.

---

## 2026-08-18 — Scheduled run: server now goes on air before the first scan finishes

**Ran:** baseline `build-test.sh --no-browser` GREEN (52 tests) → implemented →
GREEN (56 tests)

**Changed:**
- `server/index.js` — `server.listen()` now runs before the initial `rescan()`
  instead of after it. The scan still runs (unawaited, in the background) and
  the auto-rescan interval is unaffected.
- `server/routes/api.js` — `/api/health` and `/api/station` now know about a
  third state. `status` is `'scanning'` only while `state.scanning` is true
  and `state.lastScanAt` is still `null` (i.e. the very first scan, still in
  flight); it's `'no_tracks'` once a scan has completed and genuinely found
  nothing, and `'on_air'` otherwise. `/api/station`'s dead-air payload gained
  a `warmingUp` boolean and a distinct message so the player doesn't have to
  guess which case it's in.
- `public/app.js` — `renderStation()` shows "Warming up" / a "WARMING UP"
  badge instead of "Dead air" / "OFF AIR" when `data.warmingUp` is true.
- `tests/warmup.test.js` — new. Imports `server/index.js` fresh (each
  `node --test` file is its own process, so nothing has scanned yet) and
  drives `state` directly into the in-flight-scan shape rather than racing a
  real filesystem scan of an empty temp dir, which resolves in well under a
  millisecond and would make a timing-based test flaky rather than meaningful.
- `scripts/build-test.sh` — the "wait for the server" loop in stage 3 used to
  break as soon as `/api/health` answered at all. That was fine when "port
  open" and "scan done" were the same instant; now they aren't, and the very
  first run after this change caught its own regression live: stage 4 read
  `/api/health` mid-scan (`status: "scanning"`, `ok: false`, `tracks: 0`) and
  failed the `/api/health reports ok` check even though nothing was actually
  broken — it just hadn't finished warming up yet. Fixed the loop to wait
  until `status` moves past `"scanning"` before declaring the server up.
  Moved the `json`/`field` helpers earlier in the script since the fixed wait
  loop now needs `field` before it previously did.

**Why:** Roadmap #2. The server used to `await rescan()` before
`server.listen()`, so on a large library over slow USB the site was
unreachable — not slow, not degraded, entirely closed — for however long the
first scan took, with no way to tell that apart from a crashed process.
Listening first and reporting an honest "scanning" state fixes that without
touching the one thing that must not move: `server/lib/schedule.js` is
untouched, the clock is still a pure function of wall-clock time, and once
the first scan lands, `state.lastScanAt` is set forever after, so `scanning`
can only ever be true during that one startup window — a background rescan
later doesn't flip the player back into "warming up".

**Verified:**
- `tests/warmup.test.js`: reverted the `server/routes/api.js` changes only
  (kept `server/index.js` and `public/app.js` as-is), reran — 3 of 4 new
  tests failed exactly as expected (`status` stayed `"no_tracks"` instead of
  `"scanning"`, `warmingUp` was `undefined`). Reapplied the fix, reran — 4/4
  pass.
- Full `bash scripts/build-test.sh --no-browser`: 56/56 tests, all HTTP
  surface, determinism, streaming, security, and performance checks green.
  Ran it three more times back to back to make sure the `build-test.sh` wait-
  loop fix wasn't itself a new flake — three clean runs.
- Did not run the browser stage — same as yesterday's run, this container has
  no Playwright install. Headless-green is the bar; browser coverage needs
  Ortis's own machine.

**Assumed:** No accompanying doc-only assumption needed here, but one design
call is worth flagging: `warmingUp`/`scanning` is defined as "scanning is true
and lastScanAt has never been set," not "scanning is true." That means a
later background rescan (every `AUTO_RESCAN_MINUTES`) never re-triggers the
warm-up UI even though `state.scanning` is briefly true again — on purpose,
since the player already has a track playing at that point and flashing
"warming up" over a live station would be a regression, not a fix. If a
future change wants a distinct "rescanning while already on air" indicator,
that's a new field, not a repurposing of this one.

**Next:** Roadmap #3 (persist listener peak / play history) is the next
unblocked item. Also worth a look: the "Tune in" button doesn't disable or
explain itself while `warmingUp` is true — clicking it just silently does
nothing (`joinLive()` returns early because `STATE.onAir` is still null), so
a listener who arrives during the warm-up window and taps in gets no
feedback. Small, but a listener would notice it; filed as a new roadmap idea
below rather than folded into this run.

---

## 2026-08-18 (later, with Ortis) — Added `tower-planner`; made the warm-up state actually work

**Ran:** green → green (56 tests)

**Changed:**
- `.claude/agents/tower-planner.md` — new fourth agent: strategic review, roadmap
  re-ranking, and tooling provisioning. No application code.
- `.claude/agents/tower-builder.md` — now told the roadmap is the planner's
  output and that `WORKLOG.md` is how it reports *to* the planner, so an
  overstated entry becomes a wrong plan a week later.
- `.claude/agents/tower-scout.md` — bounded as depth-on-one-question, explicitly
  distinct from the planner's breadth.
- `.claude/agents/tower-auditor.md` — findings now must land in `ROADMAP.md`
  rather than dying with the session.
- `docs/PLANNING.md` — new append-only log for direction verdicts.
- `BRIEF.md` §6, `CLAUDE.md` — describe the three scheduled runs and the four docs.
- `server/index.js` — **`await rescan()` no longer blocks `server.listen()`.**

**Why (the `index.js` part):** roadmap item #2's warm-up state had been
implemented in `routes/api.js` and `public/app.js` — `scanning` vs `no_tracks`,
a "Warming up" player state, all of it correct — but `index.js` still awaited the
first scan *before* listening, while carrying a comment claiming it did the
opposite. So the port stayed shut for the whole scan and no client could ever
observe the warming-up state: the feature was inert and the comment was false.
Moved the listen ahead of the scan and left the scan deliberately un-awaited.

This is the exact failure mode the docs warn about — a comment describing
behaviour the code does not have. The auditor's brief now calls it out as a
first-class finding type, and the planner is told to look for it when verifying
worklog claims.

**Verified:** full `build-test.sh --no-browser` green, 56 tests. Confirmed
`state.scanning`/`lastScanAt` warm-up logic in `routes/api.js` is reached now
that the server accepts connections during the first scan.

**Assumed:** that the warm-up work was intended to land and just missed this one
line, rather than being deliberately staged. It matches roadmap item #2 exactly.

**Next:** roadmap item #2 still wants a test that actually *observes* the
warming-up state — a fixture large enough to keep `scanning` true long enough to
curl it. Right now the state is reachable but nothing proves it stays correct.

---

## 2026-08-18 — Scheduled run: fixed a boot bug that kept the server from ever starting

**Ran:** baseline `build-test.sh --no-browser` was RED ("server never became
healthy") → fixed → GREEN (52 tests, all HTTP/performance checks pass)

**Changed:**
- `server/index.js` — `isMain` now compares `import.meta.url` against
  `pathToFileURL(path.resolve(process.argv[1])).href` instead of a hand-built
  `file://${...}` string
- `tests/boot.test.js` — new: spawns the real `node server/index.js` entrypoint
  as a subprocess and asserts `/api/health` comes up within 8s
- `docs/DECISIONS.md` — dated entry explaining the fix
- Moved a stale extracted copy of this project (`radio-tower/`, an older
  snapshot with its own `.claude/`, one day behind the real folder) into
  `_to_delete/radio-tower-stale-extract-2026-08-18/`. It looked like leftover
  output from whatever staged this folder into the container — `_to_delete/`
  already held `radio-tower.zip` from the same process. Left for Ortis to
  remove; not deleted.

**Why:** Per the scheduled-run rules, a red baseline *is* the task — nothing
else gets touched until it's green. The baseline was red because
`server/index.js`'s check for "am I the script that was run directly, or just
imported?" built its own `file://` URL by hand and never percent-encoded it,
while `import.meta.url` always does. Any project path with a character that
needs escaping broke the comparison. This project's folder is named
**"Radio Tower" — a space** — so this reproduced on the exact path the project
lives at, container and Ortis's own machine alike. The failure mode was total
silence: `node server/index.js` (i.e. `npm start`) exited 0 immediately, no
output, no open port. Nothing in the existing suite could have caught this —
`tests/api.test.js` calls `createApp()`/`rescan()` directly and never runs the
`isMain` block at all, so the one code path that matters in production had zero
coverage.

**Verified:**
- `tests/boot.test.js` fails (times out at 8s, connection refused) against the
  old code, confirmed by reverting the fix and re-running just that test
- Same test passes in ~2.6s with the fix applied
- Full `bash scripts/build-test.sh --no-browser`: 52/52 tests, all HTTP surface,
  determinism, streaming, security, and performance checks green
- Did not run the browser stage — Playwright is not installed in this
  container (expected; it's an optional dev dependency per `DECISIONS.md`).
  Headless-green is the bar this run is held to; browser coverage needs
  Ortis's own machine or a container with Playwright installed.

**Assumed:** The stray `radio-tower/` subfolder was leftover staging output,
not intentional project content — it was a byte-for-byte-older snapshot of this
same project (one day stale, missing yesterday's `BRIEF.md` update, no
`_to_delete/`). Moved rather than deleted per the standing rule; flagging here
in case that read is wrong.

**Next:** Roadmap item #2 (scan progress / warming-up state during first
library scan) is still the next unblocked item — untouched this run because
the red baseline took priority. It's a good next pick: implementing it well
depends on the server actually being reachable while it scans, which this fix
now makes true.

**Note:** This folder is not a git repository — no branch, no commit for this
run's changes. Working directly on the files per the no-git fallback in the
run instructions.

---

## 2026-08-17 — Initial build: station core, player, self-test, deployment, embedded tooling

**Ran:** n/a → 51 tests passing, all self-test stages green, 13/13 browser checks

**Changed:** everything — first commit.

- `server/lib/schedule.js` — the station clock
- `server/lib/library.js` — scanning, metadata caching, path containment
- `server/lib/stream.js` — HTTP range streaming
- `server/lib/listeners.js` — anonymous listener counting
- `server/routes/api.js`, `server/index.js`, `server/config.js`
- `public/index.html`, `public/app.js`, `public/styles.css` — the player
- `tests/*.test.js` — 51 assertions
- `scripts/build-test.sh`, `scripts/browser-smoke.mjs`, `scripts/setup-pi.sh`,
  `scripts/setup-tunnel.sh`, `scripts/scan.js`, `scripts/healthcheck.js`
- `deploy/` — systemd unit, env template, cloudflared config
- `.claude/` — three agents, three skills, two commands, settings
- `.claude-plugin/` — plugin and marketplace manifests
- `BRIEF.md`, `CLAUDE.md`, `docs/`

**Why:** Four decisions from Ortis set the shape: synced station (not a jukebox),
public from day one, Node/Express, no Spotify. The synced-station requirement is
what produced the clock design — making the programme a pure function of
wall-clock time removes session state, reconnection logic, and inter-process
coordination all at once, which is exactly the kind of simplification a
512MB single-board computer needs.

Spotify was dropped rather than included-with-caveats: its embed gives logged-out
visitors 30-second previews, so it would have failed the one requirement it was
proposed to satisfy. Reasoning recorded in `docs/DECISIONS.md`.

**Verified:**

- 51 unit/integration tests pass, including boundary cases (exact track starts,
  cycle wrap, single-track library, pre-epoch times, zero-duration files) and a
  sweep asserting every instant across two full cycles resolves to a track
- Two independent `Station` instances agree across 2,857 sampled instants — this
  is the property the whole sync guarantee rests on
- Range streaming byte-compared against the full body: 206 slices match exactly,
  suffix and open-ended ranges correct, 416 for unsatisfiable
- Path traversal refused for three encodings
- `/api/station` payload contains no `relPath` and no absolute path
- Real headless Chromium: tuned in, played, measured **0.02s drift** against the
  server's reported offset, rolled over to the next track unattended, kept
  playing, zero console errors
- `/api/station` averages 0.7ms over 20 calls; resident memory 84MB

**Caveat:** all measurement was done in a cloud container on x86, not on a
Raspberry Pi. The memory and latency numbers are indicative, not the real ones.
Roadmap item #1 exists to replace them with measurements from the actual device.

**Next:** get it onto the Pi and record real numbers, then fix the cold-start
behaviour — the server currently does not listen until the first library scan
finishes, which on a large library over USB means the site is down for minutes.

## 2026-08-19 — Library curation, and reordering what's next

Ortis's brief: ingest music from six scattered folders, dedupe it, categorise
it, run it off the USB drive on the Pi; make the upcoming queue rearrangeable
without disturbing what's playing; rework the visualizer; review the identity.
The last two were cut from this run when usage ran short, and are queued for a
scheduled agent run.

Baseline first. `npm test` was **83 pass / 1 fail** — a pre-existing stale test
(see DECISIONS, "A stale test, and why it mattered"). Repaired to 84/0 before
changing anything, so later results meant something.

Built:

- `server/lib/genre.js` — 14-bucket rule engine over filenames and folder
  names, with unicode folding for fullwidth and bold-math titles.
- `server/lib/dedupe.js` — duplicate detection wired into `scanLibrary()`, with
  a total deterministic tiebreak.
- `scripts/ingest.mjs` — walks the six sources, dedupes, reports a genre
  breakdown, writes `ingest-manifest.json`, and copies or moves one clean set
  to the USB drive. Kept separate from `npm run scan` so a routine rescan can
  never start copying gigabytes.
- `Station.setQueueOrder()` / `clearQueueOrder()` / `slotStartsAt()` plus
  `GET /api/queue`, `POST /api/queue/reorder`, `POST /api/queue/clear`, gated
  on `STATION_KEY` and `QUEUE_LOCK_SECONDS`.
- `publicTrack()` now carries `genreSlug` / `genreLabel`.

Two real bugs found by writing the tests rather than by review: the queue
originally addressed slots by track id, which is ambiguous whenever the library
is smaller than the lookahead window (ids repeat across cycles); and a
`normalizeTitle` rule that stripped leading track numbers would have turned
Gorillaz' "19-2000" into "2000".

`npm test`: **118 pass / 0 fail**. All genre and dedupe cases use real
filenames from the actual drives — synthetic names would have passed while the
real library still mis-filed half its vaporwave.

Not done, deliberately: the visualizer rebuild, the identity review, the
drag-and-drop queue UI, and running the ingest against the real drives (this
sandbox cannot reach `E:`). See `docs/HANDOFF-2026-08-19.md`.

Sandbox note: the browser stage of the self-test needs `libXdamage.so.1`, which
is absent from a fresh workspace and unavailable without root. Fetched with
`apt-get download libxdamage1`, extracted with `dpkg-deb -x`, and exposed via
`LD_LIBRARY_PATH`; all 13 browser checks then pass.

---

## 2026-08-19 (scheduled run) — The visualiser, rebuilt; and an identity menu

Two of the three tasks in the run's brief landed complete and verified. Ortis
was reachable mid-run and confirmed the constraints: no Pi access (work wifi,
hardware unreachable until evening), no USB drive plugged in — **code and
self-test only**. So nothing here touches hardware or the real library.

### The baseline was not what the handoff said

`docs/HANDOFF-2026-08-19.md` recorded **118 pass / 0 fail**. The first thing
this run did was re-run it: **117 pass / 1 fail**. `tests/boot.test.js` — the
one that spawns the real `node server/index.js` — timed out waiting 8s for the
port to open.

It was not a regression, and it was measured rather than assumed:

| `import express` + `music-metadata` | time |
|---|---|
| from the repo on this sandbox's mounted (9p) filesystem | 12.0s / 13.7s / 13.3s |
| the same `node_modules` copied to local disk | **0.20s** |

A ~65x penalty on module resolution alone, before any of our code runs. The
server was starting correctly the whole time; it had not finished `import`ing
by the deadline. The 8s figure was asserting "boots fast on a local disk",
which that test was never meant to claim — and which a Pi Zero 2 W reading
`node_modules` off an SD card might well fail too.

Fixed by raising the deadline to 45s (`BOOT_TEST_TIMEOUT_MS` overrides) **and**
adding an early-exit watch, so the assertion is unchanged and a genuinely
broken entrypoint still fails immediately rather than after 45 seconds. Proved
that with a standalone harness simulating the 2026-08-18 `isMain` bug (a child
that exits 0 without listening): **detected in 177ms**.

### Task 1 — the visualiser (the priority)

`public/viz.js` is new — 5 composited layers, no dependency, no bundler:

- **bloom** — lissajous-drifting radial gradients, swelled by bass. The liminal
  layer; it has no beat, it breathes.
- **ring** — a *squircle* hugging the cover's own outline, displaced outward by
  the spectrum. Not a circle: following the artwork's silhouette is what makes
  it read as a frame rather than as decoration.
- **dispersal** — dots flung along the ring's normals where a band is loud.
- **shock** — expanding squircle outlines fired by onset detection. These snap;
  everything else drifts. ("waves for quicks")
- **ribbon** — a hard oscilloscope trace of the raw waveform along the bottom
  margin, faded at both ends.

**Two analysers, in parallel from one source.** A pretty spectrum wants heavy
smoothing (0.78); onset detection wants none, because smoothing is exactly what
erases a transient. One `AnalyserNode` cannot be both.

**It frames the cover, it never covers it.** The canvas fills the art frame and
sits *behind* the artwork, which is now inset to 76%. Every layer draws in the
margin band around it. The dark mode and the sober background — the two things
Ortis named as already right — are preserved: the bloom composites `source-over`
specifically so it stays a wash behind the art rather than saturating the frame.

**Genre keys the palette,** end to end: `library.js` now stores `genreAccent`
from `GENRES[].accent`, `publicTrack()` carries it, `/api/station` returns it,
`viz.js` eases toward it. Verified live — barber beats renders violet (285),
atmospheric DnB sea-green (165). Screenshots: `docs/visualizer-desktop.png`,
`docs/visualizer-mobile.png`.

**Three quality tiers**, chosen by measured frame cost with a deliberate dead
band so detail cannot oscillate. `prefers-reduced-motion` pins to the calm tier
(no sparks, no shocks, no drift) and is re-read on change, not just at load.
Everything stops when the tab is hidden.

Four bugs the tests and screenshots caught, none of which review would have:

1. **`binForAngle` had its exponent inverted** (`^0.62`, should be `^1.7`) —
   it spent most of the ring's arc on the empty high bins. Caught by
   `tests/viz.test.js`.
2. **The hue drift was an unbounded rotation** (4.5°/s). After a minute on air,
   barber beats had drifted violet → pink → orange and the genre cue was gone.
   Now a bounded ±19° sine wobble. Caught by looking at a screenshot.
3. **The bloom composited additively** and saturated the whole frame to a flat
   glare within seconds — destroying the sober background. Caught the same way.
4. **A pre-existing mobile layout bug.** `.art-frame` used `margin:0 auto`,
   which makes a stretched grid item shrink-to-fit its content. With real album
   art that content was the image's natural width (large, so the 220px cap hid
   it); with the no-art fallback it was a 64px SVG, and the whole player
   rendered as a thumbnail on a phone. Every existing check passed throughout.

### Task 2 — identity options

`docs/IDENTITY-OPTIONS.md`: five directions (A *keep Radio Tower, restyle the
mark*, B *Liminal FM*, C *Night Porter*, D *Same Second*, E *The Tower is On*),
each with a name, motto, buildable inline SVG, palette and one line on what it
signals. **Nothing in `public/` was changed** — Ortis asked for a menu, not a
migration. All five marks were rendered at 64/26/16px on the real background
and the contact sheet saved as `docs/identity-marks.png`, so the file's claims
about small-size legibility are observed rather than asserted.

### Task 3 — the queue editor

**Done.** `public/queue.js` + a hidden-by-default panel in `index.html`.

- Pointer-event drag, so one implementation serves mouse and touch. Plus
  ArrowUp/ArrowDown on a focused row — a drag-only editor is unusable without
  a pointer.
- **Locked slots get no drag affordance at all** — not draggable-then-rejected.
- **The key lives in memory only.** Not localStorage, not the URL, not a
  served file; the input is cleared the moment it is submitted, and a refused
  key re-locks the editor rather than staying armed.
- **The panel is hidden entirely when `editable` is false**, which is the
  default (STATION_KEY unset ⇒ the write endpoints are 503). Most listeners
  never learn the editor exists.
- **Every render comes from the server.** The DOM is moved during a drag for
  feedback; only a refetch is treated as truth.

Two bugs found by running it rather than reading it:

1. `movableWindow()` took the *first* run of unlocked slots. With a library
   smaller than the lookahead the queue spans several cycles, and when the
   frozen slot lands second-to-last in its cycle that run is a single slot —
   so the editor offered nothing at all, about one time in four, while the
   next cycle had a full set waiting. It now takes the **longest** run, ties
   to the earliest so it stays deterministic.
2. The editor re-rendered on its 15s poll *while a hand was reaching for a
   row*, so the press landed on a different track — or a frozen one, doing
   nothing. It now holds off re-rendering for 5s after any hover, focus or
   press. That was a real usability bug the self-test surfaced first.

### Verification

- `npm test`: **152 pass / 0 fail**. Baseline was 117/1 (the handoff claimed
  118/0 — see above). 34 new: `tests/viz.test.js` (20),
  `tests/queue-ui.test.js` (12), plus the boot-test repair.
- `bash scripts/build-test.sh --no-browser`: **exit 0**, all stages green.
- Browser checks: **32/32**, up from 13, run three consecutive times against a
  server configured exactly as `build-test.sh` now configures it (including
  `STATION_KEY`). Nineteen new checks — four for the visualiser, three for a
  phone viewport, twelve for the queue editor.

**An honest note on how that was run.** The complete `build-test.sh` (browser
stage included) takes longer than the ~178s cap on a single command in this
sandbox, so it was verified in two halves: stages 1-5 and the verdict via
`--no-browser` (exit 0), and stage 6 by invoking `scripts/browser-smoke.mjs`
directly against an identically-configured server. Both halves are green; a
single uninterrupted end-to-end run was **not** performed here, and on Ortis's
machine — where the repo is on a local disk rather than a 9p mount — it should
simply run straight through.

A second startup budget had to be raised for the same reason as the boot test:
`build-test.sh`'s own readiness loop allowed 40 x 0.25s = **10 seconds**, which
is less than the 12-13s this filesystem needs just to `import`. It had been
passing only when a preceding `npm test` left the page cache warm. Now 120s,
with an immediate bail if the server process dies — so a real failure is still
caught at once.

Sandbox note, again: the browser stage needs `libXdamage.so.1` (plus
`libxfixes3 libxext6 libxrandr2 libxkbcommon0 libxcomposite1 libatspi2.0-0
libasound2`), absent from a fresh workspace and unavailable without root.
`apt-get download` + `dpkg-deb -x` + `LD_LIBRARY_PATH`, as the last run
recorded. Also note `npx playwright install chromium` is needed — the browsers
are not in the image, only the `playwright` package.

Next: running the ingest against the real drives (needs the USB drive plugged
in), deploying to the Pi (needs the Pi), whichever identity Ortis picks from
`docs/IDENTITY-OPTIONS.md`, and roadmap #5 — which remains the highest-ranked
item and was deliberately not touched this run, because it is a station-clock
change and this run was already carrying three features.

## 2026-08-19 (with Ortis) — The DJ booth: `dj/`, Spontaneous Emissions, a measured library, and an index instead of a reshuffle

Ortis, paraphrased: the music sucks and they aren't the right files; build a DJ
agent with access to the MP3s and the Pi bridge that can change the line-up on
the fly; make it runnable separately in Claude Code; review today's logs and
document how to fire a Spontaneous Emission; tidy the directories so each agent
pulls the right specialised docs; prepare a USB cleanup for when the stick is
plugged in.

### The booth — `dj/`

Standalone by construction: **zero dependencies, no import from `../server`**, so
`cd dj && node dj.mjs` works against a station anywhere with none of the repo
needing to be intact. That is what "run it separately" has to mean for a program
whose job is to work when something else is broken.

```
dj/
├─ dj.mjs        the CLI: status, moods, files, library, emit, clear, rescan, doctor
├─ moods.json    the mood vocabulary — data, re-read every run, safe to edit live
├─ test.mjs      11 tests, node:test, no dependencies
├─ CLAUDE.md     its whole brief; auto-loaded by `cd dj && claude`
├─ README.md
└─ .claude/      /emit slash command + a settings.json that DENIES writes to
                 ../server ../public ../scripts ../tests ../docs ../music
```

Plus, in the project's own tooling: `.claude/agents/tower-dj.md` and
`.claude/skills/tower-dj-booth/SKILL.md`, so the main session can delegate to
the same booth with the same boundaries. Plugin bumped to 0.2.0.

**A Spontaneous Emission is a permutation, and no server change was needed.**
`emit` fetches `/api/queue`, takes the longest contiguous run of unlocked slots
inside one cycle, scores each against the mood, stable-sorts, and posts to the
existing `POST /api/queue/reorder`. Genre 100, keyword 40, `exclude` −200,
duration ±20. Equal scores keep their programmed order, so an emission is a
nudge toward a mood rather than a reshuffle.

What it refuses to do, out loud: pull a track in from elsewhere in the library,
skip what is on air, or shuffle when nothing matched. Filed as a roadmap item
("a DJ set override"), where it correctly reads as a schedule change needing the
era mechanism.

### Two bugs, both found by running it rather than reading it

1. **`status` marked the wrong slots movable.** It tested `win.ids.includes(id)`,
   and with a library smaller than the lookahead the same track id appears
   several times in `upcoming` — so slots outside the window, in the same cycle,
   drew a movable marker. Now compared by slot *address* (`withinCycle` between
   the window's first and last), which is the only thing that identifies a slot
   uniquely. `movableWindow()` gained `endWithin` to make that possible.
2. **The first `moods.json` matched nothing.** `liminal` and `study` were
   weighted on the `ambient` genre. A scan of the real library — run before
   shipping, on a hunch — showed **zero** ambient-classified tracks. Both moods
   would have refused every time for a reason nobody would have guessed from the
   file. Rewritten against the measured distribution, which is now recorded at
   the top of `moods.json` with the date and the instruction to re-measure.

### The measured answer to "the music sucks"

30 files, 12.48h of air, scanned today:

| | files | share of air |
|---|---|---|
| barber-beats | 19 | 50.2% |
| vaporwave | 2 | **24.4%** |
| dnb-jungle | 2 | 9.7% |
| rock-pop | 1 | 7.6% |
| unsorted | 2 | 4.7% |
| vgm | 4 | 3.5% |

**Eight files hold 71.8% of the day**; the longest (121 minutes) holds 16.2% on
its own. The station shuffles *slots*, not minutes — a two-hour mix is one slot
exactly like a 44-second track. Put the station on at random and you land inside
a long ambient mix about three times in four.

That is the whole complaint, and **the DJ cannot fix it** — it is a library job
(`BRIEF.md` rule 7: nothing under `music/` moves without Ortis). Written up with
the numbers in `docs/guides/STATE-OF-THE-STATION-2026-08-19.md`, and filed as
three ranked-later roadmap items: split-or-move the long mixes, a possible
share-of-air column in `npm run scan`, and two files (`ㅤㅤㅤ.mp3`, the Air
track) whose filenames the genre rules cannot see.

The second half of "not the right files" is different and worse: `dj.mjs doctor`
compares the folder the booth reads against `/api/health`'s `musicDir`. On the
Pi they routinely differ, because `pi/install.sh` step 5 adopts any USB with
audio on it. See below.

### The USB cleanup — prepared, not run

The stick was not plugged in. Built from what the logs already record about it
(42 files in `E:\Music`, 471 in `E:\Behold the backkup\...`):

`usb/rebuild-usb.ps1` + `docs/guides/USB-CLEANUP.md`. It inventories to a dated
CSV every run, archives before it deletes anything, mirrors the curated library
to `E:\RadioTowerMusic`, and **refuses `-Purge` unless an archive completed and
verified in the same invocation** — because "Behold the backkup" is a backup that
lives on the stick itself and may have no second copy. Dry run by default;
refuses any drive Windows does not report as Removable.

The insight worth keeping: the runbook's current workaround is to mount the
stick outside `/mnt` and `/media` so the installer's scan misses it. That works
and depends on remembering. Making the stick's *only* audio the correct audio
turns the same auto-detection from a hazard into the behaviour you want. It does
not fix roadmap #25; it makes it harmless.

### Tidying — an index, not a reshuffle

Moving `IDENTITY-OPTIONS.md`, the PNGs and `HANDOFF-2026-08-19.md` into tidy
subfolders would have broken paths cited from `DECISIONS.md` and this file, both
append-only. Instead: **`docs/README.md`**, an index that names which document is
the *current authority* wherever two overlap. New folders only for new things
(`docs/guides/`, `dj/`, `usb/`), `archive/` for the two pieces of genuine root
debris, and `docs/.write-test{,2}` cleared out.

Each agent file now ends with which account-level skills are its own to reach
for — `engineering:debug` and `desktop-commander:terminal` for the builder,
`engineering:tech-debt` and `code-review` for the auditor, `engineering:architecture`
and `skill-creator` for the planner, `engineering:system-design` for the scout.
In prose rather than `skills:` frontmatter, so a renamed or unavailable plugin
skill degrades into a dead suggestion instead of a failed agent load.

### Verification

- `node --test dj/test.mjs` — **11 pass / 0 fail**. They assert the two failures
  that are silent until they are live: an emission that is not a permutation,
  and one that touches a locked slot.
- **End-to-end against a real server**, booted on :8099 with `STATION_KEY` set
  and a 5-track library: `status` rendered the programme and the movable window;
  `emit "game" --dry-run` planned it; `emit "game" --top 1` was **accepted** and
  `/api/queue` came back with `override: {cycleIndex: 28834, startWithin: 0,
  ids: [...]}`; `clear` dropped it. The no-key path was checked separately and
  printed the intended refusal rather than a stack trace.
- `npm test` — **152 pass / 0 fail**, identical to the baseline before this run.
  Nothing under `server/`, `public/`, `scripts/` or `tests/` was touched.
- **Not verified:** `usb/rebuild-usb.ps1` — no stick, and it is PowerShell,
  which this sandbox cannot run. Its first dry run is its first test. Say so
  rather than implying otherwise.

Next: the library itself is the highest-value thing on the list, and it is
Ortis's call. Then roadmap #25, then the design brief.

## 2026-08-19 (later, with Ortis) — Modelled the library fix, found my own recommendation wrong, built the splitter instead

### The correction

This morning's entry recommended splitting the long mixes **or** moving them out
of `MUSIC_DIR`. Before recommending the second half of that to Ortis it was
modelled, and it does not survive:

| | tracks | cycle | longest file's share | genres |
|---|---|---|---|---|
| now | 30 | 12.48h | 16.2% | bb 50, vapor 24, dnb 10, rock-pop 8 |
| drop >40min | 22 | 3.53h | 16.0% | bb 57, unsorted 16, dnb 14, vgm 13 |
| drop >20min | 18 | **1.51h** | **18.9%** | **bb 65, vgm 29** |
| drop >12min | 17 | 1.22h | 9.1% | bb 80, vgm 13 |

Cutting the long files leaves **eighteen tracks, ten of them one artist**, on a
90-minute loop — and the longest survivor takes a *larger* share of the air than
the problem it was meant to fix. Vaporwave, DnB and rock-pop leave the station
entirely.

The diagnosis was one level too shallow. **The library is too small.** Thirty
files, twelve of them hour-long mixes, is an eighteen-track station wearing a
costume; the mixes are not the disease, they are what hides it. Corrected in
`docs/guides/STATE-OF-THE-STATION-2026-08-19.md` and in the roadmap item, in
place, with the table — the wrong recommendation is left visible above the
correction rather than quietly edited out.

### `split/` — the splitter

`split/split-mixes.mjs`, `split/test.mjs`, `split/README.md`. Node, zero npm
dependencies, shells out to ffmpeg. **ffmpeg is not a runtime dependency** and
must not become one: this is offline tooling run on the laptop, like `usb/`.
The two-dependency budget is untouched.

Six decisions worth keeping:

1. **It proposes.** Nothing is written without `--apply`, and `--apply`
   **refuses an `--out` inside `MUSIC_DIR`**. Ortis moves reviewed pieces in
   himself (`BRIEF.md` rule 7). The source is never modified.
2. **One decode, every sensitivity.** `silencedetect` runs once at
   `noise=-45dB:d=0.35`; the coarser proposals are derived in JS by raising the
   minimum gap. The report prints what `--gap 0.5 / 1 / 2 / 3` would each have
   given — without decoding a two-hour file four times.
3. **The cut lands in the middle of the silence**, so neither the outgoing tail
   nor the incoming first beat is clipped.
4. **Piece names keep the original stem** (`Macroblank - 一生に一度 - 03.mp3`).
   Load-bearing: `server/lib/genre.js` classifies by filename, so a renamed
   piece becomes `unsorted` — which no mood in `dj/moods.json` can reach.
5. **Streams are copied, not re-encoded.** No generation loss.
6. **It reports its own failures.** Silence detection cannot see a crossfade,
   and these mixes are frequently gapless. A result whose longest piece exceeds
   12 minutes *or* 35% of the mix is printed as **WEAK**, not counted as a win;
   one with no boundaries says so and suggests leaving the file whole. The 12
   minute threshold replaced an initial 20, which called a 13.1-minute piece
   "reasonable" — on a station where a slot is a slot, it is not.

### Verification

- `node --test split/test.mjs` — **9 pass / 0 fail**. Pure half only: parsing
  ffmpeg's log, planning segments, the verdict, the naming rule.
- **Run end to end on a real mix.** `slowerpace 音楽 Soft Sunday`, 28.1 min:
  6 silences found; `--gap 1.0` gave 5 pieces (longest 13:05, flagged WEAK);
  `--gap 0.5` gave 6 (longest 8:16, 29%, passed). `--apply` produced six files
  whose measured durations — 8.3 / 4.8 / 5.2 / 3.7 / 3.8 / 2.2 min — match the
  plan and sum to the original 28.1.
- **The guard was tested, not assumed:** `--out` pointing inside a music
  directory was refused with the intended message.
- `npm test` — **152 pass / 0 fail**, unchanged. Nothing under `server/`,
  `public/`, `scripts/` or `tests/` was touched.
- **Not verified:** whether the cuts sound right. That is a listening job and
  the tool says so at the end of every apply. A boundary at a silence is not
  the same thing as a boundary between tracks.

Next: Ortis runs it over the eight long files, listens, and moves the good
pieces in. Then the USB, which is also where more music comes from.

---

## 2026-08-19 — A live iteration loop for the visualiser, layer independence, and genre backdrops

Three jobs, run in order per the brief, all completed: Job A (hot reload +
dev tuning panel), Job B (layer independence + preset switching), Job C
(genre-matched backdrops from the Portfolio images). Baseline before
touching anything: `bash scripts/build-test.sh --no-browser` — 4 failures
(stage 2 test-suite check, and the pre-existing ffmpeg/python3 gap in stages
4/5). All four root causes tracked down; one (stage 2) was a real bug in
`build-test.sh` itself and is fixed (see `docs/DECISIONS.md`); the other
three are the pre-existing missing-`ffmpeg`/`python3` environment gap
already documented in this file's 2026-08-18 entries, unrelated to this run.

### Job A — hot reload

`server/lib/devReload.js` (new): an `fs.watch` on `public/` (recursive,
falling back to per-subdirectory watches where recursive isn't supported)
feeding a debounced SSE broadcast at `GET /api/dev/reload`, wired into
`server/index.js`'s `createApp({ devReload })` — only from the `isMain` boot
block, gated on `NODE_ENV !== 'production'`, never from `createApp()`'s
no-args form the test suite calls, so no test process opens a watch handle.

`public/app.js`'s client: a `viz.js` change rebuilds the `Visualizer` in
place by transplanting the *existing* `AudioContext`/analysers onto a freshly
`import()`-ed instance (never re-attaching — `createMediaElementSource()`
can only ever be called once per media element) — no stutter, no seek, no
re-sync of playback. A `styles.css` change swaps the stylesheet's `href`
with a cache-bust. Everything else falls back to `location.reload()`, which
is simply correct here (the station clock means a fresh page just rejoins
live) rather than a last-resort hack.

Two real bugs found and fixed while building this, both detailed in
`docs/DECISIONS.md`: `attachDevReload()` was originally called after the
404 catch-all was already registered (route unreachable, always 404) — fixed
by threading a `{ devReload }` flag through `createApp()` itself. And
`scripts/browser-smoke.mjs`'s `page.goto(..., { waitUntil: 'networkidle' })`
hung the full 20s timeout once a page had a permanently-open `EventSource` —
fixed by switching both `goto()` calls to `waitUntil: 'domcontentloaded'`
(nothing downstream depended on `networkidle`). Also added
`Environment=NODE_ENV=production` to `deploy/radiotower.service`, since
nothing in the deploy path set it before — without that fix, dev-reload
would have been live and public on the real Pi.

The dev panel (`public/dev-panel.js`, new): every tunable the brief named
(per-band gain/smoothing, onset sensitivity, hue/drift, layer opacity, tier
override) is now `Visualizer#knobs` (`defaultKnobs()` in `viz.js`), read
fresh every frame. The panel is `import()`-ed only behind `?viz=dev` — a
normal page never fetches it. A "copy defaults snippet" button serialises
the live knobs into a paste-ready object literal matching `defaultKnobs()`'s
shape, per Ortis's own workflow ("I tune by ear, you paste the result back
into the source").

### Job B — layer independence

`viz.js` now exports `PRESETS = { frame, bands }`. `frame` is every existing
paint method, unchanged. `bands` adds one new method — `_paintLowLayer`, a
large squircle bloom sized by `energy.low` and smoothed over ~300ms via a
dedicated exponential filter — and threads one new multiplier
(`highSizeGain`) into the existing, shared `_fireSparks` spark-radius
formula. `PRESETS.frame.highSizeGain === 0`, so that shared formula's output
for `frame` is provably unchanged (`+ energy.high * 0`), not just visually
similar — asserted directly in `tests/viz.test.js`. The mid layer is,
literally, the pre-existing `_paintRing` call, not rewritten.

A discreet `#vizPreset` ghost button cycles the two presets and persists the
choice to `localStorage`, read back on boot.

### Job C — genre backdrops

Of the 12 images in `C:\Users\barri\Documents\Pro\Portfolio`, only 3 were
used: `birdup.png`, `thatbirdominous.png`, `whattheelephantbluer.png` —
downscaled to a 1600px longest edge and re-encoded to WebP, all three
≤150KB (`public/assets/backdrops/`). The other nine: seven `Screenshot
*.png` files (two show visible software UI — Gephi, Photoshop; the other
five are diagram/data-viz exports of this library's own genre-tag analysis,
correctly anticipated by the brief as "probably wrong for this"), plus
`cover.png` and a `.jpg` — both dropped **despite `cover.png` being named
explicitly in the brief** — because both are third-party work (a scanned
commercial Japanese vinyl sleeve; a watermarked fan-art product photo), a
rights concern the brief's "screenshot" filter didn't anticipate. Full
reasoning for every dropped file in `docs/DECISIONS.md`.

`npm run scan -- --list` reported **no genre data at all** before this run,
even though every track has carried `genreSlug` since the "Genre hue is
carried on the track" decision — the classification wasn't empty, only the
CLI's reporting of it was. Fixed generically (`scripts/scan.js` now prints a
genre breakdown and a per-track genre column), not worked around. Real
numbers against the actual 30-track library: `barber-beats` 63.3%, `vgm`
13.3%, `dnb-jungle` 6.7%, `vaporwave` 6.7%, `unsorted`/`electronic`/
`rock-pop` 3.3% each — seven of `GENRES`' fourteen slugs don't occur at all.

`public/backdrops.js` maps exactly three slugs to the three images (mood- and
palette-matched, reasoning in `docs/DECISIONS.md`); the other eleven fall
back to the sober default, as the brief specified for anything unmapped.
Rendering: two stacked `.backdrop-layer` divs, `blur(48px) brightness(.32)
saturate(.85)`, resting at 8% opacity, `z-index:-1`; `createBackdropSwitcher()`
cross-fades by toggling a `.visible` class — the existing project-wide
`prefers-reduced-motion` rule already turns that into a hard cut for free,
with no special-case code. `#artFallback`'s "no art" placeholder and the
programme guide's empty/error states get the same treatment, satisfying
"use the same images as placeholders wherever the UI renders an empty panel".

No system `ffmpeg` on this machine has `libwebp` (confirmed against the one
bundled with CapCut). Installed Pillow into the system Python as one-time,
ad-hoc offline tooling (network egress worked) to do the WebP conversion —
same spirit as `split/`'s ffmpeg carve-out; the script itself was not
committed, only its three output files.

### Verification

- `node --test "tests/*.test.js"` — **134 pass / 0 fail / 25 skipped**
  (skips are the pre-existing ffmpeg-gated fixture tests). New: 2 tests in
  `tests/viz.test.js` (`defaultKnobs()`, `PRESETS`), 5 in the new
  `tests/backdrops.test.js`.
- `node scripts/browser-smoke.mjs` against a real server with the real music
  library — **20/20 checks pass**, including every visualiser-specific check
  and "no console errors" with the hot-reload client live.
- A dedicated (uncommitted, throwaway) Playwright script drove the actual
  dev workflow end to end: edited `viz.js` on disk while tuned in, status
  line reported `viz.js hot-reloaded` in **149ms**, canvas kept painting
  before and after, `audio.currentTime` advanced monotonically by exactly
  the wall-clock gap (166.49s → 167.11s) — no stutter, no seek. Dev panel
  confirmed absent on `/` and present on `/?viz=dev`; a slider drag updated
  the live knob and the exported snippet; preset cycling updated the button
  label, persisted to `localStorage`, and survived a reload. Backdrop:
  exactly one of two layers visible at a time, resolved to the correct image
  for the on-air genre (`barber-beats` → `birdup.webp`) on both the player
  and the schedule page; `#artFallback`'s pseudo-element backdrop confirmed
  present. Screenshots confirm the backdrop is imperceptible against real UI
  text at normal viewing distance.
- `bash scripts/build-test.sh --no-browser`: **3 failures**, all three the
  pre-existing ffmpeg/python3 environment gap (down from 4 — the stage-2
  false negative is fixed). Full run with `TOWER_BROWSER_EXECUTABLE` pointed
  at a real installed Chrome (this script's own browser auto-detection only
  searches Linux/macOS paths and finds nothing on Windows): same 3, plus the
  browser stage cascading from the same empty-fixture-library condition —
  proven, not assumed, to be that and not a regression, by the 20/20 direct
  run above against real content.

### Assumptions made

- Interpreted the brief's "keyed to `energy.mid`" for the mid layer as
  describing its *role* in the layer scheme, not an instruction to narrow
  the ring's input to a single band — doing the latter would have broken
  "must look identical when switched off" for the `frame` preset, which
  shares the same method.
- Dropped `cover.png` despite it being named explicitly in the brief, on a
  copyright judgement call the brief didn't anticipate (see
  `docs/DECISIONS.md`). If Ortis has rights to that specific scan and wants
  it included anyway, say so and it's a one-line addition to
  `SOURCES`/`GENRE_BACKDROPS`.
- Picked `whattheelephantbluer.webp` for `#artFallback` and
  `thatbirdominous.webp` for the schedule page's empty/error states somewhat
  arbitrarily (no genre to key off in either case) — chosen only so the two
  don't coincide with `birdup.webp`'s use for the library's dominant genre,
  to avoid "no art" and "barber-beats" reading as the same visual event.

Next: roadmap re-ranked (see `docs/ROADMAP.md`) — the phone pass (#2) and
the pending Ortis rulings are unaffected by this run; a new item covers
proving the two new visualiser presets and the backdrops on a real phone,
since only desktop-viewport screenshots were taken here.

---

## 2026-08-19 (later, with Ortis) — This run's update deployed to the real Pi, live

Ortis asked mid-session to push this run's code to the real station. Checked
first rather than assumed: the Pi was not idle — `curl radiotower.local:8080
/api/health` showed a station genuinely on air with **5 real listeners tuned
in**, 46 tracks, ~5 hours uptime. Confirmed with Ortis before touching
anything given that new information (he'd said "unless you can recall...
there isn't a station there" — there was, and it was live). Deployed as an
**update to a running station**, not a first install, following the caution
`docs/RUNBOOK-update-2026-08-19.md` establishes for exactly this situation.

**Method:** no `rsync` binary on this session's Windows machine, so the
92 project files (excluding `node_modules`, `.cache`, `.git`, `music`,
`_to_delete`, `archive`, `.claude-plugin`) were streamed to the Pi via
`tar -czf - ... | ssh ortis@radiotower.local "tar -xzf - -C ~/rt-update"`
into a staging directory under the login user's own home — sidesteps the
`radiotower` service account's restrictive permissions (`drwx------`,
by design, per `docs/DECISIONS.md` 2026-08-18) without needing them for
staging. `npm install` and `bash scripts/build-test.sh --no-browser` were
both run **on the Pi itself**, over a non-privileged SSH session, before
anything privileged happened — proving the new code against the actual
target hardware rather than only this session's Windows sandbox.

**That self-test result is worth recording on its own:** fully green, every
stage, `✓ the tower is sound` — **159/159 tests, and every HTTP/performance
check that fails in this session's own Windows sandbox for lack of
`ffmpeg`/`python3` passed here**, because the Pi has both. This is the
strongest verification this run's code got: real hardware, real fixture
generation, real range requests, real timing. Confirms
`docs/DECISIONS.md`'s "build-test.sh's test-suite check was a false
negative on current Node" fix generalises — it also worked correctly here,
on Node v22.23.2, not just the v24.19.0 this session's sandbox runs.

`sudo` on the Pi needs a password this session has no way to supply
non-interactively, and asking for it in chat is not something this session
will do. The three privileged steps (backup, install, verify) were handed to
Ortis as an exact copy-pasteable block to run himself over a real `ssh -t`
session, rather than attempted blind or by asking for a credential.

**What actually happened, from Ortis's own pasted terminal output:**
- Backup: `sudo rsync -a --delete /opt/radio-tower/ /opt/radio-tower.bak/` and
  `sudo cp /etc/radio-tower.env /etc/radio-tower.env.bak` both ran (a
  re-paste of the same block a moment later hit a harmless bash history-
  expansion error on the unescaped `!` in a terminal artifact — the `rsync`
  line of that *second* attempt didn't execute, but the first attempt already
  had, so nothing was lost; `du -sh /opt/radio-tower.bak` reported 6.7M
  despite permission-denied noise on subdirectory contents, which is `du`
  being run without `sudo`, not evidence the backup itself is incomplete).
- Install: `sudo bash scripts/setup-pi.sh` — copied 1037 files, installed
  production dependencies only (**express + music-metadata, still two** —
  confirmed by the installer's own "production only" log line), left
  `/etc/radio-tower.env` untouched (`✓ already exists — leaving your
  settings alone`), enabled and restarted the systemd service. Health check
  immediately after: `"ok":true,"status":"on_air","tracks":46,
  "nowPlayingId":"fd263d7a2f7d"` — **the exact same track that was on air
  before the restart**, which is the station-clock design's whole promise
  (`BRIEF.md` §3, "restarting the server does not interrupt the programme")
  working as advertised on a real, listened-to station, not just in a test.
- **One cosmetic-only oddity, worth a roadmap note, not a fix here:**
  `pi/install.sh`'s own "Finding your music" / summary section printed
  `! no audio files found anywhere yet` and `Music directory: /mnt/music (0
  tracks found)` — flatly contradicted by the real health check two lines
  later (`tracks:46`) and by every verification below. The installer's own
  music-count check is reading something stale or checking before the mount
  is visible in that shell context; the *actual* running service was never
  wrong. Filed as a new, low-severity roadmap item rather than investigated
  further this run — it never affected reality, only a status line.

**Verified independently of Ortis's paste, from this session, against the
now-live real station:**
- `grep MUSIC_DIR /etc/radio-tower.env` → `/mnt/music` — unchanged.
  `STATION_EPOCH` → `2026-01-01T00:00:00Z` — unchanged. Neither moved, which
  is the one thing that must never happen silently on an update
  (`BRIEF.md` rule 7).
- `curl http://radiotower.local:8080/api/health` → `tracks:46`, matching the
  pre-update count exactly.
- `curl -o /dev/null -w '%{http_code}' http://radiotower.local:8080/api/dev/reload`
  → **404** — confirms this run's own `Environment=NODE_ENV=production` fix
  to `deploy/radiotower.service` actually took effect on a real install, not
  just in a local test: the dev-only hot-reload SSE endpoint this run added
  is correctly absent from the real, public-facing station.
  `/backdrops.js`, `/assets/backdrops/thatbirdominous.webp`, and `/viz.js`
  all → **200** — this run's Job A/B/C code is live and being served.
  `/api/station` → on air is a `vaporwave`-tagged track, 4 listeners
  reconnected (briefly dipped from 5 during the restart, as expected —
  nothing in the station-clock design requires a listener to do anything to
  resync, and the player's own poll loop handles it).

**Left in place, deliberately:** `/opt/radio-tower.bak/` and
`/etc/radio-tower.env.bak` on the Pi (the rollback this run's own
`docs/RUNBOOK-update-2026-08-19.md` insists on having before any install)
and `~/rt-update` (the staging checkout, harmless in `ortis`'s own home).
None of this needed cleanup to finish safely, and deleting someone's
just-made backup immediately after using it defeats the point of having one.

---

## 2026-08-28 (with Ortis) — Tidy, a cache bug fixed, and a Pi that can change Wi-Fi networks without you

Ortis put the project on hold: he loses access to the current router and will
not have a new one for about a month. The ask was to make the project easy to
resume rather than to add features — plus one specific question, "why were my
requests for website design not correctly carried out?", answered separately
in `docs/DESIGN-POSTMORTEM.md`.

**Baseline first, as the rule requires.** `bash scripts/build-test.sh
--no-browser` on this session's Linux sandbox (which, unlike the Windows
sessions, has both `ffmpeg` and `python3`): **red** — 1 check failed, two
tests in `tests/pi-install.test.js` asserting `install.sh`'s payload-error
messages. Investigated rather than assumed: re-running the file alone passed
7/7 twice and 5/5 once. The tests were **network-dependent** — `install.sh`
probed `registry.npmjs.org` before it checked the SD card, so on a machine
whose egress to npm is slow or blocked the script died at the internet check
and never reached the message under test. Not a code defect; a real test
fragility, and exactly the kind of thing that would read as "my project is
broken" to someone returning to it in a month.

### Fixed — listeners were being served stale code

`server/index.js` served `public/` with `maxAge: '1h'`. That put
`Cache-Control: public, max-age=3600` on every ES module and stylesheet, so a
returning listener kept running whatever JavaScript they had first cached, for
an hour at a time, with no signal. Diagnosed live on 2026-08-20 from Ortis's
own browser (`fetch(…,{cache:'no-store'})` returned the new file while
`await import(…)` returned the old module; `#vizStage`'s CSS was in the served
stylesheet but in no entry of `document.styleSheets`); the diagnosis was
recorded but **the fix had never been run** — it was sitting in
`PROMPT-cache-and-stage-defaults.md` as Job 1.

Now: `no-cache` on everything the browser executes, `public, max-age=604800`
on `/assets/`. Reasoning and the rejected alternatives in `docs/DECISIONS.md`.

Pinned by a new `tests/static-cache.test.js` (9 tests) which asserts the
headers directly and proves a conditional request still gets an empty 304 —
this is invisible to every other test in the suite, because the server returns
the correct bytes either way.

**One thing worth recording for whoever writes the next such test:** the 304
assertion first failed against a server that was behaving correctly. Node's
`fetch` (undici) applies its own client-side cache semantics and answered the
conditional request with a 200 from its side of the wire. A raw `node:http`
request to the same server returned 304, as did `curl`. The test uses
`node:http` and says why in a comment.

### New — the Pi can be moved to a new Wi-Fi network without logging into it

The problem Ortis is actually about to have: a Pi that knows one Wi-Fi network
is unreachable the moment that network stops existing, and the normal way to
tell it about a new one is SSH, which needs the network you no longer have.

`pi/wifi/radiotower-network.sh` reads `/boot/firmware/radiotower-wifi.txt` —
on the FAT32 partition, so Windows can write it — and turns each `SSID |
password` line into a NetworkManager profile, priority descending from the top
of the file. `radiotower-network.service` runs it on **every** boot (not just
the first, so one card can move house repeatedly), ordered `Before=
radiotower.service` so the station starts with an address already in hand, and
with `SuccessExitStatus=0 1` so a Wi-Fi file it cannot parse can never stop the
station from starting. Installed by `pi/install.sh` unconditionally, including
on an Ethernet-only tower — installing it on the day it is needed would require
the access whose loss is the whole problem.

If nothing in the file is reachable and a `HOTSPOT =` line is set, the tower
brings up its own access point instead. That is the difference between "down
until I find a router" and "a radio station you can carry into a room with no
infrastructure and switch on".

**Verified:** 12 tests in `tests/pi-wifi.test.js`, driving the script in
`--dry-run` where every state-changing call prints the `nmcli` command it would
run. Covers the parser, priority ordering, SSIDs and passwords containing
spaces, open networks, malformed lines, the `HOTSPOT` line, that the shipped
example file itself parses, and that `install.sh` and the unit are wired up.
The CRLF test earns its place: this file is edited in Notepad on FAT32 and read
by bash, and a stray `\r` silently becomes part of the Wi-Fi password.

**Found by those tests, in the script itself:** `--dry-run` was printing its
plan to stdout while every call site appended `>/dev/null`, so the whole dry-run
was a silent no-op. Fixed by moving the redirect inside the wrapper. Worth
noting as the dry-run mechanism working as intended on its first outing.

**Not proven, and said so in `pi/NEW-NETWORK.md` rather than glossed:** nothing
here has touched a real radio. The parser and the plan are tested; that `nmcli`
accepts these arguments on the Pi in front of you, and that the hotspot comes
up, is not. The doc tells Ortis to try it once while he can still reach the Pi
another way.

### Fixed — the flaky tests, at the cause

`pi/install.sh` now does its cheap local checks (free space, is the app on the
card, does it have a `package.json`) **before** the five-second network probe.
That makes the two tests deterministic, and is better behaviour besides: if
you copied the folder to the wrong place, that is true whether or not the
Ethernet cable is in, and being told "no internet" first sends you off to fix
the wrong thing.

### Tidied

Root now holds `BRIEF.md`, `CLAUDE.md`, `README.md`, the package files and the
folders — nothing else. The three `PROMPT-*.md` files moved to `docs/prompts/`
with a `README.md` index recording which have been run and which are
superseded. Deleted: the empty `_to_delete/` (a standing item in
`docs/guides/START-HERE-CLAUDE-CODE.md` that earlier sandboxes lacked
permission to do) and `archive/write-test-artifact{,2}`, two zero-byte files
containing the word "test" and a date, referenced by nothing.

`archive/`'s two real artifacts were **kept** despite the "remove outdated
files" instruction: `CLAUDE.md` describes that folder as "build debris kept
rather than deleted" and both are cited by path from the append-only history.
Deleting them to satisfy a tidy would make that history lie, which costs more
than 576KB of tidiness is worth.

### Written

- `docs/DESIGN-POSTMORTEM.md` — the answer to Ortis's question, with the
  ready-to-paste prompt that supersedes `PROMPT-cache-and-stage-defaults.md`.
- `docs/PICK-UP-AGAIN.md` — the single page to read in a month.

### Verification

`bash scripts/build-test.sh --no-browser`: **fully green, "the tower is
sound", 188 tests passed** (up from 159 at the last recorded full run; +9
static-cache, +12 pi-wifi, plus this sandbox running the fixture-gated tests
that Windows sessions skip). Baseline before this run's changes was red.

**Not run this session:** the browser stage. No Chrome in this sandbox and no
`TOWER_BROWSER_EXECUTABLE` to point at one. Nothing this run touched is
front-end behaviour — the cache change is a response header, asserted
directly — but the visualiser and player were not re-driven in a real browser,
and that is a gap, not a pass.

### Assumption stated, per the standing instruction

Ortis asked whether usage is billed at prompt-send time, so that a run started
before his weekly reset would count against the old week. It is not — usage is
metered as tokens are consumed. Told him directly rather than quietly
proceeding on his premise. Proceeded with the work anyway because the outcome
is better under the true model, not worse: most of this run bills to the new
week.

Next: the full-page visualiser (`docs/DESIGN-POSTMORTEM.md`), then roadmap #6
and #14, the two unauthenticated/unthrottled public endpoints.

---

## 2026-09-23 (with Ortis, Cowork) — Take the tower anywhere; Library, Photos and Crates

**Asked:** an agent/task that uses the Pi's infrastructure, the bridges and the
hosting to make a folder that lets the tower connect to any router or Wi-Fi and
immediately put the site up and keep it live. Plus: make the site nicer, with
the University, photo and music folders shown in it. Follow-up from Ortis: an
essay library as a bookshelf where books half pick themselves up on hover, each
labelled with title and class, the whole social network analysis map, and the
full thesis downloadable. His answers: photos from **both** folders, **I
shortlist, he approves**, **his own domain**.

**Baseline:** `bash scripts/build-test.sh`: 188 tests + 32/32 browser checks,
green, in the cloud sandbox with Playwright 1.56.0.

### Built

- **`pi/anywhere/`**: `radiotower-online.sh` (the card's `radiotower-online.txt`
  becomes `/etc/radiotower/online.env`), `radiotower-tunnel.sh` + unit (named
  Cloudflare Tunnel from a token), `portal.mjs` + unit (the phone setup page),
  `radiotower-watchdog.sh` + timer, four system confs (captive DNS, Wi-Fi
  power-save off, hardware watchdog, journal cap), `prepare-card.ps1` (Windows:
  writes the app and both .txt files to `bootfs`), `README.md`, `DOMAIN.md`,
  `radiotower-online.txt.example`.
- **`pi/wifi/radiotower-network.sh`**: with no reachable network it now falls
  back to the setup hotspot (it used to exit 1 unless a `HOTSPOT` line existed).
  It also gains `--after-portal` and `--retry`. All 12 existing Wi-Fi tests
  still pass unchanged.
- **`pi/install.sh`** installs and enables the kit, installs `cloudflared`, and
  no longer copies `collections/_*` onto the Pi.
- **Site:** section bar on every page (`public/sitenav.js`: Listen · Guide ·
  Library · Photos · Crates, plus an "on air" ticker on sub-pages);
  `library.html` (thesis card, close-up bookcase with spines coloured by
  department, lift on hover, peek card, reading desk, map room with pan/zoom and
  a transcribed legend); `photos.html` (justified rows, lightbox with
  keyboard and swipe); `crates.html` (sleeves by content category, record
  slides out on hover, "next on air" times, no play button).
- **Server:** `server/lib/collections.js`, `GET /api/collections`, static
  `/collections/` with private-path refusal and `?download=1`.
- **Content** (`collections/`): 22 essays + the thesis (63 pp) + proposal
  slides, 8 network maps, 24 photos, 4 album covers. `music/Crates/`: 32 tracks
  (HYRULE DREAMS, By Thy Doors of Ash, 思い出の森).
- **Embedded tooling:** agents `tower-roamer` and `tower-curator`, skills
  `tower-anywhere` and `tower-curate`, commands `/tower-online` and
  `/tower-curate`. Plugin bumped to 0.3.0. `npm run collections` checks the
  manifest against the disk. **Parked in `claude-tooling-to-install/`**, not
  `.claude/`: Cowork's file bridge refuses writes into `.claude/`, deliberately.
  Ortis copies them in with three commands (that folder's README).

### Verified

`bash scripts/build-test.sh`: **234 tests passed** (+27 `pi-anywhere`, +15
`collections`, +8 no-cache checks for the new pages), **43/43 browser checks**
(+11: every book on a shelf, a hovered book rises 46% of its height, the peek
card, the reading desk offers Read + Download, the thesis downloads, the map
zooms, the lightbox arrows through, crates show next-on-air times, crates have
no play button, no phone overflow, no console errors). "The tower is sound."

The first run of the lift check reported "rose 1000px". That was hover()'s own
scroll being measured. The check now scrolls and settles first, and bounds the
lift below the book's height.

### Not proven, and why

Everything in `pi/anywhere/` is tested off-Pi through dry-runs and stub
binaries. Three things can only be proven on the real Pi and haven't been:
`nmcli` bringing up `rt-hotspot` on this Pi's radio, iOS/Android opening the
captive page by themselves, and the first real tunnel connection to Ortis's
domain (he has no token yet). The README asks him to try the setup-hotspot path
once at home before relying on it.

### Assumptions stated

- "java" in the request was read as JavaScript: the locked stack is Node +
  vanilla JS, and there is no JVM anywhere in this project.
- The music crates were in the shortlist Ortis answered without striking
  anything, and matched his original ask ("the music folders"), so they were
  added. They sit in one folder, `music/Crates/`, if he wants them out.

---

## 2026-09-26 — The cloud edition, first shift (Ortis away, unattended)

Request: GitHub + the web, a modern site with map, portfolio, a working radio
with a real queue and visuals control. Plan and reasoning: `docs/CLOUD.md`,
`docs/DECISIONS.md` 2026-09-26.

**Built:** `site/` — a static single-page site (no bundler) where every
browser runs the station's own clock (`server/lib/schedule.js`, copied
verbatim) over the 28 tracks already on Ortis's Wix media. Pages: Seuil,
Radio, Atlas, Écrits, Portfolio (the three rooms, ported), DJ booth. The
music survives page changes; a full-page visualiser paints nine layers on one
canvas (roadmap #28's goal, now a failable check); a Visuals panel for every
listener plus a DJ broadcast look; the queue editor and Spontaneous Emissions
commit `site/station/control.json` through the GitHub contents API.
`.github/workflows/` runs the self-test and deploys Pages.

**Shared code touched, defaults preserved:** `Station` gains `shuffle`
(default true); `/api/station|queue|schedule` bodies moved to
`server/lib/payloads.js`. `npm test` count unchanged for the old suites.

**Verified (this container):** `bash scripts/build-test.sh` → 257 tests,
43/43 browser checks, **32/32 site checks** (new stage 7: two listeners on the
same second, music across navigation, 85–91 % stage coverage, booth commit
adopted by a second listener, 390 px phone, dist/ under /radio-tower/, tower
mode against a real server). "The tower is sound."

**Not verified here:** playback of the real Wix URLs and a real Pages deploy —
the container cannot reach static.wixstatic.com or github.io.
