---
description: Where Radio Tower stands right now — code health, self-test result, roadmap, and whether the station is live.
---

Report the current state of Radio Tower. Be concrete and brief; this is a status
check, not a report.

1. Read `BRIEF.md` (the standing guide), then `docs/WORKLOG.md` and
   `docs/ROADMAP.md`.

2. Run the self-test:

   ```bash
   bash scripts/build-test.sh --no-browser
   ```

3. Check whether a station is actually running anywhere reachable:

   ```bash
   node scripts/healthcheck.js 2>&1 | head -20
   ```

   If nothing answers, say so plainly — it is not an error, it just means the
   station is not up locally right now.

4. Report, in this shape and nothing longer:

   - **Station** — live or not; if live: track count, cycle length, listeners
   - **Self-test** — pass/fail, and the failing checks if any
   - **Last worked on** — the most recent worklog entry, one line
   - **Next up** — the top unblocked roadmap item
   - **Anything rotting** — known issues nobody has picked up

Do not fix anything. If something is broken, say what and offer to run
`/tower-work` on it.
