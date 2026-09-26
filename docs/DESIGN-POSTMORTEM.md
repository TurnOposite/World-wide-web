# Why the website design asks did not land

Written 2026-08-28, at Ortis's request: *"look at all the prompts I've given in
this project to determine why my requests for website design were not correctly
carried out and determine a fix for that."*

This is not a list of excuses. Every claim below was checked against the code
on disk today, and two of the four causes are now fixed rather than described.

---

## The short answer

Four things went wrong, and they compounded:

1. **Your browser was running old code.** Two correct deploys looked like
   silent failures. This is now fixed.
2. **The brief made the constraints measurable and the goal vague**, so the
   builder optimised the constraints. It built exactly what was written.
3. **The verification proved the wrong thing** — frame-cost numbers and
   screenshots, both green, on a feature that was absent.
4. **A process defect ate one deploy** — prose pasted into a shell.

Cause 1 is the one that cost the most, because it corrupted the feedback loop
that would have caught the other three.

---

## 1. The stale-cache bug — FIXED THIS RUN

`server/index.js` served `public/` with `maxAge: '1h'`, which put
`Cache-Control: public, max-age=3600` on every `.js` and `.css` file. A
returning listener kept running whatever JavaScript they had already cached,
for an hour at a time, without ever asking the server whether it had changed.

It was diagnosed live from inside your own browser on 2026-08-20:

- `fetch('/viz.js', {cache:'no-store'})` returned the **new** file.
- `await import('/viz.js')` in the same page returned the **old** module.
- `#vizStage` was in the served HTML *and* in the served `styles.css`, but no
  rule matching it existed in any entry of `document.styleSheets`.
- `Ctrl+Shift+R` fixed all of it instantly.

**Why this is the expensive one.** You looked at a correct deploy and said
nothing had changed — accurately, because nothing had. The response was to
tune the numbers again and redeploy, which also looked unchanged. Two rounds
of tuning were spent on a value that was already live. Any design instruction
you gave in that window was being judged against code that predated it.

It is also a listener-facing bug in its own right: you cannot tell a stranger
who opened a link to press Ctrl+Shift+R.

**The fix**, in `server/index.js`: everything the browser *executes* is served
`no-cache`; only `/assets/` stays cacheable. `no-cache` does not mean "do not
store" — the file is still kept and revalidated, so the normal case is an
empty 304, not a re-download. Pinned by `tests/static-cache.test.js`, which
asserts the headers directly and proves the 304 still happens, because this is
invisible to every other test in the suite: the server sends the right bytes
either way.

---

## 2. The brief made its constraints testable and its goal an adjective

This is the real design lesson, and it is worth more than the bug above.

[`docs/prompts/PROMPT-viz-fullbleed.md`](./prompts/PROMPT-viz-fullbleed.md)
asked for a full-viewport visualiser. It then said, in the same brief:

> Cap the stage's opacity low (start ~0.35 and expect to come down), lean on
> the low/mid layers rather than the high-frequency sparks, and keep it away
> from the horizontal band where the track title and the two panels sit. Body
> text contrast must not measurably drop — check it, don't assume it.

and

> the stage must run at its own tier, at least one below the frame's […] the
> stage drops out before the art-frame ring does.

Read those as instructions to optimise against. **"Fills the page" cannot be
measured. "Protected-rectangle alpha must not rise" can.** So the builder
satisfied the measurable ones exactly, and the unmeasurable one not at all —
and, correctly by its own lights, reported success.

You can watch this happen in `docs/DECISIONS.md`. The keep-clear rectangle was
measured at **exactly zero alpha** inside the protected region, reported as a
strength. And then, honestly:

> at the phone viewport (390×844) and scroll position zero, the on-air card
> plus the two panels alone are taller than the viewport […] The keep-clear
> rectangle is therefore correctly *larger than the entire visible screen*,
> and the stage has nowhere legible to paint above the fold on a phone.

That is a feature that had been constrained out of existence, described
accurately, and shipped. The builder was not being careless — it flagged the
limitation and named the two honest ways out. The brief simply told it that
invisibility was the safe failure.

**What is actually in the code today** (verified on disk, 2026-08-28):
`_frame()` calls `_paint(w, h, dt)` for the small art-frame canvas and
`_paintStageIfActive(dt)` for the full-page one. `_paintStageIfActive` reaches
only `_paintStageWash`. The five methods that make the visualiser recognisable
— `_paintLowLayer`, `_paintRing`, `_paintShocks`, `_paintSparks`,
`_paintRibbon` — are called **only** from `_paint`, and `_paint` is called
**only** against the art frame. There is no geometry on the stage canvas to
reveal. No value of `stageOpacity` or `stageScale` can fix that, which is why
two rounds of tuning did not.

