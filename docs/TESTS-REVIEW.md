# The tests: what to simplify, without blind spots

Ortis, 2026-11-17: « 500 tests is a lot … look at what simplification the tests could go through to still
encapsulate everything that the site needs to work, but also centralize those things without leaving blind
spots. » A review, not a change: nothing below is done yet. Each item says what it removes, what replaces it,
and what would be lost if done carelessly.

## What there is today

| Layer | Where | Count | Runs on |
|---|---|---|---|
| Unit and integration tests | `tests/*.test.js` (47 files, ~9,700 lines) | 513 | `npm test`, CI |
| Shell checks against a live server | `scripts/build-test.sh` stages 1, 4, 5 | ~20 | self-test, CI |
| The Pi-era player in a browser | `scripts/browser-smoke.mjs` (`public/`) | 46 | self-test, CI |
| The website in a browser | `scripts/site-smoke.mjs` (one 2,000-line file) | 187 | self-test, CI |
| The Atelier in a browser | `scripts/atelier-smoke.mjs` | 27 | self-test, CI |
| The claude.ai preview | `scripts/preview-smoke.mjs` | 19 | **never** (not in the self-test nor CI) |

About 790 checks in all. The number is not the problem by itself — the whole run takes ~15 minutes, and most
tests are small. The problems are **the same rule tested four or five times in four or five shapes**, **tests of
things no visitor runs any more**, **tests that read source text instead of behaviour**, and **one check that is
always red on the laptop**, which teaches everyone to ignore red.

## 1. Retire what no one runs (≈ 75 checks, with their code)

These test features the live site no longer uses. Removing the tests alone would leave dead code untested;
the proposal is to remove **the feature and its tests together**, each in its own commit.

| What | Tests | Why it is dead |
|---|---|---|
| The Pi-era player, `public/` (BACKLOG B6) | `browser-smoke.mjs` (46), `backdrops.test.js` (5), half of `static-cache.test.js`, `api.test.js` « the player HTML / the programme guide page are served » (2), the « player page is served » shell check | Since the tower serves the site (`SITE_DIR`), no listener loads `public/`. `public/viz.js` and `public/queue.js` stay: the site copies them (`site/js/lib`), so `viz.test.js` and `queue-ui.test.js` stay, re-pointed at the copies |
| GitHub Pages go-live (retired 2026-10-02) | `cloud-live.test.js` (6), the smoke's « go-live checker » and « dist/ under a repo sub-path » checks | The site is on Vercel at a domain root |
| The claude.ai preview plane | `preview-smoke.mjs` (19, never run), the 4 « preview plane » tests in `cloud-control.test.js` | Unused since the site went to Vercel; a test that never runs is a blind spot dressed as coverage — either retire it or put it in CI |

**Needs your word:** retire the Pi player (B6 already says yes, once stage 6 is re-aimed), Pages, the preview.
The classic shell (`?classic=1`, « kept one release » since 2026-10-20) is the next candidate: 31 smoke checks
run on it; retiring it would remove those and the code behind them.

## 2. One rule, one place (≈ 60 tests become ≈ 15, same coverage)

The same promises are written again for each layer (the counts in brackets are from reading the test names,
approximate). Keep each rule **once**, as a table or a property, and run it
against every engine that must keep it — then a new engine or route cannot be added without being held to it.

| Rule | Tested today in | Proposal |
|---|---|---|
| **Everyone hears the same second** (determinism) | `schedule.test` (3), `programme.test` (1), `channels.test` (1), `cloud-station.test` (2), the shell's « deterministic across 2,857 instants » | One `assertSameProgramme(make)` helper, run on `Station`, `DailyStation`, a channel, and the browser engine — two instances, random instants, restarts, a library change |
| **A reorder is a permutation behind the fence** | `queue-override` (12), `queue-compose` (7), `queue-api` (6), `cloud-station` (5), `queue-ui` (3) | Keep `queue-compose`'s random-decisions property test as the authority and run it against both the server and the browser engine; keep `queue-ui` for the editor's window; `queue-api` keeps only how HTTP answers (status codes) — ~20 example tests go |
| **Only the station key opens the station's doors** | `queue-api` (3), `telegraph` (1), `telegraph-log` (1), `notify` (1), `status` (1), `ratelimit` (1), `upload` | One table built from the router itself: every route is listed as **open** or **keyed**; the test fails if a route is in neither list, then checks each keyed one refuses no key and a wrong key and budgets wrong keys. **This closes a blind spot**: today a new keyed route is safe only if its author remembers to test it |
| **Range requests** | `stream.test` (11), `api.test` (5), the shell (3) | `stream.test` keeps every edge case; one HTTP test that a 206 reaches the client; the shell keeps one, against real ffmpeg audio |
| **No filesystem path ever leaves the tower** | `api.test`, `queue-api.test`, the shell | One test walking every open GET endpoint's answer for `relPath` / absolute paths — again from the router's list, so a new endpoint is covered without anyone remembering |
| **05:00 Paris, summer and winter** | `programme.test` (2), `telegraph.test` (1), `site-line-admin.test` (1) | One calendar test; the others assert only that they use the calendar |

