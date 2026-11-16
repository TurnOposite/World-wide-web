---
description: Where Radio Tower stands right now — code health, self-test result, roadmap, and whether the station is live.
---

Report the current state of Radio Tower. Be concrete and brief; this is a status
check, not a report.

1. Read `BRIEF.md` (the standing guide), then `docs/BACKLOG.md` (the to-do
   list) and the newest entries of `docs/WORKLOG.md`.

2. Run the self-test:

   ```bash
   bash scripts/build-test.sh --no-browser
   ```

3. Read the live state in one screen — GitHub `main` and its self-test, the
   commit Vercel serves, the tower's health and commit, listeners, the
   telegraph line, the next 05:00, and what changed since last time:

   ```bash
   npm run status
   ```

   Add `-- --repeats 14` for the same-song-twice warnings (slower: it reads 14
   days of programme from the tower). A part that does not answer is reported
   as such, not as a failure of the others.

4. Report, in this shape and nothing longer:

   - **Station** — on air or not; tracks, listeners, uptime; the commit on the
     tower, on Vercel and on GitHub `main` (they should be the same one)
   - **Self-test** — pass/fail, and the failing checks if any
   - **Last worked on** — the most recent worklog entry, one line
   - **Next up** — the first open item of `docs/BACKLOG.md` that does not wait on Ortis
   - **Anything rotting** — known issues nobody has picked up

Do not fix anything. If something is broken, say what and offer to run
`/tower-work` on it.
