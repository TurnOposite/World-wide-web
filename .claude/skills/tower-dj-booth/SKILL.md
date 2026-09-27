---
name: tower-dj-booth
description: Drive Radio Tower's DJ booth — inspect what is on air, read the MP3 library from disk, and fire a Spontaneous Emission that reorders the upcoming queue to a mood over the Pi bridge. Use when asked to change what the station is playing right now, when the music is wrong or the mood is wrong, when diagnosing "these aren't the right files", or when working inside the dj/ folder.
---

# The booth

`dj/dj.mjs` is the only way to change what Radio Tower is playing without
restarting it. Zero dependencies, ES module, Node 22+, safe to run from
anywhere. Its brief is `dj/CLAUDE.md`; this skill is the operating manual.

## Wiring

```bash
cd dj
export STATION_URL=http://localhost:8080          # or http://raspberrypi.local:8080
export STATION_KEY=<the key the server was started with>
```

PowerShell: `$env:STATION_URL="..."`, `$env:STATION_KEY="..."`.
Or per-command: `--url`, `--key`, `--music`.

Reads (`status`, `files`, `library`, `doctor`) need no key. Writes (`emit`,
`clear`, `rescan`) do — and if the *server* was started without `STATION_KEY`,
the endpoints are 503 no matter what you send. That is deliberate: the station
sits on a public Cloudflare tunnel, and an unauthenticated write surface must
never be the default.

Never print a key back into a transcript.

## The commands

| Command | What it tells you |
|---|---|
| `node dj.mjs doctor` | folder mismatch, oversized files, reachability, whether writes will work |
| `node dj.mjs status` | on air, upcoming, and which slots are legally movable |
| `node dj.mjs files [--big] [--genre x] [--grep y]` | the MP3s on disk, by folder, with sizes |
| `node dj.mjs library [--grep x]` | the library as the *station* classified it |
| `node dj.mjs moods` | the mood vocabulary |
| `node dj.mjs emit "<mood>" [--top N] [--dry-run]` | the Spontaneous Emission |
| `node dj.mjs clear` | drop the override |
| `node dj.mjs rescan` | re-read `MUSIC_DIR` (slow on a Pi) |

## A Spontaneous Emission

**One command that says "play this vibe now" and rewrites the upcoming queue.**

```bash
node dj.mjs emit "liminal"
node dj.mjs emit "game" --top 3        # move only the best three
node dj.mjs emit "night drive" --dry-run
```

Mechanically: fetch `/api/queue` → find the longest contiguous run of unlocked
slots inside one cycle → score each against the mood → stable-sort → `POST
/api/queue/reorder {cycleIndex, startWithin, ids}`.

Scoring, from `dj/moods.json`: genre 100 × weight, each filename keyword 40,
`exclude` −200, duration preference ±20. Equal scores keep their programmed
order, so an emission is a nudge toward a mood, not a reshuffle of the library.

### The invariant

**It is a permutation.** The same multiset of durations in a different order, so
the window ends at exactly the same instant, `cycleSeconds` is unchanged, no era
is created, and a listener outside the window hears nothing different. Adding or
removing a track would move every cycle boundary since the epoch for everyone.

Consequences to state honestly rather than engineer around:

- Nothing matching in the window ⇒ the booth **refuses**. Widen the mood, wait
  for the cycle to bring other tracks into range, or add a mood entry.
- You cannot pull an arbitrary track forward from the library. That needs a
  server-side "DJ set" endpoint — a roadmap item, not a client trick.
- You cannot skip the track on air. There is no endpoint, on purpose.
- One override at a time, and nothing on air or about to play ever moves
  (since 2026-09-27, `Station.planQueueOrder`): a new emission in the same
  stretch composes with the one in force; one in another stretch is refused
  while the old one still waits. `clear` keeps the reordered tracks on air or
  inside the fence and returns the rest to the clock (`full: false`, `until`).
  It is dropped automatically when the library changes underneath it.

## Reading refusals

| Response | Means | Do |
|---|---|---|
| `503 queue_editing_disabled` | the **server** has no `STATION_KEY` | restart the station with one; nothing client-side helps |
| `401 bad_key` | your key is wrong | check the shell, don't guess |
| `409 too_close_to_air` | a slot froze while you were deciding | wait; never lower `QUEUE_LOCK_SECONDS` |
| `409 not_a_permutation` | a rescan reshuffled the cycle | refetch and retry (`emit` already retries once) |
| `409 window_crosses_cycle` | the window straddled a seam | the booth prevents this; if you see it, it's a bug |
| `409 earlier_reorder_on_air` | honouring it would drop a reorder whose tracks are on air now | wait until `until`, then retry |
| `409 other_reorder_waiting` | an earlier reorder in another stretch has not played yet | `clear` drops it (if none of it is near air), or wait until `until` |

## Moods

`dj/moods.json` is data, re-read on every run. Named today: `night drive`,
`liminal`, `upbeat`, `game`, `study`, `short set`, `deep`, `vapor`, `jungle`,
`french`. Anything else is free text — matched against genre names first, then
titles, artists, albums.

Adding a mood is a legitimate, encouraged edit. Genre slugs must match
`server/lib/genre.js` exactly: `barber-beats vaporwave vgm dnb-jungle lofi jazz
electronic trip-hop ambient french-rap chanson classical rock-pop unsorted`.

## Before and after changing `dj.mjs`

```bash
node --test dj/test.mjs      # 11 tests, under a second, no dependencies
```

They assert the two failures that are silent until they are live: an emission
that is not a permutation, and one that touches a locked slot. Do not weaken
them to make a change pass.

## The boundary

The booth changes the *programme*. It does not change the *station*. Anything
in `server/`, `public/`, `scripts/`, `tests/` or the roadmap belongs to
`tower-builder`. Audio files are never deleted, moved or renamed — `BRIEF.md`
rule 7.