Each server-booting test file today starts its own tower with its own settings (`telegraph`, `telegraph-log`,
`notify`, `status`, `api`, `queue-api`, `channels`, `warmup`, `upload`, `collections`, `boot`…). A shared
`tests/helpers/tower.js` (start one with these settings, give me its address, stop it) would remove ~300 lines of
repeated setup and make every one of them start the same way.

**Done 2026-11-17 (night), step 2 of the order below:** `tests/routes.test.js` reads the 25 routes from the router:
13 OPEN, 12 KEYED, and a route in neither list fails the suite. Every keyed route answers 401 to no key and a wrong
key and opens with the right one; wrong keys on any of them share one budget per address (twenty, then 429 even with
the right key). Every answer is walked for a path on disk, a file name or a `relPath` — and the walk's first run found
`/api/health` telling anyone where the music is on the tower's disk; that moved behind the key (`/api/status`). Both
checks were broken on purpose once (a route dropped from the table, the key taken off `/queue/clear`) and went red.
The ~10 key tests spread over other files are now redundant with this one; they go in step 3, with the shared helper.

**Done 2026-11-17 (night), step 3 of the order below — in part:**

- `tests/helpers/tower.js` (`startTower`): the fifteen files that stand up a tower start it one way now (boot and
  warmup keep their own: what they test is the start itself).
- The key refusals and path walks that `routes.test` holds for every route left `api`, `queue-api`, `telegraph`,
  `telegraph-log`, `notify`, `status`, `library-bot` and `ratelimit` (each test kept what it checks on its own, such
  as « checking a key moves nothing »); « another address is not locked out » moved into `routes.test`.
- « Everyone hears the same second » is `tests/helpers/same-programme.js` (`assertSameProgramme`): on air, the second,
  the next five, the hour's guide — run on the Station, the daily programme (across both clock changes) and each
  channel of the browser's engine. Broken on purpose (one second off, a different « next ») it went red. Writing it
  showed that a Station takes the scan's path-sorted list and that the order is part of the programme: the scan sorts
  with `localeCompare`, whose result can depend on the machine's language — harmless while one tower deals for
  everyone, worth knowing if two machines ever deal the same library.
- 520 → 515 tests, ~185 lines fewer, nothing it checked is unchecked.

**Done 2026-11-17 (night), the rest of step 3:**

- **The permutation**: `queue-compose`'s property test is the authority. It now also holds what three example tests in
  `queue-override` held — the revision unchanged, nothing before or after the window moved, the window ending at the
  same instant — and one in `cloud-station` (« never moves what is on air… »). The browser plans with the same
  Station (its copy is byte for byte, pinned), so it is not run twice; what is the browser's own, the control
  document's trip through JSON, is `assertSameProgramme` on two engines. Broken on purpose (a reorder that also swaps
  the track after its window) the property went red.
- **Range requests**: five HTTP tests in `api.test` are one (the whole file, a 206 slice, a suffix, a 416, HEAD); every
  shape of header stays in `stream.test`; the shell keeps its 206 on real audio and drops its 416.
- **The 05:00 calendar** stays in `programme.test`; the room's reset (`telegraph.test`) and the Booth's log days
  (`site-line-admin.test`) are each checked against it every ten minutes of two years instead of by examples. That
  found a bug: the Booth's `broadcastDay` took five hours off instead of reading Paris's hour, and filed 05:00–06:00
  under the wrong day on the two nights a year the clocks change. Fixed.
- 515 → 507 tests. Section 2 is done.

## 3. Behaviour, not source text (≈ 45 assertions)

