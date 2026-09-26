# Hot fix: the visualiser fills the page, not just the album frame

Paste everything below the line into the Claude Code tab you already have open
in `C:\Users\barri\Documents\Ortis\Radio Tower`.

---

You are `tower-builder`. Read `BRIEF.md` and `docs/DECISIONS.md` first. Run
`bash scripts/build-test.sh --no-browser` before you start and note the baseline
(3 pre-existing ffmpeg/python3 failures are expected and not yours).

**The problem.** `#viz` is `position:absolute; inset:0` inside `.art-frame` — a
square box around the cover. Everything either side of the on-air card, and the
whole page below it, is dead black. That empty space is where the visualiser
should live. Ortis saw it live and said so.

**The fix.** A full-viewport visualiser stage behind the whole page, with the
existing art-frame ring kept intact on top of it.

1. **New canvas `#vizStage`** in `index.html`, `position:fixed; inset:0;
   z-index:0; pointer-events:none`, sitting above `.backdrop` (z-index -1) and
   below `main`/`header` content. Give `main`, `header` and `footer` an explicit
   `position:relative; z-index:1` so nothing text-bearing ends up underneath it
   by accident.
2. **One audio graph, two canvases.** Do NOT construct a second `Visualizer`
   that builds its own graph — `createMediaElementSource()` can only be called
   once per media element, which the hot-reload work already discovered. Pick
   whichever is cleaner in the code as it actually stands:
   - teach `Visualizer` to hold a list of render targets and paint the same
     frame to each with its own `_resize()`/geometry, or
   - construct a second instance and transplant the existing
     `AudioContext`/analyser onto it, reusing exactly the mechanism
     `app.js`'s hot-reload client already uses.
   Either way the FFT is read **once per frame**, not twice. Say which you chose
   and why in `docs/DECISIONS.md`.
3. **Frame budget.** A full-viewport canvas is 5–8× the pixels of the art frame,
   and the cost lands on the listener's phone, not the Pi. The stage must run at
   its own tier, at least one below the frame's, and the existing adaptive
   `TIERS` cost measurement must govern it. If the measured frame cost can't hold
   the budget, the stage drops out before the art-frame ring does — the ring is
   the thing Ortis already likes and it is never sacrificed for the new one.
   On `prefers-reduced-motion`, the stage does not render at all.
4. **Legibility is the hard constraint.** This is atmosphere behind a page of
   text, not a screensaver. Cap the stage's opacity low (start ~0.35 and expect
   to come down), lean on the low/mid layers rather than the high-frequency
   sparks, and keep it away from the horizontal band where the track title and
   the two panels sit. Body text contrast must not measurably drop — check it,
   don't assume it.
5. **Make it switchable.** Extend the existing `#vizPreset` cycle rather than
   adding a second control: `Frame` (today's behaviour, stage off — this stays
   the default until Ortis says otherwise), `Bands`, and a new `Stage` that turns
   the full-page canvas on. Persist to `localStorage` as it already does.
6. **The dev panel gets a stage section** — at minimum stage opacity, stage
   scale, and stage tier override, so Ortis can tune this by ear at
   `?viz=dev` without another round trip.

**Verify** with `node scripts/browser-smoke.mjs` against a real server and real
music, plus a Playwright pass that screenshots all three presets at a desktop
viewport *and* a 390×844 phone viewport. Attach the frame-cost numbers you
measured for the stage — I want to see them, not a claim that it's fine.

**Then deploy it to the real Pi**, the same way as the last run: stage over SSH
into `~/rt-update`, and hand Ortis the exact `sudo` block to paste rather than
attempting it yourself. Confirm afterwards that `/api/dev/reload` is still a 404
on the live station.

Worklog entry, `docs/DECISIONS.md` line for every judgement call, roadmap
re-ranked. If the stage can't be made legible at any opacity, stop, say so, and
leave `Frame` as the default — that is a real outcome, not a failure.
