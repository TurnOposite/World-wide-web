---
name: tower-mobile-check
description: Verify the Radio Tower player on a phone — mobile emulation in the browser smoke test, the iOS Safari hazards specific to a player that seeks on every join, and the physical-device checklist only a human can run. Use when working on mobile behaviour, the Media Session API, lock-screen metadata, "it doesn't work on my phone", or roadmap items #2 and #3.
---

# Checking the tower on a phone

`BRIEF.md` §7 says *"the stranger opens it on a phone"*. That word is doing a
lot of work, and as of 2026-08-18 nothing in this project has ever tested it.
This skill exists so the next agent does not have to re-derive what "test it on
a phone" means, or discover the iOS hazards the hard way.

## The one thing to understand first

**This player seeks on every single join.** That is not an edge case — it is the
entire join protocol. `joinLive()` sets `audio.currentTime` to the offset the
station clock computed, every time a listener tunes in and every time a track
rolls over. Read `.claude/skills/tower-station-clock/SKILL.md` if that is not
familiar.

Every mobile hazard below is a hazard *because* of that. A player that just hits
play from zero would dodge most of this. This one cannot.

## What emulation can and cannot prove

Playwright's device emulation sets a viewport, a touch flag, and a user-agent
string. It does **not** give you WebKit-on-iOS. Chromium pretending to be an
iPhone is still Chromium: same audio stack, same media policy, same range-request
handling.

| Question | Emulation settles it? |
|---|---|
| Does the layout work at 390x844? | **Yes** |
| Is "Tune in" reachable and tappable? | **Yes** |
| Does a touch tap satisfy the gesture requirement? | **Yes** |
| Does join-at-offset still land correctly on a small screen? | **Yes** |
| Does iOS Safari accept `currentTime` on a streamed file? | **No** |
| Does audio survive a screen lock? | **No** |
| Does Media Session populate the iOS lock screen? | **No** |
| Does the 206 response satisfy WebKit's range parser? | **No** |

So: add the emulation profile because it catches layout and gesture-flow
regressions for free and costs nothing to run. Then say plainly, in the worklog,
that it is not Safari. **Never write "verified on mobile" off an emulated run.**
Write "verified in a mobile viewport under Chromium".

## Adding the emulated profile

`scripts/browser-smoke.mjs` already drives the desktop path. The mobile addition
should run the *same* assertions, not new ones — tune in, land at the right
offset, drift under 2s, survive a rollover — under a phone-shaped context:

```js
const iPhone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
             'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
const ctx = await browser.newContext(iPhone);
```

Use `page.tap()` rather than `page.click()` for the tune-in button — with
`hasTouch: true` that is what a real listener does, and it is the code path that
matters for the autoplay gesture.

If Playwright ships WebKit in the environment you are in, run the same profile
against `webkit` as well. It is desktop WebKit, not iOS WebKit, but it is the
closest automated approximation available and it will catch range-request and
`currentTime` problems that Chromium forgives.

## The iOS Safari hazards, specifically

**1. Audio needs a user gesture.** Handled today — nothing plays until the
listener taps "Tune in". Keep it that way. Any future auto-join, "resume on
load", or reconnect-after-error path that calls `audio.play()` without a fresh
tap will silently fail on iOS. If you add one, it must fall back to showing the
button again, not to a spinner.

**2. `currentTime` before metadata is loaded.** Setting `currentTime` on an
element that has not reached `HAVE_METADATA` is unreliable across WebKit
versions — the assignment can be ignored, or fire a `seeked` event without having
moved. If a join lands at offset 0 on a phone but at the right place on desktop,
this is the first thing to check: wait for `loadedmetadata` before seeking.

**3. Backgrounding and screen lock.** iOS suspends media in a backgrounded tab
unless the page has an active Media Session. This is the argument for roadmap #3
being a correctness item rather than polish — until it is built, the expected
behaviour on a locked iPhone is *the music stops*, which fails §7 the moment the
stranger puts their phone in their pocket.

**4. Coming back from a suspend is not a resume — it is a re-join.** This is a
station. If the listener returns after four minutes, the correct behaviour is to
re-read `/api/station` and seek to live, never to continue from where the buffer
stopped. `public/app.js` already re-joins on `visibilitychange`; verify that path
specifically on a phone, because it is the one a real listener hits constantly
and no automated test currently exercises.

**5. Range requests.** `server/lib/stream.js` handles closed, open-ended and
suffix ranges and returns a correct `Content-Range`; `tests/stream.test.js`
byte-compares 206 slices against the full body. That is solid, and it is the
reason to be *reasonably* confident here. WebKit is stricter than Chromium about
off-by-one `Content-Range` values, so if audio plays everywhere except Safari,
re-read that file before suspecting the clock.

## The physical-device checklist

Four minutes, needs a human and a real phone. This is the only thing that
actually closes roadmap #2.

1. Open the station URL on an **iPhone, in Safari** (not Chrome for iOS — it is
   WebKit underneath, but test the real one first). Tap **Tune in**.
   -> Audio starts within a couple of seconds.
2. Check the drift readout in the header. -> Under 2s.
3. Have a desktop browser on the same station. -> Same track, same place.
   *This is §7. Everything else is scaffolding for this line.*
4. **Lock the phone.** Wait 60 seconds. Unlock.
   -> Does audio still play? Does the lock screen show anything? (Today: expect
   no metadata. If audio also stopped, roadmap #3 is a correctness bug and
   should be re-ranked immediately.)
5. Switch to another app for two minutes, come back.
   -> Player re-joins live rather than resuming behind.
6. Wait out a track rollover with the screen on. -> Rolls over cleanly, no gap,
   no double audio.
7. Repeat 1-3 on an **Android phone in Chrome**.
8. On cellular data, not just Wi-Fi — a different network path, and the one a
   stranger handed a URL will actually be on.

Record the result in `docs/WORKLOG.md` with the phone model and OS version.
A "works on my phone" with no version is not evidence a future run can use.

## Where this fits

- Roadmap **#2** — prove the player on a real phone (this skill's main subject)
- Roadmap **#3** — Media Session and lock-screen metadata (checklist step 4
  decides how urgent it is)
- `tower-selftest` — how to run and read the harness this extends
- `tower-station-clock` — why seeking on join is non-negotiable
