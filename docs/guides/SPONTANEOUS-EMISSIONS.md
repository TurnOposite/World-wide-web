# Spontaneous Emissions™

**One command that says "play this vibe now" and rewrites what the station is
about to play — live, from the music on this laptop, without a restart and
without cutting off the track someone is already hearing.**

Built 2026-08-19. Lives in [`dj/`](../../dj/). Nothing else in the project
changed to make it work.

---

## The 30-second version

```bash
cd "C:\Users\barri\Documents\Ortis\Radio Tower\dj"
$env:STATION_URL="http://localhost:8080"      # or http://raspberrypi.local:8080
$env:STATION_KEY="<the key the station was started with>"

node dj.mjs status              # what's on now, what can be moved
node dj.mjs emit "liminal"      # ← the emission
node dj.mjs clear               # put the station clock back
```

Bash / the Pi: `export STATION_URL=...` instead of `$env:`.

Named moods: `night drive` · `liminal` · `upbeat` · `game` · `study` ·
`short set` · `deep` · `vapor` · `jungle` · `french`.
Anything else is free text — `emit "something like macroblank"` works.

---

## What actually happens

1. `GET /api/queue` — the upcoming slots, each flagged `locked` or not.
2. Find the **movable window**: the longest unbroken run of unlocked slots
   inside a single cycle. What's on air is never in it, and neither is anything
   starting in the next 60 seconds.
3. Score every slot against the mood. Genre is worth 100, each keyword found in
   the title/artist/album 40, `exclude` −200, a duration preference ±20.
4. Stable-sort. Equal scores keep the order the clock gave them.
5. `POST /api/queue/reorder {cycleIndex, startWithin, ids}`.
6. Every listener's player picks it up on its next poll. Nobody skips.

Flags worth knowing:

| | |
|---|---|
| `--dry-run` | print the exact plan, send nothing. Free. Use it when guessing. |
| `--top 3` | move only the three best matches forward; everything else keeps its programmed order. A change of scene rather than a rewritten hour. |
| `--url`, `--key`, `--music` | override the environment for one command |

---

## The rule that makes it safe

**An emission is a permutation. Nothing else.**

The same tracks in a different order, so the window ends at exactly the same
instant it would have. `cycleSeconds` doesn't move, no era is created, and a
listener outside the window hears no difference at all.

Swapping a 3-minute track for a 5-minute one would shift every cycle boundary
since the epoch, for every listener, forever. That is why there is no "insert
this track" button and why there will not be a quick one.

So, plainly, the things it **cannot** do:

- **Pull a specific track in from the wider library.** Only what is already
  standing in the window can move.
- **Skip what is playing.** There is no endpoint. On purpose.
- **Match a mood that isn't in the window.** When nothing scores, the booth
  refuses rather than shuffling for the look of it, and tells you so.

The honest workaround for all three is the same: wait for the cycle to bring
different tracks into range, widen the mood, or fix the library. There is a
ranked roadmap item ("DJ set override") for the server-side change that would
lift the restriction properly.

---

## Adding a mood

`dj/moods.json` — plain data, re-read on every run, safe to edit while the
station is live.

```json
"rainy sunday": {
  "aliases": ["rain", "grey"],
  "why": "Slow, warm, nothing with a transient in it.",
  "genres": { "barber-beats": 1, "ambient": 1, "vaporwave": 0.6 },
  "keywords": ["soft", "sunday", "slowerpace", "contemplation"],
  "exclude": ["rock-pop"],
  "prefer": "long"
}
```

Two rules:

- Genre slugs must match `server/lib/genre.js` exactly.
- **Weight against what is actually in the library, not what the genre list
  makes possible.** The first draft of `moods.json` leaned on `ambient`, and
  this library contains zero ambient-classified tracks — the mood would have
  matched nothing. The measured distribution is recorded at the top of
  `moods.json`; re-measure with `node dj.mjs library` after the library changes.

---

## Instructions for Claude Code

### Run the DJ as its own agent

```bash
cd "C:\Users\barri\Documents\Ortis\Radio Tower\dj"
claude
```

`dj/CLAUDE.md` loads automatically and is its entire brief. Then just talk to
it: *"this is too sleepy, put some game music on"*. It has `/emit` as a slash
command, and its `.claude/settings.json` denies writes to `../server`,
`../public`, `../scripts`, `../tests`, `../docs` and `../music` — so a DJ
session cannot wander into the station code even if asked to.

### Or delegate from the main project session

```
> use the tower-dj agent to put something upbeat on
```

`.claude/agents/tower-dj.md` carries the `tower-dj-booth` skill. Same
boundaries, same booth.

### A paste-ready prompt when something is wrong on air

```text
The station is playing the wrong thing. You are the DJ — work in the dj/ folder
and change nothing outside it.

1. `node dj.mjs doctor`. Report every line. The one that matters most is whether
   the station's MUSIC_DIR is the same folder the booth is reading; a mismatch
   there is the usual cause of "these aren't the right files", and it is a Pi
   config fix, not something you can solve from the booth.
2. `node dj.mjs files --big`. Every file is one slot no matter how long it is,
   so oversized single-file albums quietly eat the day. List them with sizes.
   Do NOT move or delete any audio — report only.
3. `node dj.mjs status`. Tell me what's on air, and how many slots are movable.
4. If the library is fine and only the moment is wrong, fire an emission:
   `node dj.mjs emit "<the mood I asked for>" --dry-run` first, read the plan
   out to me, then send it. If zero slots matched, do not send it — tell me,
   and show me the moods.json entry you would add instead.
5. Report in numbers: which cycle and slot the override landed on, how many
   slots matched, and confirm the track on air was untouched.

Before and after any edit to dj.mjs: `node --test test.mjs`. Do not weaken a
test to make a change pass.
```

### If you change `dj.mjs`

```bash
node --test dj/test.mjs      # 11 tests, under a second, zero dependencies
```

They assert the two failures that are invisible until they are live: an
emission that is not a permutation, and one that touches a locked slot.

---

## When it refuses

| What you see | What it means | What to do |
|---|---|---|
| `booth: CLOSED` / `503 queue_editing_disabled` | the **server** was started without `STATION_KEY` | restart the station with one — nothing client-side fixes this |
| `401 bad_key` | your key doesn't match the server's | check the shell; don't guess |
| `409 too_close_to_air` | a slot froze while you were deciding | wait a minute. Never lower `QUEUE_LOCK_SECONDS` |
| `409 not_a_permutation` | a rescan reshuffled the cycle underneath you | `emit` already retries once; if it persists, the library is changing |
| `no_movable_window` | everything upcoming is locked, or the window straddles a cycle seam | wait — slots thaw as the clock advances |
| `Nothing upcoming matches that mood` | the window genuinely has none of it | widen the mood, wait, or add a `moods.json` entry |

### Starting the station with a key

```bash
# bash
STATION_KEY=$(node -e "console.log(crypto.randomUUID())") npm start

# PowerShell
$env:STATION_KEY=[guid]::NewGuid().ToString(); npm start
```

On the Pi it belongs in `/etc/radio-tower.env`, not on the command line.
