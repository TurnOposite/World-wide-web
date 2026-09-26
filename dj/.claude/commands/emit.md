---
description: Fire a Spontaneous Emission — reorder the station's upcoming queue to a mood, live.
argument-hint: "<mood>  e.g. night drive | liminal | game | study | something like macroblank"
---

Put this on the air: **$1**

Work in this order, and stop at the first thing that looks wrong.

1. **`node dj.mjs status`.** Confirm the station is reachable, the booth is
   OPEN (the server has a `STATION_KEY`), and something is actually movable.
   If the booth is closed, say so and stop — no amount of client-side effort
   opens it; the server has to be restarted with a key.

2. **`node dj.mjs emit "$1" --dry-run`.** Read the plan out loud: how many of
   the movable slots matched, and which tracks move where. If **zero** matched,
   do not send it. Tell Ortis nothing upcoming fits that mood, and offer the
   two honest options — a wider mood, or adding an entry to `moods.json` (show
   him the entry you'd add).

3. **Send it.** `node dj.mjs emit "$1"` — or `--top 3` if the plan looked like
   it was rewriting the whole hour when he only wanted a change of scene.
   On `too_close_to_air` or `not_a_permutation`, the booth already retries once;
   if it still fails, report the refusal verbatim rather than retrying blind.

4. **Report in numbers.** Which cycle and slot the override lives on, how many
   slots matched, and — explicitly — that the track on air was not touched.
   Mention `node dj.mjs clear` puts the station clock back.

Never lower `QUEUE_LOCK_SECONDS`, never edit anything in the parent folder, and
never move or delete audio.
