# The Booth

The DJ for Radio Tower. Reads the MP3s, talks to the station, changes what is
coming up — live, without a restart, without cutting off the track someone is
already listening to.

Standalone on purpose: no dependencies, no build, no import from `../server`.

## Run it

```bash
cd dj
export STATION_URL=http://localhost:8080     # or http://raspberrypi.local:8080
export STATION_KEY=<the key the server was started with>

node dj.mjs status
node dj.mjs emit "night drive"
node dj.mjs clear
```

PowerShell:

```powershell
cd dj
$env:STATION_URL="http://localhost:8080"
$env:STATION_KEY="<key>"
node dj.mjs status
```

## Run the DJ agent instead

```bash
cd dj
claude
```

`CLAUDE.md` in this folder is its whole brief. Then just talk: *"this is too
sleepy, put some games music on"*.

## Commands

| | |
|---|---|
| `status` | what's on air, what's coming, what can legally be moved |
| `moods` | the mood vocabulary (`moods.json` — edit it freely) |
| `files [--big] [--genre x] [--grep y]` | the MP3s on disk, by folder, with sizes |
| `library [--grep x]` | the library as the *station* classified it |
| `emit "<mood>" [--top N] [--dry-run]` | a Spontaneous Emission |
| `clear` | drop the override, back to the station clock |
| `rescan` | re-read the music directory |
| `doctor` | why isn't this working |

`--url`, `--key`, `--music` override the environment.

## The one thing to know

An emission is a **permutation** of the upcoming slots — the same tracks in a
different order, so the window still ends at the same instant and nobody's
clock moves. It cannot add a track, cannot remove one, cannot skip what is
playing. If nothing upcoming matches the mood, it refuses instead of shuffling
for the look of it.

## Test

```bash
node --test test.mjs      # 11 tests, under a second, no dependencies
```