Eleven files assert that a source file **contains** a line of code (`assert.match(read('site/js/…'), /…/)`):
`site-push` (9), `site-telegraph` (7), `site-modules` (6), `site-cast` (5), `site-dials` (4), `site-line-admin` (4),
and others. They break on a harmless rename and pass on a broken behaviour that kept the text. Most of these
behaviours are already checked for real in `site-smoke.mjs` (the bell, the Antenna offering no notifications,
the stream switch, the dials' layer). **Proposal:** delete the source-text assertions whose behaviour the smoke
checks; turn the rest into small browser checks. Keep text checks only where nothing can run the code
(`fire.yml`, which only GitHub runs; a CSS breakpoint shared with `layout.js`).

## 4. Split the 2,000-line smoke

`site-smoke.mjs` is one script: a failure early on (or a crash) hides every check after it, and two people
cannot change it without colliding. **Proposal:** one file per room (`radio`, `antenna`, `booth`, `echo`, `world`,
`phone`, `tower`) sharing one browser, one fixture tower and the `check()` reporter, run in a row by
`build-test.sh`. Same checks, readable failures, a crash costs one room.

## 5. Make red mean red

- **« phone on its side (844×390) »** is red on every Windows run by 0.125 px (the mini-player's edge, tolerance
  2 px, Chrome's sub-pixel rounding). Fix the measure (round both edges, or allow 1 px), so a laptop run can be
  fully green. Today « green » on the laptop means « green except that one », and a real failure beside it is
  easy to miss.
- **28 unit tests skip on Windows** when ffmpeg is not on PATH, silently. `npm test` should find the ffmpeg the
  self-test uses, or print loudly what it skipped.
- **Timing flakes** (`ratelimit.test` once at 10 s under load today; « …the music did not stop », « it is a
  permutation », the seam check fixed today): give every time-based test the injected clock most already
  accept, and in the browser wait for a condition instead of reading once (BACKLOG B5).

**Done 2026-11-17 (night), step 1 of the order below:**

- The side-phone red was **not** rounding: the frame really ran 2.1 px under the mini-player, which is 66.1 px tall
  with Windows' Segoe UI where the layout assumed 64. `world.js` now measures the mini-player (and places the frames
  again when it changes height); the check's slack went from 2 px to 0.5, since the 2 px is what hid it.
- `tests/helpers/ffmpeg.js` finds ffmpeg for all five files that need it (`$FFMPEG`, else PATH). `npm test` warns
  before it starts when it is missing, the self-test prints how many tests skipped, and under CI (or
  `REQUIRE_FFMPEG=1`) a missing ffmpeg is a failure, not 28 skips.
- `ratelimit.test`: the tower's budgets take the test's clock (`createApp({ now })`), so the burst count is exact
  (40, not « 40 to 42 ») and the refill is checked by moving the clock a second.
- The browser: « …the music did not stop » waits up to 3 s for the player to be playing and on the clock instead of
  reading once; « it is a permutation » allows for a track ending between its two reads (the window slides by one)
  and waits for « applied » instead of 300 ms.

## 6. Blind spots found (things nothing tests today)

- **`preview-smoke.mjs` never runs** (above).
- **The live tower's own `music\channels.json`** — the streams' fill is tested against the file in git, not the
  one on the tower. `npm run status` could say how many tracks each stream has, and warn on an empty one.
- **The library bot's lanes** (`albums --into "For Radio"` / `"More often"`) are not tested end to end with the
  programme: a test that a file placed by the bot lands in the lane the programme reads.
- **Real phones** (iOS audio, the Home Screen, notifications): no emulator settles them — the
  `tower-mobile-check` checklist, run by hand once after each phone-facing change.

## The order I would take it in

1. Section 5 (green means green) — small, and it makes every later step trustworthy.
2. The keyed-route table and the no-path walk (section 2) — they close blind spots, so they come before any deletion.
3. The shared tower helper, then folding the duplicate rules into their one place.
4. Source-text assertions → behaviour (section 3).
5. Splitting the smoke (section 4).
6. Retiring dead features with their tests (section 1), each with your word.

Estimated result: ~513 unit tests → ~380, the browser checks ~280 → ~200 (most of the drop from retiring the Pi
player and the preview), the same promises kept, and three new ones (every keyed route, every endpoint's paths,
the bot's lanes) that today depend on memory.
