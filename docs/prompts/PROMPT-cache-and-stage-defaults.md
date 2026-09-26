# Two fixes: the cache bug, and the stage's real defaults

Paste everything below the line into the Claude Code tab open on
`C:\Users\barri\Documents\Ortis\Radio Tower`.

---

You are `tower-builder`. Read `BRIEF.md` and `docs/DECISIONS.md` first. Baseline
`bash scripts/build-test.sh --no-browser` before you touch anything (3
pre-existing ffmpeg/python3 failures are expected and not yours).

Three jobs. **Job 1 is the important one** — the other two are cosmetic by
comparison and must not delay it.

## Job 1 — listeners are being served stale code after every deploy

This was diagnosed live, from inside Ortis's own browser, against the real Pi
immediately after the 2026-08-20 stage deploy. The evidence, so you fix the
actual cause and not a guess:

- `fetch('/viz.js', {cache:'no-store'})` returned the **new** file —
  `PRESETS` with all three of `frame`, `bands`, `stage`.
- `await import('/viz.js')` in the same page returned the **old** module —
  `PRESETS` with only `frame` and `bands`.
- `#vizStage` was present in the served HTML *and* in the DOM, and `#vizStage`
  was present in the served `styles.css` — but no rule matching it existed in
  any entry of `document.styleSheets`, and the element computed to
  `position: static; z-index: auto; 300×150`, i.e. the CSS never applied.
- A hard reload (Ctrl+Shift+R) fixed all of it instantly.

So: the last two deploys both looked like they had silently failed when the
files had in fact landed correctly. The preset button honestly reported a
two-preset module because that is what the browser was running.

**This is a listener-facing correctness bug, not a developer annoyance.** Every
person who has ever opened the station keeps running whatever JS they first
cached, indefinitely, with no signal that anything is wrong — and "press
Ctrl+Shift+R" is not an instruction you can give a stranger who opened a link.
By `docs/ROADMAP.md`'s own second tiebreaker (correctness-of-what's-already-live
beats reach-for-more-listeners) this outranks everything else in this file.

Fix it on the server, in `server/index.js`'s static handling. Work out what
`express.static` is actually sending today (check the real `Cache-Control`,
`ETag` and `Last-Modified` headers with `curl -I`, don't assume) and make it so a
returning listener always revalidates the HTML entry point and the ES modules,
while genuinely immutable assets (`/assets/backdrops/*.webp`) can still be cached
hard. Either approach is acceptable if you argue it in `docs/DECISIONS.md`:
`Cache-Control: no-cache` on HTML and `.js`, or content-hashed query strings on
the imports. **No bundler** — that is out of bounds for this project.

Then prove it the way it was diagnosed: change a byte in `public/viz.js`, serve
it, load the page **without** a hard reload, and show the browser picked up the
change. A test asserting the response headers belongs in `tests/`.

## Job 2 — the stage's defaults, tuned by ear on the live station

Ortis and I tuned this at `?viz=dev` against the real Pi, on real tracks. At the
shipped defaults (`stageOpacity: 0.35`, `stageScale: 1.0`) the stage is close to
invisible — his words on first seeing it deployed were that nothing had changed.
Settled on:

```
stageOpacity: 0.90
stageScale:   1.70
```

Make those the defaults in `defaultKnobs()`. Everything else in the panel was
left at 1.00 and should not move.

## Job 3 — the stage only lights one corner

At those values the stage is clearly alive, but it reads as a single soft mass in
the **bottom-left** of the viewport, with the rest of the page still black. Two
suspects, both yours to investigate rather than assume:

- `_stageKeepClear` may be masking far more than the text band it was written to
  protect — it was tuned when opacity was 0.35, and at 0.90 it is doing most of
  the suppression.
- `_seedStageBlooms` may be placing blooms such that only one or two land on
  screen at a wide aspect ratio.

The goal: the stage should read across the whole viewport — both sides of the
on-air card and the full width below it — rather than one corner. Legibility is
still the hard constraint from the previous brief and has not been relaxed:
measure text contrast, don't eyeball it. If making it symmetric costs legibility
at 0.90, lower the opacity and say so — the number above is what looked right
one-sided, not a commitment.

## Finishing

`bash scripts/build-test.sh --no-browser` with no new failures, plus
`node scripts/browser-smoke.mjs` against a real server. Screenshot the stage at a
desktop viewport and at 390×844.

**Then deploy to the real Pi**, staging over SSH into `~/rt-update` as before.
When you hand Ortis the privileged block, put the commands in **one fenced code
block containing nothing but commands**, and every word of explanation or warning
entirely outside it — the 2026-08-20 worklog records a deploy that silently
half-failed because prose inside the pasteable block got pasted into the shell.
That is a filed process fix; follow it.

After deploying, verify from outside: `/api/dev/reload` still 404, and — the new
one — a plain reload with a warm cache now picks up the new files.

Worklog entry, `docs/DECISIONS.md` line per judgement call, roadmap re-ranked.
