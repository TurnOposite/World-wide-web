# split/

Cutting the long mixes into tracks.

## Why

The station shuffles **slots, not minutes**. A 121-minute mix is one slot
exactly like a 44-second track, so eight files currently hold 71.8% of the air.

Deleting them was modelled and it makes the station *worse*: dropping everything
over 20 minutes leaves 18 tracks on a 90-minute loop, and the longest survivor
takes a **larger** share than before (18.9% vs 16.2%). Splitting fixes the
slot-share problem and the library-size problem at once, and loses no music.

Numbers: `docs/guides/STATE-OF-THE-STATION-2026-08-19.md`.

## Requirements

`ffmpeg` and `ffprobe` on PATH. **Neither is a dependency of the station** —
this is offline tooling you run on the laptop, like `usb/`. The two-runtime-
dependency budget is untouched.

```powershell
winget install Gyan.FFmpeg     # Windows
sudo apt install ffmpeg        # the Pi
```

## Use

```bash
cd split
node split-mixes.mjs                       # propose for every file over 20 min
node split-mixes.mjs --file "../music/Liminal Atmosphere/Macroblank - 一生に一度.mp3"
node split-mixes.mjs --gap 0.5             # break on shorter silences → more pieces
node split-mixes.mjs --apply proposals/macroblank-....json
```

| flag | |
|---|---|
| `--gap 1.0` | minimum silence, in seconds, that counts as a track break |
| `--min-track 90` | anything shorter is merged into its neighbour — a 2s blip mid-track is an artefact, not a track |
| `--min-minutes 20` | which files count as "long" when scanning the library |
| `--out <dir>` | where `--apply` writes. Defaults to `split/out/<name>/` |

## What it will and won't do

**It proposes.** Nothing is written anywhere without `--apply`, and `--apply`
**refuses an `--out` inside `MUSIC_DIR`** — you move the reviewed pieces in
yourself (`BRIEF.md` rule 7). The source file is never modified.

**One decode, every sensitivity.** It runs `silencedetect` once at a sensitive
threshold and derives the coarser proposals in JS, so the report tells you what
`--gap 0.5 / 1 / 2 / 3` would each have given without decoding a two-hour file
four times.

**Embedded chapters beat guessing.** If the file has them, they're used and
silence detection is skipped.

**Streams are copied, not re-encoded.** No generation loss, and it's fast.

**Piece names keep the original stem** — `Macroblank - 一生に一度 - 03.mp3`.
That is load-bearing: `server/lib/genre.js` classifies by filename and folder,
so a renamed piece becomes `unsorted`, which no mood in `dj/moods.json` can
reach.

**It tells you when it failed.** Silence detection cannot see a crossfade, and
these mixes are often gapless by design. A proposal whose longest piece is over
12 minutes, or over 35% of the mix, is reported as **WEAK** rather than counted
as a win. One with no boundaries at all says so and suggests leaving the file
whole.

## The workflow

1. `node split-mixes.mjs` — read the proposals, note which are WEAK.
2. Re-run the weak ones with `--gap 0.5`.
3. `--apply` the good ones.
4. **Listen to a few.** Especially the joins.
5. Move the pieces into `music/` yourself, delete the original mix (or keep it
   somewhere outside `MUSIC_DIR`), then `npm run scan`.
6. `cd ../dj && node dj.mjs library` to see the new genre balance.

## Test

```bash
node --test test.mjs      # 9 tests, no ffmpeg needed, no dependencies
```
