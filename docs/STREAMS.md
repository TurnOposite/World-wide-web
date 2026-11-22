# The streams: Everything, Chill, Energy

Ortis, 2026-11-17: « put all the breakcore and all the faster BPM stuff, or what looks like to be faster BPM
stuff, in … the energetic, and then in the chill, all the like liminal barber beat jazz. And keep everything
stream as is. »

| Stream | What is in it | Size on 2026-11-17 |
|---|---|---|
| **Everything** | the daily programme, unchanged (`docs/PROGRAMME.md`) | 3,174 tracks |
| **Chill** | the labels Barber Beats, Vaporwave (« liminal »), Ambient, Lo-fi, Jazz — and every album his sheet sends there | 2,737 tracks, ≈ 296 h |
| **Energy** | the labels Atmospheric DnB (drum & bass, jungle), Electronic — and his breakcore, hyperpop, « energy » rows | 124 tracks, ≈ 42 h |

Chill is most of the library: barber beats alone is ≈ 188 h of it. Each stream is a shuffle with its own clock,
the same second for everyone on it; switching is on /radio (the switch under the title) and in the Antenna.

## Where it comes from

His label sheet, `Radio-Tower_labels-and-streams_2026-11-10_filled-by-Ortis.xlsx` (529 album rows, his
corrections on 59 of them; `docs/plans/LABELS-ortis-2026-11-11.md`). Each row is decided by, in order:

1. **« Your stream »**, if he wrote one (no row has one yet).
2. **« Your label »**, his own words: words about energy win (breakcore, hyperpop, energy, dnb, jungle — so
   « Funk, Energy » and « VGM / Electro / energetic » are Energy); otherwise the first label he typed (« Jazz /
   lofi » is Chill, « Rock / jazz » is neither). Slushwave, Bossa nova and Beat tape count as Chill. Funk,
   Hip-hop, Pop, Rock, VGM and Rap FR stay on Everything only.
3. The label the tower gives the album.
4. For the rows with no label, the sheet's own suggestion (Focus → Chill, Energy → Energy; Easy → neither).

The result is `server/data/streams.json`: each stream's labels, the tracks it takes besides (ids), and the
tracks it leaves out. It is in the code, not in `music\channels.json`, so a push carries it to the tower, and
new music joins a stream by its label alone. His own channels.json can still overrule it: a stream defined
there with its own `genres` or `tracks`, or `"sheet": false`, is left as he wrote it
(`withSheet` in `server/lib/channels.js`). His `Chill` and `Energy` folders still work as before.

## Changing it

- **One album to the other stream:** type it in « Your stream » (Chill, Energy, or None) in the sheet, then
  rebuild (below). Or, without the sheet: drop the files in a `Chill` or `Energy` folder and publish.
- **Rebuild from the sheet** — PowerShell on the laptop, in `radio-tower-live`:

```powershell
python -I scripts\sheet-to-json.py "..\Radio Tower\Claude outputs\plan-chat-moods-2026-11-10\Radio-Tower_labels-and-streams_2026-11-10_filled-by-Ortis.xlsx" "$env:TEMP\sheet.json"
```

```powershell
node scripts\streams-from-sheet.mjs "$env:TEMP\sheet.json"
```

  then the self-test and a push: the tower takes it at its next scan after the update.
- **Tempo (BPM)** is not measured: « faster » here is the label's word for it (BACKLOG W2).

## His labels and his pace, from the sheet (2026-11-22)

Since 2026-11-22 the sheet also sets **the label each track shows** and **how often it comes round**:

- **Labels** (BACKLOG W1): `server/data/labels.json`, track by track, applied over the rules of `genre.js` at every
  scan (`applyLabels` in `server/lib/library.js`). His eight labels are tower labels now: Slushwave, Bossa nova and Beat
  tape feed Chill, Breakcore and Hyperpop feed Energy, Funk, Hip-hop and Pop stay on Everything. His words are read as
  the label whose word comes first (« jazz lofi anime » is Jazz); an artist he labelled once keeps that label on his
  other rows (Unknown artist excepted).
- **Pace**: `server/data/pace.json`. « great / good / rlly good » → *More often (his sheet)*, every 3 days;
  « AI slop / meh », and the rows nobody could place (« not even sure that's actual music ») → *Less often (his
  sheet)*, every 30 days. `server/index.js` puts these two lanes first in the programme (`withPace`), so a loved long
  mix leaves the long mixes' lane. His Favourites (For Radio, For The Waves) are never moved to More often. Takes effect
  at the next 05:00.

Rebuild after he edits the sheet (PowerShell, in `radio-tower-live`):

```powershell
python -I scripts\sheet-to-json.py "<his .xlsx>" "$env:TEMP\sheet.json"
```

```powershell
node scripts\labels-from-sheet.mjs "$env:TEMP\sheet.json"
```

```powershell
node scripts\streams-from-sheet.mjs "$env:TEMP\sheet.json"
```

The pace file is written from the sheet by the session that applies it (it needs the music folder's paths to keep his
Favourites out); then the self-test and a push.
