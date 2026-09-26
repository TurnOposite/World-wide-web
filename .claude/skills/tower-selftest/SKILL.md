---
name: tower-selftest
description: Run and interpret the Radio Tower self-test — the script that test-builds the platform by booting a real server against generated audio and driving a real browser. Use before and after any change to the Radio Tower codebase, when a test fails and the cause is unclear, when asked whether the station is working, or when adding new checks to the suite.
---

# Test-building Radio Tower

The project proves itself with one command:

```bash
bash scripts/build-test.sh
```

Exit code 0 means the tower is sound. Anything else means something is broken and
the output says what. **Run it before you change anything and after** — a baseline
you did not take is a baseline you cannot compare against.

Flags:

```bash
bash scripts/build-test.sh --no-browser   # skip the browser stage (no Chromium)
bash scripts/build-test.sh --keep         # leave the test server and fixtures up
TEST_PORT=9100 bash scripts/build-test.sh # if :8199 is taken
```

## What each stage actually proves

**1 — Toolchain and syntax.** Node ≥ 20, every `.js` and `.mjs` parses,
dependencies present. Catches the trivial breakage instantly so you don't spend
two minutes booting a server to find a typo.

**2 — Test suite.** `npm test` — the `node:test` suite in `tests/`. Unit tests for
the schedule and range parsing, integration tests that boot the Express app over
generated MP3s. Around 50 assertions.

**3 — Live server.** Generates four sine-wave MP3s with ffmpeg into a temp
directory, boots the real `server/index.js` against them on `:8199`, waits for
`/api/health`. If this stage fails, the server log is printed — read it.

**4 — HTTP surface.** The checks that matter:

| Check | What it protects |
|---|---|
| `/api/health` reports ok | the station is on air at all |
| `/api/station` has something on air | the clock resolved to a track |
| no filesystem paths in the payload | `relPath` and `MUSIC_DIR` never reach a client |
| station clock advances in real time | offset moves ~1s per wall second, doesn't reset |
| schedule is deterministic | two `Station` instances agree across 2,857 instants — **this is the sync guarantee** |
| range requests return 206 | browsers can seek, which is how listeners join mid-track |
| ranged body is exactly N bytes | off-by-one in range math breaks Safari specifically |
| out-of-range returns 416 | correct rejection instead of a corrupt body |
| path traversal is refused | the station is on the public internet |

**5 — Performance.** `/api/station` averaged over 20 calls (must be under 100ms)
and resident memory (must be under 250MB, so it fits a Pi Zero 2 W). These are
Pi-fitness gates, not micro-optimisation.

**6 — Browser.** `scripts/browser-smoke.mjs` in headless Chromium: loads the
player, clicks Tune in, and asserts the audio element is actually playing within
2 seconds of where the tower says it should be. Then it waits for a track
boundary and checks the player rolls over on its own. This catches what unit
tests structurally cannot — autoplay policy, seeking before metadata is ready,
CORS on the Web Audio graph, and the drift-correction loop.

Set `CHROME_PATH` to use a system Chromium instead of a Playwright download:

```bash
CHROME_PATH=/usr/bin/chromium node scripts/browser-smoke.mjs http://127.0.0.1:8080
```

## Reading a failure

**Stage 2 red, everything else untested.** A unit test broke. Run `npm test` on
its own for the full assertion output. If it is a `schedule.test.js` failure,
stop and read `BRIEF.md` §3 before touching anything — you are in the one file
where a clever fix does real damage.

**"server never became healthy".** The log is dumped underneath. Usually a syntax
error the `--check` pass missed (a bad dynamic import), a port collision, or a
missing dependency.

**"station clock is wrong".** Two `/api/station` calls 1.2s apart did not advance
by roughly 1.2s. Either `Station.at()` has lost its dependence on wall-clock time,
or the epoch handling regressed. This is a serious failure — the whole product is
this one property.

**"schedule diverged between instances".** Two `Station` objects built from the
same tracks disagreed. Something stateful or non-deterministic crept into
`cycleOrder` or `seededShuffle` — a `Math.random()`, a `Date.now()` inside the
ordering, or a mutation of the shared track array. Listeners would hear different
songs. Fix before anything else.

**"ranged body was N bytes, expected 100".** Off-by-one in `parseRange` or in the
`createReadStream` bounds. `end` is inclusive in both HTTP and Node's stream
options — the bug is almost always forgetting that twice or once.

**"resident memory NMB is high for a Pi".** Something is holding the library
twice, buffering whole tracks, or leaking listeners. Check `Listeners.seen`
expiry and any new caching.

**Browser stage fails but everything else passes.** Look at which check. "audio
element is playing" failing usually means autoplay policy — the smoke script
passes `--autoplay-policy=no-user-gesture-required`, so if it fails there,
playback genuinely broke. "playback is in sync" failing with a large drift means
the seek-on-`loadedmetadata` path regressed.

## Adding checks

Put pure logic in `tests/*.test.js` — they are fast and run everywhere. Put
anything needing a live server in `tests/api.test.js`. Put anything needing a
real browser in `scripts/browser-smoke.mjs`. Add a curl-level check to
`build-test.sh` only when it is an operational property (a status code, a header,
a timing) rather than a behaviour.

When you add a check, make it fail first. A check that has never failed has never
been shown to check anything.