---

## 3. The verification proved the wrong thing

The fullbleed brief asked for frame-cost numbers and screenshots at two
viewports. It got them: a table of milliseconds per frame, an alpha-channel
survey, screenshots at 1280×900 and 390×844. All green. All measuring
*whether the stage was cheap and safe*, none measuring *whether the stage was
there*.

A visual feature needs an acceptance check that can fail for the reason you
would actually reject it. "I took a screenshot" is not one — a screenshot of
an invisible effect looks like a screenshot.

---

## 4. The process defect (already filed)

Roadmap #26: deploy handoffs mixed pasteable commands and prose in one block,
and prose got pasted into a shell, half-failing a deploy. Already a filed
process fix; the rule is commands-only inside fences, every word of
explanation outside them.

---

## The fix, as rules

These are for whoever picks this up — including you, pasting a prompt.

**1. State the goal as something that can fail.** Not "the stage should read
across the whole viewport" but: *with Stage active at 1280×900, sample the
stage canvas's alpha on a stride-5 grid; at least 25% of samples outside the
on-air card must be non-zero. Assert it in a test.* If the number is wrong,
argue about the number — but have one. The alpha-sampling harness to do this
already exists; it was used to prove the opposite property.

**2. Protect legibility with geometry, not faintness.** Every panel in this
design already has an opaque background. Text sitting on an opaque box is
legible over an arbitrarily bright backdrop — that is what the box is for.
The keep-clear rectangle is doing a job the CSS already does, and it is the
thing suppressing the feature. The masthead is the one genuinely transparent
region and is the only one that needs protecting.

**3. Never let "safe" be the same as "invisible".** If a constraint set makes
the feature impossible, that is a finding to bring back, not a thing to ship.
The last run *did* say so, in `DECISIONS.md`, in a paragraph headed "An honest
limitation" — and it shipped anyway. The rule: if the honest limitation is
"the feature cannot appear", stop and say so in the response, not only in the
log.

**4. Your eye is the acceptance test, so protect the feedback loop.** With the
cache bug fixed, what you see is now what is deployed. Ship visual changes
behind the existing `#vizPreset` cycle, non-default, so a bad one costs a
click rather than a redeploy.

---

## The prompt to actually use

When you come back to this, paste this rather than
`PROMPT-cache-and-stage-defaults.md` (whose Job 1 is done and whose Jobs 2 and
3 tune the wrong thing).

---

You are `tower-builder`. Read `BRIEF.md`, `docs/DESIGN-POSTMORTEM.md` and
`docs/DECISIONS.md` first. Baseline `bash scripts/build-test.sh` before you
touch anything.

**The job: run the real visualiser on the full-page canvas.** `#vizStage`
exists, is correctly sized and positioned, and is fed by the same audio graph.
What it lacks is geometry: `_paint()` is only ever called against the art
frame. Call it against the stage too.

`_paint()` already derives everything from `(w, h)`, so it generalises — but
two things are genuinely not free, and they are the whole job:

1. **The hole in the middle must be the on-air card, not `ART_FRACTION`.**
   `_paint` computes `artHalf = min(w,h) * ART_FRACTION / 2`. On a full
   viewport that puts a ring the size of the screen behind the text. For the
   stage, the ring's inner radius must come from the on-air card's
   `getBoundingClientRect()`. Pass the geometry in rather than branching on
   "am I the stage" inside five paint methods.
2. **`TIERS` must govern the stage independently, and the stage drops out
   first.** The art-frame ring is the part that already works and is never
   sacrificed for this. That constraint stays.

**Delete `_stageKeepClear` and `_paintStageWash`.** The wash is what shipped
instead of this feature, and the keep-clear rectangle is what made it
invisible. Legibility is protected by the panels' own opaque backgrounds; the
masthead has none, so give it one rather than keeping a global mask.

**Acceptance, and it must be able to fail:** with `Stage` active at 1280×900,
sample `#vizStage`'s alpha channel on a stride-5 grid. At least 25% of samples
outside the on-air card's rectangle must be non-zero. Assert it in
`tests/viz.test.js` against a headless run. Separately, measure text contrast
on `.onair` and `.masthead` and show it unchanged. Report both numbers.

`Frame` stays the default. `Stage` stays a preset. If it cannot be made both
visible and legible, stop and say so **in your reply**, not only in
`DECISIONS.md`.
