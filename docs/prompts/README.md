# docs/prompts/ — the briefs Ortis pasted into Claude Code

These three files sat at the repo root until 2026-08-28. They are the actual
briefs that produced the visualiser and backdrop work, kept because they are
the clearest record of what was *asked for* — which is not always what the
worklog records as having been *built*, and the gap between those two is
itself worth being able to read.

| File | Status |
|---|---|
| [`PROMPT-viz-backdrops.md`](./PROMPT-viz-backdrops.md) | **Run.** Shipped 2026-08-19 — `public/backdrops.js`, three WebP images, live on the Pi |
| [`PROMPT-viz-fullbleed.md`](./PROMPT-viz-fullbleed.md) | **Run, and this is the one that did not land.** A `Stage` preset shipped, but it paints a bloom wash, not the visualiser. See [`../DESIGN-POSTMORTEM.md`](../DESIGN-POSTMORTEM.md) |
| [`PROMPT-cache-and-stage-defaults.md`](./PROMPT-cache-and-stage-defaults.md) | **Job 1 done 2026-08-28** (the stale-cache bug — fixed in `server/index.js`, pinned by `tests/static-cache.test.js`). Jobs 2 and 3 are superseded: they tune a stage that should be replaced, not tuned |

## If you are picking this up again

Do not run `PROMPT-cache-and-stage-defaults.md` as written — its Job 1 is
already done and its Jobs 2 and 3 ask you to tune `stageOpacity` and
`stageScale` on an effect that two rounds of tuning already proved cannot be
fixed by tuning. The current, correct brief for that work is
[`../DESIGN-POSTMORTEM.md`](../DESIGN-POSTMORTEM.md) §"The prompt to actually
use", which was written after working out why the first two attempts missed.
