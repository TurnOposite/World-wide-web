---
description: Do one complete improvement cycle on Radio Tower — baseline, pick one thing, build it, prove it, log it.
argument-hint: "[optional: what to work on]"
---

Run one full build cycle on Radio Tower. Use the `tower-builder` agent's
discipline whether or not you delegate to it.

$1

If nothing was specified above, pick the work yourself from `docs/ROADMAP.md`.

## The cycle

1. **Read the guide.** `BRIEF.md` first — it holds the original request, the
   locked decisions, and the rules. Then `docs/WORKLOG.md` so you do not redo
   finished work, and `docs/ROADMAP.md` for what is next.

2. **Baseline.** `bash scripts/build-test.sh`. Record the result. If it is
   already red, fixing that regression *is* the task — stop there and do it.

3. **Choose exactly one thing.** Highest-ranked unblocked roadmap item, or the
   thing named above. Not two things. If the roadmap is empty, do a survey pass
   instead: read the code fresh, find the weakest part, and add concrete roadmap
   items with reasoning. That is a real result.

4. **Say the plan out loud** before typing: what changes, which files, how you
   will know it worked. If it touches `server/lib/schedule.js`, name the
   invariant from `BRIEF.md` §3 you are preserving and how.

5. **Build it.** ES modules, no front-end build step, no new dependency without
   a justifying line in `docs/DECISIONS.md`.

6. **Prove it.** A test that fails without your change, then
   `bash scripts/build-test.sh` green. Never weaken an existing test to pass.

7. **Log it.** Append a dated entry to `docs/WORKLOG.md` (ran / changed / why /
   verified / next), update `docs/ROADMAP.md`, and add to `docs/DECISIONS.md` if
   you made a non-obvious call.

8. **Report** in five lines: what changed, self-test before → after, what you
   found but did not fix, and the single best next step.

If something is genuinely ambiguous and Ortis is here, ask him one clear question
with options. If nobody is there, choose the most defensible option, write the
assumption at the top of the worklog entry, and continue.
