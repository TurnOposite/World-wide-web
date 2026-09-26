# Run this prompt in the Radio Tower folder

Open a terminal in `C:\Users\barri\Documents\Ortis\Radio Tower`, run `claude`, and
paste everything below the line. Leave the station running (`npm start`) in a
second terminal first — this run is meant to be iterated against a live page.

---

You are `tower-builder` for this run. Read `BRIEF.md`, `docs/ARCHITECTURE.md` and
`docs/DECISIONS.md` before you touch anything, and run `bash scripts/build-test.sh`
green **before** you start. Two related jobs, in this order. Do both fully or stop
after job A with a worklog line — a half-finished job B is worse than none.

## Job A — a live iteration loop for the visualizer

Today changing `public/viz.js` means a manual reload and re-listening for the
moment the drop lands. Fix that, because everything else in this run depends on
being able to *see* a change in under a second.

1. **Hot-reload `public/` in dev only.** `npm run dev` already uses `--watch` for
   the server; add a dev-only SSE endpoint (`GET /api/dev/reload`, registered only
   when `NODE_ENV !== 'production'`) that fires when a file under `public/`
   changes, and a small client in `app.js` that re-imports `viz.js` and rebuilds
   the `Visualizer` **without touching the `<audio>` element or the station
   clock**. Playback must not stutter, seek, or re-sync. If that proves impossible
   cleanly, fall back to a full `location.reload()` that restores playback
   position from the station clock — but say so in `docs/DECISIONS.md`.
   Zero new runtime dependencies; `node:fs.watch` is enough.
2. **Live knobs.** Add a hidden dev panel (toggled by `?viz=dev`, never shown to a
   normal listener, no bundle cost in production) exposing the tunables that
   currently live as constants in `viz.js` — per-band gain and smoothing, onset
   sensitivity, hue/drift, layer opacity, tier override. It writes to a plain
   object the render loop reads each frame. Dumping the current values as a
   paste-ready JS snippet is the point: I tune by ear, you paste the result back
   into the source as the new defaults.
3. Verify with the real page in a real browser, not just a unit test.

## Job B — more layers, same intelligence

Keep exactly what already works: `bands()` splitting the spectrum into low/mid/
high, `OnsetDetector`, the adaptive `TIERS` frame-cost budget, `prefers-reduced-
motion`, the album art at `ART_FRACTION`. **Do not replace the current visual** —
it stays the default and must look identical when the new work is switched off.

Add **layer independence**: today the bands mostly modulate one figure. Make each
band drive its own visual element with its own scale, so a bassline moves
something large and slow while a hi-hat moves something small and fast, and the
two are visibly separate objects rather than one shape wobbling. Concretely:

- A **low** layer: large, slow, low-frequency — a swelling squircle / radial
  bloom sized by `energy.low`, its motion smoothed over ~300ms.
- A **mid** layer: the existing mirrored sweep, unchanged, keyed to `energy.mid`.
- A **high** layer: small, fast, many — sparks or a fine ring, keyed to
  `energy.high` and gated by `OnsetDetector` so transients read as hits.
- Amplitude maps to **size**, not just brightness. Bigger for bigger.

Then make the set switchable — two or three named presets in `viz.js`
(`stations`? `looks`?) with the current one as `default`, cycled by a discreet
control in the player and remembered in `localStorage`. No new dependency, no
build step, and the frame budget still has to survive tier 0 on a phone.

## Job C — backdrops from the Portfolio images (only if A and B are green)

`C:\Users\barri\Documents\Pro\Portfolio` holds 12 images — `birdup.png`,
`thatbirdominous.png`, `whattheelephantbluer.png`, `cover.png`, and a set of
screenshots. Use them as **quiet** backdrops, not wallpaper.

- Copy (never symlink, never commit the originals from outside the repo) the
  usable ones into `public/assets/backdrops/`, downscaled and re-encoded to a
  size a Pi Zero 2 W can serve without thinking — target ≤150KB each, WebP,
  longest edge 1600px. `ffmpeg` is already accepted here as *offline* tooling
  (see `split/`); do the conversion offline and commit the outputs, do not
  transcode per request.
- Build a genre→backdrop map. Get the genres from `npm run scan -- --list` —
  read what the library actually reports rather than inventing categories, and
  if the tags are empty or useless, say so in the worklog and key off folder
  name instead. Anything unmapped falls back to the current sober background.
- Rendering rule: heavily darkened, blurred, low opacity (start ~8%), behind
  everything, cross-fading only on track change, and **never** competing with
  the album art or hurting text contrast. It should read as atmosphere someone
  only notices when it changes. Respect `prefers-reduced-motion` — no
  cross-fade, just a cut.
- Use the same images as placeholders wherever the UI currently renders an empty
  panel (the schedule page, any card with no art), same treatment.
- The screenshots are probably wrong for this. Look at them; use your judgement;
  drop the ones that look like screenshots of software and note which you
  dropped and why.

## Finishing

`bash scripts/build-test.sh` green. Append a dated entry to `docs/WORKLOG.md`, a
line to `docs/DECISIONS.md` for every judgement call (hot-reload approach, which
images you dropped, the genre mapping source), and re-rank `docs/ROADMAP.md` if
this run changed what matters next. State any assumption you had to make.
